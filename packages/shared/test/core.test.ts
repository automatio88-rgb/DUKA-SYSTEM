import { describe, it, expect } from 'vitest';
import { formatKsh, costPerSellUnit, validateSplit, margin } from '../src/money';
import { recomputeChain, creditCheck, escalationLevel } from '../src/ledger';
import { deriveLevels, levelOf, consumeFEFO, expiryBand, expiryDiscount } from '../src/stock';
import { weekdayVelocity, suggestOrder, stockSignal, daysOfStock } from '../src/velocity';
import { expectedCash, variance, gapAlert } from '../src/cash';
import { can } from '../src/permissions';
import { applyOps, newServerState, pullSince } from '../src/sync';
import { fuzzySearch } from '../src/fuzzy';

describe('money', () => {
  it('formats KSh with thousands + sign', () => { expect(formatKsh(1234)).toBe('KSh 1,234'); expect(formatKsh(-50)).toBe('−KSh 50'); expect(formatKsh(250000, { compact: true })).toBe('KSh 250K'); });
  it('converts buy→sell with wastage', () => { expect(costPerSellUnit(7200, 50)).toBe(144); expect(costPerSellUnit(7200, 50, 2)).toBeCloseTo(146.94, 2); });
  it('validates split payments', () => { expect(validateSplit(500, { cash: 200, mpesa: 300, credit: 0 }).ok).toBe(true); expect(validateSplit(500, { cash: 200, mpesa: 200, credit: 0 }).diff).toBe(100); });
  it('computes margin', () => { expect(margin(100, 80)).toBeCloseTo(0.2); });
});
describe('credit ledger', () => {
  const e = (id: string, type: any, amount: number, t: string) => ({ id, type, amount, created_at: t, customer_id: 'c' });
  it('recomputes balance_after chain regardless of client order', () => {
    const ch = recomputeChain([e('3', 'payment', 200, '2026-01-03'), e('1', 'charge', 450, '2026-01-01'), e('2', 'charge', 300, '2026-01-02'), e('4', 'adjustment', -50, '2026-01-04')]);
    expect(ch.map(x => x.balance_after)).toEqual([450, 750, 550, 500]);
  });
  it('flags credit limit breach', () => { expect(creditCheck(900, 200, 1000)).toEqual({ ok: false, over: 100 }); expect(creditCheck(900, 200).ok).toBe(true); });
  it('escalates tone by days', () => { expect(escalationLevel(3)).toBe(0); expect(escalationLevel(15)).toBe(1); expect(escalationLevel(40)).toBe(2); });
});
describe('stock', () => {
  it('derives levels from moves (merge, never overwrite)', () => {
    const L = deriveLevels([{ product_id: 'p', from_location: null, to_location: 'S', qty: 24 }, { product_id: 'p', from_location: 'S', to_location: 'D', qty: 12 }, { product_id: 'p', from_location: 'D', to_location: null, qty: 5 }, { product_id: 'p', from_location: 'D', to_location: null, qty: 1, deleted_at: 'x' }]);
    expect(levelOf(L, 'p', 'S')).toBe(12); expect(levelOf(L, 'p', 'D')).toBe(7);
  });
  it('FEFO consumes earliest expiry first', () => {
    const r = consumeFEFO([{ id: 'late', qty: 10, expiry_date: '2026-12-01' }, { id: 'soon', qty: 4, expiry_date: '2026-10-01' }], 6);
    expect(r.consumed).toEqual([{ id: 'soon', qty: 4 }, { id: 'late', qty: 2 }]); expect(r.shortfall).toBe(0);
  });
  it('reports FEFO shortfall', () => { expect(consumeFEFO([{ id: 'a', qty: 2, expiry_date: '2026-10-01' }], 5).shortfall).toBe(3); });
  it('bands expiry and never discounts below cost', () => { expect(expiryBand(5)).toBe(7); expect(expiryBand(20)).toBe(30); expect(expiryBand(60)).toBeNull(); expect(expiryDiscount(3, 70, 58).price).toBe(58); });
});
describe('velocity & reorder', () => {
  const today = new Date('2026-09-26T20:00:00'); // Saturday
  const sales = Array.from({ length: 28 }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - i); return { date: d.toISOString().slice(0, 10), qty: d.getDay() === 6 ? 20 : 10 }; });
  it('weights by weekday', () => { const v = weekdayVelocity(sales, today); expect(v.perDow[6]).toBeGreaterThan(v.perDow[2]); expect(v.avgPerDay).toBeGreaterThan(10); });
  it('suggests whole buy units covering lead + cover', () => { const v = weekdayVelocity(sales, today); const q = suggestOrder({ onHandTotal: 20, perDow: v.perDow, unitsPerBuyUnit: 24, reorderLevel: 12 }, today); expect(q).toBe(4); /* 9 days incl. 1 Sat = 100 + 12 safety − 20 on hand = 92 → 4 cartons */ });
  it('signals shelf_low vs total_low', () => { expect(stockSignal(2, 48, 12, 10)).toBe('shelf_low'); expect(stockSignal(3, 0, 12, 10)).toBe('total_low'); expect(stockSignal(40, 20, 12, 10)).toBe('ok'); });
  it('days of stock', () => { expect(daysOfStock(30, 10)).toBe(3); expect(daysOfStock(5, 0)).toBe(Infinity); });
});
describe('cash guard', () => {
  it('computes expected cash + variance', () => { const ex = expectedCash({ openingFloat: 2000, cashSales: 8450, cashDebtPayments: 500, payouts: 300 }); expect(ex).toBe(10650); expect(variance(ex, 10400)).toBe(-250); });
  it('alerts on single gap and on patterns', () => { expect(gapAlert([{ user_id: 'a', variance: -300 }])?.reason).toBe('single_gap'); expect(gapAlert([{ user_id: 'b', variance: -50 }, { user_id: 'b', variance: -80 }, { user_id: 'a', variance: 10 }, { user_id: 'b', variance: -60 }])?.reason).toBe('pattern'); expect(gapAlert([{ user_id: 'a', variance: -20 }])).toBeNull(); });
});
describe('permissions', () => {
  it('staff can sell, count and log credit but not see profit or edit prices', () => {
    for (const a of ['sell', 'credit', 'payment', 'transfer', 'count', 'demand'] as const) expect(can('staff', a)).toBe(true);
    for (const a of ['profit', 'price', 'void', 'delete', 'reports', 'variance', 'settings'] as const) expect(can('staff', a)).toBe(false);
    expect(can('owner', 'void')).toBe(true);
  });
});
describe('sync idempotency', () => {
  const op = (id: string, entity: string, eid: string, payload: any) => ({ id, shop_id: 's', device_id: 'd1', entity, entity_id: eid, op: 'upsert' as const, payload_json: payload, client_ts: '2026-01-01' });
  it('replaying the same batch creates zero duplicates', () => {
    const st = newServerState(); const batch = [op('o1', 'sales', 'x1', { total: 100 }), op('o2', 'stock_moves', 'm1', { qty: 1 })];
    expect(applyOps(st, batch).applied).toBe(2); expect(applyOps(st, batch).skipped).toBe(2);
    expect(st.tables.get('sales')!.size).toBe(1); expect(st.tables.get('stock_moves')!.size).toBe(1);
  });
  it('append-only rows never overwrite; mutable rows are LWW', () => {
    const st = newServerState();
    applyOps(st, [op('a', 'stock_moves', 'm', { qty: 5 }), op('b', 'stock_moves', 'm', { qty: 99 }), op('c', 'products', 'p', { retail_price: 60 }), op('d', 'products', 'p', { retail_price: 65 })]);
    expect(st.tables.get('stock_moves')!.get('m').qty).toBe(5); expect(st.tables.get('products')!.get('p').retail_price).toBe(65);
  });
  it('pull returns ops since cursor excluding own device', () => { const st = newServerState(); applyOps(st, [op('a', 'sales', 's1', {}), { ...op('b', 'sales', 's2', {}), device_id: 'd2' }]); expect(pullSince(st, 0, 'd1').ops.length).toBe(1); expect(pullSince(st, 2).ops.length).toBe(0); });
});
describe('fuzzy search', () => {
  const items = [{ id: '1', name: 'Blue Band 250g', name_sw: 'Blue Band 250g' }, { id: '2', name: 'Mumias Sugar (loose)', name_sw: 'Sukari Mumias' }, { id: '3', name: 'Brookside Milk ESL 500ml', name_sw: 'Maziwa Brookside', barcode: '6161100000001' }];
  it('matches Swahili names, prefixes, barcodes, and subsequences', () => {
    expect(fuzzySearch(items, 'sukari')[0].id).toBe('2'); expect(fuzzySearch(items, 'maz')[0].id).toBe('3'); expect(fuzzySearch(items, '6161100000001')[0].id).toBe('3'); expect(fuzzySearch(items, 'blbnd')[0].id).toBe('1');
  });
});
