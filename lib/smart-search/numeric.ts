/**
 * ADR-024 §2.3 — numeric range parser.
 *
 * Scans a normalised query string for `[operator] number [– number] unit`
 * expressions and routes them to the range-slider fields. Recognises:
 *
 *   <N m²  / bis N m² / up to N m²   → size max
 *   >N m²  / ab N m²  / from N m²    → size min
 *   N–M m² / N bis M m²              → size range
 *   …the same patterns for € (price), €/m² (price per m²) and rooms.
 *
 * Numbers accept `k`/`m` thousands/millions suffixes, German decimal
 * commas and English decimal points. A bare `N unit` with no operator and
 * no range is read as a ceiling (max) — a predictable v1 rule; the slider
 * is visible and adjustable afterwards.
 */

import type { RangeKey } from './types';

export interface NumericMatch {
  /** The matched substring (removed from the string before word-tokenising). */
  sourceText: string;
  /** One or two range-field assignments. */
  targets: { key: RangeKey; value: string }[];
}

type UnitGroup = 'size' | 'price' | 'pricePerSqm' | 'rooms';

const UNIT_KEYS: Record<UnitGroup, { min: RangeKey; max: RangeKey }> = {
  size: { min: 'minSize', max: 'maxSize' },
  price: { min: 'minPrice', max: 'maxPrice' },
  pricePerSqm: { min: 'minPricePerSqm', max: 'maxPricePerSqm' },
  rooms: { min: 'minRooms', max: 'maxRooms' },
};

const MIN_OPS = new Set(['>', '>=', '≥', 'ab', 'from', 'ueber', 'über', 'min', 'mindestens']);
const MAX_OPS = new Set(['<', '<=', '≤', 'bis', 'up to', 'unter', 'max', 'maximal']);

// Order matters: the €/m² alternatives must precede the bare m²/€ ones.
// Capture groups: 1 op · 2 n1 · 3 s1 · 4 sep · 5 n2 · 6 s2 · 7 unit.
const NUMERIC_RE = new RegExp(
  '(?:(>=|<=|≥|≤|>|<|\\bab\\b|\\bbis\\b|\\bfrom\\b|\\bup to\\b|\\bunter\\b|\\bueber\\b|\\bmax\\b|\\bmaximal\\b|\\bmin\\b|\\bmindestens\\b)\\s*)?' +
    '(?:€\\s*)?' +
    '(\\d[\\d.,]*)\\s*([km])?\\s*' +
    '(?:(–|-|\\bbis\\b|\\bto\\b)\\s*(?:€\\s*)?(\\d[\\d.,]*)\\s*([km])?\\s*)?' +
    '(€\\/m²|€\\/m2|eur\\/m²|eur\\/m2|m²|m2|qm|zimmer|\\bzi\\b|rooms|room|€|eur|euro)',
  'gi',
);

function unitGroup(unitRaw: string): UnitGroup {
  const u = unitRaw.toLowerCase();
  if (u.includes('/m')) return 'pricePerSqm';
  if (u === 'm²' || u === 'm2' || u === 'qm') return 'size';
  if (u === 'zimmer' || u === 'zi' || u === 'rooms' || u === 'room') return 'rooms';
  return 'price';
}

/** Parse a numeric fragment (`500k`, `1,2m`, `1.200`, `200`) to a number. */
export function parseNumber(numPart: string, suffix?: string): number | null {
  const s = suffix?.toLowerCase();
  if (s === 'k' || s === 'm') {
    const n = parseFloat(numPart.replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    return s === 'k' ? n * 1_000 : n * 1_000_000;
  }
  // No suffix: treat `.`/`,` as thousands separators → integer.
  const n = parseInt(numPart.replace(/[.,]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract numeric range expressions. Returns the matches plus `rest` — the
 * input with every matched span blanked to a space so the caller can
 * word-tokenise what is left.
 */
export function parseNumericRanges(input: string): { matches: NumericMatch[]; rest: string } {
  const matches: NumericMatch[] = [];
  let rest = input;

  for (const m of input.matchAll(NUMERIC_RE)) {
    const [full, opRaw, n1Raw, s1, sepRaw, n2Raw, s2, unitRaw] = m;
    const group = unitGroup(unitRaw);
    const keys = UNIT_KEYS[group];
    const n1 = parseNumber(n1Raw, s1);
    if (n1 == null || n1 < 0) continue;

    const targets: { key: RangeKey; value: string }[] = [];

    if (sepRaw && n2Raw) {
      // Range: low → min, high → max (operator, if any, is ignored).
      const n2 = parseNumber(n2Raw, s2);
      if (n2 == null || n2 < 0) continue;
      const lo = Math.min(n1, n2);
      const hi = Math.max(n1, n2);
      targets.push({ key: keys.min, value: String(lo) });
      targets.push({ key: keys.max, value: String(hi) });
    } else {
      const op = opRaw?.toLowerCase().trim();
      if (op && MIN_OPS.has(op)) {
        targets.push({ key: keys.min, value: String(n1) });
      } else if (op && MAX_OPS.has(op)) {
        targets.push({ key: keys.max, value: String(n1) });
      } else {
        // Bare `N unit` — read as a ceiling.
        targets.push({ key: keys.max, value: String(n1) });
      }
    }

    matches.push({ sourceText: full.trim(), targets });
    rest = rest.replace(full, ' '.repeat(full.length));
  }

  return { matches, rest };
}
