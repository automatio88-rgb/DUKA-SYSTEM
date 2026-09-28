import { motion } from 'framer-motion';
import { Lock, Bell, Sparkles, ChevronRight, ArrowUpRight, ArrowDownRight, Truck, Wallet, MessageSquareText } from 'lucide-react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { dayFigures, series, cashPosition, dayKey, addDays } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { endSession } from '@/lib/data';
import { Page, Money, EASE } from '@/components/ui';
import { SyncPill } from '@/components/SyncPill';
import { ksh } from '@/lib/format';
import { AlertRow } from './Alerts';

export function Home() {
  const t = useT(); const { session, lang, push, go, set } = useApp(s => ({ session: s.session!, lang: s.lang, push: s.push, go: s.go, set: s.set }));
  const owner = session.role === 'owner';
  const v = useData(e => {
    const today = dayFigures(e); const lastWeek = dayFigures(e, dayKey(addDays(e.now(), -7))); const yesterday = dayFigures(e, dayKey(addDays(e.now(), -1)));
    const s7 = series(e, 7); const cp = cashPosition(e);
    const alerts = e.db.alerts.filter(a => !a.read_at && a.type !== 'briefing').sort((a, b) => sev(b.severity) - sev(a.severity) || b.created_at.localeCompare(a.created_at));
    const brief = [...e.db.alerts].filter(a => a.type === 'briefing').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return { today, lastWeek, yesterday, s7, cp, alerts, brief, shop: e.shop };
  });
  const h = new Date().getHours();
  const greet = t(h < 12 ? 'home.greeting.morning' : h < 17 ? 'home.greeting.afternoon' : 'home.greeting.evening');
  const closed = v.today.txns === 0; const show = closed ? v.yesterday : v.today;
  const delta = v.lastWeek.sales ? Math.round(((v.today.sales - v.lastWeek.sales) / v.lastWeek.sales) * 100) : 0;
  const peak = v.s7.reduce((m, d, i) => (d.sales > v.s7[m].sales ? i : m), 0);
  const days = v.s7.map((d, i) => ({ ...d, label: t(`dshort.${new Date(d.date + 'T12:00').getDay()}` as any), peak: i === peak }));

  return (
    <Page>
      <header className="flex items-center justify-between mb-5">
        <div><p className="eyebrow">{v.shop.name}</p><h1 className="text-[24px] font-bold leading-tight">{greet}, {session.name.split(' ')[0]}</h1></div>
        <div className="flex items-center gap-1"><SyncPill />
          <button aria-label={t('auth.lock')} className="tap h-11 w-11 grid place-items-center rounded-full" onClick={() => { endSession(); set({ session: null }); }}><Lock size={20} className="text-muted" /></button></div>
      </header>

      {/* Today's takings: the receipt */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="surface receipt-edge p-5 pb-6" data-testid="today-card">
        <div className="flex items-center justify-between"><span className="eyebrow">{closed ? t('c.yesterday') : t('home.todaySales')}</span>
          {!closed && v.lastWeek.sales > 0 && <span className={`badge ${delta >= 0 ? 'b-leaf' : 'b-clay'}`}>{delta >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(delta)}% <span className="font-normal ml-1 opacity-80">{t('home.vsLastWeek')}</span></span>}</div>
        <Money value={show.sales} className="block text-[44px] leading-none font-semibold mt-3" />
        <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div><p className="text-muted">{t('pos.cash')}</p><p className="num font-semibold">{ksh(show.cash)}</p></div>
          <div><p className="text-muted">{t('pos.mpesa')}</p><p className="num font-semibold">{ksh(show.mpesa)}</p></div>
          <div><p className="text-muted">{t('pos.credit')}</p><p className="num font-semibold text-maize">{ksh(show.credit)}</p></div>
        </div>
        <div className="mt-4 pt-4 border-t border-dashed border-line flex justify-between text-sm">
          <span className="text-muted">{show.txns} {lang === 'sw' ? 'mauzo' : 'sales'} · {t('rep.avgBasket')} <span className="num text-ink">{ksh(show.avgBasket)}</span></span>
          {owner && <span className="text-muted">{lang === 'sw' ? 'Faida' : 'Profit'} <span className="num text-leaf font-semibold">~{ksh(show.gross)}</span></span>}
        </div>
      </motion.section>

      {/* Quick actions in thumb reach */}
      <div className="grid grid-cols-4 gap-2 mt-7">
        {[{ icon: Wallet, label: 'M-Pesa', on: () => push({ name: 'payments' }) }, { icon: Truck, label: t('st.receive').split(' ')[0], on: () => push({ name: owner ? 'purchases' : 'stocktake' }) },
          { icon: MessageSquareText, label: 'Brain', on: () => push({ name: 'brain' }) }, { icon: Bell, label: lang === 'sw' ? 'Arifa' : 'Alerts', on: () => push({ name: 'alerts' }), n: v.alerts.length }].map(({ icon: I, label, on, n }) => (
          <button key={label} onClick={on} className="tap relative surface py-3 grid place-items-center gap-1.5"><I size={22} className="text-brand" /><span className="text-[12px] font-semibold">{label}</span>{!!n && <span className="absolute top-1.5 right-2 min-w-[20px] h-5 px-1 rounded-full bg-clay text-white text-[11px] font-bold grid place-items-center">{n}</span>}</button>
        ))}
      </div>

      {owner && (
        <>
          {/* Cash position as a ledger, not a wall of stat cards */}
          <section className="mt-7">
            <div className="flex items-baseline justify-between mb-2"><h2 className="text-[17px] font-semibold">{t('home.cashPosition')}</h2><Money value={v.cp.net} className="text-lg font-semibold" /></div>
            <div className="surface divide ruled">
              {[[t('home.inDrawer'), v.cp.drawer, 'ink'], [t('home.onMpesa'), v.cp.mpesa, 'ink'], [t('home.credit'), v.cp.receivables, 'maize'], [t('home.payables'), -v.cp.payables, 'clay']].map(([l, n, c]) => (
                <div key={l as string} className="row min-h-[48px]"><span className="flex-1 text-[15px] text-muted capitalize">{l as string}</span><span className={`num font-semibold ${c === 'maize' ? 'text-maize' : c === 'clay' ? 'text-clay' : ''}`}>{ksh(n as number)}</span></div>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <div className="flex items-baseline justify-between"><h2 className="text-[17px] font-semibold">{t('home.sales7')}</h2><button className="text-sm text-brand font-semibold" onClick={() => push({ name: 'reports' })}>{t('rep.title')}</button></div>
            <div className="h-[170px] -mx-2 mt-2">
              <ResponsiveContainer>
                <BarChart data={days} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <Bar dataKey="sales" radius={[8, 8, 8, 8]} maxBarSize={34}>
                    {days.map((d, i) => <Cell key={i} fill={d.peak ? 'var(--maize)' : 'var(--s3)'} />)}
                    <LabelList dataKey="sales" content={(p: any) => days[p.index]?.peak ? <text x={p.x + p.width / 2} y={p.y - 8} textAnchor="middle" fill="var(--maize)" fontSize={11} fontWeight={600}>{lang === 'sw' ? 'Kilele' : 'Peak'} {ksh(p.value, true)}</text> : null} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </>
      )}

      {v.brief && (
        <button onClick={() => push({ name: 'brain' })} className="mt-6 w-full text-left surface p-4 tap flex gap-3">
          <span className="h-10 w-10 shrink-0 rounded-ctl bg-maize-soft text-maize grid place-items-center"><Sparkles size={20} /></span>
          <span className="text-[15px] leading-relaxed"><span className="block font-semibold mb-0.5">Duka Brain</span><span className="text-muted line-clamp-3">{v.brief.body}</span></span>
        </button>
      )}

      <section className="mt-7">
        <div className="flex items-baseline justify-between mb-2"><h2 className="text-[17px] font-semibold">{t('home.alerts')}</h2>{v.alerts.length > 4 && <button className="text-sm text-brand font-semibold flex items-center" onClick={() => push({ name: 'alerts' })}>{t('c.seeAll')} <ChevronRight size={16} /></button>}</div>
        {v.alerts.length === 0 ? <p className="text-muted py-6 text-center">{t('home.noAlerts')}</p> : (
          <div className="surface divide">{v.alerts.slice(0, 4).map((a, i) => <AlertRow key={a.id} a={a} i={i} />)}</div>
        )}
      </section>
      {!owner && <button className="btn btn-brand btn-block mt-6" onClick={() => go('sell')}>{t('pos.newSale')}</button>}
    </Page>
  );
}
const sev = (s: string) => (s === 'critical' ? 3 : s === 'warn' ? 2 : 1);
