// Money is stored as integer shillings. Kenyan dukas don't deal in cents at the counter.
export const toKsh = (n: number) => Math.round(n);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export function formatKsh(n: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const v = Math.round(n);
  const neg = v < 0;
  const abs = Math.abs(v);
  let body: string;
  if (opts.compact && abs >= 1_000_000) body = (abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, '') + 'M';
  else if (opts.compact && abs >= 10_000) body = (abs / 1000).toFixed(abs >= 100_000 ? 0 : 1).replace(/\.0$/, '') + 'K';
  else body = abs.toLocaleString('en-KE');
  const sign = neg ? '−' : opts.sign && v > 0 ? '+' : '';
  return `${sign}KSh ${body}`;
}
export const margin = (price: number, cost: number) => (price <= 0 ? 0 : (price - cost) / price);
/** Cost per sell unit after buy→sell conversion and loose-goods wastage. */
export function costPerSellUnit(costPerBuyUnit: number, unitsPerBuyUnit: number, wastagePct = 0): number {
  const yieldUnits = unitsPerBuyUnit * (1 - wastagePct / 100);
  if (yieldUnits <= 0) throw new Error('Invalid unit conversion');
  return Math.round((costPerBuyUnit / yieldUnits) * 100) / 100;
}
/** Split a total between cash / mpesa / credit, validating it adds up. */
export function validateSplit(total: number, parts: { cash: number; mpesa: number; credit: number }) {
  const s = toKsh(parts.cash) + toKsh(parts.mpesa) + toKsh(parts.credit);
  return { ok: s === toKsh(total), diff: toKsh(total) - s };
}
