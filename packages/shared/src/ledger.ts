import type { LedgerEntry } from './types';
type E = Pick<LedgerEntry, 'id' | 'type' | 'amount' | 'created_at' | 'customer_id'> & Partial<Pick<LedgerEntry, 'balance_after' | 'deleted_at'>>;
/** Recompute balance_after chain (server authority). charge +, payment −, adjustment signed. */
export function recomputeChain<T extends E>(entries: T[]): (T & { balance_after: number })[] {
  const sorted = [...entries].filter(e => !e.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  let bal = 0;
  return sorted.map(e => {
    bal += e.type === 'charge' ? e.amount : e.type === 'payment' ? -e.amount : e.amount;
    return { ...e, balance_after: Math.round(bal) };
  });
}
export function balances(entries: E[]) {
  const by = new Map<string, E[]>();
  for (const e of entries) { if (!by.has(e.customer_id)) by.set(e.customer_id, []); by.get(e.customer_id)!.push(e); }
  const out = new Map<string, number>();
  for (const [c, es] of by) { const ch = recomputeChain(es); out.set(c, ch.length ? ch[ch.length - 1].balance_after : 0); }
  return out;
}
export function creditCheck(balance: number, add: number, limit?: number) {
  if (!limit) return { ok: true, over: 0 } as const;
  const after = balance + add;
  return { ok: after <= limit, over: Math.max(0, after - limit) };
}
/** Days since the last payment (or first charge) — used for escalation tone. */
export function escalationLevel(daysOutstanding: number): 0 | 1 | 2 {
  return daysOutstanding >= 30 ? 2 : daysOutstanding >= 14 ? 1 : 0;
}
