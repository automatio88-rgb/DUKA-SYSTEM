import { motion } from 'framer-motion';
import { Home, BookOpen, Package, LayoutGrid, ScanLine } from 'lucide-react';
import { useApp, type Tab } from '@/app/store';
import { useT } from '@/lib/i18n';

/** Thumb-zone navigation: 4 tabs + a raised centre SELL button (the action he does 100×/day). */
export function BottomNav() {
  const { tab, go, stack } = useApp(s => ({ tab: s.tab, go: s.go, stack: s.stack }));
  const t = useT();
  const items: { k: Tab; icon: typeof Home; label: string }[] = [
    { k: 'home', icon: Home, label: t('nav.home') }, { k: 'kitabu', icon: BookOpen, label: t('nav.kitabu') },
    { k: 'sell', icon: ScanLine, label: t('nav.sell') },
    { k: 'stock', icon: Package, label: t('nav.stock') }, { k: 'more', icon: LayoutGrid, label: t('nav.more') },
  ];
  if (stack.length) return null;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex justify-center no-print" aria-label="Main">
      <div className="w-full max-w-[480px] bg-s1/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-[var(--nav-h)] items-center">
          {items.map(({ k, icon: Icon, label }) => k === 'sell' ? (
            <div key={k} className="grid place-items-center">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => go('sell')} aria-label={label} data-testid="nav-sell"
                className="-mt-8 h-[68px] w-[68px] rounded-[22px] bg-brand text-brand-ink grid place-items-center shadow-e3 ring-4 ring-bg">
                <Icon size={28} strokeWidth={2.2} />
              </motion.button>
              <span className={`text-[11px] mt-1 font-semibold ${tab === k ? 'text-ink' : 'text-muted'}`}>{label}</span>
            </div>
          ) : (
            <button key={k} onClick={() => go(k)} className="relative h-full grid place-items-center" aria-current={tab === k ? 'page' : undefined} data-testid={`nav-${k}`}>
              <span className="grid place-items-center gap-1">
                <span className="relative h-8 w-14 grid place-items-center">
                  {tab === k && <motion.span layoutId="navpill" className="absolute inset-0 rounded-full bg-brand-soft" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                  <Icon size={22} className={`relative ${tab === k ? 'text-brand' : 'text-muted'}`} />
                </span>
                <span className={`text-[11px] font-semibold ${tab === k ? 'text-ink' : 'text-muted'}`}>{label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
