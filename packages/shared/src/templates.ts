import type { Lang } from './types';
import type { DukaEngine } from './engine';
import { formatKsh as k } from './money';
import { dayFigures, cashPosition } from './reports';
import { dayKey, addDays } from './dates';

const REM = {
  sw: [
    (n: string, b: number, shop: string) => `Habari ${n}, ni ${shop} hapa. Tunakukumbusha kwa upole deni lako la ${k(b)}. Ukipata nafasi, unaweza kulipa kwa M-Pesa. Asante kwa kuwa mteja wetu!`,
    (n: string, b: number, shop: string) => `Habari ${n}. Deni lako kwa ${shop} ni ${k(b)} na limekaa muda. Tafadhali lipa wiki hii ili tuendelee kukuhudumia vizuri.`,
    (n: string, b: number, shop: string) => `${n}, deni lako la ${k(b)} kwa ${shop} limepita muda sana. Tafadhali lipa kufikia Jumamosi. Baada ya hapo hatutaweza kukupa bidhaa kwa deni.`,
  ],
  en: [
    (n: string, b: number, shop: string) => `Hi ${n}, it's ${shop}. A gentle reminder that your balance is ${k(b)}. You can pay by M-Pesa whenever convenient. Thank you for shopping with us!`,
    (n: string, b: number, shop: string) => `Hello ${n}. Your balance at ${shop} is ${k(b)} and has been open a while. Please clear it this week so we can keep serving you.`,
    (n: string, b: number, shop: string) => `${n}, your balance of ${k(b)} at ${shop} is long overdue. Please pay by Saturday; after that we can't extend further credit.`,
  ],
};
export const reminderTemplate = (shop: string) => (name: string, bal: number, level: 0 | 1 | 2, lang: Lang) => REM[lang][level](name, bal, shop);

export function morningBriefing(e: DukaEngine): string {
  const lang = e.shop.language; const now = e.now();
  const y = dayFigures(e, dayKey(addDays(now, -1)));
  const lastWeekSame = dayFigures(e, dayKey(addDays(now, -7)));
  const low = e.reorderList(); const shelf = low.filter(r => r.signal === 'shelf_low').length; const total = low.filter(r => r.signal === 'total_low').length;
  const cp = cashPosition(e); const exp = e.expiring(7).length;
  const cleared = e.db.credit_ledger.filter(l => l.type === 'payment' && l.balance_after === 0 && dayKey(l.created_at) === y.date).length;
  const owner = e.shop.owner_name.split(' ')[0];
  if (lang === 'sw') return `Habari ya asubuhi ${owner}! Jana uliuza ${k(y.sales)} (faida ~${k(y.gross)}). Leo tarajia karibu ${k(lastWeekSame.sales)} kama wiki iliyopita. ${shelf ? `Bidhaa ${shelf} zinaisha rafuni lakini ziko stoo.` : ''} ${total ? `${total} zinahitaji kuagizwa.` : ''} ${exp ? `${exp} zinaharibika ndani ya siku 7.` : ''} ${cleared ? `Wateja ${cleared} walimaliza madeni jana.` : ''} Wateja wanakudai ${k(cp.receivables)}. Siku njema!`.replace(/\s+/g, ' ').trim();
  return `Good morning ${owner}! Yesterday you sold ${k(y.sales)} (~${k(y.gross)} profit). Expect around ${k(lastWeekSame.sales)} today, like last week. ${shelf ? `${shelf} items are low on the shelf but in the store.` : ''} ${total ? `${total} need ordering.` : ''} ${exp ? `${exp} batches expire within 7 days.` : ''} ${cleared ? `${cleared} customers cleared their debts yesterday.` : ''} Customers owe you ${k(cp.receivables)}. Have a good day!`.replace(/\s+/g, ' ').trim();
}
export function eveningReport(e: DukaEngine): string {
  const lang = e.shop.language; const d = dayFigures(e);
  const top = d.top[0]?.name;
  if (lang === 'sw') return `Ripoti ya Leo: mauzo ${k(d.sales)} kwa wateja ${d.txns}. Cash ${k(d.cash)}, M-Pesa ${k(d.mpesa)}, deni ${k(d.credit)}. Faida ghafi ~${k(d.gross)}. ${top ? `Iliyotoka sana: ${top}.` : ''} Madeni yaliyolipwa: ${k(d.creditCollected)}. Usisahau kuhesabu droo kabla ya kufunga.`;
  return `Today's report: ${k(d.sales)} across ${d.txns} sales. Cash ${k(d.cash)}, M-Pesa ${k(d.mpesa)}, credit ${k(d.credit)}. Gross profit ~${k(d.gross)}. ${top ? `Top seller: ${top}.` : ''} Debt collected: ${k(d.creditCollected)}. Count the drawer before you close.`;
}
