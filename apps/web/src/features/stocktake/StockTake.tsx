import { useState } from 'react';
import { EyeOff, ClipboardCheck, MessageCircleQuestion } from 'lucide-react';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Segmented, Avatar } from '@/components/ui';

/** Rolling stock-take (§F11): expected quantities are hidden until you count — no copying the screen. */
export default function StockTake() {
  const t = useT(); const { say, lang } = useApp(s => ({ say: s.say, lang: s.lang }));
  const [loc, setLoc] = useState<'shop' | 'store'>('shop'); const [cat, setCat] = useState<string | null>(null); const [counts, setCounts] = useState<Record<string, string>>({}); const [countId, setCountId] = useState<string | null>(null); const [dem, setDem] = useState('');
  const v = useData(e => ({ cats: e.db.categories.slice().sort((a, b) => a.sort - b.sort), prods: e.db.products.filter(p => p.active && p.category_id === cat), items: countId ? e.db.stock_count_items.filter(i => i.count_id === countId) : [] }), [cat, countId]);
  const start = (c: string) => {
    const name = v.cats.find(x => x.id === c)?.name ?? '';
    const count = act(e => e.startCount(loc, name, e.db.products.filter(p => p.active && p.category_id === c).map(p => p.id)));
    setCat(c); setCountId(count.id); setCounts({});
  };
  const post = () => { const r = act(e => e.postCount(countId!, Object.fromEntries(Object.entries(counts).filter(([, x]) => x !== '').map(([k, x]) => [k, +x])))); say(r.variances.length ? `${r.variances.length} ${lang === 'sw' ? 'zimetofautiana' : 'off'} · KSh ${r.lossValue}` : t('cash.balanced'), r.variances.length ? 'warn' : 'ok'); setCountId(null); setCat(null); };
  return (
    <Page>
      <TopBar back title={t('cnt.title')} />
      {!countId ? (
        <>
          <Segmented value={loc} onChange={setLoc} options={[{ v: 'shop', label: t('st.duka') }, { v: 'store', label: t('st.store') }]} />
          <p className="eyebrow mt-5 mb-2">{t('cnt.pick')}</p>
          <div className="grid grid-cols-2 gap-2">{v.cats.map(c => <button key={c.id} className="surface tap p-4 text-left font-semibold min-h-[72px]" onClick={() => start(c.id)}><ClipboardCheck size={18} className="text-brand mb-2" />{c.name}</button>)}</div>
          <section className="surface p-4 mt-7"><p className="font-semibold flex items-center gap-2"><MessageCircleQuestion size={18} className="text-maize" />{t('dem.title')}</p>
            <div className="flex gap-2 mt-3"><input className="field" placeholder={t('dem.add')} value={dem} onChange={e => setDem(e.target.value)} /><button className="btn btn-brand" disabled={!dem.trim()} onClick={() => { act(e => e.addDemand(dem.trim())); setDem(''); say(t('dem.saved')); }}>{t('c.add')}</button></div></section>
        </>
      ) : (
        <>
          <p className="text-sm text-muted flex items-center gap-2 mb-3"><EyeOff size={16} />{t('cnt.hidden')}</p>
          <div className="surface divide">{v.items.map(it => { const p = v.prods.find(x => x.id === it.product_id); if (!p) return null; const c = counts[p.id]; const diff = c !== undefined && c !== '' ? +c - it.expected_qty : null; return (
            <div key={it.id} className="row"><Avatar name={p.name} size={38} /><span className="flex-1 min-w-0"><span className="block truncate text-[15px]">{p.name}</span>{diff !== null && <span className={`text-[12px] num ${diff === 0 ? 'text-leaf' : 'text-clay'}`}>{t('cnt.expected')}: {it.expected_qty} · {diff > 0 ? '+' : ''}{diff}</span>}</span>
              <input className="field w-[88px] h-12 text-center num" inputMode="decimal" value={c ?? ''} onChange={e => setCounts({ ...counts, [p.id]: e.target.value })} placeholder="—" aria-label={`${p.name} ${t('cnt.counted')}`} /></div>); })}</div>
          <button className="btn btn-brand btn-block mt-4" onClick={post}>{t('cnt.post')}</button>
        </>
      )}
    </Page>
  );
}
