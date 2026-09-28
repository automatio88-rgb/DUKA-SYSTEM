import { describe, it, expect } from 'vitest';
import { parseMpesaSms, matchPayment, suspiciousFlags } from '../src/mpesa';

const F = {
  sendMoney: 'QGH4ABC12D Confirmed.You have received Ksh500.00 from MARY WANJIKU 0712345678 on 12/3/24 at 2:15 PM  New M-PESA balance is Ksh3,200.00. Separate personal and business funds through Pochi la Biashara on *334#.',
  sendMoney254: 'RBK9ZX12QW Confirmed. You have received Ksh1,250.00 from JOHN KAMAU 254722334455 on 5/10/25 at 10:05 AM New M-PESA balance is Ksh12,450.50.',
  till: 'SJK3FGH7TY Confirmed. Ksh350.00 received from 254722000111 PETER OTIENO on 5/6/24 at 7:42 PM. New Account balance is Ksh45,210.00. Transaction cost, Ksh0.00.',
  tillMasked: 'TCL8HJ2KLM Confirmed. Ksh 1,020.00 received from 2547***456 GRACE MUTHONI on 14/2/26 at 8:01 AM. New Account balance is Ksh9,840.00.',
  pochi: 'TAB1CD2EF3 Confirmed. You have received Ksh200.00 from JANE AKINYI 0798765432 on 1/9/26 at 8:05 AM via Pochi la Biashara. New business balance is Ksh2,450.00.',
  paybill: 'UDE5FG6HJ7 Confirmed. Ksh2,000.00 received from BRIAN OMONDI 0711998877 for account DUKA001 on 3/4/26 at 6:30 PM. New Utility balance is Ksh80,000.00.',
  lowercase: 'qwe1rty2ui confirmed. you have received ksh75.00 from ALI HASSAN 0700111222 on 9/9/26 at 12:00 PM new m-pesa balance is ksh175.00',
  noSpaceAmount: 'SXY7TT55PL Confirmed. You have received KES 3,450 from SAMUEL NJOROGE 0733445566 on 30/8/26 at 9:59 PM New M-PESA balance is KES 10,000',
  bigAmount: 'TZX1AB2CD3 Confirmed. You have received Ksh125,000.00 from WHOLESALE KENYA LTD 0720100200 on 2/2/26 at 11:11 AM New M-PESA balance is Ksh130,000.00.',
  hourNoon: 'TLK4MN5OP6 Confirmed. You have received Ksh60.00 from KIPCHOGE RUTO 0791234567 on 7/7/26 at 12:30 AM New M-PESA balance is Ksh60.00.',
  sent: 'QWE9RT8YU7 Confirmed. Ksh100.00 sent to KPLC PREPAID for account 123456 on 1/1/26 at 1:00 PM New M-PESA balance is Ksh900.00.',
  withdraw: 'RTY6UI5OP4 Confirmed.on 2/2/26 at 3:00 PMWithdraw Ksh1,000.00 from 123456 - AGENT SHOP New M-PESA balance is Ksh500.00.',
  noCode: 'Confirmed. You have received Ksh500.00 from MARY on 12/3/24 at 2:15 PM',
  noDate: 'QGH4ABC12X Confirmed. You have received Ksh500.00 from MARY WANJIKU 0712345678. New balance Ksh1.',
  junk: 'Hello your parcel is ready at the stage',
  fuliza: 'TFU2LI3ZA4 Confirmed. You have received Ksh430.00 from MAMA NJERI 0711223344 on 26/9/26 at 6:12 PM New M-PESA balance is Ksh430.00. Fuliza M-PESA outstanding amount is Ksh0.00.',
};
const ok = (s: string) => { const r = parseMpesaSms(s); if (!r.ok) throw new Error('expected parse: ' + r.reason); return r.value; };

describe('MpesaSmsParser fixtures', () => {
  it('1 send-money received', () => { const v = ok(F.sendMoney); expect(v.code).toBe('QGH4ABC12D'); expect(v.amount).toBe(500); expect(v.payerName).toBe('Mary Wanjiku'); expect(v.payerPhone).toBe('0712345678'); expect(v.kind).toBe('send_money'); expect(v.balance).toBe(3200); });
  it('2 send-money with 254 phone + commas', () => { const v = ok(F.sendMoney254); expect(v.amount).toBe(1250); expect(v.payerPhone).toBe('0722334455'); expect(new Date(v.txTime).getHours()).toBe(10); });
  it('3 till merchant copy (phone before name)', () => { const v = ok(F.till); expect(v.amount).toBe(350); expect(v.kind).toBe('till'); expect(v.payerName).toBe('Peter Otieno'); expect(v.payerPhone).toBe('0722000111'); expect(new Date(v.txTime).getHours()).toBe(19); });
  it('4 till with masked phone', () => { const v = ok(F.tillMasked); expect(v.amount).toBe(1020); expect(v.payerName).toBe('Grace Muthoni'); expect(v.payerPhone).toContain('***'); });
  it('5 Pochi la Biashara', () => { const v = ok(F.pochi); expect(v.kind).toBe('pochi'); expect(v.amount).toBe(200); expect(v.payerName).toBe('Jane Akinyi'); });
  it('6 Paybill with account', () => { const v = ok(F.paybill); expect(v.kind).toBe('paybill'); expect(v.account).toBe('DUKA001'); expect(v.amount).toBe(2000); });
  it('7 lowercase message', () => { const v = ok(F.lowercase); expect(v.code).toBe('QWE1RTY2UI'); expect(v.amount).toBe(75); });
  it('8 KES without decimals', () => { expect(ok(F.noSpaceAmount).amount).toBe(3450); expect(new Date(ok(F.noSpaceAmount).txTime).getHours()).toBe(21); });
  it('9 six-figure amount', () => { expect(ok(F.bigAmount).amount).toBe(125000); });
  it('10 12:30 AM is 00:30', () => { expect(new Date(ok(F.hourNoon).txTime).getHours()).toBe(0); });
  it('11 outgoing "sent to" is rejected', () => { const r = parseMpesaSms(F.sent); expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('not_incoming'); });
  it('12 withdrawal is rejected', () => { expect(parseMpesaSms(F.withdraw).ok).toBe(false); });
  it('13 missing code', () => { const r = parseMpesaSms(F.noCode); expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('no_code'); });
  it('14 missing date', () => { const r = parseMpesaSms(F.noDate); expect(r.ok).toBe(false); if (!r.ok) expect(r.reason).toBe('no_date'); });
  it('15 junk text', () => { expect(parseMpesaSms(F.junk).ok).toBe(false); expect(parseMpesaSms('').ok).toBe(false); });
  it('16 Fuliza tail does not confuse amount', () => { const v = ok(F.fuliza); expect(v.amount).toBe(430); expect(v.payerName).toBe('Mama Njeri'); });
});
describe('auto-match', () => {
  const customers = [{ id: 'bk', name: 'Baba Kevin', phone: '0722334455', balance: 1500 }, { id: 'mn', name: 'Mama Njeri', phone: '0711223344', balance: 430 }, { id: 'z', name: 'Zero', phone: '0700000000', balance: 0 }];
  it('matches debtor by phone', () => { expect(matchPayment(ok(F.sendMoney254), [], customers)).toMatchObject({ type: 'customer', id: 'bk' }); });
  it('matches pending M-Pesa sale by amount + time window', () => { const p = ok(F.till); const sale = { id: 's1', mpesa_amount: 350, created_at: new Date(new Date(p.txTime).getTime() + 4 * 60000).toISOString(), mpesaPending: true }; expect(matchPayment(p, [sale], [])).toMatchObject({ type: 'sale', id: 's1' }); });
  it('does not match sales outside the window', () => { const p = ok(F.till); const sale = { id: 's1', mpesa_amount: 350, created_at: new Date(new Date(p.txTime).getTime() + 60 * 60000).toISOString(), mpesaPending: true }; expect(matchPayment(p, [sale], []).type).toBe('none'); });
  it('leaves strangers unmatched', () => { expect(matchPayment(ok(F.pochi), [], customers).type).toBe('none'); });
  it('flags duplicate codes and odd amounts', () => { const p = ok(F.sendMoney); expect(suspiciousFlags(p, new Set(['QGH4ABC12D']), new Date('2024-03-12T15:00:00'))).toContain('duplicate_code'); expect(suspiciousFlags(ok(F.bigAmount), new Set(), new Date('2026-02-03'))).toEqual([]); });
});
