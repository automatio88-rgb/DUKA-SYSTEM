import { describe, it, expect } from 'vitest';
import { parseIntent } from '../src/intent';
import { parseSwNumber } from '../src/swnum';

describe('Swahili numbers', () => {
  const cases: [string, number][] = [['mia nne hamsini', 450], ['elfu moja', 1000], ['elfu mbili mia tano', 2500], ['elfu kumi na tano', 15000], ['mia tatu na hamsini', 350], ['sitini na tano', 65], ['2k', 2000], ['ksh450', 450], ['soo mbili', 200], ['four hundred and fifty', 450]];
  for (const [s, n] of cases) it(`${s} = ${n}`, () => { expect(parseSwNumber(s)!.value).toBe(n); });
});
describe('MockLLMProvider intents (§F10)', () => {
  it('Andika deni ya Baba Kevin mia nne hamsini → addCredit(Baba Kevin, 450)', () => { const c = parseIntent('Andika deni ya Baba Kevin mia nne hamsini'); expect(c.tool).toBe('addCredit'); expect(c.args).toMatchObject({ customer: 'Baba Kevin', amount: 450 }); expect(c.lang).toBe('sw'); });
  it('Nimehamisha katoni mbili za maziwa kutoka store → transferStock', () => { const c = parseIntent('Nimehamisha katoni mbili za maziwa kutoka store'); expect(c.tool).toBe('transferStock'); expect(c.args).toMatchObject({ qty: 2, unit: 'carton', product: 'maziwa', direction: 'store→duka' }); });
  it('Nani ananidai zaidi ya elfu moja? → debtQuery(>1000)', () => { const c = parseIntent('Nani ananidai zaidi ya elfu moja?'); expect(c.tool).toBe('debtQuery'); expect(c.args.minBalance).toBe(1000); });
  it('Ripoti ya leo / daily report → dailyReport', () => { expect(parseIntent('Ripoti ya leo').tool).toBe('dailyReport'); const e = parseIntent('daily report'); expect(e.tool).toBe('dailyReport'); expect(e.lang).toBe('en'); });
  it('Weka bei ya sukari 65 → priceUpdate(sugar, 65)', () => { const c = parseIntent('Weka bei ya sukari 65'); expect(c.tool).toBe('priceUpdate'); expect(c.args).toMatchObject({ product: 'sukari', price: 65 }); });
  it('Mteja ameuliza formula ya watoto → addDemandLog', () => { const c = parseIntent('Mteja ameuliza formula ya watoto'); expect(c.tool).toBe('addDemandLog'); expect(c.args.text).toBe('formula ya watoto'); });
  it('extras: payments, stock, sale, English credit', () => {
    expect(parseIntent('Mama Njeri amelipa 300').args).toMatchObject({ customer: 'Mama Njeri', amount: 300 });
    expect(parseIntent('Tuna maziwa ngapi').tool).toBe('stockQuery');
    expect(parseIntent('nimeuza mkate tatu').args).toMatchObject({ qty: 3 });
    expect(parseIntent('add credit for John Otieno 2k').args).toMatchObject({ customer: 'John Otieno', amount: 2000 });
    expect(parseIntent('rudisha katoni moja ya soda kwenda store').args.direction).toBe('duka→store');
  });
});
