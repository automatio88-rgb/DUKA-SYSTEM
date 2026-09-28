import { useMemo } from 'react';
import { useApp } from '@/app/store';
import { E, data } from './data';
import type { DukaEngine, DataSet } from '@duka/shared';
/** Recompute a derived view whenever the engine commits (version bump). */
export function useData<T>(fn: (e: DukaEngine, db: DataSet) => T, deps: unknown[] = []): T {
  const v = useApp(s => s.version);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(E(), data()), [v, ...deps]);
}
