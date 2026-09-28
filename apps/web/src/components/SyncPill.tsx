import { motion } from 'framer-motion';
import { useApp } from '@/app/store';
import { useT } from '@/lib/i18n';

/** Subtle sync status (§13): synced / syncing / offline / N pending / device-only. */
export function SyncPill() {
  const { sync, pending } = useApp(s => ({ sync: s.sync, pending: s.pending }));
  const t = useT();
  const [label, dot] =
    sync === 'syncing' ? [t('sync.syncing'), 'var(--maize)'] :
    sync === 'offline' ? [pending ? `${t('sync.offline')} · ${pending}` : t('sync.offline'), 'var(--clay)'] :
    sync === 'pending' ? [`${pending} ${t('sync.pending')}`, 'var(--maize)'] :
    sync === 'local' ? [t('sync.synced'), 'var(--faint)'] : [t('sync.synced'), 'var(--leaf)'];
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-s2 border border-line text-[12px] text-muted" aria-live="polite" data-testid="sync-pill">
      <motion.span className="h-2 w-2 rounded-full" style={{ background: dot }} animate={sync === 'syncing' ? { opacity: [1, 0.3, 1] } : { opacity: 1 }} transition={{ repeat: sync === 'syncing' ? Infinity : 0, duration: 1.1 }} />
      {label}
    </span>
  );
}
