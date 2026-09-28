import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, UserPlus, BellRing, Phone } from 'lucide-react';
import { reminderTemplate, escalationLevel, DomainError } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Money, Avatar, Sheet, Keypad, Empty, EASE } from '@/components/ui';
import { ksh } from '@/lib/format';

export function Kitabu() {
  const t = useT(); const { push, lang } = useApp(s => ({ push: s.push, lang: s.lang }));
  const [q, setQ] = useState(''); const [add, setAdd] = useState(false);
  const v = useData(e => { const list = e.db.customers.filter(c => !c.deleted_at).map(c => ({ c, bal: e.balanceOf(c.id), days: e.lastPaymentDays(c.id) })).sort((a, b) => b.bal - a.bal); return { list, owed: list.reduce((a, x) => a + Math.max(0, x.bal), 0), n: list.filter(x => x.bal > 0).length }; });
  const list = v.list.filter(x => x.c.name.toLowerCase().includes(q.toLowerCase()) || (x.c.phone ?? '').includes(q));
  return (
    <Page className="ruled min-h-[100dvh]">
      <TopBar title={t('kb.title')} right={<button className="chip tap" onClick={() => setAdd(true)}><UserPlus size={16} />{t('kb.addCustomer')}</button>} />
      <section className="mb-5"><p className="eyebrow">{t('kb.owed')}</p><Money value={v.owed} className="block text-[40px] font-semibold leading-tight text-maize" /><p className="text-muted text-sm">{v.n} {t('kb.debtors')}</p></section>
      <label className="relative block mb-4"><Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" /><input className="field pl-12" placeholder={t('kb.search')} value={q} onChange={e => setQ(e.target.value)} /></label>
      {list.length === 0 ? <Empty title={lang === 'sw' ? 'Kitabu ni safi' : 'The kitabu is clean'} /> : (
        <div className="surface divide">
          {list.map(({ c, bal, days }, i) => {
            const lvl = bal > 0 ? escalationLevel(days) : -1; const over = c.credit_limit && bal > c.credit_limit;
            return (
              <motion.button key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03, ease: EASE }} onClick={() => push({ name: 'customer', params: { id: c.id } })} className="w-full row text-left" data-testid="customer-row">
                <Avatar name={c.name} size={44} round />
                <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{c.name}</span>
                  <span className="block text-[13px] text-muted">{bal > 0 ? `${t('kb.lastPaid')}: ${days} ${t('kb.days')}` : t('kb.cleared')}{over ? ` · ${lang === 'sw' ? 'amezidi kikomo' : 'over limit'}` : ''}</span></span>
                <span className="text-right"><span className={`block num font-semibold ${bal > 0 ? '' : 'text-leaf'}`}>{ksh(bal)}</span>{lvl >= 1 && <span className={`badge ${lvl === 2 ? 'b-clay' : 'b-maize'}`}>{t(`kb.tone.${lvl}` as any)}</span>}</span>
              </motion.button>
            );
          })}
        </div>
      )}
      <NewCustomer open={add} onClose={() => setAdd(false)} />
    </Page>
  );
}

function NewCustomer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(); const say = useApp(s => s.say); const [f, setF] = useState({ name: '', phone: '', limit: '' });
  return (
    <Sheet open={open} onClose={onClose} title={t('kb.addCustomer')}>
      <div className="space-y-3">
        <input className="field" placeholder={t('kb.name')} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input className="field" placeholder={t('kb.phone')} inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <input className="field num" placeholder={t('kb.limit')} inputMode="numeric" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} />
        <button className="btn btn-brand btn-block" disabled={f.name.trim().length < 2} onClick={() => { act(e => e.addCustomer({ name: f.name.trim(), phone: f.phone || undefined, credit_limit: +f.limit || undefined })); say(t('kb.save')); setF({ name: '', phone: '', limit: '' }); onClose(); }}>{t('kb.save')}</button>
      </div>
    </Sheet>
  );
}

export function CustomerScreen({ id }: { id: string }) {
  const t = useT(); const { lang, say } = useApp(s => ({ lang: s.lang, say: s.say }));
  const [mode, setMode] = useState<'charge' | 'payment' | null>(null); const [amt, setAmt] = useState(''); const [remind, setRemind] = useState(false);
  const v = useData(e => { const c = e.customer(id); return { c, bal: e.balanceOf(id), days: e.lastPaymentDays(id), ledger: e.ledgerOf(id).reverse(), shop: e.shop.name }; }, [id]);
  const lvl = escalationLevel(v.days) as 0 | 1 | 2;
  const msg = reminderTemplate(v.shop)(v.c.name, v.bal, lvl, lang);
  const save = () => {
    const n = +amt; if (!n) return;
    try {
      if (mode === 'charge') { const r = act(e => e.addCredit(id, n)); if (r.overLimit) say(`${t('pos.overLimit')} ${ksh(r.overLimit)}`, 'warn'); else say(`${t('kb.charge')} ${ksh(n)}`); }
      else { act(e => e.recordPayment(id, n, 'cash')); say(`${t('kb.payment')} ${ksh(n)}`); }
      setAmt(''); setMode(null);
    } catch (err) { say(err instanceof DomainError ? err.code : String(err), 'warn'); }
  };
  return (
    <Page className="ruled min-h-[100dvh]">
      <TopBar back title={v.c.name} sub={v.c.phone} right={v.c.phone ? <a href={`tel:${v.c.phone}`} className="tap h-11 w-11 grid place-items-center rounded-full bg-s2" aria-label="Call"><Phone size={18} /></a> : undefined} />
      <section className="surface p-5">
        <p className="eyebrow">{t('kb.balance')}</p><Money value={v.bal} className={`block text-[40px] font-semibold ${v.bal > 0 ? 'text-maize' : 'text-leaf'}`} />
        {v.c.credit_limit && <div className="mt-3"><div className="h-2 rounded-full bg-s3 overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, (v.bal / v.c.credit_limit) * 100)}%` }} transition={{ duration: 0.8, ease: EASE }} className={`h-full ${v.bal > v.c.credit_limit ? 'bg-clay' : 'bg-maize'}`} /></div><p className="text-[13px] text-muted mt-1.5">{t('kb.limit')} <span className="num">{ksh(v.c.credit_limit)}</span></p></div>}
        {v.bal > 0 && <button className="chip tap mt-4" onClick={() => setRemind(true)}><BellRing size={16} />{t('kb.remind')}</button>}
      </section>

      <h2 className="text-[17px] font-semibold mt-7 mb-2">{t('kb.statement')}</h2>
      <div className="surface divide">
        {v.ledger.map(l => (
          <div key={l.id} className="row min-h-[52px]">
            <span className={`badge ${l.type === 'payment' ? 'b-leaf' : l.type === 'charge' ? 'b-maize' : 'b-mute'}`}>{t(`kb.${l.type}` as any)}</span>
            <span className="flex-1 text-[13px] text-muted">{new Date(l.created_at).toLocaleDateString(lang === 'sw' ? 'sw-KE' : 'en-KE', { day: 'numeric', month: 'short' })}{l.note ? ` · ${l.note}` : ''}</span>
            <span className="text-right"><span className={`block num font-semibold ${l.type === 'payment' ? 'text-leaf' : ''}`}>{l.type === 'payment' ? '−' : '+'}{ksh(Math.abs(l.amount))}</span><span className="block num text-[12px] text-muted">{ksh(l.balance_after)}</span></span>
          </div>
        ))}
      </div>

      {/* Actions pinned in the thumb zone */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center no-print"><div className="w-full max-w-[480px] grid grid-cols-2 gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-bg/95 backdrop-blur border-t border-line">
        <button className="btn btn-ghost" onClick={() => setMode('charge')} data-testid="add-debt">{t('kb.addCredit')}</button><button className="btn btn-leaf" onClick={() => setMode('payment')} data-testid="record-payment">{t('kb.recordPayment')}</button></div></div>

      <Sheet open={!!mode} onClose={() => setMode(null)} title={mode === 'charge' ? t('kb.addCredit') : t('kb.recordPayment')}>
        <p className="num text-[44px] font-semibold text-center my-3">{ksh(+amt || 0)}</p>
        {mode === 'payment' && v.bal > 0 && <div className="flex justify-center mb-3"><button className="chip num" onClick={() => setAmt(String(v.bal))}>{lang === 'sw' ? 'Deni lote' : 'Full balance'} {ksh(v.bal)}</button></div>}
        <Keypad onKey={k => setAmt(k === '⌫' ? amt.slice(0, -1) : amt.length < 7 ? amt + k : amt)} />
        <button className={`btn btn-block mt-3 ${mode === 'payment' ? 'btn-leaf' : 'btn-brand'}`} disabled={!+amt} onClick={save}>{t('kb.save')}</button>
      </Sheet>
      <Sheet open={remind} onClose={() => setRemind(false)} title={`${t('kb.remind')} · ${t(`kb.tone.${lvl}` as any)}`}>
        <p className="surface p-4 text-[15px] leading-relaxed bg-s2">{msg}</p>
        <a className="btn btn-leaf btn-block mt-4" href={`https://wa.me/${(v.c.phone ?? '').replace(/^0/, '254')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" onClick={() => { act(e => e.put('reminders', { customer_id: id, channel: 'whatsapp', message: msg, scheduled_at: e.iso(), sent_at: e.iso(), status: 'sent', escalation_level: lvl } as any, 'reminder.sent')); setRemind(false); }}>WhatsApp</a>
        <a className="btn btn-ghost btn-block mt-2" href={`sms:${v.c.phone ?? ''}?body=${encodeURIComponent(msg)}`}>SMS</a>
      </Sheet>
      <div className="h-24" />
    </Page>
  );
}
