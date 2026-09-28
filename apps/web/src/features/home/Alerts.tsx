import { motion } from 'framer-motion';
import { AlertTriangle, PackageOpen, Timer, Snowflake, Wallet, Banknote, Truck, ClipboardList, Info } from 'lucide-react';
import type { Alert } from '@duka/shared';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { act } from '@/lib/data';
import { Page, TopBar, Empty } from '@/components/ui';
import { timeAgo } from '@/lib/format';

const ICON: Record<string, typeof Info> = { shelf_low: PackageOpen, total_low: AlertTriangle, expiry: Timer, dead_stock: Snowflake, unmatched_payment: Wallet, suspicious_payment: AlertTriangle, cash_gap: Banknote, payable_due: Truck, count_variance: ClipboardList, credit_limit: Wallet };

export function AlertRow({ a, i = 0 }: { a: Alert; i?: number }) {
  const { push, lang, say, session } = useApp(s => ({ push: s.push, lang: s.lang, say: s.say, session: s.session }));
  const I = ICON[a.type] ?? Info; const d: any = a.data_json ?? {};
  const tone = a.severity === 'critical' ? 'text-clay bg-clay-soft' : a.severity === 'warn' ? 'text-maize bg-maize-soft' : 'text-muted bg-s2';
  const action = (() => {
    if (a.type === 'shelf_low') return { label: lang === 'sw' ? 'Toa stoo' : 'Move', run: () => { try { act(e => { const p = e.product(d.productId); e.transfer(p.id, Math.min(e.qty(p.id, 'store'), p.units_per_buy_unit)); e.put('alerts', { id: a.id, read_at: e.iso() } as any); }); say(lang === 'sw' ? 'Imehamishwa rafuni' : 'Moved to shelf'); } catch { say('—', 'warn'); } } };
    if (a.type === 'total_low' && session?.role === 'owner') return { label: lang === 'sw' ? 'Agiza' : 'Order', run: () => push({ name: 'purchases', params: { draft: true } }) };
    if (a.type === 'unmatched_payment' || a.type === 'suspicious_payment') return { label: lang === 'sw' ? 'Weka' : 'Assign', run: () => push({ name: 'payments' }) };
    if (a.type === 'expiry' || a.type === 'dead_stock') return { label: lang === 'sw' ? 'Ona' : 'View', run: () => push({ name: 'reports', params: { tab: a.type === 'expiry' ? 'expiry' : 'dead' } }) };
    if (a.type === 'cash_gap') return { label: lang === 'sw' ? 'Ona' : 'View', run: () => push({ name: 'cash' }) };
    return null;
  })();
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }} className="row">
      <span className={`h-10 w-10 shrink-0 rounded-ctl grid place-items-center ${tone}`}><I size={19} /></span>
      <div className="flex-1 min-w-0"><p className="font-semibold text-[15px] truncate">{a.title}</p><p className="text-[13px] text-muted truncate">{a.body} · {timeAgo(a.created_at, lang)}</p></div>
      {action && <button onClick={action.run} className="chip tap shrink-0">{action.label}</button>}
    </motion.div>
  );
}

export default function Alerts() {
  const t = useT(); const lang = useApp(s => s.lang);
  const list = useData(e => e.db.alerts.filter(a => !a.read_at && a.type !== 'briefing').sort((a, b) => b.created_at.localeCompare(a.created_at)));
  return (
    <Page>
      <TopBar back title={t('home.alerts')} right={list.length ? <button className="chip" onClick={() => act(e => list.forEach(a => e.put('alerts', { id: a.id, read_at: e.iso() } as any)))}>{lang === 'sw' ? 'Futa zote' : 'Clear all'}</button> : undefined} />
      {list.length ? <div className="surface divide">{list.map((a, i) => <AlertRow key={a.id} a={a} i={i} />)}</div> : <Empty title={t('home.noAlerts')} />}
    </Page>
  );
}
