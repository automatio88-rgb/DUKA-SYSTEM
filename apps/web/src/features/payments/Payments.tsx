import { useState } from 'react';
import { motion } from 'framer-motion';
import { ClipboardPaste, AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { DomainError } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Sheet, Avatar, Segmented, EASE } from '@/components/ui';
import { ksh, timeAgo } from '@/lib/format';

/** M-Pesa ingestion (§F5): paste the SMS → parsed → auto-matched to a debtor or a pending M-Pesa sale. */
export default function Payments() {
  const t = useT(); const { lang, say } = useApp(s => ({ lang: s.lang, say: s.say }));
  const [text, setText] = useState(''); const [tab, setTab] = useState<'inbox' | 'all'>('inbox'); const [assign, setAssign] = useState<string | null>(null);
  const v = useData(e => ({ rows: e.db.payments_inbox.slice().sort((a, b) => b.tx_time.localeCompare(a.tx_time)), cust: new Map(e.db.customers.map(c => [c.id, c.name])), debtors: e.debtors() }));
  const rows = tab === 'inbox' ? v.rows.filter(r => r.status === 'unmatched' || r.status === 'suspicious') : v.rows;
  const paste = async () => { try { const clip = await navigator.clipboard.readText(); if (clip) setText(clip); } catch { /* permission denied: manual paste */ } };
  const read = () => {
    try {
      const r = act(e => e.ingestSms(text, 'manual'));
      if (r.flags.includes('duplicate_code')) say(t('pay.duplicate'), 'warn');
      else if (r.match.type === 'customer') say(`${t('pay.matched')}: ${v.cust.get(r.match.id)} −${ksh(r.payment.amount)}`);
      else if (r.match.type === 'sale') say(`${t('pay.matched')} ✓ ${ksh(r.payment.amount)}`);
      else say(`${t('pay.unmatched')}: ${ksh(r.payment.amount)}`, 'warn');
      setText('');
    } catch (err) { say(err instanceof DomainError ? t('pay.invalid') : String(err), 'warn'); }
  };
  return (
    <Page>
      <TopBar back title={t('pay.title')} />
      <section className="surface p-4">
        <div className="flex items-center justify-between mb-2"><p className="font-semibold">{t('pay.paste')}</p><button className="chip tap" onClick={paste}><ClipboardPaste size={16} />{lang === 'sw' ? 'Bandika' : 'Paste'}</button></div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4} className="field h-auto py-3 text-[14px] leading-relaxed num" placeholder="SJK3FGH7TY Confirmed. You have received Ksh350.00 from…" data-testid="mpesa-text" />
        <p className="text-[12px] text-muted mt-2">{t('pay.pasteHint')}</p>
        <button className="btn btn-leaf btn-block mt-3" disabled={text.length < 20} onClick={read} data-testid="mpesa-read">{t('pay.process')}</button>
      </section>
      <div className="mt-6 mb-3"><Segmented value={tab} onChange={setTab} options={[{ v: 'inbox', label: `${t('pay.unmatched')} · ${v.rows.filter(r => r.status === 'unmatched' || r.status === 'suspicious').length}` }, { v: 'all', label: t('c.all') }]} /></div>
      <div className="surface divide">
        {rows.length === 0 && <p className="p-6 text-center text-muted">{lang === 'sw' ? 'Malipo yote yameunganishwa.' : 'Every payment has a home.'}</p>}
        {rows.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03, ease: EASE }} className="row">
            <span className={`h-10 w-10 rounded-ctl grid place-items-center ${p.status === 'matched' ? 'bg-leaf-soft text-leaf' : p.status === 'suspicious' ? 'bg-clay-soft text-clay' : 'bg-maize-soft text-maize'}`}>{p.status === 'matched' ? <CheckCircle2 size={20} /> : p.status === 'suspicious' ? <AlertTriangle size={20} /> : <CircleDashed size={20} />}</span>
            <div className="flex-1 min-w-0"><p className="font-semibold truncate">{p.payer_name ?? p.payer_phone}</p><p className="text-[12px] text-muted num truncate">{p.mpesa_code} · {timeAgo(p.tx_time, lang)}{p.matched_customer_id ? ` · ${v.cust.get(p.matched_customer_id)}` : ''}{p.flag ? ` · ${p.flag}` : ''}</p></div>
            <span className="num font-semibold">{ksh(p.amount)}</span>
            {p.status === 'unmatched' && <button className="chip tap" onClick={() => setAssign(p.id)} data-testid="assign">{t('pay.assign')}</button>}
          </motion.div>
        ))}
      </div>
      <Sheet open={!!assign} onClose={() => setAssign(null)} title={t('pay.toCustomer')} tall>
        <div className="divide">{v.debtors.map(d => (
          <button key={d.c.id} className="w-full row px-0" onClick={() => { act(e => e.assignPayment(assign!, { customerId: d.c.id })); say(`${t('pay.matched')}: ${d.c.name}`); setAssign(null); }}><Avatar name={d.c.name} size={40} round /><span className="flex-1 text-left">{d.c.name}</span><span className="num text-maize">{ksh(d.balance)}</span></button>
        ))}</div>
        <button className="btn btn-ghost btn-block mt-3" onClick={() => { act(e => e.ignorePayment(assign!)); setAssign(null); }}>{t('pay.ignore')}</button>
      </Sheet>
    </Page>
  );
}
