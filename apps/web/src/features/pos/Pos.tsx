import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, X, Minus, Plus, ShoppingBasket, UserRound, Check } from 'lucide-react';
import { fuzzySearch, DomainError, type Product, type PaymentMethod } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Sheet, Keypad, DrawnCheck, Segmented, Avatar, EASE } from '@/components/ui';
import { SyncPill } from '@/components/SyncPill';
import { ksh, tileColor, initials } from '@/lib/format';

type Line = { p: Product; qty: number };
const LOOSE = new Set(['kg', 'litre', 'tin', 'bunch']);

/** POS (§F3). Performance note: the product list and velocity ranking are memoised per engine version; taps only touch local state. */
export function Pos() {
  const t = useT(); const { lang, say } = useApp(s => ({ lang: s.lang, say: s.say }));
  const [q, setQ] = useState(''); const [cat, setCat] = useState<string>('top');
  const [cart, setCart] = useState<Line[]>([]); const [open, setOpen] = useState(false);
  const [qtyFor, setQtyFor] = useState<Product | null>(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ total: number; change?: number } | null>(null);
  const base = useData(e => ({ top: e.topMovers(40), all: e.db.products.filter(p => p.active && !p.deleted_at), cats: e.db.categories.slice().sort((a, b) => a.sort - b.sort), shelf: new Map(e.db.products.map(p => [p.id, e.qty(p.id, 'shop')])) }));
  const list = useMemo(() => q ? fuzzySearch(base.all, q, 40) : cat === 'top' ? base.top : base.all.filter(p => p.category_id === cat), [q, cat, base]);
  const total = cart.reduce((a, l) => a + l.p.retail_price * l.qty, 0);
  const count = cart.reduce((a, l) => a + l.qty, 0);

  const add = (p: Product, qty = 1) => { navigator.vibrate?.(6); setCart(c => { const i = c.findIndex(l => l.p.id === p.id); if (i < 0) return [...c, { p, qty }]; const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + qty }; return n; }); };
  const setLine = (id: string, qty: number) => setCart(c => qty <= 0 ? c.filter(l => l.p.id !== id) : c.map(l => l.p.id === id ? { ...l, qty } : l));
  const finish = (method: PaymentMethod, extra: { customerId?: string; cash?: number; mpesa?: number; credit?: number; tendered?: number } = {}) => {
    try {
      const { sale, warnings } = act(e => e.sell(cart.map(l => ({ productId: l.p.id, qty: l.qty })), { method, customerId: extra.customerId, cash: extra.cash, mpesa: extra.mpesa, credit: extra.credit }));
      const over = warnings.find(w => w.startsWith('over_limit')); if (over) say(`${t('pos.overLimit')} ${ksh(+over.split(':')[1])}`, 'warn');
      setOpen(false); setDone({ total: sale.total, change: extra.tendered ? extra.tendered - sale.total : undefined }); setCart([]); setQ('');
      setTimeout(() => setDone(null), 1400);
    } catch (err) { say(err instanceof DomainError ? err.code : String(err), 'warn'); }
  };

  return (
    <main className="pt-[max(env(safe-area-inset-top),12px)] pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+96px)]">
      <div className="sticky top-0 z-20 bg-bg/95 backdrop-blur px-4 pb-3 pt-1">
        <div className="flex items-center gap-2 mb-3"><h1 className="text-[22px] font-bold flex-1">{t('nav.sell')}</h1><SyncPill />
          <button onClick={() => setBusy(!busy)} aria-pressed={busy} className="chip tap" data-testid="busy-toggle"><Zap size={16} className={busy ? 'text-maize' : ''} />{t('pos.busyMode')}</button></div>
        {!busy && <>
          <label className="relative block"><Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={e => setQ(e.target.value)} className="field pl-12 pr-12" placeholder={t('pos.search')} inputMode="search" enterKeyHint="search" data-testid="pos-search" />
            {q && <button aria-label={t('pos.clear')} onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center"><X size={18} /></button>}</label>
          {!q && <div className="scroll-x mt-3 -mx-4 px-4">
            <button className="chip" aria-pressed={cat === 'top'} onClick={() => setCat('top')}>{t('pos.topMovers')}</button>
            {base.cats.map(c => <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>}
        </>}
      </div>

      {busy ? <BusyPad onDone={total => { setDone({ total }); setTimeout(() => setDone(null), 1200); }} /> : (
        <div className="px-4 grid grid-cols-3 gap-2.5" data-testid="pos-grid">
          {list.map((p, i) => <Tile key={p.id} p={p} i={i} qty={cart.find(l => l.p.id === p.id)?.qty ?? 0} shelf={base.shelf.get(p.id) ?? 0} lang={lang} onTap={() => (LOOSE.has(p.sell_unit) ? setQtyFor(p) : add(p))} onLong={() => setQtyFor(p)} />)}
          {q && list.length === 0 && (
            <div className="col-span-3 text-center py-10"><p className="text-muted">{t('pos.noResults')}</p>
              <button className="btn btn-ghost mt-4" onClick={() => { act(e => e.addDemand(q)); say(t('dem.saved')); setQ(''); }}>{t('pos.logDemand')}: “{q}”</button></div>
          )}
        </div>
      )}

      {/* Cart bar: bottom thumb zone. Tap left to review; tap CASH to finish in one move. */}
      <AnimatePresence>
        {count > 0 && !busy && (
          <motion.div initial={{ y: 90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 90, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 380 }} className="fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+10px)] z-30 flex justify-center px-3">
            <div className="w-full max-w-[464px] flex gap-2 p-2 rounded-[20px] bg-ink text-bg shadow-e3">
              <button onClick={() => setOpen(true)} className="flex-1 flex items-center gap-3 px-3 text-left" data-testid="cart-open">
                <span className="relative"><ShoppingBasket size={24} /><span className="absolute -top-2 -right-2.5 min-w-[20px] h-5 px-1 rounded-full bg-brand text-white text-[11px] font-bold grid place-items-center">{count}</span></span>
                <span><span className="block text-[12px] opacity-70">{t('pos.total')}</span><span className="num text-xl font-semibold">{ksh(total)}</span></span>
              </button>
              <button onClick={() => finish('cash')} className="btn btn-leaf min-w-[120px]" data-testid="quick-cash"><Check size={20} />{t('pos.cash')}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CartSheet open={open} onClose={() => setOpen(false)} cart={cart} total={total} setLine={setLine} onPay={finish} />
      <QtySheet p={qtyFor} onClose={() => setQtyFor(null)} onAdd={(p, n) => { add(p, n); setQtyFor(null); }} />

      <AnimatePresence>{done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, pointerEvents: 'none' }} onClick={() => setDone(null)} className="fixed inset-0 z-50 grid place-items-center bg-bg/90 backdrop-blur-sm" data-testid="sale-done">
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} transition={{ ease: EASE, duration: 0.4 }} className="text-center"><DrawnCheck /><p className="mt-4 text-lg font-semibold">{t('pos.done')}</p><p className="num text-3xl font-semibold mt-1">{ksh(done.total)}</p>{done.change != null && done.change > 0 && <p className="mt-2 text-maize num text-xl">{t('pos.change')}: {ksh(done.change)}</p>}</motion.div>
        </motion.div>
      )}</AnimatePresence>
    </main>
  );
}

function Tile({ p, i, qty, shelf, lang, onTap, onLong }: { p: Product; i: number; qty: number; shelf: number; lang: string; onTap: () => void; onLong: () => void }) {
  const c = tileColor(p.name); const timer = useRef<number>(); const long = useRef(false);
  const low = shelf <= Math.max(2, p.reorder_level / 3);
  return (
    <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.02, duration: 0.3, ease: EASE }}
      whileTap={{ scale: 0.93 }} onPointerDown={() => { long.current = false; timer.current = window.setTimeout(() => { long.current = true; navigator.vibrate?.(15); onLong(); }, 450); }}
      onPointerUp={() => { clearTimeout(timer.current); if (!long.current) onTap(); }} onPointerLeave={() => clearTimeout(timer.current)} onContextMenu={e => e.preventDefault()}
      className={`relative text-left rounded-card p-2.5 min-h-[112px] flex flex-col border ${qty ? 'border-brand bg-brand-soft' : 'border-line bg-s1'} select-none`} aria-label={`${p.name} ${ksh(p.retail_price)}`}>
      <span className="h-9 w-9 rounded-[10px] grid place-items-center font-display font-semibold text-[13px]" style={{ background: c.bg, color: c.fg }}>{initials(p.name)}</span>
      <span className="mt-2 text-[13px] font-semibold leading-tight line-clamp-2">{lang === 'sw' && p.name_sw ? p.name_sw : p.name}</span>
      <span className="mt-auto pt-1 flex items-end justify-between"><span className="num text-[15px] font-semibold">{p.retail_price}</span>{low && <span className={`text-[11px] font-semibold ${shelf <= 0 ? 'text-clay' : 'text-maize'}`}>{shelf <= 0 ? '0' : shelf}</span>}</span>
      <AnimatePresence>{qty > 0 && <motion.span key={qty} initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 700, damping: 20 }} className="absolute -top-1.5 -right-1.5 min-w-[26px] h-[26px] px-1.5 rounded-full bg-brand text-white text-[13px] font-bold grid place-items-center num">{qty}</motion.span>}</AnimatePresence>
    </motion.button>
  );
}

function CartSheet({ open, onClose, cart, total, setLine, onPay }: { open: boolean; onClose: () => void; cart: Line[]; total: number; setLine: (id: string, q: number) => void; onPay: (m: PaymentMethod, x?: any) => void }) {
  const t = useT(); const [m, setM] = useState<PaymentMethod>('cash'); const [cust, setCust] = useState<string | null>(null); const [tender, setTender] = useState(0); const [split, setSplit] = useState({ cash: '', mpesa: '' }); const [pick, setPick] = useState(false);
  const customers = useData(e => e.db.customers.filter(c => !c.deleted_at).map(c => ({ c, bal: e.balanceOf(c.id) })).sort((a, b) => b.bal - a.bal));
  const chosen = customers.find(x => x.c.id === cust);
  const splitCredit = total - (+split.cash || 0) - (+split.mpesa || 0);
  const canPay = m === 'credit' ? !!cust : m === 'split' ? splitCredit >= 0 && (splitCredit === 0 || !!cust) : true;
  return (
    <Sheet open={open} onClose={onClose} title={t('pos.cart')}>
      <div className="divide -mx-1">
        {cart.map(l => (
          <div key={l.p.id} className="flex items-center gap-3 py-2.5 px-1">
            <Avatar name={l.p.name} size={40} />
            <div className="flex-1 min-w-0"><p className="font-medium truncate">{l.p.name}</p><p className="text-sm text-muted num">{ksh(l.p.retail_price)} × {l.qty}</p></div>
            <div className="flex items-center gap-1"><button aria-label="-" onClick={() => setLine(l.p.id, l.qty - 1)} className="h-10 w-10 rounded-full bg-s2 grid place-items-center"><Minus size={18} /></button><span className="w-8 text-center num font-semibold">{l.qty}</span><button aria-label="+" onClick={() => setLine(l.p.id, l.qty + 1)} className="h-10 w-10 rounded-full bg-s2 grid place-items-center"><Plus size={18} /></button></div>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-baseline my-4"><span className="text-muted">{t('pos.total')}</span><span className="num text-3xl font-semibold">{ksh(total)}</span></div>
      <Segmented value={m} onChange={setM} options={[{ v: 'cash', label: t('pos.cash') }, { v: 'mpesa', label: t('pos.mpesa') }, { v: 'credit', label: t('pos.credit') }, { v: 'split', label: t('pos.split') }]} />
      <div className="mt-4 min-h-[64px]">
        {m === 'cash' && <div className="scroll-x">{[total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, 1000, 2000].filter((v, i, a) => v >= total && a.indexOf(v) === i).map(v => <button key={v} className="chip num" aria-pressed={tender === v} onClick={() => setTender(v)}>{ksh(v)}</button>)}</div>}
        {m === 'cash' && tender > total && <p className="mt-3 text-maize">{t('pos.change')}: <span className="num font-semibold">{ksh(tender - total)}</span></p>}
        {m === 'mpesa' && <p className="text-sm text-muted">{useApp.getState().lang === 'sw' ? 'Mauzo yatasubiri ujumbe wa M-Pesa kuthibitisha.' : 'The sale waits for the M-Pesa SMS to confirm it.'}</p>}
        {(m === 'credit' || (m === 'split' && splitCredit > 0)) && (
          <button onClick={() => setPick(true)} className="w-full row rounded-ctl bg-s2 border border-line" data-testid="pick-customer"><UserRound size={20} className="text-muted" /><span className="flex-1 text-left">{chosen ? chosen.c.name : t('pos.pickCustomer')}</span>{chosen && <span className="num text-maize">{ksh(chosen.bal)}</span>}</button>
        )}
        {m === 'split' && <div className="grid grid-cols-2 gap-2 mt-2"><input className="field num" inputMode="numeric" placeholder={t('pos.cash')} value={split.cash} onChange={e => setSplit({ ...split, cash: e.target.value })} /><input className="field num" inputMode="numeric" placeholder="M-Pesa" value={split.mpesa} onChange={e => setSplit({ ...split, mpesa: e.target.value })} />{splitCredit > 0 && <p className="col-span-2 text-sm text-maize">{t('pos.credit')}: <span className="num">{ksh(splitCredit)}</span></p>}</div>}
      </div>
      <button className="btn btn-brand btn-block mt-4 h-14 text-lg" disabled={!canPay || !cart.length} data-testid="charge"
        onClick={() => onPay(m, m === 'split' ? { cash: +split.cash || 0, mpesa: +split.mpesa || 0, credit: Math.max(0, splitCredit), customerId: cust ?? undefined } : { customerId: cust ?? undefined, tendered: m === 'cash' && tender > total ? tender : undefined })}>
        {t('pos.charge')} {ksh(total)}</button>
      <Sheet open={pick} onClose={() => setPick(false)} title={t('pos.pickCustomer')} tall>
        <div className="divide">{customers.map(({ c, bal }) => (
          <button key={c.id} className="w-full row px-0" onClick={() => { setCust(c.id); setPick(false); }}><Avatar name={c.name} size={40} round /><span className="flex-1 text-left font-medium">{c.name}</span><span className="num text-sm text-muted">{ksh(bal)}{c.credit_limit ? ` / ${ksh(c.credit_limit)}` : ''}</span></button>
        ))}</div>
      </Sheet>
    </Sheet>
  );
}

function QtySheet({ p, onClose, onAdd }: { p: Product | null; onClose: () => void; onAdd: (p: Product, n: number) => void }) {
  const t = useT(); const [v, setV] = useState('');
  const n = parseFloat(v.replace(',', '.')) || 0;
  return (
    <Sheet open={!!p} onClose={() => { setV(''); onClose(); }} title={p ? `${p.name}` : ''}>
      {p && <>
        <div className="flex items-baseline justify-between"><span className="text-muted">{t('pos.qty')} ({p.sell_unit})</span><span className="num text-4xl font-semibold">{v || '0'}</span></div>
        <p className="text-right text-muted num mt-1">{ksh(n * p.retail_price)}</p>
        <div className="scroll-x my-3">{[0.25, 0.5, 1, 2, 5].map(x => <button key={x} className="chip num" onClick={() => setV(String(x))}>{x} {p.sell_unit}</button>)}</div>
        <Keypad extra="." onKey={k => setV(k === '⌫' ? v.slice(0, -1) : v.length < 6 ? v + k : v)} />
        <button className="btn btn-brand btn-block mt-3" disabled={n <= 0} onClick={() => { onAdd(p, n); setV(''); }}>{t('c.add')}</button>
      </>}
    </Sheet>
  );
}

/** Busy Mode (§F3): suspend itemised entry, capture lump sums, reconcile later. */
function BusyPad({ onDone }: { onDone: (total: number) => void }) {
  const t = useT(); const say = useApp(s => s.say); const [v, setV] = useState('');
  const lumps = useData(e => e.db.sales.filter(s => s.busy_lump && !s.reconciled).length);
  const rec = (method: PaymentMethod) => { const n = +v; if (!n) return; try { act(e => e.sell([], { method }, { busyLump: n })); onDone(n); setV(''); } catch (err) { say(String(err), 'warn'); } };
  return (
    <div className="px-4">
      <div className="surface p-4 bg-maize-soft border-maize/30"><p className="text-[15px]">{t('pos.busyOn')}</p>{lumps > 0 && <p className="text-sm text-muted mt-1">{lumps} {useApp.getState().lang === 'sw' ? 'jumla zinasubiri kupatanishwa' : 'lump sums awaiting reconcile'}</p>}</div>
      <p className="num text-[52px] font-semibold text-center my-6">{ksh(+v || 0)}</p>
      <Keypad onKey={k => setV(k === '⌫' ? v.slice(0, -1) : v.length < 7 ? v + k : v)} />
      <div className="grid grid-cols-2 gap-2 mt-3"><button className="btn btn-leaf" disabled={!+v} onClick={() => rec('cash')}>{t('pos.cash')}</button><button className="btn btn-ghost" disabled={!+v} onClick={() => rec('mpesa')}>M-Pesa</button></div>
    </div>
  );
}
