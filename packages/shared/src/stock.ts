import type { StockMove, StockBatch } from './types';
/** Invariant: stock level = Σ moves (in to location − out of location). Movements merge, never overwrite. */
export function deriveLevels(moves: Pick<StockMove, 'product_id' | 'from_location' | 'to_location' | 'qty' | 'deleted_at'>[]) {
  const levels = new Map<string, number>();
  const key = (p: string, l: string) => `${p}|${l}`;
  for (const m of moves) {
    if (m.deleted_at) continue;
    if (m.to_location) levels.set(key(m.product_id, m.to_location), (levels.get(key(m.product_id, m.to_location)) ?? 0) + m.qty);
    if (m.from_location) levels.set(key(m.product_id, m.from_location), (levels.get(key(m.product_id, m.from_location)) ?? 0) - m.qty);
  }
  return levels;
}
export const levelOf = (levels: Map<string, number>, productId: string, locationId: string) => levels.get(`${productId}|${locationId}`) ?? 0;

/** First-Expiry-First-Out: consume qty from batches ordered by expiry. Returns updated batches + what was consumed. */
export function consumeFEFO<T extends Pick<StockBatch, 'id' | 'qty' | 'expiry_date'>>(batches: T[], qty: number) {
  const sorted = [...batches].filter(b => b.qty > 0).sort((a, b) => a.expiry_date.localeCompare(b.expiry_date));
  let left = qty;
  const consumed: { id: string; qty: number }[] = [];
  const next = sorted.map(b => {
    if (left <= 0) return b;
    const take = Math.min(b.qty, left);
    left -= take;
    consumed.push({ id: b.id, qty: take });
    return { ...b, qty: b.qty - take };
  });
  return { batches: next, consumed, shortfall: Math.max(0, left) };
}
export function daysUntil(dateIso: string, now = new Date()) {
  const d = new Date(dateIso + (dateIso.length === 10 ? 'T00:00:00' : ''));
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}
export function expiryBand(days: number): 7 | 14 | 30 | null {
  if (days <= 7) return 7; if (days <= 14) return 14; if (days <= 30) return 30; return null;
}
/** Discount suggestion: nearer expiry, deeper cut; never below cost. */
export function expiryDiscount(days: number, price: number, cost: number) {
  const pct = days <= 7 ? 0.3 : days <= 14 ? 0.15 : 0.08;
  const suggested = Math.max(Math.ceil(cost), Math.round(price * (1 - pct)));
  return { pct: Math.round(((price - suggested) / price) * 100), price: suggested };
}
