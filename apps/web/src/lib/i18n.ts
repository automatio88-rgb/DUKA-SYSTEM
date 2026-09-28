import { translate, type Key } from '@duka/shared';
import { useApp } from '@/app/store';
export function useT() {
  const lang = useApp(s => s.lang);
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
