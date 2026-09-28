import { parseIntent, type ToolCall, type ToolName } from './intent';
import { DukaEngine, DomainError } from './engine';
import { resolveProduct } from './fuzzy';
import { formatKsh as k } from './money';
import { dayFigures, weeklyNarrative } from './reports';
import type { Lang } from './types';
import { PermissionError } from './permissions';

/** LLMProvider adapter: turn a message into a tool call. Mock = deterministic parser; OpenAI-compatible = real function-calling. */
export interface LLMProvider { name: string; decide(text: string, ctx: { lang: Lang }): Promise<ToolCall> }
export class MockLLMProvider implements LLMProvider { name = 'mock'; async decide(text: string) { return parseIntent(text); } }

export const TOOL_SCHEMAS = [
  { name: 'recordSale', description: 'Record a cash sale of a product', parameters: { type: 'object', properties: { product: { type: 'string' }, qty: { type: 'number' } }, required: ['product'] } },
  { name: 'addCredit', description: 'Add debt (kitabu) for a customer', parameters: { type: 'object', properties: { customer: { type: 'string' }, amount: { type: 'number' } }, required: ['customer', 'amount'] } },
  { name: 'recordPayment', description: 'Customer paid against their debt', parameters: { type: 'object', properties: { customer: { type: 'string' }, amount: { type: 'number' } }, required: ['customer', 'amount'] } },
  { name: 'transferStock', description: 'Move stock between store and duka', parameters: { type: 'object', properties: { product: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string', enum: ['carton', 'bag', 'packet', 'dozen', 'piece', 'crate', 'bale'] }, direction: { type: 'string', enum: ['store→duka', 'duka→store'] } }, required: ['product', 'qty'] } },
  { name: 'stockQuery', description: 'How much of a product is left', parameters: { type: 'object', properties: { product: { type: 'string' } }, required: ['product'] } },
  { name: 'debtQuery', description: 'List debtors, optionally above a balance or one customer', parameters: { type: 'object', properties: { minBalance: { type: 'number' }, customer: { type: 'string' } } } },
  { name: 'priceUpdate', description: 'Set retail price of a product', parameters: { type: 'object', properties: { product: { type: 'string' }, price: { type: 'number' } }, required: ['product', 'price'] } },
  { name: 'dailyReport', description: "Today's sales report", parameters: { type: 'object', properties: {} } },
  { name: 'weeklyReport', description: 'Weekly business review', parameters: { type: 'object', properties: {} } },
  { name: 'addDemandLog', description: 'A customer asked for something we do not have', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'draftOrder', description: 'Draft a purchase order for low stock', parameters: { type: 'object', properties: { supplier: { type: 'string' } } } },
] as const;

/** OpenAI-compatible function-calling provider (env-gated: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL). Falls back to mock on any error. */
export class OpenAICompatProvider implements LLMProvider {
  name = 'openai-compat'; private mock = new MockLLMProvider();
  constructor(private cfg: { baseUrl: string; apiKey: string; model: string }) {}
  async decide(text: string, ctx: { lang: Lang }): Promise<ToolCall> {
    try {
      const r = await fetch(`${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ model: this.cfg.model, temperature: 0, tools: TOOL_SCHEMAS.map(f => ({ type: 'function', function: f })), messages: [
          { role: 'system', content: 'You are Duka Brain, the business partner of a Kenyan duka owner. Understand Swahili, English and Sheng. Swahili number words: mia=100, elfu=1000. Always call exactly one tool.' },
          { role: 'user', content: text }] }),
      });
      const j: any = await r.json();
      const tc = j.choices?.[0]?.message?.tool_calls?.[0];
      if (!tc) return this.mock.decide(text);
      return { tool: tc.function.name as ToolName, args: JSON.parse(tc.function.arguments || '{}'), lang: parseIntent(text).lang ?? ctx.lang, confidence: 0.95 };
    } catch { return this.mock.decide(text); }
  }
}

export interface AgentResult { call: ToolCall; reply: string; ok: boolean; data?: unknown }
const say = (lang: Lang, sw: string, en: string) => (lang === 'sw' ? sw : en);

export async function runAgent(e: DukaEngine, text: string, llm: LLMProvider = new MockLLMProvider()): Promise<AgentResult> {
  const call = await llm.decide(text, { lang: e.shop.language });
  const L = call.lang; const a = call.args;
  const prod = (q?: string) => (q ? resolveProduct(e.db.products.filter(p => p.active && !p.deleted_at), q) : undefined);
  try {
    switch (call.tool) {
      case 'greeting': { const d = dayFigures(e); return { call, ok: true, reply: say(L, `Poa sana! Leo umeuza ${k(d.sales)} kwa wateja ${d.txns}. Nikusaidie na nini?`, `Hey! You've sold ${k(d.sales)} across ${d.txns} sales today. What do you need?`) }; }
      case 'help': return { call, ok: true, reply: say(L, 'Naweza: kuandika deni, kupokea malipo, kuhamisha mzigo kutoka stoo, kuweka bei, kukuambia nani anadaiwa, ripoti ya leo au ya wiki, na kuandika bidhaa wateja wanazoulizia.', 'I can record debts and payments, move stock from the store, set prices, tell you who owes you, give today\'s or this week\'s report, and log what customers asked for.') };
      case 'addCredit': {
        let c = e.findCustomer(a.customer);
        if (!c && a.customer) c = e.addCustomer({ name: a.customer });
        if (!c) return { call, ok: false, reply: say(L, 'Deni la nani? Taja jina.', 'Whose debt? Give me a name.') };
        const { entry, overLimit } = e.addCredit(c.id, a.amount, 'via Duka Brain');
        return { call, ok: true, data: entry, reply: say(L, `Nimeandika deni la ${k(a.amount)} kwa ${c.name}. Sasa anadaiwa ${k(entry.balance_after)}.${overLimit ? ` Tahadhari: amezidi kikomo kwa ${k(overLimit)}.` : ''}`, `Added ${k(a.amount)} to ${c.name}'s tab. They now owe ${k(entry.balance_after)}.${overLimit ? ` Heads up: ${k(overLimit)} over their limit.` : ''}`) };
      }
      case 'recordPayment': {
        const c = e.findCustomer(a.customer);
        if (!c) return { call, ok: false, reply: say(L, `Sijampata ${a.customer ?? 'mteja huyo'} kwa kitabu.`, `Can't find ${a.customer ?? 'that customer'} in the kitabu.`) };
        const entry = e.recordPayment(c.id, a.amount, 'cash', 'via Duka Brain');
        return { call, ok: true, data: entry, reply: entry.balance_after <= 0 ? say(L, `Safi! ${c.name} amemaliza deni lote.`, `Nice! ${c.name} has cleared their tab.`) : say(L, `Nimepokea ${k(a.amount)} kutoka kwa ${c.name}. Bado anadaiwa ${k(entry.balance_after)}.`, `Got ${k(a.amount)} from ${c.name}. ${k(entry.balance_after)} still owed.`) };
      }
      case 'transferStock': {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, `Sijui bidhaa "${a.product}". Jaribu jina lingine.`, `I don't know "${a.product}". Try another name.`) };
        const units = a.unit && ['carton', 'bag', 'bale', 'crate', 'dozen'].includes(a.unit) ? a.qty * (a.unit === 'dozen' ? 12 : p.units_per_buy_unit) : a.qty;
        const from = a.direction === 'duka→store' ? 'shop' : 'store';
        e.transfer(p.id, units, from as any, 'via Duka Brain');
        return { call, ok: true, reply: say(L, `Sawa. ${a.qty} ${a.unit === 'carton' ? 'katoni' : a.unit ?? ''} za ${p.name_sw ?? p.name} (${units} ${p.sell_unit}) zimehamishwa ${from === 'store' ? 'kutoka stoo kwenda dukani' : 'kwenda stoo'}. Rafuni sasa: ${e.qty(p.id, 'shop')}, stoo: ${e.qty(p.id, 'store')}.`, `Done. Moved ${a.qty} ${a.unit ?? ''} of ${p.name} (${units} ${p.sell_unit}) ${from === 'store' ? 'from the store to the shelf' : 'back to the store'}. Shelf: ${e.qty(p.id, 'shop')}, store: ${e.qty(p.id, 'store')}.`) };
      }
      case 'stockQuery': {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, 'Bidhaa gani?', 'Which product?') };
        const s = e.qty(p.id, 'shop'), st = e.qty(p.id, 'store'); const v = e.velocity(p.id).avgPerDay;
        return { call, ok: true, data: { shelf: s, store: st }, reply: say(L, `${p.name}: ${s} rafuni, ${st} stoo. ${v > 0 ? `Inatosha kama siku ${Math.floor((s + st) / v)}.` : ''}`, `${p.name}: ${s} on the shelf, ${st} in the store. ${v > 0 ? `About ${Math.floor((s + st) / v)} days' worth.` : ''}`) };
      }
      case 'debtQuery': {
        if (a.customer) { const c = e.findCustomer(a.customer); if (!c) return { call, ok: false, reply: say(L, 'Sijampata.', 'Not found.') }; const b = e.balanceOf(c.id); return { call, ok: true, reply: say(L, `${c.name} anadaiwa ${k(b)}.`, `${c.name} owes ${k(b)}.`) }; }
        const list = e.debtors(a.minBalance ?? 0);
        if (!list.length) return { call, ok: true, data: [], reply: say(L, 'Hakuna anayedaiwa kiasi hicho. Safi!', 'Nobody owes that much. Clean book!') };
        const lines = list.slice(0, 8).map(d => `• ${d.c.name}: ${k(d.balance)}${d.days > 14 ? say(L, ` (siku ${d.days})`, ` (${d.days}d)`) : ''}`).join('\n');
        const tot = list.reduce((s, d) => s + d.balance, 0);
        return { call, ok: true, data: list.map(d => ({ name: d.c.name, balance: d.balance })), reply: say(L, `Wateja ${list.length} wanadaiwa${a.minBalance ? ` zaidi ya ${k(a.minBalance)}` : ''}, jumla ${k(tot)}:\n${lines}`, `${list.length} customers owe${a.minBalance ? ` over ${k(a.minBalance)}` : ''}, ${k(tot)} total:\n${lines}`) };
      }
      case 'priceUpdate': {
        const p = prod(a.product);
        if (!p) return { call, ok: false, reply: say(L, `Sijui bidhaa "${a.product}".`, `Unknown product "${a.product}".`) };
        const old = p.retail_price; e.updatePrice(p.id, a.price);
        const m = Math.round(((a.price - p.cost_price) / a.price) * 100);
        return { call, ok: true, reply: say(L, `Bei ya ${p.name} sasa ni ${k(a.price)} (ilikuwa ${k(old)}). Faida kwa kila moja: ${m}%.`, `${p.name} is now ${k(a.price)} (was ${k(old)}). Margin: ${m}%.`) };
      }
      case 'dailyReport': { const d = dayFigures(e); return { call, ok: true, data: d, reply: say(L, `Ripoti ya Leo\nMauzo: ${k(d.sales)} (wateja ${d.txns})\nCash ${k(d.cash)} · M-Pesa ${k(d.mpesa)} · Deni ${k(d.credit)}\nFaida ghafi: ~${k(d.gross)}\n${d.top[0] ? `Iliyotoka sana: ${d.top[0].name}` : ''}`, `Today's report\nSales: ${k(d.sales)} (${d.txns} sales)\nCash ${k(d.cash)} · M-Pesa ${k(d.mpesa)} · Credit ${k(d.credit)}\nGross profit: ~${k(d.gross)}\n${d.top[0] ? `Top seller: ${d.top[0].name}` : ''}`).trim() }; }
      case 'weeklyReport': { const w = weeklyNarrative(e, L); return { call, ok: true, data: w, reply: `${w.headline}\n\n${w.paragraphs.join('\n\n')}` }; }
      case 'addDemandLog': { const g = prod(a.text); e.addDemand(a.text, g?.name); return { call, ok: true, reply: say(L, `Nimeandika: "${a.text}". Nitakuonyesha kwa ripoti ya wiki kama wengi wanaiulizia.`, `Logged "${a.text}". I'll flag it in the weekly review if more people ask.`) }; }
      case 'draftOrder': { const po = e.draftOrder(); if (!po) return { call, ok: true, reply: say(L, 'Hakuna kinachohitaji kuagizwa sasa.', 'Nothing needs ordering right now.') }; const n = e.db.purchase_items.filter(i => i.purchase_id === po.id).length; const sup = e.db.suppliers.find(s => s.id === po.supplier_id)?.name; return { call, ok: true, data: po, reply: say(L, `Nimeandaa agizo la bidhaa ${n} kwa ${sup}, jumla ${k(po.total_cost)}. Liangalie kwa Mzigo.`, `Drafted an order of ${n} items for ${sup}, ${k(po.total_cost)} total. Review it under Deliveries.`) }; }
      case 'recordSale': {
        const p = prod(a.product); if (!p) return { call, ok: false, reply: say(L, 'Umeuza nini?', 'Sold what?') };
        const { sale } = e.sell([{ productId: p.id, qty: a.qty ?? 1 }], { method: 'cash' });
        return { call, ok: true, data: sale, reply: say(L, `Nimeweka mauzo: ${a.qty ?? 1} × ${p.name} = ${k(sale.total)} cash.`, `Recorded: ${a.qty ?? 1} × ${p.name} = ${k(sale.total)} cash.`) };
      }
      default: return { call, ok: false, reply: say(L, 'Sijaelewa vizuri. Jaribu: "Andika deni ya Mama Njeri 300" au "Ripoti ya leo".', 'Didn\'t catch that. Try "Add credit for Mama Njeri 300" or "daily report".') };
    }
  } catch (err) {
    if (err instanceof PermissionError) return { call, ok: false, reply: say(L, 'Hii ni ya mwenye duka tu.', 'Only the owner can do that.') };
    if (err instanceof DomainError && err.code === 'insufficient_stock') return { call, ok: false, reply: say(L, `Stoo haina za kutosha (ziko ${(err.data as any).available}).`, `Not enough in the store (${(err.data as any).available} available).`) };
    return { call, ok: false, reply: say(L, 'Kuna shida kidogo. Jaribu tena.', 'Something went wrong. Try again.') };
  }
}
