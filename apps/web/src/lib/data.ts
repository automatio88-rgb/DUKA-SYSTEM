/**
 * Offline-first data layer (§13).
 * All tables live in IndexedDB (Dexie). At boot they are loaded into memory and wrapped by the shared
 * DukaEngine. Every action: engine mutates memory → drain() change feed → Dexie bulkPut + oplog entry.
 * The UI never waits for the network.
 */
import Dexie, { type Table as DTable } from 'dexie';
import { DukaEngine, emptyDataSet, TABLES, buildDemo, type DataSet, type Change, type User, type Lang } from '@duka/shared';
import { useApp } from '@/app/store';

export interface OpRow { id: string; shop_id: string; device_id: string; entity: string; entity_id: string; op: 'upsert' | 'delete'; payload_json: any; client_ts: string; synced: 0 | 1 }
class DukaDB extends Dexie {
  oplog!: DTable<OpRow, string>;
  meta!: DTable<{ key: string; value: any }, string>;
  constructor() {
    super('duka-system');
    const schema: Record<string, string> = {};
    for (const t of TABLES) schema[t] = 'id, updated_at';
    schema.oplog = 'id, synced, client_ts';
    schema.meta = 'key';
    this.version(1).stores(schema);
  }
}
export const idb = new DukaDB();

export function deviceId() {
  let d = localStorage.getItem('duka.device');
  if (!d) { d = crypto.randomUUID(); localStorage.setItem('duka.device', d); }
  return d;
}

let db: DataSet = emptyDataSet();
let engine: DukaEngine | null = null;
export const data = () => db;
export const E = () => { if (!engine) throw new Error('no session'); return engine; };
export const hasEngine = () => !!engine;

export async function loadAll(): Promise<boolean> {
  const next = emptyDataSet();
  await Promise.all(TABLES.map(async t => { (next as any)[t] = await idb.table(t).toArray(); }));
  db = next;
  return db.shops.length > 0;
}
export function startSession(u: Pick<User, 'id' | 'role'>) {
  engine = new DukaEngine(db, { shopId: db.shops[0].id, userId: u.id, role: u.role, deviceId: deviceId() });
}
export function endSession() { engine = null; }
/** Rebuild engine caches after pulled server changes. */
export function refreshEngine() { if (engine) engine = new DukaEngine(db, engine.ctx); useApp.getState().bump(); }

export async function persist(changes: Change[], log = true) {
  if (!changes.length) return;
  const by = new Map<string, Map<string, any>>();
  for (const c of changes) { if (!by.has(c.table)) by.set(c.table, new Map()); by.get(c.table)!.set(c.row.id, c.row); }
  const shopId = db.shops[0]?.id ?? '';
  const now = new Date().toISOString(); const dev = deviceId();
  const tables = [...by.keys()].map(t => idb.table(t));
  await idb.transaction('rw', [...tables, idb.oplog], async () => {
    for (const [t, rows] of by) await idb.table(t).bulkPut([...rows.values()]);
    if (log) await idb.oplog.bulkPut(changes.map(c => ({ id: crypto.randomUUID(), shop_id: shopId, device_id: dev, entity: c.table, entity_id: c.row.id, op: 'upsert' as const, payload_json: c.row, client_ts: now, synced: 0 as const })));
  });
  useApp.getState().setPending(await idb.oplog.where('synced').equals(0).count());
}

/** Run an engine action, persist its change feed, re-render. Errors bubble to the caller for inline UI. */
export function act<T>(fn: (e: DukaEngine) => T): T {
  const e = E();
  const out = fn(e);
  const ch = e.drain();
  void persist(ch);
  useApp.getState().bump();
  return out;
}
export async function actAsync<T>(fn: (e: DukaEngine) => Promise<T>): Promise<T> {
  const e = E(); const out = await fn(e); await persist(e.drain()); useApp.getState().bump(); return out;
}

export async function writeAll(next: DataSet, log = true) {
  db = next;
  await idb.transaction('rw', TABLES.map(t => idb.table(t)), async () => {
    for (const t of TABLES) { await idb.table(t).clear(); await idb.table(t).bulkPut((next as any)[t]); }
  });
  if (log) {
    const shopId = next.shops[0]?.id ?? ''; const now = new Date().toISOString(); const dev = deviceId();
    const ops: OpRow[] = TABLES.flatMap(t => (next as any)[t].map((row: any) => ({ id: crypto.randomUUID(), shop_id: shopId, device_id: dev, entity: t, entity_id: row.id, op: 'upsert' as const, payload_json: row, client_ts: now, synced: 0 as const })));
    await idb.oplog.bulkPut(ops);
    useApp.getState().setPending(ops.length);
  }
}
export async function seedDemo(lang: Lang) {
  const d = await buildDemo(new Date(), { lang });
  await writeAll(d.db);
  await idb.meta.put({ key: 'demo', value: true });
  return d;
}
export async function wipeDevice() { await idb.delete(); localStorage.removeItem('duka.session'); location.reload(); }

export async function meta<T = any>(key: string): Promise<T | undefined> { return (await idb.meta.get(key))?.value; }
export async function setMeta(key: string, value: any) { await idb.meta.put({ key, value }); }
