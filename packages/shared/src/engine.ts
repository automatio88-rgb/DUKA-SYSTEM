/**
 * DukaEngine — the single source of business truth.
 * Runs identically in the browser (offline, over Dexie-loaded data), in the Supabase edge
 * function, and in tests. Every mutation: permission check → rows → audit_log → change feed
 * (which the web app persists to IndexedDB + the sync oplog).
 */
import type * as T from './types';
import { deriveLevels, levelOf, consumeFEFO, daysUntil, expiryBand, expiryDiscount } from './stock';
import { recomputeChain, creditCheck, escalationLevel } from './ledger';
import { weekdayVelocity, suggestOrder, stockSignal, daysOfStock } from './velocity';
import { expectedCash, variance as cashVariance, gapAlert } from './cash';
import { parseMpesaSms, matchPayment, suspiciousFlags } from './mpesa';
import { assertCan, can, type Action } from './permissions';
import { validateSplit, toKsh } from './money';
import { dayKey, addDays, daysBetween } from './dates';

export interface DataSet {
  shops: T.Shop[]; users: T.User[]; locations: T.Location[]; categories: T.Category[]; products: T.Product[];
  stock_moves: T.StockMove[]; stock_batches: T.StockBatch[]; suppliers: T.Supplier[]; purchases: T.Purchase[]; purchase_items: T.PurchaseItem[];
  price_history: T.PriceHistory[]; customers: T.Customer[]; sales: T.Sale[]; sale_items: T.SaleItem[]; credit_ledger: T.LedgerEntry[];
  reminders: T.Reminder[]; payments_inbox: T.PaymentInbox[]; cash_sessions: T.CashSession[]; expenses: T.Expense[];
  stock_counts: T.StockCount[]; stock_count_items: T.StockCountItem[]; demand_log: T.DemandLog[]; agent_messages: T.AgentMessage[];
  alerts: T.Alert[]; audit_log: T.AuditLog[];
}
export type Table = keyof DataSet;
export const TABLES: Table[] = ['shops', 'users', 'locations', 'categories', 'products', 'stock_moves', 'stock_batches', 'suppliers', 'purchases', 'purchase_items', 'price_history', 'customers', 'sales', 'sale_items', 'credit_ledger', 'reminders', 'payments_inbox', 'cash_sessions', 'expenses', 'stock_counts', 'stock_count_items', 'demand_log', 'agent_messages', 'alerts', 'audit_log'];
export const emptyDataSet = (): DataSet => Object.fromEntries(TABLES.map(t => [t, []])) as unknown as DataSet;

export interface Ctx { shopId: string; userId: string; role: T.Role; deviceId: string; now?: () => Date }
export interface Change { table: Table; row: any }
export interface CartLine { productId: string; qty: number; tier?: T.Tier; unitPrice?: number }
export interface PaymentInput { method: T.PaymentMethod; cash?: number; mpesa?: number; credit?: number; customerId?: string | null; mpesaConfirmed?: boolean }
export class DomainError extends Error { constructor(public code: string, public data?: Record<string, unknown>) { super(code); } }

const uuid = () => (globalThis.crypto as Crypto).randomUUID();

export class DukaEngine {
  private changes: Change[] = [];
  private levelCache: Map<string, number> | null = null;
  private velCache: Map<string, Map<string, number>> | null = null;
  constructor(public db: DataSet, public ctx: Ctx, private newId: () => string = uuid) {}

  // ─── infrastructure ──────────────────────────────────────────
  now() { return this.ctx.now ? this.ctx.now() : new Date(); }
  iso() { return this.now().toISOString(); }
  can(a: Action) { return can(this.ctx.role, a); }
  drain(): Change[] { const c = this.changes; this.changes = []; return c; }
  get shop(): T.Shop { return this.db.shops.find(s => s.id === this.ctx.shopId)!; }
  loc(type: T.LocationType) { const l = this.db.locations.find(l => l.type === type && !l.deleted_at); if (!l) throw new DomainError('no_location'); return l.id; }
  product(id: string) { const p = this.db.products.find(p => p.id === id); if (!p) throw new DomainError('no_product', { id }); return p; }
  customer(id: string) { const c = this.db.customers.find(c => c.id === id); if (!c) throw new DomainError('no_customer', { id }); return c; }

  put<K extends Table>(table: K, row: Partial<DataSet[K][number]> & { id?: string }, audit?: string): DataSet[K][number] {
    const arr = this.db[table] as any[];
    const ts = this.iso();
    row = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as typeof row;
    const idx = row.id ? arr.findIndex(r => r.id === row.id) : -1;
    const before = idx >= 0 ? arr[idx] : undefined;
    const full = { ...(before ?? { id: row.id ?? this.newId(), created_at: ts, deleted_at: null }), ...row, updated_at: ts, updated_by: this.ctx.userId };
    if ('shop_id' in full || ['products', 'customers', 'sales', 'stock_moves', 'credit_ledger', 'suppliers', 'purchases', 'alerts', 'expenses', 'demand_log', 'reminders', 'payments_inbox', 'cash_sessions', 'stock_counts', 'agent_messages', 'audit_log', 'categories', 'locations', 'users'].includes(table)) full.shop_id = full.shop_id ?? this.ctx.shopId;
    if (idx >= 0) arr[idx] = full; else arr.push(full);
    this.changes.push({ table, row: full });
    if (table === 'stock_moves') this.levelCache = null;
    if (table === 'sale_items' || table === 'sales') this.velCache = null;
    if (audit && table !== 'audit_log') {
      this.put('audit_log', { user_id: this.ctx.userId, action: audit, entity: table, entity_id: full.id, before_json: before ?? null, after_json: full } as any);
    }
    return full;
  }

  // ─── stock ───────────────────────────────────────────────────
  levels() { return (this.levelCache ??= deriveLevels(this.db.stock_moves)); }
  qty(productId: string, type: T.LocationType) { return levelOf(this.levels(), productId, this.loc(type)); }
  move(productId: string, qty: number, reason: T.MoveReason, from: string | null, to: string | null, refId?: string, note?: string) {
    return this.put('stock_moves', { product_id: productId, qty, reason, from_location: from, to_location: to, ref_id: refId ?? null, note, user_id: this.ctx.userId } as any, `stock.${reason}`);
  }
  private shiftBatches(productId: string, fromLoc: string, qty: number, toLoc?: string) {
    const batches = this.db.stock_batches.filter(b => b.product_id === productId && b.location_id === fromLoc && !b.deleted_at);
    if (!batches.length) return;
    const { consumed } = consumeFEFO(batches, qty);
    for (const c of consumed) {
      const b = batches.find(x => x.id === c.id)!;
      this.put('stock_batches', { id: b.id, qty: b.qty - c.qty });
      if (toLoc) {
        const twin = this.db.stock_batches.find(x => x.product_id === productId && x.location_id === toLoc && x.expiry_date === b.expiry_date && !x.deleted_at);
        if (twin) this.put('stock_batches', { id: twin.id, qty: twin.qty + c.qty });
        else this.put('stock_batches', { product_id: productId, location_id: toLoc, qty: c.qty, expiry_date: b.expiry_date, purchase_id: b.purchase_id } as any);
      }
    }
  }
  transfer(productId: string, qty: number, from: T.LocationType = 'store', note?: string) {
    assertCan(this.ctx.role, 'transfer');
    if (qty <= 0) throw new DomainError('bad_qty');
    const f = this.loc(from), to = this.loc(from === 'store' ? 'shop' : 'store');
    const available = levelOf(this.levels(), productId, f);
    if (available < qty) throw new DomainError('insufficient_stock', { available });
    this.shiftBatches(productId, f, qty, to);
    return this.move(productId, qty, 'transfer', f, to, undefined, note);
  }
  adjust(productId: string, type: T.LocationType, delta: number, reason: T.MoveReason = 'adjustment', note?: string) {
    assertCan(this.ctx.role, reason === 'count_correction' ? 'count' : 'adjust');
    const l = this.loc(type);
    if (delta < 0) this.shiftBatches(productId, l, -delta);
    return delta >= 0 ? this.move(productId, delta, reason, null, l, undefined, note) : this.move(productId, -delta, reason, l, null, undefined, note);
  }
  timeline(productId: string) { return this.db.stock_moves.filter(m => m.product_id === productId && !m.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at)); }

  // ─── velocity ────────────────────────────────────────────────
  dailyQty() {
    if (this.velCache) return this.velCache;
    const saleDay = new Map<string, string>();
    for (const s of this.db.sales) if (s.status === 'complete') saleDay.set(s.id, dayKey(s.offline_created_at || s.created_at));
    const m = new Map<string, Map<string, number>>();
    for (const it of this.db.sale_items) {
      const d = saleDay.get(it.sale_id); if (!d) continue;
      if (!m.has(it.product_id)) m.set(it.product_id, new Map());
      const pm = m.get(it.product_id)!; pm.set(d, (pm.get(d) ?? 0) + it.qty);
    }
    return (this.velCache = m);
  }
  velocity(productId: string) {
    const pm = this.dailyQty().get(productId);
    return weekdayVelocity(pm ? [...pm].map(([date, qty]) => ({ date, qty })) : [], this.now());
  }
  topMovers(n = 40) {
    return this.db.products.filter(p => p.active && !p.deleted_at)
      .map(p => ({ p, v: this.velocity(p.id).total })).sort((a, b) => b.v - a.v).slice(0, n).map(x => x.p);
  }

  // ─── POS ─────────────────────────────────────────────────────
  priceFor(p: T.Product, tier: T.Tier = 'regular') {
    return tier === 'wholesale' && p.wholesale_price ? p.wholesale_price : tier === 'loyal' && p.loyal_price ? p.loyal_price : p.retail_price;
  }
  sell(lines: CartLine[], pay: PaymentInput, opts: { discount?: number; id?: string; busyLump?: number; offlineAt?: string } = {}) {
    assertCan(this.ctx.role, 'sell');
    if (opts.id && this.db.sales.some(s => s.id === opts.id)) return { sale: this.db.sales.find(s => s.id === opts.id)!, warnings: ['duplicate_ignored'] };
    const warnings: string[] = [];
    const busy = opts.busyLump != null;
    if (!busy && !lines.length) throw new DomainError('empty_cart');
    const customer = pay.customerId ? this.customer(pay.customerId) : undefined;
    const tier = customer?.tier ?? 'regular';
    const priced = lines.map(l => { const p = this.product(l.productId); return { l, p, price: l.unitPrice ?? this.priceFor(p, l.tier ?? tier) }; });
    const gross = busy ? toKsh(opts.busyLump!) : toKsh(priced.reduce((a, x) => a + x.price * x.l.qty, 0));
    const discount = toKsh(opts.discount ?? 0);
    const total = gross - discount;
    let cash = 0, mpesa = 0, credit = 0;
    if (pay.method === 'cash') cash = total; else if (pay.method === 'mpesa') mpesa = total; else if (pay.method === 'credit') credit = total;
    else { cash = toKsh(pay.cash ?? 0); mpesa = toKsh(pay.mpesa ?? 0); credit = toKsh(pay.credit ?? 0); const v = validateSplit(total, { cash, mpesa, credit }); if (!v.ok) throw new DomainError('split_mismatch', { diff: v.diff }); }
    if (credit > 0 && !customer) throw new DomainError('credit_needs_customer');
    if (customer && credit > 0) { const chk = creditCheck(this.balanceOf(customer.id), credit, customer.credit_limit); if (!chk.ok) warnings.push(`over_limit:${chk.over}`); }
    const sale = this.put('sales', {
      id: opts.id, user_id: this.ctx.userId, customer_id: customer?.id ?? null, total, discount, status: 'complete',
      payment_method: pay.method, cash_amount: cash, mpesa_amount: mpesa, credit_amount: credit, device_id: this.ctx.deviceId,
      offline_created_at: opts.offlineAt ?? this.iso(), busy_lump: busy, reconciled: !busy, mpesa_pending: mpesa > 0 && !pay.mpesaConfirmed,
    } as any, 'sale.create');
    const duka = this.loc('shop');
    for (const { l, p, price } of priced) {
      this.put('sale_items', { sale_id: sale.id, product_id: p.id, qty: l.qty, unit_price: price, unit_cost_snapshot: p.cost_price, price_tier: l.tier ?? tier } as any);
      if (levelOf(this.levels(), p.id, duka) < l.qty) warnings.push(`negative_stock:${p.name}`);
      this.shiftBatches(p.id, duka, l.qty);
      this.move(p.id, l.qty, 'sale', duka, null, sale.id);
    }
    if (credit > 0 && customer) this.ledger(customer.id, 'charge', credit, { saleId: sale.id, note: busy ? 'busy-mode' : undefined });
    return { sale, warnings };
  }
  voidSale(saleId: string, note?: string) {
    assertCan(this.ctx.role, 'void');
    const s = this.db.sales.find(x => x.id === saleId); if (!s || s.status === 'void') throw new DomainError('not_voidable');
    this.put('sales', { id: s.id, status: 'void' } as any, 'sale.void');
    const duka = this.loc('shop');
    for (const it of this.db.sale_items.filter(i => i.sale_id === s.id)) this.move(it.product_id, it.qty, 'adjustment', null, duka, s.id, 'void');
    if (s.credit_amount > 0 && s.customer_id) this.ledger(s.customer_id, 'adjustment', -s.credit_amount, { saleId: s.id, note: note ?? 'void' });
  }
  reconcileLump(saleId: string, lines: CartLine[]) {
    const s = this.db.sales.find(x => x.id === saleId); if (!s?.busy_lump) throw new DomainError('not_lump');
    const duka = this.loc('shop');
    for (const l of lines) { const p = this.product(l.productId); this.put('sale_items', { sale_id: s.id, product_id: p.id, qty: l.qty, unit_price: l.unitPrice ?? p.retail_price, unit_cost_snapshot: p.cost_price, price_tier: 'regular' } as any); this.shiftBatches(p.id, duka, l.qty); this.move(p.id, l.qty, 'sale', duka, null, s.id, 'reconciled'); }
    this.put('sales', { id: s.id, reconciled: true } as any, 'sale.reconcile');
  }

  // ─── Kitabu ──────────────────────────────────────────────────
  addCustomer(c: { name: string; phone?: string; credit_limit?: number; tier?: T.Tier; notes?: string; id?: string }) {
    assertCan(this.ctx.role, 'credit');
    return this.put('customers', { tier: 'regular', ...c } as any, 'customer.create');
  }
  findCustomer(name?: string) {
    if (!name) return undefined;
    const n = name.toLowerCase().trim();
    const list = this.db.customers.filter(c => !c.deleted_at);
    return list.find(c => c.name.toLowerCase() === n) ?? list.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))
      ?? list.find(c => n.split(' ').filter(w => w.length > 2 && !['baba', 'mama', 'mzee'].includes(w)).some(w => c.name.toLowerCase().includes(w)));
  }
  ledgerOf(customerId: string) { return recomputeChain(this.db.credit_ledger.filter(e => e.customer_id === customerId)); }
  balanceOf(customerId: string) { const l = this.ledgerOf(customerId); return l.length ? l[l.length - 1].balance_after : 0; }
  balances() { const m = new Map<string, number>(); for (const c of this.db.customers) m.set(c.id, this.balanceOf(c.id)); return m; }
  ledger(customerId: string, type: T.LedgerEntry['type'], amount: number, o: { saleId?: string; note?: string; method?: 'cash' | 'mpesa' } = {}) {
    assertCan(this.ctx.role, type === 'payment' ? 'payment' : 'credit');
    if (type !== 'adjustment' && amount <= 0) throw new DomainError('bad_amount');
    const bal = this.balanceOf(customerId);
    const delta = type === 'charge' ? amount : type === 'payment' ? -amount : amount;
    return this.put('credit_ledger', { customer_id: customerId, type, amount: toKsh(amount), balance_after: toKsh(bal + delta), sale_id: o.saleId ?? null, note: o.note, method: o.method, user_id: this.ctx.userId } as any, `credit.${type}`);
  }
  addCredit(customerId: string, amount: number, note?: string) {
    const c = this.customer(customerId);
    const chk = creditCheck(this.balanceOf(customerId), amount, c.credit_limit);
    const entry = this.ledger(customerId, 'charge', amount, { note });
    if (!chk.ok) this.alert('credit_limit', 'warn', `${c.name}: over limit`, `KSh ${chk.over} above limit`, { customerId, key: `limit:${customerId}:${dayKey(this.now())}` });
    return { entry, overLimit: chk.ok ? 0 : chk.over };
  }
  recordPayment(customerId: string, amount: number, method: 'cash' | 'mpesa' = 'cash', note?: string) { return this.ledger(customerId, 'payment', amount, { method, note }); }
  lastPaymentDays(customerId: string) {
    const l = this.db.credit_ledger.filter(e => e.customer_id === customerId && !e.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastPay = [...l].reverse().find(e => e.type === 'payment');
    const ref = lastPay ?? l[0];
    return ref ? daysBetween(ref.created_at, this.now()) : 0;
  }
  debtors(min = 0) {
    return this.db.customers.filter(c => !c.deleted_at).map(c => ({ c, balance: this.balanceOf(c.id), days: this.lastPaymentDays(c.id) }))
      .filter(x => x.balance > min).sort((a, b) => b.balance - a.balance);
  }

  // ─── M-Pesa ──────────────────────────────────────────────────
  ingestSms(raw: string, source: T.PaymentInbox['source'] = 'sms') {
    const r = parseMpesaSms(raw);
    if (!r.ok) throw new DomainError('mpesa_unparseable', { reason: r.reason });
    const p = r.value;
    const known = new Set(this.db.payments_inbox.map(x => x.mpesa_code).filter(Boolean) as string[]);
    const flags = suspiciousFlags(p, known, this.now());
    const base = { source, raw_text: raw, mpesa_code: p.code, payer_name: p.payerName, payer_phone: p.payerPhone, amount: p.amount, tx_time: p.txTime } as any;
    if (flags.includes('duplicate_code')) {
      const row = this.put('payments_inbox', { ...base, status: 'suspicious', flag: flags.join(',') }, 'payment.suspicious');
      this.alert('suspicious_payment', 'critical', `Duplicate M-Pesa ${p.code}`, `KSh ${p.amount} from ${p.payerName ?? 'unknown'} was already recorded`, { paymentId: row.id, key: `susp:${row.id}` });
      return { payment: row, match: { type: 'none' as const }, flags };
    }
    const sales = this.db.sales.filter(s => s.mpesa_pending && s.status === 'complete').map(s => ({ id: s.id, mpesa_amount: s.mpesa_amount, created_at: s.offline_created_at, mpesaPending: true }));
    const customers = this.db.customers.map(c => ({ id: c.id, name: c.name, phone: c.phone, balance: this.balanceOf(c.id) }));
    const match = matchPayment(p, sales, customers);
    const status = flags.length ? 'suspicious' : match.type === 'none' ? 'unmatched' : 'matched';
    const row = this.put('payments_inbox', { ...base, status, flag: flags.join(',') || undefined, matched_sale_id: match.type === 'sale' ? match.id : null, matched_customer_id: match.type === 'customer' ? match.id : null }, 'payment.ingest');
    if (status === 'matched') this.applyPayment(row as T.PaymentInbox);
    else if (status === 'unmatched') this.alert('unmatched_payment', 'info', `KSh ${p.amount} from ${p.payerName ?? p.payerPhone ?? 'M-Pesa'}`, 'Tap to put it against a debt', { paymentId: row.id, key: `unm:${row.id}` });
    return { payment: row, match, flags };
  }
  private applyPayment(p: T.PaymentInbox) {
    if (p.matched_customer_id) { const bal = this.balanceOf(p.matched_customer_id); this.recordPayment(p.matched_customer_id, Math.min(p.amount, Math.max(bal, p.amount)), 'mpesa', `M-Pesa ${p.mpesa_code}`); }
    if (p.matched_sale_id) this.put('sales', { id: p.matched_sale_id, mpesa_pending: false } as any, 'sale.mpesa_confirmed');
  }
  assignPayment(paymentId: string, target: { customerId?: string; saleId?: string }) {
    const p = this.db.payments_inbox.find(x => x.id === paymentId); if (!p) throw new DomainError('no_payment');
    const row = this.put('payments_inbox', { id: p.id, status: 'matched', matched_customer_id: target.customerId ?? null, matched_sale_id: target.saleId ?? null } as any, 'payment.assign');
    this.applyPayment(row as T.PaymentInbox);
    for (const a of this.db.alerts.filter(a => (a.data_json as any)?.paymentId === p.id && !a.read_at)) this.put('alerts', { id: a.id, read_at: this.iso() } as any);
    return row;
  }
  ignorePayment(paymentId: string) { return this.put('payments_inbox', { id: paymentId, status: 'ignored' } as any, 'payment.ignore'); }

  // ─── Cash sessions ───────────────────────────────────────────
  openSession(float: number) {
    assertCan(this.ctx.role, 'cash');
    if (this.currentSession()) throw new DomainError('session_open');
    return this.put('cash_sessions', { user_id: this.ctx.userId, opened_at: this.iso(), opening_float: toKsh(float), expected_cash: toKsh(float) } as any, 'cash.open');
  }
  currentSession() { return this.db.cash_sessions.find(s => !s.closed_at && !s.deleted_at); }
  sessionFigures(s: T.CashSession, until = this.iso()) {
    const inWin = (iso: string) => iso >= s.opened_at && iso <= until;
    const cashSales = this.db.sales.filter(x => x.status === 'complete' && inWin(x.offline_created_at)).reduce((a, x) => a + x.cash_amount, 0);
    const mpesaSales = this.db.sales.filter(x => x.status === 'complete' && inWin(x.offline_created_at)).reduce((a, x) => a + x.mpesa_amount, 0);
    const cashDebtPayments = this.db.credit_ledger.filter(e => e.type === 'payment' && e.method === 'cash' && inWin(e.created_at)).reduce((a, e) => a + e.amount, 0);
    const payouts = this.db.expenses.filter(e => inWin(e.created_at) && !e.deleted_at).reduce((a, e) => a + e.amount, 0);
    return { cashSales, mpesaSales, cashDebtPayments, payouts, expected: expectedCash({ openingFloat: s.opening_float, cashSales, cashDebtPayments, payouts }) };
  }
  addExpense(amount: number, category: string, note?: string) {
    assertCan(this.ctx.role, 'cash');
    return this.put('expenses', { amount: toKsh(amount), category, note, user_id: this.ctx.userId, session_id: this.currentSession()?.id } as any, 'expense.create');
  }
  closeSession(counted: number, note?: string) {
    const s = this.currentSession(); if (!s) throw new DomainError('no_session');
    const f = this.sessionFigures(s);
    const v = cashVariance(f.expected, counted);
    const row = this.put('cash_sessions', { id: s.id, closed_at: this.iso(), expected_cash: f.expected, counted_cash: toKsh(counted), variance: v, note } as any, 'cash.close');
    const hist = this.db.cash_sessions.filter(x => x.closed_at && x.variance != null).sort((a, b) => a.closed_at!.localeCompare(b.closed_at!)).map(x => ({ user_id: x.user_id, variance: x.variance! }));
    const g = gapAlert(hist);
    if (g) this.alert('cash_gap', g.level, g.reason === 'pattern' ? 'Repeated drawer shortages' : `Drawer short KSh ${Math.abs(v)}`, g.reason === 'pattern' ? `Same person short 3 of last 5 closes, total KSh ${Math.abs(g.amount)}` : `Expected KSh ${f.expected}, counted KSh ${counted}`, { sessionId: s.id, key: `gap:${s.id}` });
    return { session: row, figures: f, variance: v };
  }

  // ─── Purchases & suppliers ───────────────────────────────────
  addSupplier(s: { name: string; phone?: string; notes?: string; id?: string }) { assertCan(this.ctx.role, 'purchase'); return this.put('suppliers', s as any, 'supplier.create'); }
  createPurchase(supplierId: string, items: { productId: string; qtyBuy: number; costPerBuy: number; expiry?: string }[], o: { invoiceNo?: string; paid?: number; dueDate?: string; id?: string } = {}) {
    assertCan(this.ctx.role, 'purchase');
    const total = toKsh(items.reduce((a, i) => a + i.qtyBuy * i.costPerBuy, 0));
    const pur = this.put('purchases', { id: o.id, supplier_id: supplierId, invoice_no: o.invoiceNo, total_cost: total, status: 'draft', paid_amount: toKsh(o.paid ?? 0), due_date: o.dueDate } as any, 'purchase.create');
    for (const i of items) this.put('purchase_items', { purchase_id: pur.id, product_id: i.productId, qty_buy_units: i.qtyBuy, cost_per_buy_unit: i.costPerBuy, expiry_date: i.expiry } as any);
    return pur;
  }
  receivePurchase(purchaseId: string) {
    assertCan(this.ctx.role, 'purchase');
    const pur = this.db.purchases.find(p => p.id === purchaseId); if (!pur || pur.status === 'received') throw new DomainError('not_receivable');
    const store = this.loc('store');
    for (const it of this.db.purchase_items.filter(i => i.purchase_id === pur.id)) {
      const p = this.product(it.product_id);
      const units = it.qty_buy_units * p.units_per_buy_unit;
      this.move(p.id, units, 'purchase', null, store, pur.id);
      if (p.track_expiry && it.expiry_date) this.put('stock_batches', { product_id: p.id, location_id: store, qty: units, expiry_date: it.expiry_date, purchase_id: pur.id } as any);
      const cps = Math.round((it.cost_per_buy_unit / (p.units_per_buy_unit * (1 - (p.wastage_pct || 0) / 100))) * 100) / 100;
      this.put('price_history', { product_id: p.id, supplier_id: pur.supplier_id, cost_price: cps, recorded_at: this.iso() } as any);
      this.put('products', { id: p.id, cost_price: cps } as any, 'product.cost');
    }
    return this.put('purchases', { id: pur.id, status: 'received' } as any, 'purchase.receive');
  }
  payPurchase(purchaseId: string, amount: number) { const p = this.db.purchases.find(x => x.id === purchaseId)!; return this.put('purchases', { id: p.id, paid_amount: p.paid_amount + toKsh(amount) } as any, 'purchase.pay'); }
  bestPrice(productId: string, days = 90) {
    const since = addDays(this.now(), -days).toISOString();
    const rows = this.db.price_history.filter(h => h.product_id === productId && h.recorded_at >= since && h.supplier_id);
    const latest = new Map<string, T.PriceHistory>();
    for (const r of rows.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))) latest.set(r.supplier_id!, r);
    const best = [...latest.values()].sort((a, b) => a.cost_price - b.cost_price)[0];
    return best ? { supplierId: best.supplier_id!, cost: best.cost_price, supplier: this.db.suppliers.find(s => s.id === best.supplier_id)?.name } : undefined;
  }
  payables() { return this.db.purchases.filter(p => p.status === 'received' && p.total_cost > p.paid_amount && !p.deleted_at).map(p => ({ p, owed: p.total_cost - p.paid_amount, supplier: this.db.suppliers.find(s => s.id === p.supplier_id)?.name ?? '' })); }

  // ─── Intelligence ────────────────────────────────────────────
  reorderList() {
    return this.db.products.filter(p => p.active && !p.deleted_at).map(p => {
      const v = this.velocity(p.id); const shelf = this.qty(p.id, 'shop'), store = this.qty(p.id, 'store');
      const signal = stockSignal(shelf, store, p.reorder_level, v.avgPerDay);
      const suggestBuy = signal === 'total_low' ? Math.max(1, suggestOrder({ onHandTotal: shelf + store, perDow: v.perDow, unitsPerBuyUnit: p.units_per_buy_unit, reorderLevel: p.reorder_level }, this.now())) : 0;
      return { p, shelf, store, signal, avgPerDay: v.avgPerDay, daysLeft: daysOfStock(shelf + store, v.avgPerDay), suggestBuy, best: this.bestPrice(p.id) };
    }).filter(x => x.signal !== 'ok');
  }
  draftOrder(supplierId?: string) {
    const items = this.reorderList().filter(r => r.signal === 'total_low' && (!supplierId || (r.best?.supplierId ?? supplierId) === supplierId));
    if (!items.length) return null;
    const bySup = supplierId ?? items[0].best?.supplierId ?? this.db.suppliers[0]?.id;
    return this.createPurchase(bySup, items.map(r => ({ productId: r.p.id, qtyBuy: r.suggestBuy, costPerBuy: Math.round((r.best?.cost ?? r.p.cost_price) * r.p.units_per_buy_unit) })));
  }
  expiring(days = 30) {
    return this.db.stock_batches.filter(b => b.qty > 0 && !b.deleted_at).map(b => ({ b, p: this.product(b.product_id), days: daysUntil(b.expiry_date, this.now()) }))
      .filter(x => x.days <= days).sort((a, b) => a.days - b.days).map(x => ({ ...x, band: expiryBand(x.days), discount: expiryDiscount(Math.max(x.days, 0), x.p.retail_price, x.p.cost_price), location: this.db.locations.find(l => l.id === x.b.location_id)?.type }));
  }
  deadStock(days = 45) {
    const since = dayKey(addDays(this.now(), -days));
    const lastSold = new Map<string, string>();
    for (const [pid, m] of this.dailyQty()) lastSold.set(pid, [...m.keys()].sort().pop()!);
    return this.db.products.filter(p => p.active && !p.deleted_at).map(p => ({ p, qty: this.qty(p.id, 'shop') + this.qty(p.id, 'store'), last: lastSold.get(p.id) }))
      .filter(x => x.qty > 0 && (!x.last || x.last < since)).map(x => ({ ...x, frozen: Math.round(x.qty * x.p.cost_price) })).sort((a, b) => b.frozen - a.frozen);
  }

  // ─── Stock-take & demand ─────────────────────────────────────
  startCount(type: T.LocationType, section: string, productIds: string[]) {
    assertCan(this.ctx.role, 'count');
    const c = this.put('stock_counts', { location_id: this.loc(type), section_name: section, status: 'open', user_id: this.ctx.userId } as any, 'count.start');
    for (const pid of productIds) this.put('stock_count_items', { count_id: c.id, product_id: pid, expected_qty: this.qty(pid, type), counted_qty: 0, variance: 0 } as any);
    return c;
  }
  postCount(countId: string, counted: Record<string, number>) {
    const c = this.db.stock_counts.find(x => x.id === countId); if (!c || c.status !== 'open') throw new DomainError('count_closed');
    const type = this.db.locations.find(l => l.id === c.location_id)!.type;
    let lossValue = 0; const vars: { name: string; variance: number }[] = [];
    for (const it of this.db.stock_count_items.filter(i => i.count_id === c.id)) {
      const got = counted[it.product_id] ?? it.expected_qty; const v = got - it.expected_qty;
      this.put('stock_count_items', { id: it.id, counted_qty: got, variance: v } as any);
      if (v !== 0) { this.adjust(it.product_id, type, v, 'count_correction', `count:${c.section_name}`); const p = this.product(it.product_id); if (v < 0) lossValue += -v * p.cost_price; vars.push({ name: p.name, variance: v }); }
    }
    this.put('stock_counts', { id: c.id, status: 'posted' } as any, 'count.post');
    if (vars.length) this.alert('count_variance', lossValue > 200 ? 'critical' : 'warn', `Count ${c.section_name}: ${vars.length} off`, vars.map(v => `${v.name} ${v.variance > 0 ? '+' : ''}${v.variance}`).join(', '), { countId: c.id, lossValue: Math.round(lossValue), key: `count:${c.id}` });
    return { variances: vars, lossValue: Math.round(lossValue) };
  }
  addDemand(text: string, guess?: string) { assertCan(this.ctx.role, 'demand'); return this.put('demand_log', { text, product_guess: guess, user_id: this.ctx.userId } as any, 'demand.add'); }
  updatePrice(productId: string, price: number, tier: T.Tier = 'regular') {
    assertCan(this.ctx.role, 'price');
    const field = tier === 'wholesale' ? 'wholesale_price' : tier === 'loyal' ? 'loyal_price' : 'retail_price';
    return this.put('products', { id: productId, [field]: toKsh(price) } as any, 'product.price');
  }
  upsertProduct(p: Partial<T.Product>) { assertCan(this.ctx.role, 'product'); return this.put('products', { active: true, wastage_pct: 0, track_expiry: false, ...p } as any, p.id ? 'product.update' : 'product.create'); }

  // ─── Alerts & jobs ───────────────────────────────────────────
  alert(type: T.AlertType, severity: T.Alert['severity'], title: string, body: string, data: Record<string, unknown> = {}) {
    const key = data.key as string | undefined;
    if (key && this.db.alerts.some(a => (a.data_json as any)?.key === key)) return;
    return this.put('alerts', { type, severity, title, body, data_json: data, read_at: null } as any);
  }
  /** Runs all due jobs lazily (called on app focus + GET /jobs/tick). Idempotent via alert keys. */
  tick(templates: { reminder: (name: string, bal: number, level: 0 | 1 | 2, lang: T.Lang) => string; briefing?: (e: DukaEngine) => string; evening?: (e: DukaEngine) => string }) {
    const now = this.now(); const today = dayKey(now); const week = `${now.getFullYear()}-w${Math.ceil((daysBetween(`${now.getFullYear()}-01-01`, now) + 1) / 7)}`;
    for (const r of this.reorderList()) {
      if (r.signal === 'shelf_low') this.alert('shelf_low', 'warn', r.p.name, `Shelf ${r.shelf}, store ${r.store}`, { productId: r.p.id, key: `shelf:${r.p.id}:${today}` });
      else this.alert('total_low', 'critical', r.p.name, `Only ${r.shelf + r.store} left, ~${Math.max(0, Math.floor(r.daysLeft))} days`, { productId: r.p.id, suggest: r.suggestBuy, key: `total:${r.p.id}:${week}` });
    }
    for (const x of this.expiring(30)) this.alert('expiry', x.days <= 7 ? 'critical' : 'warn', x.p.name, `${x.b.qty} expire in ${x.days}d. Sell at KSh ${x.discount.price}`, { productId: x.p.id, batchId: x.b.id, days: x.days, key: `exp:${x.b.id}:${x.band}` });
    const dead = this.deadStock();
    if (dead.length) this.alert('dead_stock', 'info', `${dead.length} dead-stock lines`, `KSh ${dead.reduce((a, d) => a + d.frozen, 0)} frozen`, { count: dead.length, key: `dead:${today.slice(0, 7)}` });
    for (const pp of this.payables()) if (pp.p.due_date && daysUntil(pp.p.due_date, now) <= 3) this.alert('payable_due', 'warn', `Pay ${pp.supplier}`, `KSh ${pp.owed} due ${pp.p.due_date}`, { purchaseId: pp.p.id, key: `due:${pp.p.id}` });
    const s = this.shop.settings_json;
    if (now.getDay() === s.reminderDay) {
      for (const d of this.debtors(s.reminderMinBalance)) {
        if (this.db.reminders.some(r => r.customer_id === d.c.id && dayKey(r.scheduled_at) === today)) continue;
        const level = escalationLevel(d.days);
        this.put('reminders', { customer_id: d.c.id, channel: d.c.phone ? 'whatsapp' : 'inapp', message: templates.reminder(d.c.name, d.balance, level, this.shop.language), scheduled_at: this.iso(), status: 'queued', escalation_level: level } as any, 'reminder.queue');
      }
    }
    if (now.getHours() >= 6 && s.lastBriefing !== today && templates.briefing) {
      this.alert('briefing', 'info', 'Morning briefing', templates.briefing(this), { key: `brief:${today}` });
      this.put('shops', { id: this.shop.id, settings_json: { ...this.shop.settings_json, lastBriefing: today } } as any);
    }
    if (now.getHours() >= 21 && s.lastEvening !== today && templates.evening) {
      this.alert('briefing', 'info', 'Evening report', templates.evening(this), { key: `eve:${today}` });
      this.put('shops', { id: this.shop.id, settings_json: { ...this.shop.settings_json, lastEvening: today } } as any);
    }
    return this.drain();
  }
}
