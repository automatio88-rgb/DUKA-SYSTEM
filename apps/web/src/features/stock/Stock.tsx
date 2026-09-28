import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRightLeft, Plus, History, Pencil } from 'lucide-react';
import { fuzzySearch, daysOfStock, DomainError, type MoveReason } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Avatar, Sheet, Keypad, Segmented, EASE } from '@/components/ui';
import { ksh, hhmm } from '@/lib/format';

type Filter = 'all' | 'low' | 'expiring' | 'store';
export function Stock() {
  const t = useT(); const { push, session, lang } = useApp(s => ({ push: s.push, session: s.session!, lang: s.lang }));
  const [q, setQ] = useState(''); const [f, setF] = useState<Filter>('all'); const [add, setAdd] = useState(false);
  const rows = useData(e => {
    const re = new Map(e.reorderList().map(r => [r.p.id, r.signal])); const exp = new Set(e.expiring(30).map(x => x.p.id));
    return e.db.products.filter(p => p.active && !p.deleted_at).map(p => { const shelf = e.qty(p.id, 'shop'), store = e.qty(p.id, 'store'); return { p, shelf, store, signal: re.get(p.id) ?? 'ok', exp: exp.has(p.id), days: daysOfStock(shelf + store, e.velocity(p.id).avgPerDay) }; });
  });
  const list = useMemo(() => {
    let r = rows; if (f === 'low') r = r.filter(x => x.signal !== 'ok'); if (f === 'expiring') r = r.filter(x => x.exp); if (f === 'store') r = r.filter(x => x.store > 0);
    if (q) { const ids = new Set(fuzzySearch(r.map(x => x.p), q, 60).map(p => p.id)); r = r.filter(x => ids.has(x.p.id)); }
    return f === 'low' ? [...r].sort((a, b) => a.days - b.days) : r;
  }, [rows, f, q]);
  const lowN = rows.filter(x => x.signal !== 'ok').length;
  return (
    <Page>
      <TopBar title={t('st.title')} sub={`${rows.length} ${lang === 'sw' ? 'bidhaa' : 'products'}`} right={session.role === 'owner' ? <button className="chip tap" onClick={() => setAdd(true)}><Plus size={16} />{t('st.addProduct')}</button> : undefined} />
      <label className="relative block"><Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" /><input className="field pl-12" placeholder={t('st.search')} value={q} onChange={e => setQ(e.target.value)} /></label>
      <div className="scroll-x my-3">
        {([['all', t('c.all')], ['low', `${t('st.low')} · ${lowN}`], ['expiring', t('st.expiring')], ['store', t('st.store')]] as [Filter, string][]).map(([k, l]) => <button key={k} className="chip" aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
      </div>
      <div className="surface divide">
        {list.slice(0, 150).map((x, i) => (
          <motion.button key={x.p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.02, ease: EASE }} onClick={() => push({ name: 'product', params: { id: x.p.id } })} className="w-full row text-left">
            <Avatar name={x.p.name} size={42} />
            <span className="flex-1 min-w-0"><span className="block font-medium truncate">{x.p.name}</span>
              <span className="block text-[13px] text-muted">{Number.isFinite(x.days) ? `~${Math.floor(x.days)} ${t('st.daysLeft')}` : '—'}{x.exp ? ` · ${t('st.expiring')}` : ''}</span></span>
            <span className="grid grid-cols-2 gap-3 text-right">
              <span><span className="block text-[11px] text-muted">{t('st.duka')}</span><span className={`num font-semibold ${x.signal !== 'ok' && x.shelf <= x.p.reorder_level ? 'text-clay' : ''}`}>{fmtQ(x.shelf)}</span></span>
              <span><span className="block text-[11px] text-muted">{t('st.store')}</span><span className="num font-semibold text-muted">{fmtQ(x.store)}</span></span>
            </span>
          </motion.button>
        ))}
      </div>
      <NewProduct open={add} onClose={() => setAdd(false)} />
    </Page>
  );
}
const fmtQ = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function NewProduct({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(); const say = useApp(s => s.say); const cats = useData(e => e.db.categories);
  const [f, setF] = useState({ name: '', name_sw: '', cat: '', buy: 'carton', sell: 'piece', units: '12', cost: '', price: '', reorder: '6' });
  const up = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const cps = +f.cost && +f.units ? +f.cost / +f.units : 0; const m = +f.price && cps ? Math.round(((+f.price - cps) / +f.price) * 100) : 0;
  return (
    <Sheet open={open} onClose={onClose} title={t('st.addProduct')} tall>
      <div className="space-y-3">
        <input className="field" placeholder="Jogoo Maize Meal 2kg" value={f.name} onChange={up('name')} />
        <input className="field" placeholder="Unga Jogoo 2kg (Kiswahili)" value={f.name_sw} onChange={up('name_sw')} />
        <select className="field" value={f.cat} onChange={up('cat')}><option value="">{t('st.category')}</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="grid grid-cols-3 gap-2"><input className="field" value={f.buy} onChange={up('buy')} aria-label={t('st.buyUnit')} /><input className="field num" value={f.units} onChange={up('units')} inputMode="decimal" aria-label="units" /><input className="field" value={f.sell} onChange={up('sell')} aria-label={t('st.sellUnit')} /></div>
        <p className="text-[13px] text-muted -mt-1">1 {f.buy} = {f.units} {f.sell}</p>
        <div className="grid grid-cols-2 gap-2"><input className="field num" placeholder={`${t('st.cost')} / ${f.buy}`} value={f.cost} onChange={up('cost')} inputMode="numeric" /><input className="field num" placeholder={`${t('st.price')} / ${f.sell}`} value={f.price} onChange={up('price')} inputMode="numeric" /></div>
        {m !== 0 && <p className={`text-sm ${m < 8 ? 'text-clay' : 'text-leaf'}`}>{t('st.margin')}: {m}% · {ksh(+f.price - cps)} / {f.sell}</p>}
        <button className="btn btn-brand btn-block" disabled={!f.name || !+f.price || !f.cat} onClick={() => { act(e => e.upsertProduct({ name: f.name, name_sw: f.name_sw || undefined, category_id: f.cat, buy_unit: f.buy, sell_unit: f.sell, units_per_buy_unit: +f.units || 1, cost_price: Math.round(cps * 100) / 100, retail_price: +f.price, reorder_level: +f.reorder || 0 })); say(t('kb.save')); onClose(); }}>{t('c.save')}</button>
      </div>
    </Sheet>
  );
}

export function ProductScreen({ id }: { id: string }) {
  const t = useT(); const { session, lang, say } = useApp(s => ({ session: s.session!, lang: s.lang, say: s.say })); const owner = session.role === 'owner';
  const [sheet, setSheet] = useState<null | 'transfer' | 'adjust' | 'price'>(null); const [val, setVal] = useState(''); const [dir, setDir] = useState<'store' | 'shop'>('store'); const [reason, setReason] = useState<MoveReason>('adjustment');
  const v = useData(e => { const p = e.product(id); return { p, shelf: e.qty(id, 'shop'), store: e.qty(id, 'store'), tl: e.timeline(id).slice(0, 40), best: owner ? e.bestPrice(id) : undefined, vel: e.velocity(id), locs: new Map(e.db.locations.map(l => [l.id, l.type])) }; }, [id]);
  const run = () => {
    const n = +val; if (!n && sheet !== 'adjust') return;
    try {
      if (sheet === 'transfer') act(e => e.transfer(id, n, dir));
      if (sheet === 'adjust') act(e => e.adjust(id, dir, n, reason));
      if (sheet === 'price') act(e => e.updatePrice(id, n));
      say(t('st.moved')); setSheet(null); setVal('');
    } catch (err) { say(err instanceof DomainError ? `${err.code}${err.data?.available != null ? ` (${err.data.available})` : ''}` : String(err), 'warn'); }
  };
  const margin = Math.round(((v.p.retail_price - v.p.cost_price) / v.p.retail_price) * 100);
  return (
    <Page>
      <TopBar back title={v.p.name} sub={v.p.name_sw} />
      <div className="grid grid-cols-2 gap-3">
        {[['shop', t('st.duka'), v.shelf], ['store', t('st.store'), v.store]].map(([k, l, n]) => (
          <div key={k as string} className="surface p-4"><p className="eyebrow">{l as string}</p><p className="num text-[36px] font-semibold leading-tight">{fmtQ(n as number)}</p><p className="text-[13px] text-muted">{v.p.sell_unit} · {Math.floor((n as number) / v.p.units_per_buy_unit)} {v.p.buy_unit}</p></div>
        ))}
      </div>
      <div className="surface mt-3 divide">
        <div className="row"><span className="flex-1 text-muted">{t('st.price')}</span><span className="num font-semibold">{ksh(v.p.retail_price)}</span>{owner && <button aria-label={t('c.edit')} className="h-10 w-10 grid place-items-center" onClick={() => { setVal(String(v.p.retail_price)); setSheet('price'); }}><Pencil size={16} /></button>}</div>
        {owner && <div className="row"><span className="flex-1 text-muted">{t('st.cost')}</span><span className="num">{ksh(v.p.cost_price)}</span><span className={`badge ${margin < 8 ? 'b-clay' : 'b-leaf'}`}>{margin}%</span></div>}
        {owner && v.best && <div className="row"><span className="flex-1 text-muted">{t('pur.bestPrice')}</span><span className="text-sm">{v.best.supplier}</span><span className="num text-leaf">{ksh(v.best.cost)}</span></div>}
        <div className="row"><span className="flex-1 text-muted">{lang === 'sw' ? 'Mauzo kwa siku' : 'Sells per day'}</span><span className="num">{v.vel.avgPerDay.toFixed(1)}</span></div>
      </div>
      <h2 className="text-[17px] font-semibold mt-7 mb-2 flex items-center gap-2"><History size={18} />{t('st.timeline')}</h2>
      <ol className="relative ml-3 border-l border-line">
        {v.tl.map(m => { const inn = m.to_location && !m.from_location; const tr = m.reason === 'transfer'; return (
          <li key={m.id} className="ml-4 py-2.5"><span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${tr ? 'bg-maize' : inn ? 'bg-leaf' : 'bg-clay'}`} />
            <div className="flex justify-between"><span className="text-[15px]">{t(`reason.${m.reason}` as any)}{tr ? ` · ${v.locs.get(m.from_location!) === 'store' ? t('st.store') : t('st.duka')} → ${v.locs.get(m.to_location!) === 'store' ? t('st.store') : t('st.duka')}` : ''}</span><span className={`num font-semibold ${tr ? '' : inn ? 'text-leaf' : 'text-clay'}`}>{tr ? '' : inn ? '+' : '−'}{fmtQ(m.qty)}</span></div>
            <span className="text-[12px] text-muted">{new Date(m.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })} {hhmm(m.created_at)}{m.note ? ` · ${m.note}` : ''}</span></li>
        ); })}
      </ol>
      <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center"><div className="w-full max-w-[480px] grid grid-cols-2 gap-2 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] bg-bg/95 backdrop-blur border-t border-line">
        <button className="btn btn-brand" onClick={() => { setDir('store'); setVal(String(v.p.units_per_buy_unit)); setSheet('transfer'); }} data-testid="transfer"><ArrowRightLeft size={18} />{t('st.transfer')}</button>
        <button className="btn btn-ghost" disabled={!owner} onClick={() => { setDir('shop'); setVal(''); setSheet('adjust'); }}>{t('st.adjust')}</button></div></div>
      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet === 'transfer' ? t('st.transfer') : sheet === 'adjust' ? t('st.adjust') : t('st.price')}>
        {sheet !== 'price' && <Segmented value={dir} onChange={setDir} options={sheet === 'transfer' ? [{ v: 'store', label: `${t('st.store')} → ${t('st.duka')}` }, { v: 'shop', label: `${t('st.duka')} → ${t('st.store')}` }] : [{ v: 'shop', label: t('st.duka') }, { v: 'store', label: t('st.store') }]} />}
        {sheet === 'adjust' && <div className="scroll-x mt-3">{(['adjustment', 'expiry_writeoff'] as MoveReason[]).map(r => <button key={r} className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{t(`reason.${r}` as any)}</button>)}<button className="chip" onClick={() => setVal(val.startsWith('-') ? val.slice(1) : '-' + val)}>±</button></div>}
        <p className="num text-[44px] font-semibold text-center my-3">{val || '0'}<span className="text-lg text-muted ml-2">{sheet === 'price' ? 'KSh' : v.p.sell_unit}</span></p>
        {sheet === 'transfer' && <div className="scroll-x mb-3 justify-center">{[1, 2, 3].map(n => <button key={n} className="chip" onClick={() => setVal(String(n * v.p.units_per_buy_unit))}>{n} {v.p.buy_unit}</button>)}</div>}
        <Keypad extra="." onKey={k => setVal(k === '⌫' ? val.slice(0, -1) : val.length < 7 ? val + k : val)} />
        <button className="btn btn-brand btn-block mt-3" onClick={run} data-testid="confirm-transfer">{t('c.confirm')}</button>
      </Sheet>
      <div className="h-24" />
    </Page>
  );
}
