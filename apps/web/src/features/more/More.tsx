import { Wallet, Banknote, Truck, BarChart3, MessageSquareText, ClipboardCheck, Settings, ChevronRight, Lock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useApp, type ScreenName } from '@/app/store';
import { useT } from '@/lib/i18n';
import { useData } from '@/lib/useData';
import { endSession } from '@/lib/data';
import { Page, TopBar, Avatar, EASE } from '@/components/ui';

export function More() {
  const t = useT(); const { push, session, set } = useApp(s => ({ push: s.push, session: s.session!, set: s.set })); const owner = session.role === 'owner';
  const n = useData(e => ({ unm: e.db.payments_inbox.filter(p => p.status === 'unmatched' || p.status === 'suspicious').length, open: !!e.currentSession() }));
  const items: { k: ScreenName; icon: typeof Wallet; label: string; hint?: string; owner?: boolean; badge?: number }[] = [
    { k: 'brain', icon: MessageSquareText, label: t('ai.title'), hint: '“Andika deni ya Baba Kevin 450”' },
    { k: 'payments', icon: Wallet, label: t('pay.title'), badge: n.unm },
    { k: 'cash', icon: Banknote, label: t('cash.title'), hint: n.open ? t('cash.sessionOpen') : t('cash.open') },
    { k: 'stocktake', icon: ClipboardCheck, label: t('cnt.title') },
    { k: 'purchases', icon: Truck, label: t('pur.title'), owner: true },
    { k: 'reports', icon: BarChart3, label: t('rep.title'), owner: true },
    { k: 'settings', icon: Settings, label: t('set.title'), owner: true },
  ];
  return (
    <Page>
      <TopBar title={t('nav.more')} />
      <div className="surface p-4 flex items-center gap-3 mb-5"><Avatar name={session.name} size={48} round /><div className="flex-1"><p className="font-semibold">{session.name}</p><p className="text-sm text-muted">{owner ? t('auth.owner') : t('auth.staff')}</p></div>
        <button className="chip tap" onClick={() => { endSession(); set({ session: null }); }}><Lock size={16} />{t('auth.switchUser')}</button></div>
      {/* Owner-only areas are hidden, not disabled, in staff mode (§8) */}
      <div className="surface divide">
        {items.filter(i => owner || !i.owner).map((i, idx) => (
          <motion.button key={i.k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03, ease: EASE }} onClick={() => push({ name: i.k })} className="w-full row text-left min-h-[64px]" data-testid={`more-${i.k}`}>
            <span className="h-11 w-11 rounded-ctl bg-s2 grid place-items-center"><i.icon size={21} className="text-brand" /></span>
            <span className="flex-1"><span className="block font-semibold">{i.label}</span>{i.hint && <span className="block text-[13px] text-muted">{i.hint}</span>}</span>
            {!!i.badge && <span className="badge b-clay">{i.badge}</span>}<ChevronRight size={18} className="text-faint" />
          </motion.button>
        ))}
      </div>
    </Page>
  );
}
