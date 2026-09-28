import { parseSwNumber, isNumWord } from './swnum';
import type { Lang } from './types';
/**
 * MockLLMProvider core: deterministic Swahili / English / Sheng intent parser.
 * Returns a tool call the agent executes against the same engine the UI uses.
 */
export type ToolName = 'recordSale' | 'addCredit' | 'recordPayment' | 'transferStock' | 'stockQuery' | 'debtQuery' | 'priceUpdate' | 'dailyReport' | 'weeklyReport' | 'addDemandLog' | 'draftOrder' | 'help' | 'greeting' | 'unknown';
export interface ToolCall { tool: ToolName; args: Record<string, any>; lang: Lang; confidence: number }

const SW_HINTS = /\b(ya|la|za|wa|na|kwa|leo|deni|bei|nani|weka|andika|nimehamisha|kutoka|ameuliza|mteja|tuna|ngapi|amelipa|ripoti|habari|mambo|sasa|niko|agiza|elfu|mia|zaidi|nimeuza|hamisha|katoni|bidhaa|mauzo|sukari|maziwa|unga|mkate)\b/i;
export const detectLang = (t: string): Lang => (SW_HINTS.test(t) ? 'sw' : 'en');

const titleCase = (s: string) => s.replace(/\s+/g, ' ').trim().split(' ').map(w => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const UNIT_WORDS: Record<string, string> = { katoni: 'carton', carton: 'carton', cartons: 'carton', box: 'carton', boxes: 'carton', gunia: 'bag', bag: 'bag', bags: 'bag', magunia: 'bag', pakiti: 'packet', packet: 'packet', packets: 'packet', dozen: 'dozen', dazani: 'dozen', bale: 'bale', bales: 'bale', crate: 'crate', kreti: 'crate', pieces: 'piece', piece: 'piece', vipande: 'piece', kilo: 'kg', kg: 'kg' };

function nameBeforeNumber(text: string, lead: RegExp): string | undefined {
  const m = text.match(lead); if (!m) return;
  const after = text.slice((m.index ?? 0) + m[0].length).trim().split(/\s+/);
  const out: string[] = [];
  for (const w of after) { const lw = w.toLowerCase().replace(/[,?.!]/g, ''); if (isNumWord(lw) || /^(ksh|sh|bob|amelipa|ameleta|paid|of|shilingi)$/.test(lw)) break; out.push(w.replace(/[,?.!]/g, '')); if (out.length >= 4) break; }
  return out.length ? titleCase(out.join(' ')) : undefined;
}

export function parseIntent(input: string): ToolCall {
  const text = input.trim();
  const t = text.toLowerCase();
  const lang = detectLang(t);
  const n = parseSwNumber(t);
  const call = (tool: ToolName, args: Record<string, any> = {}, confidence = 0.9): ToolCall => ({ tool, args, lang, confidence });

  if (/^(habari|mambo|sasa|niaje|hello|hi|hey|good (morning|evening))\b/.test(t) && t.split(' ').length <= 4) return call('greeting');
  if (/^(help|msaada|saidia|unaweza kufanya nini|what can you do)/.test(t)) return call('help');

  // Debts query: "Nani ananidai zaidi ya elfu moja?" / "who owes me more than 1000"
  if (/(nani\s+ana(ni)?dai|wanaodaiwa|who owes|list debt|madeni yote|debtors)/.test(t)) {
    const thr = /(zaidi ya|more than|over|above|juu ya)/.test(t) && n ? n.value : 0;
    return call('debtQuery', { minBalance: thr });
  }
  // Payment against credit: "Mama Njeri amelipa 300" / "Baba Kevin paid 500"
  if (/(amelipa|ame lipa|amelipia|ameleta pesa|\bpaid\b|payment from)/.test(t) && n) {
    const m = text.match(/^(.*?)\s+(amelipa|ame lipa|amelipia|ameleta|paid)/i);
    const name = m ? titleCase(m[1].replace(/^(record|andika)\s+/i, '')) : nameBeforeNumber(text, /payment from\s+/i);
    return call('recordPayment', { customer: name, amount: n.value });
  }
  // Credit: "Andika deni ya Baba Kevin mia nne hamsini"
  if (/(deni|mkopo|\bcredit\b|\bdebt\b|kopesha|amekopa)/.test(t) && !/(ngapi|how much|anadaiwa)/.test(t) && n) {
    const name = nameBeforeNumber(text, /(deni\s+(ya|la|kwa)|mkopo\s+(ya|wa|kwa)|credit\s+(for|to)|debt\s+(for|to)|kopesha)\s+/i) ?? nameBeforeNumber(text, /(andika|weka|add)\s+/i);
    return call('addCredit', { customer: name, amount: n.value });
  }
  // Customer balance: "Baba Kevin anadaiwa ngapi"
  if (/(anadaiwa|deni la .* ni ngapi|how much does .* owe|balance ya)/.test(t)) {
    const m = text.match(/^(.*?)\s+anadaiwa/i) ?? text.match(/does\s+(.*?)\s+owe/i) ?? text.match(/balance ya\s+(.*)/i);
    return call('debtQuery', { customer: m ? titleCase(m[1]) : undefined, minBalance: 0 });
  }
  // Transfer: "Nimehamisha katoni mbili za maziwa kutoka store"
  if (/(hamisha|nimehamisha|transfer|moved|nimetoa .* store|leta kutoka store|rudisha)/.test(t)) {
    const toStore = /(kwenda store|kwenda stoo|to (the )?store|rudisha|back to store)/.test(t);
    const unitW = t.split(/\s+/).find(w => w in UNIT_WORDS);
    const productPhrase = t.replace(/.*?(za|ya|of)\s+/, '').replace(/\s+(kutoka|from|kwenda|to)\s+.*$/, '');
    return call('transferStock', { qty: n?.value ?? 1, unit: unitW ? UNIT_WORDS[unitW] : 'carton', product: productPhrase, from: toStore ? 'duka' : 'store', to: toStore ? 'store' : 'duka', direction: toStore ? 'duka→store' : 'store→duka' });
  }
  // Price update: "Weka bei ya sukari 65" / "set price of sugar to 65"
  if (/(weka bei|badilisha bei|bei mpya|set (the )?price|change price|price of)/.test(t) && n) {
    const product = t.replace(/(weka|badilisha)\s+bei\s+(ya|la|za)?\s*/, '').replace(/set (the )?price (of|for)?\s*|change price (of|for)?\s*|price of\s*/, '').replace(/\s+(to|iwe|kuwa)?\s*(ksh|sh)?\s*\d.*$/, '').replace(/\s+(mia|elfu|hamsini|sitini|sabini|themanini|tisini|arobaini|thelathini|ishirini|kumi).*/, '').trim();
    return call('priceUpdate', { product, price: n.value });
  }
  // Demand log: "Mteja ameuliza formula ya watoto"
  if (/(ameuliza|ameulizia|anauliza|wameuliza|asked for|customer wants|hatuna|tumeishiwa na|out of)/.test(t)) {
    const what = text.replace(/^.*?(ameuliza|ameulizia|anauliza|wameuliza|asked for|wants|hatuna|tumeishiwa na|out of)\s*/i, '').replace(/[?.!]$/, '');
    return call('addDemandLog', { text: what || text });
  }
  if (/(ripoti ya wiki|weekly|wiki hii)/.test(t)) return call('weeklyReport');
  if (/(ripoti ya leo|report ya leo|daily report|today'?s report|mauzo ya leo|leo tumeuza|tumeuza ngapi|how did we do today|sales today|ripoti)/.test(t)) return call('dailyReport');
  // Draft order: "Agiza bidhaa zinazoisha" / "draft order"
  if (/(agiza|draft (an )?order|reorder|order ya|tuagize|nini kinaisha)/.test(t)) return call('draftOrder', { supplier: nameBeforeNumber(text, /(kwa|from)\s+/i) });
  // Sale: "Nimeuza unga mbili" / "sold 3 bread"
  if (/(nimeuza|\bsold\b|record sale|uza)/.test(t)) {
    const product = t.replace(/(nimeuza|sold|record sale|uza)\s*/, '').split(/\s+/).filter(w => !isNumWord(w) && !(w in UNIT_WORDS)).join(' ');
    return call('recordSale', { product, qty: n?.value ?? 1 });
  }
  // Stock query: "Tuna maziwa ngapi" / "how many sugar"
  if (/(tuna .* ngapi|zimebaki|imebaki|ngapi|how many|stock (ya|of)|do we have|iko store)/.test(t)) {
    const product = t.replace(/(tuna|how many|stock (ya|of)|do we have|zimebaki|imebaki|ngapi|iko store|\?|left|in stock)/g, ' ').trim();
    return call('stockQuery', { product });
  }
  return call('unknown', { text }, 0.2);
}
