import { describe, it, expect } from 'vitest';
import { tokenise } from './tokeniser';
import type { Suggestion } from './types';

/** ADR-024 §2–§5 — tokeniser tests. */

const kinds = (ss: Suggestion[]) => ss.map((s) => s.kind);
const targets = (ss: Suggestion[]) => ss.map((s) => s.target);

describe('tokenise — property type', () => {
  it('recognises a canonical DE term', () => {
    expect(tokenise('wohnung').suggestions[0].target).toEqual({
      field: 'propertyType',
      value: 'wohnung',
    });
  });
  it('recognises the EN synonym', () => {
    expect(tokenise('apartment').suggestions[0].target).toEqual({
      field: 'propertyType',
      value: 'wohnung',
    });
  });
  it('recognises an Austrian abbreviation (EFH → haus)', () => {
    expect(tokenise('efh').suggestions[0].target).toEqual({
      field: 'propertyType',
      value: 'haus',
    });
  });
  it('recognises MFH → zinshaus', () => {
    expect(tokenise('mfh').suggestions[0].target).toEqual({
      field: 'propertyType',
      value: 'zinshaus',
    });
  });
});

describe('tokenise — normalisation', () => {
  it('matches an umlaut term', () => {
    expect(tokenise('Grundstück').suggestions[0].target).toEqual({
      field: 'propertyType',
      value: 'grundstueck',
    });
  });
  it('is case-insensitive', () => {
    expect(tokenise('GRUNDSTÜCK').suggestions[0].target).toEqual({
      field: 'propertyType',
      value: 'grundstueck',
    });
  });
});

describe('tokenise — rent regulation', () => {
  it('altbau → mrg_full', () => {
    expect(tokenise('altbau').suggestions[0].target).toEqual({
      field: 'rentRegulationCategory',
      value: 'mrg_full',
    });
  });
});

describe('tokenise — Bundesland', () => {
  it('wien → preset key W', () => {
    expect(tokenise('wien').suggestions[0].target).toEqual({ field: 'bundesland', presetKey: 'W' });
  });
  it('vienna → preset key W', () => {
    expect(tokenise('vienna').suggestions[0].target).toEqual({ field: 'bundesland', presetKey: 'W' });
  });
  it('nö abbreviation → preset key NÖ', () => {
    expect(tokenise('nö').suggestions[0].target).toEqual({ field: 'bundesland', presetKey: 'NÖ' });
  });
});

describe('tokenise — postcodes and districts', () => {
  it('a 4-digit token is a postcode', () => {
    expect(tokenise('1060').suggestions[0].target).toEqual({
      field: 'location',
      postcodes: ['1060'],
    });
  });
  it('a multi-word district name resolves to its postcode', () => {
    const s = tokenise('innere stadt').suggestions;
    expect(s).toHaveLength(1);
    expect(s[0].target).toEqual({ field: 'location', postcodes: ['1010'] });
  });
  it('a district spanning two postcodes routes to both', () => {
    expect(tokenise('favoriten').suggestions[0].target).toEqual({
      field: 'location',
      postcodes: ['1100', '1101'],
    });
  });
});

describe('tokenise — multi-token queries', () => {
  it('"Altbau Wien 1060" yields three suggestions', () => {
    const { suggestions } = tokenise('Altbau Wien 1060');
    expect(kinds(suggestions).sort()).toEqual(['bundesland', 'postcode', 'rentRegulation']);
    expect(targets(suggestions)).toContainEqual({ field: 'rentRegulationCategory', value: 'mrg_full' });
    expect(targets(suggestions)).toContainEqual({ field: 'bundesland', presetKey: 'W' });
    expect(targets(suggestions)).toContainEqual({ field: 'location', postcodes: ['1060'] });
  });
  it('drops noise words (mit)', () => {
    const { suggestions, fallback } = tokenise('haus mit seeblick');
    expect(suggestions.some((s) => s.target.field === 'propertyType')).toBe(true);
    // "seeblick" has no token → substring fallback; "mit" must not appear.
    expect(fallback?.target).toEqual({ field: 'keyword', value: 'seeblick' });
  });
});

describe('tokenise — ambiguity (§3)', () => {
  it('"Neubau" yields both the regulation and the district route', () => {
    const { suggestions } = tokenise('neubau');
    expect(suggestions).toHaveLength(2);
    expect(targets(suggestions)).toContainEqual({ field: 'rentRegulationCategory', value: 'free' });
    expect(targets(suggestions)).toContainEqual({ field: 'location', postcodes: ['1070'] });
  });
  it('marks both ambiguous suggestions with a context label', () => {
    const { suggestions } = tokenise('neubau');
    expect(suggestions.every((s) => !!s.context)).toBe(true);
  });
  it('a non-ambiguous token carries no context', () => {
    expect(tokenise('altbau').suggestions[0].context).toBeUndefined();
  });
});

describe('tokenise — fuzzy matching (§4)', () => {
  it('suggests Altbau for the misspelling "altbu"', () => {
    const { suggestions } = tokenise('altbu');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].fuzzy).toBe(true);
    expect(suggestions[0].target).toEqual({ field: 'rentRegulationCategory', value: 'mrg_full' });
  });
  it('strict matches are never flagged fuzzy', () => {
    expect(tokenise('altbau').suggestions[0].fuzzy).toBe(false);
  });
});

describe('tokenise — substring fallback (§5)', () => {
  it('unrecognised input becomes one keyword fallback', () => {
    const { suggestions, fallback } = tokenise('seeblick');
    expect(suggestions).toHaveLength(0);
    expect(fallback?.target).toEqual({ field: 'keyword', value: 'seeblick' });
  });
  it('quoted phrases go straight to the fallback', () => {
    const { fallback } = tokenise('"renovated balcony view"');
    expect(fallback?.target).toEqual({ field: 'keyword', value: 'renovated balcony view' });
  });
  it('recognised tokens route; the remainder falls back', () => {
    const { suggestions, fallback } = tokenise('altbau seeblick');
    expect(suggestions).toHaveLength(1);
    expect(fallback?.target).toEqual({ field: 'keyword', value: 'seeblick' });
  });
  it('an empty query yields nothing', () => {
    expect(tokenise('   ')).toEqual({ suggestions: [], fallback: null });
  });
});

describe('tokenise — numeric integration', () => {
  it('routes a numeric range expression through the numeric parser', () => {
    const { suggestions } = tokenise('>200m²');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].kind).toBe('numeric');
    expect(suggestions[0].target).toEqual({ field: 'range', key: 'minSize', value: '200' });
  });
  it('combines numeric, chip and fallback in one query', () => {
    const { suggestions, fallback } = tokenise('altbau wien <500k€ seeblick');
    expect(targets(suggestions)).toContainEqual({ field: 'rentRegulationCategory', value: 'mrg_full' });
    expect(targets(suggestions)).toContainEqual({ field: 'bundesland', presetKey: 'W' });
    expect(targets(suggestions)).toContainEqual({ field: 'range', key: 'maxPrice', value: '500000' });
    expect(fallback?.target).toEqual({ field: 'keyword', value: 'seeblick' });
  });
});
