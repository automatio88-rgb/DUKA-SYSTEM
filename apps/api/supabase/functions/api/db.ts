/**
 * Load a shop's dataset into the shared DukaEngine and persist its change feed.
 * A duka is small (≈800 products, a few thousand rows/month) so whole-shop loads are cheap and keep
 * server behaviour byte-identical to the offline client.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TABLES, emptyDataSet, DukaEngine, type DataSet, type Change, type Role } from '../_shared/duka.js';

export const APPEND_ONLY = new Set(['stock_moves', 'sale_items', 'credit_ledger', 'audit_log', 'price_history', 'agent_messages']);
let client: SupabaseClient | null = null;
export const sb = () => (client ??= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }));

export async function loadShop(shopId: string, since?: string): Promise<DataSet> {
  const db = emptyDataSet();
  await Promise.all(TABLES.map(async t => {
    let q = sb().from(t).select('*');
    q = t === 'shops' ? q.eq('id', shopId) : q.eq('shop_id', shopId);
    if (since && ['sales', 'sale_items', 'audit_log', 'agent_messages'].includes(t)) q = q.gte('created_at', since);
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) { const { data, error } = await q.range(from, from + 999); if (error) throw error; rows.push(...(data ?? [])); if (!data || data.length < 1000) break; }
    (db as any)[t] = rows.map(numify);
  }));
  return db;
}
/** Postgres numeric comes back as string; the engine wants numbers. */
const NUM = /^(qty|amount|total|discount|.*_amount|.*_price|cost_price|balance_after|opening_float|expected_cash|counted_cash|variance|units_per_buy_unit|wastage_pct|reorder_level|qty_buy_units|cost_per_buy_unit|expected_qty|counted_qty|total_cost|paid_amount|credit_limit|unit_cost_snapshot|sort|escalation_level)$/;
function numify(r: any) { for (const k in r) if (NUM.test(k) && r[k] != null && typeof r[k] === 'string') r[k] = Number(r[k]); return r; }

export async function persist(shopId: string, changes: Change[]) {
  const by = new Map<string, Map<string, any>>();
  for (const c of changes) { if (!by.has(c.table)) by.set(c.table, new Map()); by.get(c.table)!.set(c.row.id, c.table === 'shops' ? c.row : { ...c.row, shop_id: shopId }); }
  // parents first so FKs hold
  for (const t of TABLES) {
    const rows = by.get(t); if (!rows?.size) continue;
    const { error } = await sb().from(t).upsert([...rows.values()], { onConflict: 'id', ignoreDuplicates: APPEND_ONLY.has(t) });
    if (error) throw new Error(`${t}: ${error.message}`);
  }
}

export async function withEngine<T>(auth: { shopId: string; userId: string; role: Role; deviceId: string }, fn: (e: DukaEngine) => Promise<T> | T): Promise<T> {
  const db = await loadShop(auth.shopId);
  const e = new DukaEngine(db, auth);
  const out = await fn(e);
  await persist(auth.shopId, e.drain());
  return out;
}
