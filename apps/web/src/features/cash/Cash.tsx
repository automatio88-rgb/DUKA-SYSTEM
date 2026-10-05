import { useState } from 'react';
import { BarChart, Bar, XAxis, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { DomainError } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Money, Sheet, Keypad, DrawnCheck } from '@/components/ui';
import { ksh, hhmm } from '@/lib/format';

/** Cash sessions & shrinkage guard (§F6). */
export default function Cash() {
  const t = useT(); const { session, say, lang } = useApp(s => ({ session: s.session!, say: s.say, lang: s.lang })); const owner = session.role === 'owner';
  const [sheet, setSheet] = useState<null | 'open' | 'close' | 'expense'>(null); const [val, setVal] = useState(''); const [cat, setCat] = useState('Transport'); const [result, setResult] = useState<number | null>(null);
  const v = useData(e => { const s = e.currentSession(); const users = new Map(e.db.users.map(u => [u.id, u.name.split(' ')[0]])); const hist = e.db.cash_sessions.filter(x => x.closed_at).sort((a, b) => a.closed_at!.localeCompare(b.closed_at!)).slice(-14); return { s, f: s ? e.sessionFigures(s) : null, hist: hist.map(h => ({ d: new Date(h.closed_at!).getDate(), v: h.variance ?? 0, who: users.get(h.user_id) ?? '' })), exp: s ? e.db.expenses.filter(x => x.created_at >= s.opened_at) : [] }; });
  const go = () => {
    const n = +val;
    try {
      if (sheet === 'open') act(e => e.openSession(n));
      if (sheet === 'expense') act(e => e.addExpense(n, cat));
      if (sheet === 'close') { const r = act(e => e.closeSession(n)); setResult(r.variance); setTimeout(() => setResult(null), 2600); }
      setSheet(null); setVal('');
    } catch (err) { say(err instanceof DomainError ? err.code : String(err), 'warn'); }
  };
  return (
    <Page>
      <TopBar back title={t('cash.title')} sub={v.s ? `${t('cash.sessionOpen')} ${hhmm(v.s.opened_at)}` : undefined} />
      {v.s && v.f ? (
        <>
          <section className="surface receipt-edge p-5 pb-6"><p className="eyebrow">{t('cash.expected')}</p><Money value={v.f.expected} className="block text-[42px] font-semibold" />
            <div className="mt-3 space-y-1.5 text-[15px]">
              {[[t('cash.float'), v.s.opening_float], [lang === 'sw' ? '+ Mauzo ya cash' : '+ Cash sales', v.f.cashSales], [lang === 'sw' ? '+ Madeni yaliyolipwa' : '+ Debt paid in cash', v.f.cashDebtPayments], [lang === 'sw' ? '− Pesa iliyotolewa' : '− Paid out', -v.f.payouts]].map(([l, n]) => <div key={l as string} className="flex justify-between"><span className="text-muted">{l as string}</span><span className="num">{ksh(n as number)}</span></div>)}
              <div className="flex justify-between pt-2 border-t border-dashed border-line"><span className="text-muted">M-Pesa</span><span className="num">{ksh(v.f.mpesaSales)}</span></div>
            </div>
          </section>
          <div className="grid grid-cols-2 gap-2 mt-6"><button className="btn btn-ghost" onClick={() => setSheet('expense')}>{t('cash.expense')}</button><button className="btn btn-brand" onClick={() => setSheet('close')} data-testid="close-day">{t('cash.close')}</button></div>
        </>
      ) : (
        <section className="surface p-5 text-center"><p className="text-muted mb-4">{lang === 'sw' ? 'Anza siku kwa kuhesabu pesa ya kuanzia kwa droo.' : 'Start the day by counting the float in the drawer.'}</p><button className="btn btn-brand btn-block" onClick={() => { setVal('2000'); setSheet('open'); }} data-testid="open-day">{t('cash.open')}</button></section>
      )}
      {owner && v.hist.length > 0 && (
        <section className="mt-8"><h2 className="text-[17px] font-semibold">{t('cash.trend')}</h2><p className="text-[13px] text-muted">{lang === 'sw' ? 'Chini ya mstari = pesa imepungua' : 'Below the line = cash went missing'}</p>
          <div className="h-[170px] -mx-2 mt-2"><ResponsiveContainer><BarChart data={v.hist} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}><XAxis dataKey="d" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} /><ReferenceLine y={0} stroke="var(--line)" /><Bar dataKey="v" radius={[6, 6, 6, 6]} maxBarSize={18}>{v.hist.map((h, i) => <Cell key={i} fill={h.v < -100 ? 'var(--clay)' : h.v < 0 ? 'var(--maize)' : 'var(--leaf)'} />)}</Bar></BarChart></ResponsiveContainer></div>
          <div className="surface divide mt-2">{v.hist.slice(-5).reverse().map((h, i) => <div key={i} className="row min-h-[46px]"><span className="flex-1 text-muted">{h.d} · {h.who}</span><span className={`num font-semibold ${h.v < 0 ? 'text-clay' : 'text-leaf'}`}>{h.v > 0 ? '+' : ''}{ksh(h.v)}</span></div>)}</div>
        </section>
      )}
      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === 'open' ? t('cash.float') : sheet === 'close' ? t('cash.count') : t('cash.expense')}>
        {sheet === 'expense' && <div className="scroll-x mb-2">{['Transport', 'Lunch & tea', 'Stock top-up', 'Electricity', 'Other'].map(c => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>}
        <p className="num text-[44px] font-semibold text-center my-3">{ksh(+val || 0)}</p>
        <Keypad onKey={k => setVal(k === '⌫' ? val.slice(0, -1) : val.length < 7 ? val + k : val)} />
        <button className="btn btn-brand btn-block mt-3" disabled={!val} onClick={go} data-testid="cash-confirm">{t('c.confirm')}</button>
      </Sheet>
      {result != null && <div className="fixed inset-0 z-50 grid place-items-center bg-bg/90" onClick={() => setResult(null)}><div className="text-center">{Math.abs(result) <= 50 ? <DrawnCheck /> : null}<p className="mt-3 text-lg font-semibold">{Math.abs(result) <= 50 ? t('cash.balanced') : result < 0 ? t('cash.short') : t('cash.over')}</p><p className={`num text-3xl ${result < -50 ? 'text-clay' : 'text-leaf'}`}>{ksh(result)}</p></div></div>}
    </Page>
  );
}
