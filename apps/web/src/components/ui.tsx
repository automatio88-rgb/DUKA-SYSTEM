import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, useIsPresent } from 'framer-motion';
import gsap from 'gsap';
import { ChevronLeft } from 'lucide-react';
import { ksh, initials, tileColor } from '@/lib/format';
import { useApp } from '@/app/store';

export const EASE = [0.16, 1, 0.3, 1] as const;

/** Page transition: fade + 8px slide, 220ms (§14). */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: EASE }} className={`screen ${className}`}>{children}</motion.main>;
}

export function TopBar({ title, sub, back, right }: { title: string; sub?: string; back?: boolean; right?: ReactNode }) {
  const pop = useApp(s => s.pop);
  return (
    <header className="flex items-center gap-3 mb-5 min-h-[48px]">
      {back && <button aria-label="Back" onClick={() => history.length > 1 ? history.back() : pop()} className="tap -ml-2 h-12 w-12 grid place-items-center rounded-full"><ChevronLeft size={26} /></button>}
      <div className="flex-1 min-w-0"><h1 className="text-[22px] font-bold leading-tight truncate">{title}</h1>{sub && <p className="text-sm text-muted truncate">{sub}</p>}</div>
      {right}
    </header>
  );
}

/** GSAP-tweened money counter: numbers roll instead of snapping (§14 animated counters). */
export function Money({ value, compact, className = '' }: { value: number; compact?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null); const last = useRef(0);
  useEffect(() => {
    const o = { v: last.current };
    const tw = gsap.to(o, { v: value, duration: 0.9, ease: 'expo.out', onUpdate: () => { if (ref.current) ref.current.textContent = ksh(o.v, compact); } });
    last.current = value; return () => { tw.kill(); };
  }, [value, compact]);
  return <span ref={ref} className={`num ${className}`}>{ksh(value, compact)}</span>;
}

export function Avatar({ name, size = 44, round = false }: { name: string; size?: number; round?: boolean }) {
  const c = tileColor(name);
  return <span aria-hidden className="grid place-items-center shrink-0 font-display font-semibold" style={{ width: size, height: size, borderRadius: round ? 999 : 12, background: c.bg, color: c.fg, fontSize: size * 0.36 }}>{initials(name)}</span>;
}

/** Stops intercepting taps the moment the sheet starts exiting (exit springs otherwise block the nav). */
function SheetShell({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return <div className="fixed inset-0 z-50 flex justify-center" style={{ pointerEvents: present ? 'auto' : 'none' }}>{children}</div>;
}

/** Bottom sheet (Material 3 pattern) with spring physics + drag-to-dismiss. Used instead of modals. */
export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  const controls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <SheetShell key="sheet">
          <motion.div className="absolute inset-0 bg-black/55" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.section role="dialog" aria-label={title}
            className={`absolute bottom-0 w-full max-w-[480px] rounded-t-[24px] bg-s1 border-t border-line shadow-e3 flex flex-col ${tall ? 'h-[88dvh]' : 'max-h-[88dvh]'}`}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose(); }}>
            <div className="pt-3 pb-2 grid place-items-center cursor-grab touch-none" onPointerDown={e => controls.start(e)}><span className="h-1.5 w-10 rounded-full bg-s3" /></div>
            {title && <h2 className="px-5 pb-3 text-lg font-semibold">{title}</h2>}
            <div className="px-5 pb-[calc(20px+env(safe-area-inset-bottom))] overflow-y-auto">{children}</div>
          </motion.section>
        </SheetShell>
      )}
    </AnimatePresence>
  );
}

/** Big-key numeric keypad for PINs and amounts — thumb-sized, no system keyboard jump. */
export function Keypad({ onKey, extra }: { onKey: (k: string) => void; extra?: string }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', extra ?? '00', '0', '⌫'];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map(k => (
        <motion.button key={k} whileTap={{ scale: 0.92 }} transition={{ type: 'spring', stiffness: 600, damping: 30 }} onClick={() => { navigator.vibrate?.(8); onKey(k); }}
          className="h-16 rounded-ctl bg-s2 border border-line text-2xl num font-semibold active:bg-s3" aria-label={k === '⌫' ? 'Delete' : k}>{k}</motion.button>
      ))}
    </div>
  );
}

/** Drawn-check success micro-animation (§14). */
export function DrawnCheck({ size = 88 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 88 88" aria-hidden>
      <motion.circle cx="44" cy="44" r="40" fill="none" stroke="var(--leaf)" strokeWidth="4" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: EASE }} />
      <motion.path d="M26 45 l12 12 l24 -26" fill="none" stroke="var(--leaf)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.3, ease: EASE }} />
    </svg>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex p-1 rounded-ctl bg-s2 border border-line" role="tablist">
      {options.map(o => (
        <button key={o.v} role="tab" aria-selected={value === o.v} onClick={() => onChange(o.v)} className="relative flex-1 h-11 text-[15px] font-semibold">
          {value === o.v && <motion.span layoutId={`seg-${options.map(x => x.v).join()}`} className="absolute inset-0 rounded-[9px] bg-s1 shadow-e2" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className={`relative ${value === o.v ? 'text-ink' : 'text-muted'}`}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toast() {
  const toast = useApp(s => s.toast);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
          className="fixed top-[max(env(safe-area-inset-top),12px)] inset-x-0 z-[60] flex justify-center pointer-events-none px-4">
          <div role="status" className={`pointer-events-auto max-w-[440px] px-4 py-3 rounded-ctl shadow-e3 text-[15px] font-medium ${toast.tone === 'warn' ? 'bg-clay text-white' : 'bg-ink text-bg'}`}>{toast.text}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <div className="py-12 px-6 text-center"><div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-s2 border border-line ruled" /><p className="font-semibold">{title}</p>{body && <p className="text-sm text-muted mt-1">{body}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}
