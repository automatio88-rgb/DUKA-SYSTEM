/** Velocity = trailing 28-day sales, weighted by weekday so Saturday stock isn't planned off a Tuesday. */
export interface DailySale { date: string; qty: number } // date YYYY-MM-DD
export function weekdayVelocity(sales: DailySale[], today = new Date(), window = 28) {
  const start = new Date(today); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - window);
  const byDow = Array(7).fill(0);
  let total = 0;
  for (const s of sales) {
    const d = new Date(s.date + 'T12:00:00');
    if (d < start || d > today) continue;
    byDow[d.getDay()] += s.qty; total += s.qty;
  }
  const weeks = window / 7;
  const perDow = byDow.map(v => v / weeks);
  const avg = total / window;
  return { avgPerDay: avg, perDow, total };
}
/** Forecast next n days of demand using weekday profile. */
export function forecast(perDow: number[], days: number, from = new Date()) {
  let s = 0; const d = new Date(from);
  for (let i = 0; i < days; i++) { d.setDate(d.getDate() + 1); s += perDow[d.getDay()]; }
  return s;
}
export function daysOfStock(onHand: number, avgPerDay: number) {
  if (avgPerDay <= 0) return onHand > 0 ? Infinity : 0;
  return onHand / avgPerDay;
}
/**
 * Reorder suggestion in BUY units: cover lead time + review period demand + safety,
 * minus what's on hand across both locations. Rounded up to whole cartons/bags.
 */
export function suggestOrder(p: { onHandTotal: number; perDow: number[]; unitsPerBuyUnit: number; reorderLevel: number; leadDays?: number; coverDays?: number }, from = new Date()) {
  const lead = p.leadDays ?? 2, cover = p.coverDays ?? 7;
  const need = forecast(p.perDow, lead + cover, from) + p.reorderLevel;
  const gap = need - p.onHandTotal;
  if (gap <= 0) return 0;
  return Math.ceil(gap / p.unitsPerBuyUnit);
}
export type StockSignal = 'ok' | 'shelf_low' | 'total_low';
export function stockSignal(shelf: number, store: number, reorderLevel: number, avgPerDay: number): StockSignal {
  const shelfThreshold = Math.max(Math.ceil(avgPerDay * 1.5), Math.ceil(reorderLevel / 2));
  if (shelf + store <= reorderLevel) return 'total_low';
  if (shelf <= shelfThreshold && store > 0) return 'shelf_low';
  return 'ok';
}
