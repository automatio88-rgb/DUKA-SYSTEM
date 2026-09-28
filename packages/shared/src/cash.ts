/** Expected drawer cash = float + cash sales + cash debt repayments − cash payouts/expenses − cash refunds. */
export function expectedCash(i: { openingFloat: number; cashSales: number; cashDebtPayments: number; payouts: number }) {
  return Math.round(i.openingFloat + i.cashSales + i.cashDebtPayments - i.payouts);
}
export function variance(expected: number, counted: number) { return Math.round(counted - expected); }
/** An "unexplained gap" is a shortage beyond tolerance, or a repeating pattern on one user. */
export function gapAlert(history: { user_id: string; variance: number }[], tolerance = 100) {
  const last = history[history.length - 1];
  if (!last) return null;
  if (last.variance < -tolerance) return { level: 'critical' as const, reason: 'single_gap', amount: last.variance };
  const mine = history.filter(h => h.user_id === last.user_id).slice(-5);
  const shorts = mine.filter(h => h.variance < 0);
  if (shorts.length >= 3) return { level: 'warn' as const, reason: 'pattern', amount: shorts.reduce((a, b) => a + b.variance, 0) };
  return null;
}
