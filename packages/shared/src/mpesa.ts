/**
 * MpesaSmsParser — regex engine for real Safaricom M-Pesa confirmation SMS.
 * Handles: Buy Goods till (merchant copy), Send Money received, Pochi la Biashara, Paybill received.
 * Pure function, no I/O. Returns null + reason for anything malformed.
 */
export type MpesaKind = 'till' | 'send_money' | 'pochi' | 'paybill';
export interface ParsedMpesa { code: string; amount: number; payerName?: string; payerPhone?: string; txTime: string; kind: MpesaKind; account?: string; balance?: number }
export type ParseResult = { ok: true; value: ParsedMpesa } | { ok: false; reason: 'empty' | 'no_code' | 'no_amount' | 'not_incoming' | 'no_date' };

const CODE = /\b([A-Z0-9]{10})\b\s*Confirmed/i;
const AMOUNT = /(?:received|receive)\s+(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)|(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?received/i;
const DATE = /on\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i;
const BAL = /balance\s+is\s+(?:Ksh|KES)\s?([\d,]+(?:\.\d{1,2})?)/i;
const PHONE = /(?:\+?254|0)(7\d{8}|1\d{8})/;
const MASKED = /(?:\+?254|0)\d{0,3}\s?\*{3,}\s?\d{3}/;

const num = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')));
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();

export function parseMpesaSms(raw: string): ParseResult {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  const code = text.match(CODE)?.[1]?.toUpperCase();
  if (!code) return { ok: false, reason: 'no_code' };
  if (/\b(sent to|paid to|withdraw|You bought|airtime for)\b/i.test(text) && !/received/i.test(text)) return { ok: false, reason: 'not_incoming' };
  const am = text.match(AMOUNT);
  if (!am) return { ok: false, reason: 'no_amount' };
  const amount = num(am[1] ?? am[2]);
  const d = text.match(DATE);
  if (!d) return { ok: false, reason: 'no_date' };
  const [, dd, mm, yy, hh, mi, ap] = d;
  let year = +yy; if (year < 100) year += 2000;
  let hour = +hh % 12; if ((ap ?? '').toUpperCase() === 'PM') hour += 12; if (!ap) hour = +hh;
  const txTime = new Date(year, +mm - 1, +dd, hour, +mi).toISOString();

  // payer: "from NAME 0712..." | "from 2547.. NAME" | "received from NAME"
  let payerPhone: string | undefined;
  const fromSeg = text.match(/from\s+(.+?)\s+on\s+\d/i)?.[1] ?? '';
  const ph = fromSeg.match(PHONE);
  if (ph) payerPhone = '0' + ph[1];
  else if (MASKED.test(fromSeg)) payerPhone = fromSeg.match(MASKED)![0].replace(/\s/g, '');
  const payerName = title(fromSeg.replace(PHONE, '').replace(MASKED, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ')) || undefined;

  const kind: MpesaKind = /via Pochi|business balance/i.test(text) ? 'pochi' : /for account|account number|acc\.?\s/i.test(text) ? 'paybill' : /Ksh[\d,.]+\s+received from|Account balance|Buy Goods|till/i.test(text) ? 'till' : 'send_money';
  const account = text.match(/for account\s+([A-Z0-9 -]+?)\s+on/i)?.[1]?.trim();
  const balM = text.match(BAL);
  return { ok: true, value: { code, amount, payerName, payerPhone, txTime, kind, account, balance: balM ? num(balM[1]) : undefined } };
}

export interface MatchCandidateSale { id: string; mpesa_amount: number; created_at: string; mpesaPending?: boolean }
export interface MatchCandidateCustomer { id: string; name: string; phone?: string; balance: number }
export type MatchResult = { type: 'customer'; id: string; confidence: number; why: string } | { type: 'sale'; id: string; confidence: number; why: string } | { type: 'none' };

const phoneKey = (p?: string) => (p ?? '').replace(/\D/g, '').slice(-9);
const nameTokens = (s: string) => s.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !['baba', 'mama', 'mzee', 'shosh', 'the'].includes(w));

/** Auto-match: phone → debtor; name+balance → debtor; amount + ±15min window → pending M-Pesa sale. */
export function matchPayment(p: ParsedMpesa, sales: MatchCandidateSale[], customers: MatchCandidateCustomer[], windowMin = 15): MatchResult {
  const pk = phoneKey(p.payerPhone);
  if (pk.length === 9 && !p.payerPhone?.includes('*')) {
    const c = customers.find(c => phoneKey(c.phone) === pk && c.balance > 0);
    if (c) return { type: 'customer', id: c.id, confidence: 0.95, why: 'phone' };
  }
  const t = new Date(p.txTime).getTime();
  const sale = sales
    .filter(s => s.mpesaPending && s.mpesa_amount === p.amount && Math.abs(new Date(s.created_at).getTime() - t) <= windowMin * 60_000)
    .sort((a, b) => Math.abs(new Date(a.created_at).getTime() - t) - Math.abs(new Date(b.created_at).getTime() - t))[0];
  if (sale) return { type: 'sale', id: sale.id, confidence: 0.85, why: 'amount+time' };
  if (p.payerName) {
    const pt = nameTokens(p.payerName);
    const c = customers.filter(c => c.balance > 0).find(c => nameTokens(c.name).some(w => pt.includes(w)) && p.amount <= c.balance + 50);
    if (c) return { type: 'customer', id: c.id, confidence: 0.7, why: 'name+balance' };
  }
  return { type: 'none' };
}

/** Suspicious flags: duplicate code, amount mismatch with balance line, future timestamp. */
export function suspiciousFlags(p: ParsedMpesa, knownCodes: Set<string>, now = new Date()): string[] {
  const f: string[] = [];
  if (knownCodes.has(p.code)) f.push('duplicate_code');
  if (new Date(p.txTime).getTime() - now.getTime() > 10 * 60_000) f.push('future_time');
  if (!/^[A-Z]{2,3}[A-Z0-9]{7,8}$/.test(p.code) || /(\w)\1{5,}/.test(p.code)) f.push('odd_code');
  if (p.amount <= 0 || p.amount > 300_000) f.push('odd_amount');
  return f;
}
