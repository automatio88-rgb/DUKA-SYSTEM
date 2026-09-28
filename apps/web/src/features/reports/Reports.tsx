import { useEffect, useRef, useState } from 'react';
import { AreaChart, Area, XAxis, ResponsiveContainer, BarChart, Bar, Cell, ReferenceDot } from 'recharts';
import gsap from 'gsap';
import { Printer } from 'lucide-react';
import { dayFigures, series, weeklyNarrative, profitTruth, loanPack, missedDemand } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { Page, TopBar, Money } from '@/components/ui';
import { ksh } from '@/lib/format';

type Tab = 'daily' | 'weekly' | 'profit' | 'expiry' | 'dead' | 'demand' | 'loan';
/** Reports (§F9). Owner-only: this screen is never reachable in staff mode. */
export default function Reports({ initial }: { initial?: Tab }) {
  const t = useT(); const lang = useApp(s => s.lang); const [tab, setTab] = useState<Tab>(initial ?? 'daily');
  const ref = useRef<HTMLDivElement>(null);
  // GSAP stagger reveal on tab change (scroll-story feel without scroll-jacking)
  useEffect(() => { if (!ref.current) return; const ctx = gsap.context(() => gsap.from('[data-reveal]', { y: 14, opacity: 0, duration: 0.5, ease: 'expo.out', stagger: 0.05 }), ref); return () => ctx.revert(); }, [tab]);
  const tabs: [Tab, string][] = [['daily', t('rep.daily')], ['weekly', t('rep.weekly')], ['profit', t('rep.profit')], ['expiry', t('rep.expiry')], ['dead', t('rep.dead')], ['demand', t('rep.demand')], ['loan', t('rep.loan')]];
  return (
    <Page>
      <TopBar back title={t('rep.title')} />
      <div className="scroll-x -mx-4 px-4 mb-5 no-print">{tabs.map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div ref={ref}>{tab === 'daily' && <Daily />}{tab === 'weekly' && <Weekly lang={lang} />}{tab === 'profit' && <Profit />}{tab === 'expiry' && <Expiry />}{tab === 'dead' && <Dead />}{tab === 'demand' && <Demand />}{tab === 'loan' && <Loan />}</div>
    </Page>
  );
}

function Daily() {
  const t = useT(); const v = useData(e => ({ d: dayFigures(e), s: series(e, 14) }));
  const hours = v.d.byHour.map((x, h) => ({ h, x })).filter(r => r.h >= 6 && r.h <= 22);
  const peak = hours.reduce((m, r) => (r.x > m.x ? r : m), hours[0]);
  return (
    <>
      <section data-reveal className="surface receipt-edge p-5 pb-6" data-testid="daily-report"><p className="eyebrow">{t('rep.sales')}</p><Money value={v.d.sales} className="block text-[40px] font-semibold" />
        <div className="mt-3 space-y-1.5">{[[t('rep.cogs'), -v.d.cogs], [t('rep.gross'), v.d.gross], [t('rep.expenses'), -v.d.expenses], [t('rep.net'), v.d.net]].map(([l, n], i) => <div key={i} className={`flex justify-between ${i === 3 ? 'pt-2 border-t border-dashed border-line font-semibold' : ''}`}><span className="text-muted">{l as string}</span><span className={`num ${(n as number) < 0 ? '' : i ? 'text-leaf' : ''}`}>{ksh(n as number)}</span></div>)}</div></section>
      <section data-reveal className="mt-6"><h2 className="font-semibold mb-1">{useApp.getState().lang === 'sw' ? 'Mauzo kwa saa' : 'Sales by hour'}</h2>
        <div className="h-[150px] -mx-2"><ResponsiveContainer><AreaChart data={hours} margin={{ top: 22, left: 8, right: 8 }}><defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--brand)" stopOpacity={0.45} /><stop offset="1" stopColor="var(--brand)" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="h" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} /><Area type="monotone" dataKey="x" stroke="var(--brand)" strokeWidth={2.5} fill="url(#g1)" />{peak?.x > 0 && <ReferenceDot x={peak.h} y={peak.x} r={5} fill="var(--maize)" stroke="none" label={{ value: `${peak.h}:00 ${ksh(peak.x, true)}`, position: 'top', fill: 'var(--maize)', fontSize: 11 }} />}</AreaChart></ResponsiveContainer></div></section>
      <section data-reveal className="surface divide mt-4">{v.d.top.map((p, i) => <div key={i} className="row"><span className="num text-muted w-5">{i + 1}</span><span className="flex-1 truncate">{p.name}</span><span className="num text-muted text-sm">×{p.qty}</span><span className="num font-semibold">{ksh(p.revenue)}</span></div>)}</section>
    </>
  );
}

function Weekly({ lang }: { lang: 'en' | 'sw' }) {
  const w = useData(e => ({ n: weeklyNarrative(e, lang), s: series(e, 7) }), [lang]);
  const peak = w.s.reduce((m, d, i) => (d.sales > w.s[m].sales ? i : m), 0);
  const days = w.s.map((d, i) => ({ ...d, l: new Date(d.date + 'T12:00').toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-KE', { weekday: 'short' }), p: i === peak }));
  return (
    <article>
      <h2 data-reveal className="text-[24px] font-bold leading-tight">{w.n.headline}</h2>
      <div data-reveal className="h-[150px] -mx-2 my-4"><ResponsiveContainer><BarChart data={days} margin={{ top: 20, left: 8, right: 8 }}><XAxis dataKey="l" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} /><Bar dataKey="sales" radius={[8, 8, 8, 8]} maxBarSize={30} label={{ position: 'top', content: (p: any) => days[p.index]?.p ? <text x={p.x + p.width / 2} y={p.y - 6} textAnchor="middle" fill="var(--maize)" fontSize={11} fontWeight={600}>{days[p.index].l} spike</text> : null }}>{days.map((d, i) => <Cell key={i} fill={d.p ? 'var(--maize)' : 'var(--s3)'} />)}</Bar></BarChart></ResponsiveContainer></div>
      <div className="space-y-4 text-[16px] leading-[1.65] max-w-[65ch]">{w.n.paragraphs.map((p, i) => <p data-reveal key={i}>{p}</p>)}</div>
    </article>
  );
}

function Profit() {
  const t = useT(); const p = useData(e => profitTruth(e));
  return (
    <>
      <section data-reveal className="flex gap-6 mb-5"><div><p className="eyebrow">{t('rep.sales')} 30d</p><Money value={p.totals.revenue} compact className="text-2xl font-semibold" /></div><div><p className="eyebrow">{t('rep.gross')}</p><Money value={p.totals.profit} compact className="text-2xl font-semibold text-leaf" /></div></section>
      <h3 data-reveal className="font-semibold mb-2">{t('rep.topProfit')}</h3>
      <div data-reveal className="surface divide">{p.top.map((r, i) => <div key={r.p.id} className="row"><span className="num text-muted w-5">{i + 1}</span><span className="flex-1 truncate">{r.p.name}</span><span className="badge b-mute num">{Math.round(r.margin * 100)}%</span><span className="num font-semibold text-leaf">{ksh(r.profit)}</span></div>)}</div>
      <h3 data-reveal className="font-semibold mt-6 mb-2">{t('rep.shelfWasters')}</h3>
      <div data-reveal className="surface divide">{p.wasters.map(r => <div key={r.p.id} className="row"><span className="flex-1 truncate">{r.p.name}</span><span className="text-[12px] text-muted">{useApp.getState().lang === 'sw' ? 'mtaji' : 'capital'}</span><span className="num">{ksh(r.capital)}</span><span className={`num font-semibold ${r.profit <= 0 ? 'text-clay' : ''}`}>{ksh(r.profit)}</span></div>)}</div>
      <h3 data-reveal className="font-semibold mt-6 mb-2">{t('st.category')}</h3>
      <div data-reveal className="space-y-2">{p.categories.slice(0, 8).map(c => <div key={c.name}><div className="flex justify-between text-sm"><span>{c.name}</span><span className="num">{ksh(c.profit)}</span></div><div className="h-2 rounded-full bg-s2 mt-1 overflow-hidden"><div className="h-full bg-brand rounded-full" style={{ width: `${Math.max(3, (c.profit / (p.categories[0]?.profit || 1)) * 100)}%` }} /></div></div>)}</div>
    </>
  );
}
function Expiry() { const lang = useApp(s => s.lang); const x = useData(e => e.expiring(30)); return <div className="surface divide">{x.map(r => <div data-reveal key={r.b.id} className="row"><span className={`badge ${r.days <= 7 ? 'b-clay' : r.days <= 14 ? 'b-maize' : 'b-mute'} num`}>{r.days}d</span><span className="flex-1 min-w-0"><span className="block truncate">{r.p.name}</span><span className="block text-[12px] text-muted">{r.b.qty} · {r.location === 'store' ? 'Store' : 'Duka'}</span></span><span className="text-right"><span className="block num text-muted line-through text-[12px]">{ksh(r.p.retail_price)}</span><span className="block num font-semibold text-leaf">{ksh(r.discount.price)}</span></span></div>)}{!x.length && <p className="p-6 text-center text-muted">{lang === 'sw' ? 'Hakuna kinachoharibika karibuni.' : 'Nothing expiring soon.'}</p>}</div>; }
function Dead() { const t = useT(); const d = useData(e => e.deadStock()); const tot = d.reduce((a, r) => a + r.frozen, 0); return <><section data-reveal className="mb-4"><p className="eyebrow">{t('rep.frozen')}</p><Money value={tot} className="text-[36px] font-semibold text-clay" /></section><div className="surface divide">{d.map(r => <div data-reveal key={r.p.id} className="row"><span className="flex-1 truncate">{r.p.name}</span><span className="num text-muted text-sm">{r.qty}</span><span className="num font-semibold">{ksh(r.frozen)}</span></div>)}</div></>; }
function Demand() { const lang = useApp(s => s.lang); const d = useData(e => missedDemand(e, 7)); return <div className="surface divide">{d.map(r => <div data-reveal key={r.text} className="row"><span className="flex-1 capitalize">{r.text}</span><span className="badge b-maize">{r.count}×</span></div>)}{!d.length && <p className="p-6 text-center text-muted">{lang === 'sw' ? 'Hakuna aliyekosa bidhaa wiki hii.' : 'Nobody left empty-handed this week.'}</p>}</div>; }

function Loan() {
  const t = useT(); const v = useData(e => ({ lp: loanPack(e), shop: e.shop }));
  const net = (m: { sales: number; cogs: number; expenses: number }) => m.sales - m.cogs - m.expenses;
  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between"><div><p className="eyebrow">{t('rep.loan')}</p><h2 className="text-xl font-bold">{v.shop.name}</h2><p className="text-sm text-muted">{v.shop.owner_name} · {v.shop.phone}</p></div><button className="chip no-print" onClick={() => window.print()}><Printer size={16} />{t('rep.print')}</button></div>
      <div className="overflow-x-auto mt-4"><table className="w-full text-[13px] num"><thead><tr className="text-muted text-left"><th className="py-2 font-medium">{t('rep.month')}</th><th className="text-right font-medium">{t('rep.sales')}</th><th className="text-right font-medium">{t('rep.gross')}</th><th className="text-right font-medium">{t('rep.net')}</th><th className="text-right font-medium">{t('rep.cashIn')}</th></tr></thead>
        <tbody>{v.lp.months.map(m => <tr key={m.month} className="border-t border-line"><td className="py-2">{m.month}</td><td className="text-right">{ksh(m.sales, true)}</td><td className="text-right">{ksh(m.sales - m.cogs, true)}</td><td className="text-right text-leaf">{ksh(net(m), true)}</td><td className="text-right">{ksh(m.cashIn, true)}</td></tr>)}
          <tr className="border-t-2 border-ink font-semibold"><td className="py-2">6 mo</td><td className="text-right">{ksh(v.lp.totals.sales, true)}</td><td className="text-right">{ksh(v.lp.totals.sales - v.lp.totals.cogs, true)}</td><td className="text-right text-leaf">{ksh(net(v.lp.totals), true)}</td><td className="text-right">{ksh(v.lp.totals.cashIn, true)}</td></tr></tbody></table></div>
      <p className="text-[12px] text-muted mt-4">{useApp.getState().lang === 'sw' ? 'Imetolewa na Duka System kutoka kwa rekodi za kila siku. Miezi ya zamani imetoka kwa kitabu.' : 'Generated by Duka System from daily records. Earlier months carried over from the paper books.'}</p>
    </section>
  );
}
