import { useState } from 'react';
import { Truck, PackageCheck, Sparkles, Plus, Trash2 } from 'lucide-react';
import { fuzzySearch, DomainError, type Product } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Sheet, Segmented, Avatar } from '@/components/ui';
import { ksh } from '@/lib/format';

/** Purchases, suppliers & price memory (§F7) + reorder intelligence (§F8). */
export default function Purchases() {
  const t = useT(); const { say, lang } = useApp(s => ({ say: s.say, lang: s.lang }));
  const [tab, setTab] = useState<'reorder' | 'deliveries' | 'owe'>('reorder'); const [form, setForm] = useState(false);
  const v = useData(e => ({ re: e.reorderList().sort((a, b) => (a.signal === 'total_low' ? -1 : 1) - (b.signal === 'total_low' ? -1 : 1)), pur: e.db.purchases.slice().sort((a, b) => b.created_at.localeCompare(a.created_at)), sup: new Map(e.db.suppliers.map(s => [s.id, s.name])), items: e.db.purchase_items, pay: e.payables(), prods: new Map(e.db.products.map(p => [p.id, p])) }));
  return (
    <Page>
      <TopBar back title={t('pur.title')} right={<button className="chip tap" onClick={() => setForm(true)}><Plus size={16} />{t('pur.new')}</button>} />
      <Segmented value={tab} onChange={setTab} options={[{ v: 'reorder', label: t('pur.reorder').split(' ')[0] }, { v: 'deliveries', label: t('pur.items') }, { v: 'owe', label: t('pur.payables') }]} />
      {tab === 'reorder' && (
        <>
          <button className="btn btn-brand btn-block mt-4" onClick={() => { const po = act(e => e.draftOrder()); say(po ? `${t('pur.draft')}: ${ksh(po.total_cost)}` : '—'); setTab('deliveries'); }}><Sparkles size={18} />{lang === 'sw' ? 'Andaa agizo kwa mguso mmoja' : 'Draft order in one tap'}</button>
          <div className="surface divide mt-4">{v.re.map(r => (
            <div key={r.p.id} className="row"><Avatar name={r.p.name} size={40} />
              <div className="flex-1 min-w-0"><p className="font-medium truncate">{r.p.name}</p><p className="text-[12px] text-muted">{t('st.duka')} {r.shelf} · {t('st.store')} {r.store}{r.best ? ` · ${t('pur.bestPrice')}: ${r.best.supplier} ${ksh(r.best.cost)}` : ''}</p></div>
              {r.signal === 'shelf_low' ? <button className="chip tap" onClick={() => { try { act(e => e.transfer(r.p.id, Math.min(r.store, r.p.units_per_buy_unit))); say(t('st.moved')); } catch (err) { say(String((err as DomainError).code ?? err), 'warn'); } }}>{t('st.transfer').split(' ')[0]}</button> : <span className="badge b-clay num">{r.suggestBuy} {r.p.buy_unit}</span>}
            </div>))}</div>
        </>
      )}
      {tab === 'deliveries' && <div className="surface divide mt-4">{v.pur.map(p => (
        <div key={p.id} className="row"><span className={`h-10 w-10 rounded-ctl grid place-items-center ${p.status === 'draft' ? 'bg-maize-soft text-maize' : 'bg-leaf-soft text-leaf'}`}>{p.status === 'draft' ? <Truck size={19} /> : <PackageCheck size={19} />}</span>
          <div className="flex-1 min-w-0"><p className="font-medium truncate">{v.sup.get(p.supplier_id)}</p><p className="text-[12px] text-muted">{v.items.filter(i => i.purchase_id === p.id).length} {t('pur.items').toLowerCase()} · {new Date(p.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}{p.invoice_no ? ` · ${p.invoice_no}` : ''}</p></div>
          <span className="num font-semibold">{ksh(p.total_cost)}</span>
          {p.status === 'draft' && <button className="chip tap" onClick={() => { act(e => e.receivePurchase(p.id)); say(t('pur.received')); }}>{t('pur.receive').split(' ')[0]}</button>}
        </div>))}</div>}
      {tab === 'owe' && <div className="surface divide mt-4">{v.pay.length === 0 && <p className="p-6 text-center text-muted">{lang === 'sw' ? 'Hudaiwi na mtu.' : 'You owe nobody.'}</p>}{v.pay.map(x => (
        <div key={x.p.id} className="row"><div className="flex-1"><p className="font-medium">{x.supplier}</p><p className="text-[12px] text-muted">{t('pur.due')}: {x.p.due_date ?? '—'}</p></div><span className="num font-semibold text-clay">{ksh(x.owed)}</span><button className="chip tap" onClick={() => { act(e => e.payPurchase(x.p.id, x.owed)); say(t('pur.paid')); }}>{t('pur.paid')}</button></div>))}</div>}
      <NewPurchase open={form} onClose={() => setForm(false)} />
    </Page>
  );
}

function NewPurchase({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(); const say = useApp(s => s.say);
  const d = useData(e => ({ sups: e.db.suppliers, prods: e.db.products.filter(p => p.active), best: (id: string) => e.bestPrice(id) }));
  const [sup, setSup] = useState(''); const [q, setQ] = useState(''); const [inv, setInv] = useState(''); const [lines, setLines] = useState<{ p: Product; qty: string; cost: string; exp: string }[]>([]);
  const total = lines.reduce((a, l) => a + (+l.qty || 0) * (+l.cost || 0), 0);
  return (
    <Sheet open={open} onClose={onClose} title={t('pur.new')} tall>
      <div className="space-y-3">
        <select className="field" value={sup} onChange={e => setSup(e.target.value)}><option value="">{t('pur.supplier')}</option>{d.sups.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input className="field" placeholder={t('pur.invoice')} value={inv} onChange={e => setInv(e.target.value)} />
        <input className="field" placeholder={t('st.search')} value={q} onChange={e => setQ(e.target.value)} />
        {q && <div className="surface divide">{fuzzySearch(d.prods, q, 5).map(p => { const b = d.best(p.id); return <button key={p.id} className="w-full row text-left" onClick={() => { setLines([...lines, { p, qty: '1', cost: String(Math.round(p.cost_price * p.units_per_buy_unit)), exp: '' }]); setQ(''); }}><span className="flex-1">{p.name}</span>{b && <span className="text-[12px] text-leaf">{b.supplier?.split(' ')[0]} {ksh(b.cost * p.units_per_buy_unit)}</span>}</button>; })}</div>}
        {lines.map((l, i) => (
          <div key={i} className="surface p-3"><div className="flex items-center"><p className="flex-1 font-medium text-[15px]">{l.p.name}</p><button aria-label="remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 size={16} className="text-muted" /></button></div>
            <div className="grid grid-cols-3 gap-2 mt-2"><input className="field num h-12" inputMode="decimal" value={l.qty} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} aria-label={l.p.buy_unit} /><input className="field num h-12" inputMode="numeric" value={l.cost} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, cost: e.target.value } : x))} aria-label="cost" />{l.p.track_expiry ? <input className="field h-12 text-[13px]" type="date" value={l.exp} onChange={e => setLines(lines.map((x, j) => j === i ? { ...x, exp: e.target.value } : x))} /> : <span className="text-[12px] text-muted self-center">{l.p.buy_unit}</span>}</div></div>
        ))}
        <div className="flex justify-between items-baseline"><span className="text-muted">{t('pos.total')}</span><span className="num text-2xl font-semibold">{ksh(total)}</span></div>
        <button className="btn btn-brand btn-block" disabled={!sup || !lines.length} onClick={() => { act(e => { const po = e.createPurchase(sup, lines.map(l => ({ productId: l.p.id, qtyBuy: +l.qty, costPerBuy: +l.cost, expiry: l.exp || undefined })), { invoiceNo: inv || undefined }); e.receivePurchase(po.id); }); say(t('pur.received')); setLines([]); onClose(); }}>{t('pur.receive')}</button>
      </div>
    </Sheet>
  );
}
