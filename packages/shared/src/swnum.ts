/** Swahili + Sheng number words → integers. "mia nne hamsini" → 450, "elfu mbili mia tano" → 2500, "2k" → 2000. */
const UNITS: Record<string, number> = { sifuri: 0, moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5, sita: 6, saba: 7, nane: 8, tisa: 9 };
const TENS: Record<string, number> = { kumi: 10, ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50, sitini: 60, sabini: 70, themanini: 80, tisini: 90 };
const MULT: Record<string, number> = { mia: 100, elfu: 1000, laki: 100_000, milioni: 1_000_000 };
const SHENG: Record<string, number> = { mbao: 20, finje: 50, soo: 100, rwabe: 200, jiti: 1000, ngiri: 1000, thao: 1000, kaa: 1000, punch: 5000 };
const EN: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, thousand: 1000 };
export const isNumWord = (w: string) => w in UNITS || w in TENS || w in MULT || w in SHENG || /^\d/.test(w) || w === 'na';

/** Strict Swahili sub-hundred group: TENS [na UNITS] | UNITS. */
function small(tokens: string[], i: number): [number, number] {
  const w = tokens[i];
  if (w in TENS) {
    if (tokens[i + 1] === 'na' && tokens[i + 2] in UNITS) return [TENS[w] + UNITS[tokens[i + 2]], i + 3];
    return [TENS[w], i + 1];
  }
  if (w in UNITS) return [UNITS[w], i + 1];
  return [0, i];
}
/** Parse the first money/quantity expression in text. Returns value and the [start,end) token span. */
export function parseSwNumber(text: string): { value: number; start: number; end: number } | null {
  const tokens = text.toLowerCase().replace(/[,?!.]/g, ' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    const m = w.match(/^(?:ksh|sh|kes)?(\d+(?:\.\d+)?)(k|bob|\/=)?$/);
    if (m) return { value: Math.round(parseFloat(m[1]) * (m[2] === 'k' ? 1000 : 1)), start: i, end: i + 1 };
    if (w in SHENG) { let v = SHENG[w], j = i + 1; const [s, k] = small(tokens, j); if (s) { v *= s; j = k; } return { value: v, start: i, end: j }; }
    if (w in EN) { let v = 0, cur = 0, j = i; while (j < tokens.length && (tokens[j] in EN || tokens[j] === 'and')) { const t = tokens[j]; if (t === 'and') { j++; continue; } const n = EN[t]; if (n === 100) cur = (cur || 1) * 100; else if (n === 1000) { v += (cur || 1) * 1000; cur = 0; } else cur += n; j++; } return { value: v + cur, start: i, end: j }; }
    if (w in MULT || w in TENS || w in UNITS) {
      let total = 0, j = i;
      while (j < tokens.length) {
        const t = tokens[j];
        if (t in MULT) {
          const mult = MULT[t]; j++;
          // "elfu mia mbili" (200,000) edge: multiplier followed by mia
          if (tokens[j] === 'mia' && mult >= 1000) { j++; const [s, k] = small(tokens, j); total += (s || 1) * 100 * mult; j = k; }
          else { const [s, k] = mult === 100 && tokens[j] in UNITS ? [UNITS[tokens[j]], j + 1] : small(tokens, j); total += (s || 1) * mult; j = k; }
        } else if (t in TENS || t in UNITS) { const [s, k] = small(tokens, j); total += s; j = k; }
        else if (t === 'na') j++;
        else break;
      }
      return { value: total, start: i, end: j };
    }
  }
  return null;
}
