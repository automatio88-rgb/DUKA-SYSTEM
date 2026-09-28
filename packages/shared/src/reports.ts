import type { DukaEngine } from './engine';
import type { Lang, MonthSummary } from './types';
import { dayKey, addDays, monthKey } from './dates';
import { formatKsh as k } from './money';

export interface DayFigures { date: string; sales: number; cogs: number; gross: number; expenses: number; net: number; txns: number; cash: number; mpesa: number; credit: number; avgBasket: number; creditCollected: number; top: { name: string; qty: number; revenue: number }[]; byHour: number[] }
export function dayFigures(e: DukaEngine, date = dayKey(e.now())): DayFigures {
  const sales = e.db.sales.filter(s => s.status === 'complete' && dayKey(s.offline_created_at) === date);
  const ids = new Set(sales.map(s => s.id));
  const items = e.db.sale_items.filter(i => ids.has(i.sale_id));
  const revenue = sales.reduce((a, s) => a + s.total, 0);
  // Busy-mode lumps have no items: estimate their cost at the shop's trailing margin.
  const itemCogs = items.reduce((a, i) => a + i.qty * i.unit_cost_snapshot, 0);
  const itemRev = items.reduce((a, i) => a + i.qty * i.unit_price, 0);
  const lumpRev = sales.filter(s => s.busy_lump && !s.reconciled).reduce((a, s) => a + s.total, 0);
  const ratio = itemRev > 0 ? itemCogs / itemRev : 0.8;
  const cogs = Math.round(itemCogs + lumpRev * ratio);
  const expenses = e.db.expenses.filter(x => dayKey(x.created_at) === date && !x.deleted_at).reduce((a, x) => a + x.amount, 0);
  const agg = new Map<string, { qty: number; revenue: number }>();
  for (const i of items) { const a = agg.get(i.product_id) ?? { qty: 0, revenue: 0 }; a.qty += i.qty; a.revenue += i.qty * i.unit_price; agg.set(i.product_id, a); }
  const top = [...agg].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5).map(([id, v]) => ({ name: e.db.products.find(p => p.id === id)?.name ?? '?', ...v }));
  const byHour = Array(24).fill(0); for (const s of sales) byHour[new Date(s.offline_created_at).getHours()] += s.total;
  const creditCollected = e.db.credit_ledger.filter(l => l.type === 'payment' && dayKey(l.created_at) === date).reduce((a, l) => a + l.amount, 0);
  return { date, sales: revenue, cogs, gross: revenue - cogs, expenses, net: revenue - cogs - expenses, txns: sales.length, cash: sales.reduce((a, s) => a + s.cash_amount, 0), mpesa: sales.reduce((a, s) => a + s.mpesa_amount, 0), credit: sales.reduce((a, s) => a + s.credit_amount, 0), avgBasket: sales.length ? Math.round(revenue / sales.length) : 0, creditCollected, top, byHour };
}
export function series(e: DukaEngine, days = 7) { const out: DayFigures[] = []; for (let i = days - 1; i >= 0; i--) out.push(dayFigures(e, dayKey(addDays(e.now(), -i)))); return out; }

export function cashPosition(e: DukaEngine) {
  const s = e.currentSession();
  const drawer = s ? e.sessionFigures(s).expected : 0;
  const today = dayFigures(e);
  const receivables = e.debtors().reduce((a, d) => a + d.balance, 0);
  const payables = e.payables().reduce((a, p) => a + p.owed, 0);
  const mpesa = today.mpesa + e.db.credit_ledger.filter(l => l.type === 'payment' && l.method === 'mpesa' && dayKey(l.created_at) === today.date).reduce((a, l) => a + l.amount, 0);
  return { drawer, mpesa, receivables, payables, net: drawer + mpesa + receivables - payables };
}

export function profitTruth(e: DukaEngine, days = 30) {
  const since = dayKey(addDays(e.now(), -days));
  const ok = new Set(e.db.sales.filter(s => s.status === 'complete' && dayKey(s.offline_created_at) >= since).map(s => s.id));
  const m = new Map<string, { revenue: number; cost: number; qty: number }>();
  for (const i of e.db.sale_items) if (ok.has(i.sale_id)) { const a = m.get(i.product_id) ?? { revenue: 0, cost: 0, qty: 0 }; a.revenue += i.qty * i.unit_price; a.cost += i.qty * i.unit_cost_snapshot; a.qty += i.qty; m.set(i.product_id, a); }
  const rows = e.db.products.map(p => { const a = m.get(p.id) ?? { revenue: 0, cost: 0, qty: 0 }; const onHand = e.qty(p.id, 'shop') + e.qty(p.id, 'store'); return { p, ...a, profit: Math.round(a.revenue - a.cost), margin: a.revenue ? (a.revenue - a.cost) / a.revenue : (p.retail_price - p.cost_price) / p.retail_price, capital: Math.round(onHand * p.cost_price) }; });
  const byCat = new Map<string, { name: string; revenue: number; profit: number }>();
  for (const r of rows) { const c = e.db.categories.find(c => c.id === r.p.category_id); const key = c?.id ?? 'x'; const a = byCat.get(key) ?? { name: c?.name ?? 'Other', revenue: 0, profit: 0 }; a.revenue += r.revenue; a.profit += r.profit; byCat.set(key, a); }
  const sold = rows.filter(r => r.qty > 0);
  return {
    top: [...sold].sort((a, b) => b.profit - a.profit).slice(0, 10),
    wasters: [...rows].filter(r => r.capital > 0).sort((a, b) => (a.profit / (a.capital || 1)) - (b.profit / (b.capital || 1))).slice(0, 10),
    categories: [...byCat.values()].sort((a, b) => b.profit - a.profit),
    totals: { revenue: Math.round(sold.reduce((a, r) => a + r.revenue, 0)), profit: sold.reduce((a, r) => a + r.profit, 0) },
  };
}

export function loanPack(e: DukaEngine): { months: MonthSummary[]; totals: MonthSummary } {
  const hist = e.shop.settings_json.history ?? [];
  const live = new Map<string, MonthSummary>();
  for (const s of e.db.sales.filter(s => s.status === 'complete')) { const m = monthKey(s.offline_created_at); const r = live.get(m) ?? { month: m, sales: 0, cogs: 0, expenses: 0, cashIn: 0, cashOut: 0 }; r.sales += s.total; r.cashIn += s.cash_amount + s.mpesa_amount; live.set(m, r); }
  const saleMonth = new Map(e.db.sales.map(s => [s.id, monthKey(s.offline_created_at)]));
  for (const i of e.db.sale_items) { const m = saleMonth.get(i.sale_id); const r = m && live.get(m); if (r) r.cogs += i.qty * i.unit_cost_snapshot; }
  for (const x of e.db.expenses) { const r = live.get(monthKey(x.created_at)); if (r) { r.expenses += x.amount; r.cashOut += x.amount; } }
  for (const p of e.db.purchases.filter(p => p.status === 'received')) { const r = live.get(monthKey(p.created_at)); if (r) r.cashOut += p.paid_amount; }
  for (const l of e.db.credit_ledger.filter(l => l.type === 'payment')) { const r = live.get(monthKey(l.created_at)); if (r) r.cashIn += l.amount; }
  const merged = new Map<string, MonthSummary>(hist.map(h => [h.month, h]));
  for (const [m, r] of live) { const h = merged.get(m); merged.set(m, h ? { month: m, sales: h.sales + r.sales, cogs: h.cogs + r.cogs, expenses: h.expenses + r.expenses, cashIn: h.cashIn + r.cashIn, cashOut: h.cashOut + r.cashOut } : r); }
  const months = [...merged.values()].map(r => ({ ...r, sales: Math.round(r.sales), cogs: Math.round(r.cogs) })).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  const totals = months.reduce((a, r) => ({ month: 'total', sales: a.sales + r.sales, cogs: a.cogs + r.cogs, expenses: a.expenses + r.expenses, cashIn: a.cashIn + r.cashIn, cashOut: a.cashOut + r.cashOut }), { month: 'total', sales: 0, cogs: 0, expenses: 0, cashIn: 0, cashOut: 0 });
  return { months, totals };
}

export function missedDemand(e: DukaEngine, days = 7) {
  const since = addDays(e.now(), -days).toISOString();
  const m = new Map<string, number>();
  for (const d of e.db.demand_log.filter(d => d.created_at >= since)) { const key = (d.product_guess ?? d.text).toLowerCase().trim(); m.set(key, (m.get(key) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]).map(([text, count]) => ({ text, count }));
}

/** Weekly Business Review — written like a sharp manager talking to the owner, not a table dump. */
export function weeklyNarrative(e: DukaEngine, lang: Lang): { headline: string; paragraphs: string[] } {
  const thisW = series(e, 7), prev: DayFigures[] = [];
  for (let i = 13; i >= 7; i--) prev.push(dayFigures(e, dayKey(addDays(e.now(), -i))));
  const sum = (xs: DayFigures[], f: keyof DayFigures) => xs.reduce((a, x) => a + (x[f] as number), 0);
  const s = sum(thisW, 'sales'), ps = sum(prev, 'sales'), g = sum(thisW, 'gross');
  const ch = ps ? Math.round(((s - ps) / ps) * 100) : 0;
  const best = [...thisW].sort((a, b) => b.sales - a.sales)[0];
  const bestDay = new Date(best.date + 'T12:00:00').getDay();
  const pt = profitTruth(e, 7);
  const debt = e.debtors(); const owed = debt.reduce((a, d) => a + d.balance, 0);
  const slow = debt.filter(d => d.days >= 21).slice(0, 2);
  const re = e.reorderList().filter(r => r.signal === 'total_low').slice(0, 3);
  const dead = e.deadStock(); const frozen = dead.reduce((a, d) => a + d.frozen, 0);
  const miss = missedDemand(e).slice(0, 2);
  const daysSw = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
  const daysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const topName = pt.top[0]?.p.name, topProfit = pt.top[0]?.profit ?? 0;
  if (lang === 'sw') {
    const p: string[] = [];
    p.push(`Wiki hii umeuza ${k(s)}, ${ch >= 0 ? `juu ${ch}%` : `chini ${Math.abs(ch)}%`} kuliko wiki iliyopita. Faida ghafi ni karibu ${k(g)}. Siku bora ilikuwa ${daysSw[bestDay]} (${k(best.sales)}), kwa hivyo hakikisha rafu zimejaa kabla ya siku kama hiyo.`);
    if (topName) p.push(`${topName} ndiyo iliyokuletea faida kubwa zaidi, ${k(topProfit)}. Usikubali ikaishe.`);
    p.push(`Wateja wanakudai ${k(owed)} kwa jumla.${slow.length ? ` ${slow.map(d => d.c.name).join(' na ')} hawajalipa kwa zaidi ya wiki tatu. Ukumbusho wa uzito umeandaliwa.` : ' Wengi wanalipa vizuri.'}`);
    if (re.length) p.push(`Agiza mapema: ${re.map(r => `${r.p.name} (${r.suggestBuy} ${r.p.buy_unit})`).join(', ')}.`);
    if (frozen > 0) p.push(`Kuna ${k(frozen)} imelala kwa mzigo usiotoka siku 45. Fikiria punguzo au rudisha kwa msambazaji.`);
    if (miss.length) p.push(`Wateja waliuliza ${miss.map(m => `"${m.text}" (mara ${m.count})`).join(' na ')} lakini hukuwa nayo. Hiyo ni pesa iliyopita mlangoni.`);
    return { headline: ch >= 0 ? `Wiki nzuri: mauzo yamepanda ${ch}%` : `Wiki ngumu kidogo: mauzo chini ${Math.abs(ch)}%`, paragraphs: p };
  }
  const p: string[] = [];
  p.push(`You sold ${k(s)} this week, ${ch >= 0 ? `up ${ch}%` : `down ${Math.abs(ch)}%`} on last week, with roughly ${k(g)} gross profit. ${daysEn[bestDay]} was your best day at ${k(best.sales)}, so stock the shelves the night before.`);
  if (topName) p.push(`${topName} made you the most money: ${k(topProfit)}. Never let it run out.`);
  p.push(`Customers owe you ${k(owed)} in total.${slow.length ? ` ${slow.map(d => d.c.name).join(' and ')} haven't paid in over three weeks; firm reminders are queued.` : ' Most are paying on time.'}`);
  if (re.length) p.push(`Order soon: ${re.map(r => `${r.p.name} (${r.suggestBuy} ${r.p.buy_unit})`).join(', ')}.`);
  if (frozen > 0) p.push(`${k(frozen)} is sitting in stock that hasn't moved for 45 days. Discount it or send it back.`);
  if (miss.length) p.push(`Customers asked for ${miss.map(m => `"${m.text}" (${m.count}×)`).join(' and ')} and walked out empty-handed. That's money at the door.`);
  return { headline: ch >= 0 ? `Good week: sales up ${ch}%` : `Tougher week: sales down ${Math.abs(ch)}%`, paragraphs: p };
}
