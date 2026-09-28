import { en, type Key } from './en';
import { sw } from './sw';
import type { Lang } from '../types';
export const dicts = { en, sw } as const;
export type { Key };
export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s: string = (dicts[lang] as Record<string, string>)[key] ?? en[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, String(vars[k]));
  return s;
}
