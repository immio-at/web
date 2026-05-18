import { describe, it, expect } from 'vitest';
import { parseNumber, parseNumericRanges } from './numeric';

/** ADR-024 §2.3 — numeric range parser tests. */

describe('parseNumber', () => {
  it('parses a plain integer', () => {
    expect(parseNumber('200')).toBe(200);
  });
  it('treats dots/commas without a suffix as thousands separators', () => {
    expect(parseNumber('1.200')).toBe(1200);
    expect(parseNumber('500.000')).toBe(500000);
  });
  it('expands the k suffix', () => {
    expect(parseNumber('500', 'k')).toBe(500_000);
  });
  it('expands the m suffix with a German decimal comma', () => {
    expect(parseNumber('1,2', 'm')).toBe(1_200_000);
  });
  it('expands the m suffix with an English decimal point', () => {
    expect(parseNumber('1.2', 'm')).toBe(1_200_000);
  });
});

describe('parseNumericRanges', () => {
  function only(input: string) {
    const { matches } = parseNumericRanges(input);
    return matches;
  }

  it('< N m² → size max', () => {
    expect(only('<200m²')[0].targets).toEqual([{ key: 'maxSize', value: '200' }]);
  });
  it('> N m² → size min', () => {
    expect(only('>120m²')[0].targets).toEqual([{ key: 'minSize', value: '120' }]);
  });
  it('N–M m² → size range', () => {
    expect(only('120-200m²')[0].targets).toEqual([
      { key: 'minSize', value: '120' },
      { key: 'maxSize', value: '200' },
    ]);
  });
  it('"bis N m2" → size max', () => {
    expect(only('bis 200 m2')[0].targets).toEqual([{ key: 'maxSize', value: '200' }]);
  });
  it('"ab N m²" → size min', () => {
    expect(only('ab 120m²')[0].targets).toEqual([{ key: 'minSize', value: '120' }]);
  });
  it('"up to N m²" → size max', () => {
    expect(only('up to 300m²')[0].targets).toEqual([{ key: 'maxSize', value: '300' }]);
  });
  it('< N k€ → price max', () => {
    expect(only('<500k€')[0].targets).toEqual([{ key: 'maxPrice', value: '500000' }]);
  });
  it('€/m² range → price-per-m² range', () => {
    expect(only('2000-3000 €/m²')[0].targets).toEqual([
      { key: 'minPricePerSqm', value: '2000' },
      { key: 'maxPricePerSqm', value: '3000' },
    ]);
  });
  it('> N zimmer → rooms min', () => {
    expect(only('>2 zimmer')[0].targets).toEqual([{ key: 'minRooms', value: '2' }]);
  });
  it('bare "N m²" is read as a ceiling', () => {
    expect(only('200m²')[0].targets).toEqual([{ key: 'maxSize', value: '200' }]);
  });
  it('blanks matched spans out of `rest`', () => {
    const { rest } = parseNumericRanges('altbau <200m² wien');
    expect(rest).toContain('altbau');
    expect(rest).toContain('wien');
    expect(rest).not.toContain('200');
  });
  it('leaves non-numeric input untouched', () => {
    expect(parseNumericRanges('altbau wien').matches).toHaveLength(0);
  });
});
