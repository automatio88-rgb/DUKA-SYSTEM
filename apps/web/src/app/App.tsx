import { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from './store';
import { loadAll, hasEngine, E, persist } from '@/lib/data';
import { startSync } from '@/lib/sync';
import { reminderTemplate, morningBriefing, eveningReport } from '@duka/shared';
import { BottomNav } from '@/components/BottomNav';
import { Toast, EASE } from '@/components/ui';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { Lock } from '@/features/auth/Lock';
import { Home } from '@/features/home/Home';
import { Pos } from '@/features/pos/Pos';
import { Kitabu, CustomerScreen } from '@/features/kitabu/Kitabu';
import { Stock, ProductScreen } from '@/features/stock/Stock';
import { More } from '@/features/more/More';

// Secondary screens are code-split: the POS path stays lean.
const Payments = lazy(() => import('@/features/payments/Payments'));
const Cash = lazy(() => import('@/features/cash/Cash'));
const Purchases = lazy(() => import('@/features/purchases/Purchases'));
const Reports = lazy(() => import('@/features/reports/Reports'));
const Brain = lazy(() => import('@/features/agent/Brain'));
const StockTake = lazy(() => import('@/features/stocktake/StockTake'));
const Settings = lazy(() => import('@/features/settings/Settings'));
const Alerts = lazy(() => import('@/features/home/Alerts'));

export function App() {
  const { booted, hasShop, session, tab, stack, set } = useApp(s => ({ booted: s.booted, hasShop: s.hasShop, session: s.session, tab: s.tab, stack: s.stack, set: s.set }));
  useEffect(() => { loadAll().then(has => { set({ booted: true, hasShop: has }); const q = new URLSearchParams(location.search).get('tab'); if (q) set({ tab: q as any }); }); startSync(); }, [set]);
  // Lazy jobs (§6 /jobs/tick equivalent on-device): run on login + whenever the app regains focus. No cron.
  useEffect(() => {
    if (!session || !hasEngine()) return;
    const run = () => { try { const e = E(); const ch = e.tick({ reminder: reminderTemplate(e.shop.name), briefing: morningBriefing, evening: eveningReport }); void persist(ch); useApp.getState().bump(); } catch { /* staff lacks some perms: fine */ } };
    run(); const onVis = () => !document.hidden && run(); document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis);
  }, [session]);

  if (!booted) return <div className="app-frame grid place-items-center"><span className="h-10 w-10 rounded-2xl bg-brand animate-pulse" /></div>;
  const top = stack[stack.length - 1];
  return (
    <div className="app-frame">
      <Toast />
      {!hasShop ? <Onboarding /> : !session ? <Lock /> : (
        <>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
              {tab === 'home' && <Home />}{tab === 'sell' && <Pos />}{tab === 'kitabu' && <Kitabu />}{tab === 'stock' && <Stock />}{tab === 'more' && <More />}
            </motion.div>
          </AnimatePresence>
          <AnimatePresence>
            {top && (
              <motion.div key={stack.length + top.name} className="fixed inset-0 z-30 flex justify-center" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.32, ease: EASE }}>
                <div className="w-full max-w-[480px] bg-bg overflow-y-auto">
                  <Suspense fallback={<div className="screen"><div className="h-8 w-40 rounded bg-s2 animate-pulse" /></div>}>
                    {top.name === 'payments' && <Payments />}{top.name === 'cash' && <Cash />}{top.name === 'purchases' && <Purchases />}{top.name === 'reports' && <Reports initial={top.params?.tab} />}
                    {top.name === 'brain' && <Brain />}{top.name === 'stocktake' && <StockTake />}{top.name === 'settings' && <Settings />}{top.name === 'alerts' && <Alerts />}
                    {top.name === 'customer' && <CustomerScreen id={top.params.id} />}{top.name === 'product' && <ProductScreen id={top.params.id} />}
                  </Suspense>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <BottomNav />
        </>
      )}
    </div>
  );
}
