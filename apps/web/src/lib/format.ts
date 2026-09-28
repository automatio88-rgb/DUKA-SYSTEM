import { formatKsh } from '@duka/shared';
export const ksh = (n: number, compact = false) => formatKsh(n, { compact });
export const initials = (s: string) => s.replace(/\(.*?\)/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
/** Warm shelf palette (maize, clay, leaf, sky, plum) — hue picked from the name so tiles stay stable. */
const HUES = [[38, 0.15], [28, 0.14], [150, 0.1], [215, 0.08], [350, 0.1], [85, 0.12], [15, 0.13]];
export function tileColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [hue, c] = HUES[h % HUES.length];
  return { bg: `linear-gradient(145deg, oklch(0.42 ${c} ${hue}), oklch(0.3 ${c * 0.8} ${hue + 12}))`, fg: `oklch(0.95 0.03 ${hue})` };
}
export const timeAgo = (iso: string, lang: 'en' | 'sw') => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return lang === 'sw' ? `dak ${Math.max(m, 1)}` : `${Math.max(m, 1)}m`;
  const h = Math.round(m / 60); if (h < 24) return lang === 'sw' ? `saa ${h}` : `${h}h`;
  const d = Math.round(h / 24); return lang === 'sw' ? `siku ${d}` : `${d}d`;
};
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });
