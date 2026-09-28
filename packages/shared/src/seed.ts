/**
 * Demo Mode: a believable Nairobi-estate duka ("Juma General Stores", Kayole).
 * 119 real products, 2 locations, 15 debtors, 30 days of weekday-patterned sales,
 * 3 suppliers with price history, pending expiries, dead stock, shelf/total-low items,
 * a staff drawer-shortage pattern, and an unmatched M-Pesa payment. Deterministic.
 */
import { CATALOG } from './catalog';
import { emptyDataSet, DukaEngine, type DataSet } from './engine';
import { hashPin } from './auth';
import { addDays, dayKey, monthKey } from './dates';
import { reminderTemplate, morningBriefing, eveningReport } from './templates';
import type * as T from './types';

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const DOW_FACTOR = [0.85, 0.9, 0.88, 0.92, 1.0, 1.2, 1.45]; // Sun..Sat — Saturday spike, Friday payday lift

export const DEMO_PINS = { owner: '1234', staff: '0000' };

export async function buildDemo(now = new Date(), opts: { lang?: T.Lang } = {}): Promise<{ db: DataSet; shopId: string; ownerId: string; staffId: string }> {
  const r = rng(20240928);
  const db = emptyDataSet();
  const id = () => globalThis.crypto.randomUUID();
  const at = (d: Date) => d.toISOString();
  const base = (d: Date) => ({ id: id(), created_at: at(d), updated_at: at(d), deleted_at: null });
  const start = addDays(now, -31); start.setHours(7, 0, 0, 0);
  const shopId = id(), ownerId = id(), staffId = id();
  const history: T.MonthSummary[] = [];
  for (let m = 5; m >= 1; m--) { const d = new Date(now.getFullYear(), now.getMonth() - m, 15); const s = Math.round(310_000 + r() * 70_000 + (5 - m) * 9_000); const cogs = Math.round(s * (0.79 + r() * 0.02)); const ex = Math.round(22_000 + r() * 6_000); history.push({ month: monthKey(d), sales: s, cogs, expenses: ex, cashIn: Math.round(s * 0.93), cashOut: cogs + ex }); }
  db.shops.push({ ...base(start), id: shopId, name: 'Juma General Stores', owner_name: 'Juma Mwangi', phone: '0712345678', currency: 'KES', language: opts.lang ?? 'sw', mpesa_type: 'till', settings_json: { reminderDay: 6, reminderMinBalance: 200, busyMode: false, theme: 'dark', history } });
  db.users.push({ ...base(start), id: ownerId, shop_id: shopId, name: 'Juma Mwangi', phone: '0712345678', role: 'owner', pin_hash: await hashPin(shopId, DEMO_PINS.owner), active: true });
  db.users.push({ ...base(start), id: staffId, shop_id: shopId, name: 'Brian Otieno', phone: '0798111222', role: 'staff', pin_hash: await hashPin(shopId, DEMO_PINS.staff), active: true });
  const duka = { ...base(start), shop_id: shopId, name: 'Duka', type: 'shop' as const }; const store = { ...base(start), shop_id: shopId, name: 'Store', type: 'store' as const };
  db.locations.push(duka, store);

  // ── catalog ──
  const vel = new Map<string, number>(); const expDays = new Map<string, number>();
  let sort = 0;
  for (const [cat, rows] of Object.entries(CATALOG)) {
    const c = { ...base(start), shop_id: shopId, name: cat, sort: sort++ }; db.categories.push(c);
    for (const [name, sw, bu, su, upb, cost, retail, rl, exp, v] of rows) {
      const p: T.Product = { ...base(start), shop_id: shopId, category_id: c.id, name, name_sw: sw, barcode: String(6161100000000 + db.products.length * 7919).slice(0, 13), buy_unit: bu, sell_unit: su, units_per_buy_unit: upb, wastage_pct: /loose|kg\)/i.test(name) ? 2 : 0, cost_price: cost, retail_price: retail, wholesale_price: Math.round(retail - (retail - cost) * 0.45), loyal_price: Math.round(retail - (retail - cost) * 0.2), reorder_level: rl, track_expiry: exp > 0, active: true };
      db.products.push(p); vel.set(p.id, v); if (exp) expDays.set(p.id, exp);
    }
  }
  const P = (n: string) => db.products.find(p => p.name.startsWith(n))!;

  // ── people ──
  const custSpec: [string, string, number, T.Tier][] = [['Baba Kevin', '0722334455', 3000, 'loyal'], ['Mama Njeri', '0711223344', 2000, 'loyal'], ['Mzee Kamau', '0733445566', 5000, 'regular'], ['Mama Akinyi', '0701556677', 1500, 'regular'], ['Otieno Boda', '0799887766', 1000, 'regular'], ['Wanjiku Salon', '0745112233', 4000, 'wholesale'], ['Mama Mboga Rose', '0768990011', 3000, 'wholesale'], ['Kevin Fundi', '0712778899', 1500, 'regular'], ['Shiro', '0723667788', 1000, 'regular'], ['Baba Brayo', '0790223344', 2000, 'regular'], ['Mwalimu Achieng', '0708112299', 3000, 'loyal'], ['Hassan Kibanda', '0727445500', 2500, 'regular'], ['Nyambura', '0719003322', 1000, 'regular'], ['Mama Faith', '0741556688', 1500, 'regular'], ['Mutua Watchman', '0736778800', 800, 'regular']];
  for (const [name, phone, lim, tier] of custSpec) db.customers.push({ ...base(start), shop_id: shopId, name, phone, credit_limit: lim, tier });
  const sups = [['Bidco & Unga Distributors', '0720100200'], ['Kamau Wholesalers Gikomba', '0721300400'], ['Mwangi & Sons Supplies', '0722500600']].map(([name, phone]) => ({ ...base(start), shop_id: shopId, name, phone }));
  db.suppliers.push(...sups);

  // ── profiles that make every alert fire ──
  const profile = new Map<string, 'normal' | 'shelf_low' | 'total_low' | 'dead'>();
  for (const n of ['Brookside Milk', 'Coca-Cola', 'Jogoo', 'Supaloaf', 'Kasuku Cooking Fat 500g', 'Sunlight 2in1 Powder 500g']) profile.set(P(n).id, 'shelf_low');
  for (const n of ['Mumias Sugar', 'Kensalt 500g', 'Pampers', 'Ketepa', 'Colgate Toothpaste', 'Eggs']) profile.set(P(n).id, 'total_low');
  for (const p of db.products) if (vel.get(p.id) === 0) profile.set(p.id, 'dead');

  // ── 30 days of sales ──
  const sold = new Map<string, number>();
  const sellable = db.products.filter(p => vel.get(p.id)! > 0);
  const weights = sellable.map(p => vel.get(p.id)!); const wsum = weights.reduce((a, b) => a + b, 0);
  const pick = () => { let x = r() * wsum; for (let i = 0; i < sellable.length; i++) { x -= weights[i]; if (x <= 0) return sellable[i]; } return sellable[0]; };
  const creditors = db.customers.slice(0, 12);
  const openAt = new Date(now); openAt.setHours(6, 30, 0, 0);
  const moveRows: T.StockMove[] = [];
  const pushMove = (d: Date, product_id: string, qty: number, reason: T.MoveReason, from: string | null, to: string | null, ref?: string, user = ownerId) => moveRows.push({ ...base(d), shop_id: shopId, product_id, qty, reason, from_location: from, to_location: to, ref_id: ref ?? null, user_id: user, updated_by: user });
  for (let day = 29; day >= 0; day--) {
    const d0 = addDays(now, -day); d0.setHours(6, 30, 0, 0);
    let close = new Date(d0); close.setHours(21, 30, 0, 0);
    if (day === 0) { if (now <= openAt) continue; close = now < close ? now : close; }
    const span = close.getTime() - d0.getTime();
    const fullSpan = 15 * 3600_000;
    const n = Math.round(95 * DOW_FACTOR[d0.getDay()] * (0.9 + r() * 0.2) * (day === 0 ? span / fullSpan : 1));
    for (let t = 0; t < n; t++) {
      // morning + evening peaks
      const u = r(); const frac = u < 0.35 ? r() * 0.2 : u < 0.8 ? 0.65 + r() * 0.35 : r();
      const ts = new Date(d0.getTime() + Math.min(frac, 0.999) * span);
      const k = 1 + Math.floor(r() * r() * 4);
      const lines = new Map<string, number>();
      for (let j = 0; j < k; j++) { const p = pick(); const q = ['kg', 'piece', 'stick', 'card'].includes(p.sell_unit) && r() < 0.3 ? 2 : 1; lines.set(p.id, (lines.get(p.id) ?? 0) + q); }
      const roll = r(); const method: T.PaymentMethod = roll < 0.52 ? 'cash' : roll < 0.88 ? 'mpesa' : roll < 0.97 ? 'credit' : 'split';
      const cust = method === 'credit' || method === 'split' ? creditors[Math.floor(r() * creditors.length)] : null;
      const tier = cust?.tier ?? 'regular';
      let total = 0; const saleId = id(); const user = r() < 0.35 ? staffId : ownerId;
      for (const [pid, q] of lines) {
        const p = db.products.find(x => x.id === pid)!; const price = tier === 'wholesale' ? p.wholesale_price! : tier === 'loyal' ? p.loyal_price! : p.retail_price;
        total += price * q; sold.set(pid, (sold.get(pid) ?? 0) + q);
        db.sale_items.push({ ...base(ts), sale_id: saleId, product_id: pid, qty: q, unit_price: price, unit_cost_snapshot: p.cost_price, price_tier: tier });
        pushMove(ts, pid, q, 'sale', duka.id, null, saleId, user);
      }
      total = Math.round(total);
      const credit = method === 'credit' ? total : method === 'split' ? Math.round(total / 2) : 0;
      const mpesa = method === 'mpesa' ? total : method === 'split' ? total - credit : 0;
      const cash = method === 'cash' ? total : 0;
      db.sales.push({ ...base(ts), id: saleId, shop_id: shopId, user_id: user, customer_id: cust?.id ?? null, total, discount: 0, status: 'complete', payment_method: method, cash_amount: cash, mpesa_amount: mpesa, credit_amount: credit, device_id: 'demo', offline_created_at: at(ts), busy_lump: false, reconciled: true, mpesa_pending: false, updated_by: user });
      if (credit && cust) db.credit_ledger.push({ ...base(ts), shop_id: shopId, customer_id: cust.id, type: 'charge', amount: credit, balance_after: 0, sale_id: saleId, user_id: user, updated_by: user });
    }
  }
  // Debt repayments: most pay weekly-ish; Mzee Kamau & Otieno Boda have gone quiet (escalation demo).
  const quiet = new Set([db.customers[2].id, db.customers[4].id]);
  for (const c of creditors) {
    if (quiet.has(c.id)) continue;
    for (let day = 26; day >= 1; day -= 6 + Math.floor(r() * 4)) {
      const charges = db.credit_ledger.filter(l => l.customer_id === c.id && l.type === 'charge' && new Date(l.created_at) < addDays(now, -day)).reduce((a, l) => a + l.amount, 0);
      const paid = db.credit_ledger.filter(l => l.customer_id === c.id && l.type === 'payment').reduce((a, l) => a + l.amount, 0);
      const bal = charges - paid; if (bal < 100) continue;
      const amt = Math.round((bal * (0.5 + r() * 0.4)) / 50) * 50; const ts = addDays(now, -day); ts.setHours(18, Math.floor(r() * 59));
      db.credit_ledger.push({ ...base(ts), shop_id: shopId, customer_id: c.id, type: 'payment', amount: amt, balance_after: 0, method: r() < 0.6 ? 'mpesa' : 'cash', user_id: ownerId, note: 'Weekly payment' });
    }
  }
  // Old kitabu debts carried over from the paper notebook (onboarding import)
  const carry: [number, number][] = [[0, 850], [2, 2400], [4, 1350], [5, 1800], [10, 600]];
  for (const [ci, amt] of carry) { const ts = addDays(now, -31); db.credit_ledger.push({ ...base(ts), shop_id: shopId, customer_id: db.customers[ci].id, type: 'charge', amount: amt, balance_after: 0, note: 'Kutoka kitabu cha zamani', user_id: ownerId }); }

  // ── purchases, price memory (two suppliers, different prices for same products) ──
  const receivedQty = new Map<string, number>();
  const mkPurchase = (sup: typeof sups[number], dayAgo: number, items: [string, number, number, number?][], paid: 'full' | 'none', due?: number) => {
    const ts = addDays(now, -dayAgo); ts.setHours(9, 15);
    const pid = id(); let total = 0;
    for (const [n, qty, costPerBuy, expIn] of items) {
      const p = P(n); total += qty * costPerBuy;
      db.purchase_items.push({ ...base(ts), purchase_id: pid, product_id: p.id, qty_buy_units: qty, cost_per_buy_unit: costPerBuy, expiry_date: expIn != null ? dayKey(addDays(now, expIn)) : undefined });
      db.price_history.push({ ...base(ts), product_id: p.id, supplier_id: sup.id, cost_price: Math.round((costPerBuy / p.units_per_buy_unit) * 100) / 100, recorded_at: at(ts) });
      receivedQty.set(p.id, (receivedQty.get(p.id) ?? 0) + qty * p.units_per_buy_unit);
      pushMove(ts, p.id, qty * p.units_per_buy_unit, 'purchase', null, store.id, pid);
    }
    db.purchases.push({ ...base(ts), id: pid, shop_id: shopId, supplier_id: sup.id, invoice_no: `INV-${Math.floor(1000 + r() * 8999)}`, total_cost: total, status: 'received', paid_amount: paid === 'full' ? total : 0, due_date: due != null ? dayKey(addDays(now, due)) : undefined });
  };
  mkPurchase(sups[0], 20, [['Jogoo', 4, 1920], ['Soko', 3, 1850], ['Kasuku Cooking Fat 500g', 2, 3850], ['Elianto', 2, 4000], ['Blue Band 250g', 2, 2850, 60]], 'full');
  mkPurchase(sups[1], 12, [['Jogoo', 3, 1860], ['Mumias', 1, 7200], ['Brookside Milk', 4, 1330, 16], ['Coca-Cola', 4, 1390, 150], ['Sunlight 2in1 Powder 500g', 2, 3300]], 'full');
  mkPurchase(sups[2], 4, [['Soko', 2, 1790], ['Supaloaf', 3, 684, 1], ['Omo Multi', 2, 3550], ['KCC Milk', 2, 1250, 3], ['Fresh Mala', 2, 700, 9]], 'none', 2);
  // Last price recorded becomes cost (price memory → margin)
  for (const p of db.products) { const h = db.price_history.filter(x => x.product_id === p.id).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).pop(); if (h) p.cost_price = h.cost_price; }

  // ── opening stock + transfers so final levels hit each profile ──
  for (const p of db.products) {
    const s = sold.get(p.id) ?? 0; const v = vel.get(p.id)!; const prof = profile.get(p.id) ?? 'normal';
    const [F, S] = prof === 'shelf_low' ? [1 + Math.floor(r() * 2), p.units_per_buy_unit * 2] : prof === 'total_low' ? [Math.max(1, Math.floor(p.reorder_level / 3)), 0] : prof === 'dead' ? [4 + Math.floor(r() * 6), p.units_per_buy_unit] : [Math.ceil(v * 3) + p.reorder_level, Math.max(p.units_per_buy_unit, Math.ceil(v * 7))];
    const rec = receivedQty.get(p.id) ?? 0;
    let opening = s + F + S - rec;
    const extraStoreToShop = s + F;
    if (opening < 0) opening = 0; // received more than needed: surplus stays in store
    const d = new Date(start);
    pushMove(d, p.id, opening, 'purchase', null, store.id, undefined);
    const storeAvail = opening + rec;
    const toShop = Math.min(extraStoreToShop, storeAvail);
    pushMove(new Date(d.getTime() + 3600_000), p.id, toShop, 'transfer', store.id, duka.id);
    // expiry batches (FEFO demo): split what sits on shelf/store into dated batches
    const exp = expDays.get(p.id);
    if (exp) {
      const shelfLeft = F, storeLeft = storeAvail - toShop;
      const near = ['Brookside Yoghurt', 'KCC Milk', 'Fresh Mala', 'Supaloaf', 'Mandazi', 'Salad Tomatoes', 'Tropical Heat'].some(n => p.name.startsWith(n));
      const nearDays = p.name.startsWith('Brookside Yoghurt') ? 6 : p.name.startsWith('Fresh Mala') ? 12 : p.name.startsWith('Tropical') ? 25 : Math.min(exp, 5);
      if (shelfLeft > 0) db.stock_batches.push({ ...base(now), product_id: p.id, location_id: duka.id, qty: shelfLeft, expiry_date: dayKey(addDays(now, near ? nearDays : exp)) });
      if (storeLeft > 0) db.stock_batches.push({ ...base(now), product_id: p.id, location_id: store.id, qty: storeLeft, expiry_date: dayKey(addDays(now, near ? nearDays + 3 : exp + 10)) });
    }
  }
  db.stock_moves.push(...moveRows.sort((a, b) => a.created_at.localeCompare(b.created_at)));

  // ── cash sessions (14 days), with a staff shortage pattern ──
  for (let day = 14; day >= 1; day--) {
    const o = addDays(now, -day); o.setHours(6, 30, 0, 0); const c = new Date(o); c.setHours(21, 35);
    const staffShift = day % 2 === 0; const user = staffShift ? staffId : ownerId;
    const cashSales = db.sales.filter(s => s.offline_created_at >= at(o) && s.offline_created_at <= at(c)).reduce((a, s) => a + s.cash_amount, 0);
    const payouts = 300 + Math.round(r() * 400);
    db.expenses.push({ ...base(new Date(o.getTime() + 5 * 3600_000)), shop_id: shopId, category: r() < 0.5 ? 'Transport' : 'Lunch & tea', amount: payouts, user_id: user, note: '' });
    const cashDebt = db.credit_ledger.filter(l => l.type === 'payment' && l.method === 'cash' && l.created_at >= at(o) && l.created_at <= at(c)).reduce((a, l) => a + l.amount, 0);
    const expected = 2000 + cashSales + cashDebt - payouts;
    const v = staffShift && day <= 8 ? -(150 + Math.round(r() * 250)) : Math.round((r() - 0.5) * 60);
    db.cash_sessions.push({ ...base(o), shop_id: shopId, user_id: user, opened_at: at(o), closed_at: at(c), opening_float: 2000, expected_cash: expected, counted_cash: expected + v, variance: v });
  }
  if (now > openAt) db.cash_sessions.push({ ...base(openAt), shop_id: shopId, user_id: ownerId, opened_at: at(openAt), closed_at: null, opening_float: 2000, expected_cash: 2000 });

  // ── demand log, unmatched M-Pesa, first agent message ──
  const dem: [string, number][] = [['formula ya watoto (Nan 1)', 1], ['gas refill 6kg', 2], ['formula ya watoto (Nan 1)', 3], ['Maziwa ya Lala 500ml', 3], ['gas refill 6kg', 5], ['formula ya watoto (Nan 1)', 6], ['Omena kilo', 4]];
  for (const [text, d] of dem) db.demand_log.push({ ...base(addDays(now, -d)), shop_id: shopId, text, product_guess: text.includes('formula') ? 'Infant formula' : undefined, user_id: staffId });
  const tx = addDays(now, -1); tx.setHours(19, 42);
  const raw = `SJK3FGH7TY Confirmed. You have received Ksh350.00 from PETER OTIENO 0722000111 on ${tx.getDate()}/${tx.getMonth() + 1}/${String(tx.getFullYear()).slice(2)} at 7:42 PM New M-PESA balance is Ksh45,210.00.`;
  db.payments_inbox.push({ ...base(tx), shop_id: shopId, source: 'sms', raw_text: raw, mpesa_code: 'SJK3FGH7TY', payer_name: 'Peter Otieno', payer_phone: '0722000111', amount: 350, tx_time: at(tx), matched_sale_id: null, matched_customer_id: null, status: 'unmatched' });

  // ── derive ledger chains + alerts via the engine (same code path as production) ──
  const e = new DukaEngine(db, { shopId, userId: ownerId, role: 'owner', deviceId: 'demo', now: () => now });
  const byC = new Map<string, T.LedgerEntry[]>();
  for (const l of db.credit_ledger) { if (!byC.has(l.customer_id)) byC.set(l.customer_id, []); byC.get(l.customer_id)!.push(l); }
  for (const [cid] of byC) for (const row of e.ledgerOf(cid)) { const l = db.credit_ledger.find(x => x.id === row.id)!; l.balance_after = row.balance_after; }
  e.alert('unmatched_payment', 'info', 'KSh 350 from Peter Otieno', 'Tap to put it against a debt', { paymentId: db.payments_inbox[0].id, key: `unm:${db.payments_inbox[0].id}` });
  e.alert('cash_gap', 'warn', 'Repeated drawer shortages', 'Brian Otieno was short on 4 of his last 4 closes', { key: 'gap:demo' });
  db.shops[0].settings_json.reminderDay = now.getDay();
  e.tick({ reminder: reminderTemplate(db.shops[0].name), briefing: morningBriefing, evening: eveningReport });
  db.agent_messages.push({ ...base(now), shop_id: shopId, channel: 'inapp', direction: 'out', body: db.shops[0].language === 'sw' ? 'Karibu! Mimi ni Duka Brain. Niambie kama unavyomwambia store boy: "Andika deni ya Baba Kevin mia nne hamsini".' : 'Karibu! I\'m Duka Brain. Talk to me like you talk to your store boy: "Add credit for Baba Kevin 450".' });
  db.audit_log.length = 0; // demo seed isn't user activity
  return { db, shopId, ownerId, staffId };
}
