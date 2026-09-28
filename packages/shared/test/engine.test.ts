import { describe, it, expect } from 'vitest';
import { buildDemo } from '../src/seed';
import { DukaEngine, emptyDataSet } from '../src/engine';
import { runAgent } from '../src/agent';
import { dayFigures, weeklyNarrative, profitTruth, loanPack, cashPosition, missedDemand } from '../src/reports';
import { deriveLevels } from '../src/stock';
import { PermissionError } from '../src/permissions';

const NOW = new Date('2026-09-26T17:30:00'); // Saturday evening, shop open
async function demo(role: 'owner' | 'staff' = 'owner') {
  const d = await buildDemo(NOW, { lang: 'sw' });
  return { ...d, e: new DukaEngine(d.db, { shopId: d.shopId, userId: role === 'owner' ? d.ownerId : d.staffId, role, deviceId: 'test', now: () => NOW }) };
}

describe('F13 demo seed', () => {
  it('seeds ~120 products, 2 locations, 15 customers, 30 days of sales, 3 suppliers', async () => {
    const { db } = await demo();
    expect(db.products.length).toBeGreaterThanOrEqual(115); expect(db.locations.length).toBe(2); expect(db.customers.length).toBe(15); expect(db.suppliers.length).toBe(3);
    const days = new Set(db.sales.map(s => s.offline_created_at.slice(0, 10))); expect(days.size).toBeGreaterThanOrEqual(29);
  });
  it('never has negative stock and invariant level = Σ moves holds', async () => {
    const { e, db } = await demo();
    const L = deriveLevels(db.stock_moves); for (const v of L.values()) expect(v).toBeGreaterThanOrEqual(0);
    const p = db.products[0]; expect(e.qty(p.id, 'shop')).toBe(L.get(`${p.id}|${db.locations[0].id}`) ?? 0);
  });
  it('triggers every alert type', async () => {
    const { db } = await demo();
    const types = new Set(db.alerts.map(a => a.type));
    for (const t of ['shelf_low', 'total_low', 'expiry', 'dead_stock', 'unmatched_payment', 'cash_gap', 'payable_due', 'briefing']) expect([...types]).toContain(t);
    expect(db.reminders.length).toBeGreaterThan(3);
    expect(new Set(db.reminders.map(r => r.escalation_level)).size).toBeGreaterThan(1);
  });
  it('Saturday is the weekly peak', async () => { const { e } = await demo(); const v = e.velocity(e.db.products.find(p => p.name.startsWith('Jogoo'))!.id); expect(v.perDow[6]).toBeGreaterThan(v.perDow[2]); });
});

describe('F3 POS + F4 kitabu', () => {
  it('2-item cash sale decrements Duka and updates velocity', async () => {
    const { e } = await demo();
    const bread = e.db.products.find(p => p.name.startsWith('Festive'))!; const milk = e.db.products.find(p => p.name.startsWith('Tuzo'))!;
    const before = e.qty(bread.id, 'shop'), vBefore = e.velocity(bread.id).total;
    const { sale } = e.sell([{ productId: bread.id, qty: 1 }, { productId: milk.id, qty: 2 }], { method: 'cash' });
    expect(sale.total).toBe(bread.retail_price + milk.retail_price * 2);
    expect(e.qty(bread.id, 'shop')).toBe(before - 1); expect(e.velocity(bread.id).total).toBe(vBefore + 1);
  });
  it('offline sale replay with same client id is idempotent', async () => {
    const { e } = await demo(); const p = e.db.products[0]; const id = crypto.randomUUID(); const n = e.db.sales.length;
    e.sell([{ productId: p.id, qty: 1 }], { method: 'cash' }, { id }); const r = e.sell([{ productId: p.id, qty: 1 }], { method: 'cash' }, { id });
    expect(r.warnings).toContain('duplicate_ignored'); expect(e.db.sales.length).toBe(n + 1);
  });
  it('credit sale + payment keep balance_after chain exact; statement = ledger', async () => {
    const { e } = await demo(); const c = e.db.customers[7]; const b0 = e.balanceOf(c.id); const p = e.db.products[5];
    const { sale } = e.sell([{ productId: p.id, qty: 2 }], { method: 'credit', customerId: c.id });
    expect(e.balanceOf(c.id)).toBe(b0 + sale.total);
    const pay = e.recordPayment(c.id, 100, 'cash'); expect(pay.balance_after).toBe(b0 + sale.total - 100);
    const st = e.ledgerOf(c.id); const sum = st.reduce((a, x) => a + (x.type === 'charge' ? x.amount : x.type === 'payment' ? -x.amount : x.amount), 0);
    expect(st[st.length - 1].balance_after).toBe(sum);
  });
  it('split must add up; credit needs a customer', async () => {
    const { e } = await demo(); const p = e.db.products[0];
    let err: any; try { e.sell([{ productId: p.id, qty: 1 }], { method: 'split', cash: 1, mpesa: 1 }); } catch (x) { err = x; } expect(err.code).toBe('split_mismatch');
    try { e.sell([{ productId: p.id, qty: 1 }], { method: 'credit' }); } catch (x) { err = x; } expect(err.code).toBe('credit_needs_customer');
  });
  it('busy mode records a lump sum, reconciles later', async () => {
    const { e } = await demo(); const { sale } = e.sell([], { method: 'cash' }, { busyLump: 1200 }); expect(sale.reconciled).toBe(false);
    e.reconcileLump(sale.id, [{ productId: e.db.products[0].id, qty: 2 }]); expect(e.db.sales.find(s => s.id === sale.id)!.reconciled).toBe(true);
  });
});

describe('F5 M-Pesa', () => {
  it('pasting an SMS from a debtor matches and reduces their balance', async () => {
    const { e } = await demo(); const bk = e.db.customers[0]; const bal = e.balanceOf(bk.id); expect(bal).toBeGreaterThan(300);
    const r = e.ingestSms(`TFU2LI3ZA4 Confirmed. You have received Ksh300.00 from KEVIN BABA ${bk.phone} on 26/9/26 at 5:20 PM New M-PESA balance is Ksh430.00.`);
    expect(r.match.type).toBe('customer'); expect(e.balanceOf(bk.id)).toBe(bal - 300);
  });
  it('matches a pending M-Pesa POS sale by amount+time and flags duplicates', async () => {
    const { e } = await demo(); const p = e.db.products.find(p => p.retail_price === 65)!;
    const { sale } = e.sell([{ productId: p.id, qty: 2 }], { method: 'mpesa' }); expect(sale.mpesa_pending).toBe(true);
    const sms = `UAB7CD8EF9 Confirmed. You have received Ksh130.00 from STRANGER PERSON 0700999888 on 26/9/26 at 5:32 PM New M-PESA balance is Ksh1.00.`;
    expect(e.ingestSms(sms).match.type).toBe('sale'); expect(e.db.sales.find(s => s.id === sale.id)!.mpesa_pending).toBe(false);
    expect(e.ingestSms(sms).flags).toContain('duplicate_code');
  });
  it('unmatched payment can be assigned in one tap', async () => { const { e } = await demo(); const pay = e.db.payments_inbox[0]; const c = e.db.customers[1]; const b = e.balanceOf(c.id); e.assignPayment(pay.id, { customerId: c.id }); expect(e.balanceOf(c.id)).toBe(b - 350); });
});

describe('F2/F7 inventory & purchases', () => {
  it('receive → Store, transfer → Duka, timeline records both', async () => {
    const { e } = await demo(); const p = e.db.products.find(p => p.name.startsWith('Rina'))!; const s0 = e.qty(p.id, 'store'), d0 = e.qty(p.id, 'shop');
    const po = e.createPurchase(e.db.suppliers[0].id, [{ productId: p.id, qtyBuy: 2, costPerBuy: 3400 }]); e.receivePurchase(po.id);
    expect(e.qty(p.id, 'store')).toBe(s0 + 24); e.transfer(p.id, 12); expect(e.qty(p.id, 'shop')).toBe(d0 + 12); expect(e.qty(p.id, 'store')).toBe(s0 + 12);
    expect(e.timeline(p.id).slice(0, 2).map(m => m.reason).sort()).toEqual(['purchase', 'transfer']);
  });
  it('two suppliers, different prices → cheaper supplier hint; margin from latest cost', async () => {
    const { e } = await demo(); const jogoo = e.db.products.find(p => p.name.startsWith('Jogoo'))!;
    const best = e.bestPrice(jogoo.id)!; expect(best.supplier).toBe('Kamau Wholesalers Gikomba'); expect(best.cost).toBe(155);
    const po = e.createPurchase(e.db.suppliers[2].id, [{ productId: jogoo.id, qtyBuy: 1, costPerBuy: 1980 }]); e.receivePurchase(po.id);
    expect(e.product(jogoo.id).cost_price).toBe(165); expect(e.bestPrice(jogoo.id)!.supplier).toBe('Kamau Wholesalers Gikomba');
  });
  it('F8 draft order contains suggested quantities for total-low items', async () => {
    const { e } = await demo(); const low = e.reorderList().filter(r => r.signal === 'total_low'); expect(low.length).toBeGreaterThanOrEqual(5);
    const po = e.draftOrder()!; const items = e.db.purchase_items.filter(i => i.purchase_id === po.id); expect(items.length).toBeGreaterThan(0);
    for (const i of items) { const r = low.find(x => x.p.id === i.product_id)!; expect(i.qty_buy_units).toBe(r.suggestBuy); expect(i.qty_buy_units).toBeGreaterThan(0); }
  });
  it('insufficient store stock is refused', async () => { const { e } = await demo(); const p = e.db.products.find(p => p.name.startsWith('Mumias'))!; let err: any; try { e.transfer(p.id, 9999); } catch (x) { err = x; } expect(err.code).toBe('insufficient_stock'); });
});

describe('F6 cash day simulation', () => {
  it('open → sales → debt payment → payout → close gives exact expected + variance', async () => {
    const db = emptyDataSet(); const now = new Date('2026-09-28T08:00:00'); let t = now.getTime();
    const e = new DukaEngine(db, { shopId: 's', userId: 'u', role: 'owner', deviceId: 'd', now: () => new Date(t += 60000) });
    db.shops.push({ id: 's', name: 'T', owner_name: 'O', phone: '', currency: 'KES', language: 'en', mpesa_type: 'till', settings_json: { reminderDay: 6, reminderMinBalance: 0, busyMode: false, theme: 'dark' }, created_at: '', updated_at: '' } as any);
    db.locations.push({ id: 'L1', shop_id: 's', name: 'Duka', type: 'shop' } as any, { id: 'L2', shop_id: 's', name: 'Store', type: 'store' } as any);
    const p = e.upsertProduct({ name: 'Bread', category_id: 'c', buy_unit: 'crate', sell_unit: 'loaf', units_per_buy_unit: 12, cost_price: 55, retail_price: 65, reorder_level: 5 }) as any;
    e.adjust(p.id, 'shop', 50); const c = e.addCustomer({ name: 'Mama Njeri' }); e.addCredit(c.id, 400);
    e.openSession(2000);
    e.sell([{ productId: p.id, qty: 10 }], { method: 'cash' }); e.sell([{ productId: p.id, qty: 4 }], { method: 'mpesa' }); e.sell([{ productId: p.id, qty: 2 }], { method: 'split', cash: 30, mpesa: 100 });
    e.recordPayment(c.id, 200, 'cash'); e.addExpense(150, 'Transport');
    const r = e.closeSession(2700);
    expect(r.figures.expected).toBe(2000 + 650 + 30 + 200 - 150); expect(r.variance).toBe(-30);
  });
  it('seeded staff shortage pattern produced a cash-gap alert', async () => { const { db } = await demo(); expect(db.alerts.some(a => a.type === 'cash_gap')).toBe(true); });
});

describe('F11 stock-take', () => {
  it('count with deliberate variance posts correction moves + alert', async () => {
    const { e } = await demo('staff'); const ps = e.db.products.filter(p => p.category_id === e.db.categories[1].id).slice(0, 3);
    const c = e.startCount('shop', 'Sugar shelf', ps.map(p => p.id)); const exp = e.qty(ps[0].id, 'shop');
    const r = e.postCount(c.id, { [ps[0].id]: exp - 3 }); expect(r.variances.length).toBe(1); expect(e.qty(ps[0].id, 'shop')).toBe(exp - 3);
    expect(e.db.stock_moves.some(m => m.reason === 'count_correction')).toBe(true); expect(e.db.alerts.some(a => a.type === 'count_variance')).toBe(true);
  });
});

describe('F8/F9 reports', () => {
  it('daily math adds up (cash + mpesa + credit = sales)', async () => { const { e } = await demo(); const d = dayFigures(e); expect(d.cash + d.mpesa + d.credit).toBe(d.sales); expect(d.gross).toBe(d.sales - d.cogs); expect(d.txns).toBeGreaterThan(20); });
  it('cash position = drawer + mpesa + receivables − payables', async () => { const { e } = await demo(); const c = cashPosition(e); expect(c.net).toBe(c.drawer + c.mpesa + c.receivables - c.payables); expect(c.payables).toBeGreaterThan(0); });
  it('profit truth, loan pack (6 months), expiry, dead stock, missed demand', async () => {
    const { e } = await demo(); const pt = profitTruth(e); expect(pt.top[0].profit).toBeGreaterThan(pt.top[5].profit); expect(pt.categories.length).toBeGreaterThan(5);
    const lp = loanPack(e); expect(lp.months.length).toBe(6); expect(lp.totals.sales).toBeGreaterThan(1_000_000);
    expect(e.expiring(30).some(x => x.days <= 7)).toBe(true); expect(e.deadStock().length).toBeGreaterThanOrEqual(5); expect(missedDemand(e)[0].count).toBe(3);
  });
  it('weekly narrative reads naturally in both languages', async () => {
    const { e } = await demo(); const sw = weeklyNarrative(e, 'sw'); const en = weeklyNarrative(e, 'en');
    expect(sw.paragraphs[0]).toMatch(/^Wiki hii umeuza KSh/); expect(en.paragraphs[0]).toMatch(/^You sold KSh/); expect(en.paragraphs.join(' ')).toMatch(/formula/);
  });
});

describe('F1/F8 permissions in the engine', () => {
  it('staff cannot edit prices, void, or receive purchases', async () => {
    const { e } = await demo('staff'); const p = e.db.products[0];
    for (const f of [() => e.updatePrice(p.id, 1), () => e.voidSale(e.db.sales[0].id), () => e.createPurchase(e.db.suppliers[0].id, [])]) { let err: any; try { f(); } catch (x) { err = x; } expect(err instanceof PermissionError).toBe(true); }
  });
  it('every mutation writes audit_log', async () => { const { e } = await demo(); e.addDemand('gas'); expect(e.db.audit_log.some(a => a.action === 'demand.add')).toBe(true); });
});

describe('F10 Duka Brain executes every utterance', () => {
  it('addCredit Baba Kevin 450', async () => { const { e } = await demo(); const bk = e.db.customers[0]; const b = e.balanceOf(bk.id); const r = await runAgent(e, 'Andika deni ya Baba Kevin mia nne hamsini'); expect(r.ok).toBe(true); expect(e.balanceOf(bk.id)).toBe(b + 450); expect(r.reply).toMatch(/Nimeandika deni la KSh 450 kwa Baba Kevin/); });
  it('transfer 2 cartons of milk from store', async () => { const { e } = await demo(); const m = e.db.products.find(p => p.name.startsWith('Brookside Milk'))!; const s = e.qty(m.id, 'shop'); const r = await runAgent(e, 'Nimehamisha katoni mbili za maziwa kutoka store'); expect(r.ok).toBe(true); expect(e.qty(m.id, 'shop')).toBe(s + 48); });
  it('who owes > 1000', async () => { const { e } = await demo(); const r = await runAgent(e, 'Nani ananidai zaidi ya elfu moja?'); expect(r.ok).toBe(true); expect((r.data as any[]).every(d => d.balance > 1000)).toBe(true); expect(r.reply).toMatch(/wanadaiwa zaidi ya KSh 1,000/); });
  it('daily report sw + en', async () => { const { e } = await demo(); expect((await runAgent(e, 'Ripoti ya leo')).reply).toMatch(/^Ripoti ya Leo/); expect((await runAgent(e, 'daily report')).reply).toMatch(/^Today's report/); });
  it('price of sugar to 65', async () => { const { e } = await demo(); const r = await runAgent(e, 'Weka bei ya sukari 65'); expect(r.ok).toBe(true); expect(e.db.products.find(p => p.name.startsWith('Mumias'))!.retail_price).toBe(65); });
  it('demand log: formula', async () => { const { e } = await demo(); const n = e.db.demand_log.length; const r = await runAgent(e, 'Mteja ameuliza formula ya watoto'); expect(r.ok).toBe(true); expect(e.db.demand_log.length).toBe(n + 1); });
  it('staff asking to change price gets a polite refusal', async () => { const { e } = await demo('staff'); const r = await runAgent(e, 'Weka bei ya sukari 65'); expect(r.ok).toBe(false); expect(r.reply).toMatch(/mwenye duka/); });
});
