/** Tiny, dependency-free fuzzy matcher tuned for product names typed fast with one thumb. */
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export function score(query: string, target: string): number {
  const q = norm(query), t = norm(target);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  const words = t.split(' ');
  if (words.some(w => w.startsWith(q))) return 80;
  if (t.includes(q)) return 70;
  const qt = q.split(' ');
  const hits = qt.filter(w => words.some(x => x.startsWith(w) || (w.length > 3 && x.includes(w)))).length;
  if (hits === qt.length) return 60;
  // subsequence fallback ("blbnd" → blue band)
  let i = 0; for (const ch of t) if (ch === q[i]) i++;
  if (i === q.length) return 30 + Math.min(20, q.length * 2);
  return hits ? 20 * (hits / qt.length) : 0;
}
export interface Searchable { id: string; name: string; name_sw?: string; barcode?: string }
export function fuzzySearch<T extends Searchable>(items: T[], query: string, limit = 30): T[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit);
  if (/^\d{6,}$/.test(q)) { const b = items.filter(i => i.barcode === q); if (b.length) return b; }
  return items
    .map(i => ({ i, s: Math.max(score(q, i.name), i.name_sw ? score(q, i.name_sw) - 2 : 0) }))
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.i);
}
/** Swahili/sheng words the owner actually uses → English product keywords. */
export const PRODUCT_ALIASES: Record<string, string> = {
  maziwa: 'milk', sukari: 'sugar', unga: 'unga', mkate: 'bread', mafuta: 'oil', sabuni: 'soap', chumvi: 'salt',
  chai: 'tea', majani: 'tea', mchele: 'rice', kiberiti: 'matches', maji: 'water', mayai: 'eggs', yai: 'eggs',
  dawa: 'panadol', 'dawa ya meno': 'colgate', mswaki: 'toothbrush', pedi: 'always', diapers: 'pampers', nepi: 'pampers',
  soda: 'soda', siagi: 'blue band', samli: 'ghee', 'unga wa ngano': 'wheat', ngano: 'wheat', mandazi: 'mandazi',
  'formula ya watoto': 'formula', maharagwe: 'beans', dengu: 'green grams', kahawa: 'coffee', biskuti: 'biscuits',
  karatasi: 'tissue', tishu: 'tissue', mkaa: 'charcoal', kandili: 'paraffin', mafuta_taa: 'paraffin', vocha: 'airtime', credo: 'airtime',
};
export function resolveProduct<T extends Searchable>(items: T[], phrase: string): T | undefined {
  let p = norm(phrase);
  const keys = Object.keys(PRODUCT_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) if (p.includes(k.replace('_', ' '))) { p = p.replace(k.replace('_', ' '), PRODUCT_ALIASES[k]); break; }
  const tokens = p.split(' ').filter(w => w.length > 2 && !STOP.has(w));
  let best: { i: T; s: number } | undefined;
  for (const i of items) {
    const s = Math.max(...tokens.map(t => Math.max(score(t, i.name), i.name_sw ? score(t, i.name_sw) : 0)), score(p, i.name));
    if (s > 0 && (!best || s > best.s)) best = { i, s };
  }
  return best && best.s >= 60 ? best.i : undefined;
}
const STOP = new Set(['za', 'ya', 'wa', 'la', 'the', 'of', 'kutoka', 'from', 'store', 'duka', 'katoni', 'carton', 'cartons', 'mbili', 'moja', 'tatu', 'nne', 'tano', 'bei', 'weka']);
