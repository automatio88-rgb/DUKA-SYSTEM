import type { OpLog } from './types';
/**
 * Server-side merge used by the edge function (and tested here).
 * - Idempotent: an op id seen before is skipped (safe to retry pushes forever).
 * - Append-only tables (stock_moves, sale_items, credit_ledger, audit_log, sales creation) never conflict: rows merge by id.
 * - Mutable rows: last-write-wins by server receipt order.
 * - stock levels & credit balances are NEVER taken from the client; they are re-derived after merge.
 */
export const APPEND_ONLY = new Set(['stock_moves', 'sale_items', 'credit_ledger', 'audit_log', 'price_history', 'agent_messages']);
export interface ServerState { seenOps: Set<string>; tables: Map<string, Map<string, any>>; cursor: number; log: (OpLog & { seq: number })[] }
export const newServerState = (): ServerState => ({ seenOps: new Set(), tables: new Map(), cursor: 0, log: [] });
export function applyOps(state: ServerState, ops: OpLog[], serverNow = () => new Date().toISOString()) {
  let applied = 0, skipped = 0;
  for (const op of ops) {
    if (state.seenOps.has(op.id)) { skipped++; continue; }
    state.seenOps.add(op.id);
    const t = state.tables.get(op.entity) ?? new Map(); state.tables.set(op.entity, t);
    const existing = t.get(op.entity_id);
    if (APPEND_ONLY.has(op.entity) && existing && op.op !== 'delete') { skipped++; continue; }
    if (op.op === 'delete') t.set(op.entity_id, { ...(existing ?? {}), id: op.entity_id, deleted_at: serverNow() });
    else t.set(op.entity_id, { ...(existing ?? {}), ...(op.payload_json as object), id: op.entity_id });
    state.log.push({ ...op, server_ts: serverNow(), seq: ++state.cursor });
    applied++;
  }
  return { applied, skipped, cursor: state.cursor };
}
export function pullSince(state: ServerState, since: number, excludeDevice?: string) {
  return { ops: state.log.filter(o => o.seq > since && o.device_id !== excludeDevice), cursor: state.cursor };
}
