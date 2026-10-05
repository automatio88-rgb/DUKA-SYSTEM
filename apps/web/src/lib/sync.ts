/**
 * Background sync (§13): push oplog batches → server dedupes by op id; pull ops since cursor.
 * Conflict policy lives server-side (LWW for mutable rows, merge for append-only, derived stock/credit).
 * No backend configured → the app is fully functional as a device-only duka.
 */
import { idb, data, refreshEngine, meta, setMeta, deviceId } from './data';
import { useApp } from '@/app/store';
import { TABLES } from '@duka/shared';

export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
let timer: number | undefined; let running = false;

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await meta<string>('token');
  const r = await fetch(`${API}/api/v1${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  if (!r.ok) throw Object.assign(new Error(`api ${r.status}`), { status: r.status, body: await r.json().catch(() => null) });
  return r.json();
}

export async function remoteLogin(userId: string, pin: string) {
  if (!API || !navigator.onLine) return;
  const shopCode = await meta<string>('shopCode'); if (!shopCode) return;
  try { const r = await api<{ token: string }>('/auth/pin-login', { method: 'POST', body: JSON.stringify({ shopCode, userId, pin, deviceId: deviceId() }) }); await setMeta('token', r.token); void syncOnce(); } catch { /* stay offline-capable */ }
}

export async function syncOnce() {
  const s = useApp.getState();
  const pending = await idb.oplog.where('synced').equals(0).count();
  s.setPending(pending);
  if (!navigator.onLine) return s.setSync('offline');
  if (!API || !(await meta('token'))) return s.setSync(pending ? 'pending' : 'local');
  if (running) return; running = true; s.setSync('syncing');
  try {
    for (;;) {
      const rank = new Map<string, number>(TABLES.map((t, i) => [t, i]));
      const batch = (await idb.oplog.where('synced').equals(0).toArray()).sort((a, b) => a.client_ts.localeCompare(b.client_ts) || (rank.get(a.entity) ?? 99) - (rank.get(b.entity) ?? 99)).slice(0, 400);
      if (!batch.length) break;
      await api('/sync/push', { method: 'POST', body: JSON.stringify({ ops: batch.map(({ synced: _s, shop_id: _sh, ...o }) => o) }) });
      await idb.oplog.bulkPut(batch.map(o => ({ ...o, synced: 1 as const })));
    }
    const since = (await meta<number>('cursor')) ?? 0;
    const { ops, cursor } = await api<{ ops: any[]; cursor: number }>(`/sync/pull?since=${since}`);
    if (ops.length) {
      const db = data() as any;
      for (const o of ops) {
        const t = o.entity; if (!db[t]) continue;
        const row = { ...o.payload_json, id: o.entity_id };
        await idb.table(t).put(row);
        const i = db[t].findIndex((r: any) => r.id === row.id); if (i >= 0) db[t][i] = row; else db[t].push(row);
      }
      refreshEngine();
    }
    await setMeta('cursor', cursor);
    s.setPending(0); s.setSync('synced');
  } catch { s.setSync('offline'); } finally { running = false; }
}

export function startSync() {
  if (timer) return;
  void syncOnce();
  timer = window.setInterval(syncOnce, 20_000);
  window.addEventListener('online', () => void syncOnce());
  window.addEventListener('offline', () => useApp.getState().setSync('offline'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncOnce(); });
}
