/**
 * ADR-024 §2 / §3 / §4 — the smart-search tokeniser.
 *
 * Pure. Given a raw query string it returns `Suggestion`s and an optional
 * substring `fallback`. Pipeline:
 *
 *   1. Pull out "quoted phrases" → straight to the substring fallback (§14.2)
 *   2. Unicode-normalise (§2.4)
 *   3. Extract numeric ranges (§2.3) — `numeric.ts`
 *   4. Greedy n-gram window match against the bilingual vocabulary (§2.5);
 *      a phrase resolving to >1 entry is ambiguous → one pill each (§3)
 *   5. Fuzzy fallback for unmatched words via Fuse.js (§4) — never auto-applied
 *   6. Whatever still didn't match → one combined substring fallback (§5)
 */

import Fuse from 'fuse.js';
import { normaliseForTokenisation } from './normalise';
import { parseNumericRanges } from './numeric';
import {
  PROPERTY_TYPE_TOKENS,
  RENT_REGULATION_TOKENS,
  BUNDESLAND_TOKENS,
  NOISE_WORDS,
} from './tokens';
import { VIENNA_DISTRICT_TO_POSTCODES, VIENNA_DISTRICT_DISPLAY } from './vienna-districts';
import type { Suggestion, SuggestionTarget, MatchResult } from './types';

/** Fuse.js fuzzy cutoff (ADR-024 §4.3 — tune from tester feedback). */
export const FUZZY_THRESHOLD = 0.3;

type VocabKind = 'propertyType' | 'rentRegulation' | 'bundesland' | 'district';

interface VocabEntry {
  kind: VocabKind;
  /** Chip value / Bundesland preset key / district key. */
  canonical: string;
  /** Locale-neutral display string for the suggestion pill. */
  displayName: string;
  /** District only — the postcode(s) the name routes to. */
  postcodes?: string[];
}

// ── Vocabulary build (once, at module load) ──────────────────────────────────

const VOCAB = new Map<string, VocabEntry[]>();

function addVocab(recognised: string, entry: VocabEntry): void {
  const key = normaliseForTokenisation(recognised);
  const existing = VOCAB.get(key);
  if (existing) existing.push(entry);
  else VOCAB.set(key, [entry]);
}

for (const [canonical, strings] of Object.entries(PROPERTY_TYPE_TOKENS)) {
  for (const s of strings) {
    addVocab(s, { kind: 'propertyType', canonical, displayName: canonical });
  }
}
for (const [canonical, strings] of Object.entries(RENT_REGULATION_TOKENS)) {
  for (const s of strings) {
    addVocab(s, { kind: 'rentRegulation', canonical, displayName: canonical });
  }
}
for (const [presetKey, strings] of Object.entries(BUNDESLAND_TOKENS)) {
  for (const s of strings) {
    addVocab(s, { kind: 'bundesland', canonical: presetKey, displayName: presetKey });
  }
}
for (const [districtKey, postcodes] of Object.entries(VIENNA_DISTRICT_TO_POSTCODES)) {
  addVocab(districtKey, {
    kind: 'district',
    canonical: districtKey,
    displayName: VIENNA_DISTRICT_DISPLAY[districtKey] ?? districtKey,
    postcodes,
  });
}

/** Longest recognised phrase, in words — bounds the n-gram window. */
const MAX_NGRAM = Math.max(...[...VOCAB.keys()].map((k) => k.split(' ').length), 1);

// ── Fuzzy matcher ────────────────────────────────────────────────────────────

const VOCAB_PHRASES = [...VOCAB.keys()];
const fuse = new Fuse(VOCAB_PHRASES, { threshold: FUZZY_THRESHOLD, includeScore: true });

function fuzzyMatch(word: string): VocabEntry | null {
  const results = fuse.search(word);
  if (!results.length) return null;
  const entries = VOCAB.get(results[0].item);
  return entries?.[0] ?? null;
}

// ── Suggestion construction ──────────────────────────────────────────────────

function entryTarget(e: VocabEntry): SuggestionTarget {
  switch (e.kind) {
    case 'propertyType':
      return { field: 'propertyType', value: e.canonical };
    case 'rentRegulation':
      return { field: 'rentRegulationCategory', value: e.canonical };
    case 'bundesland':
      return { field: 'bundesland', presetKey: e.canonical };
    case 'district':
      return { field: 'location', postcodes: e.postcodes ?? [] };
  }
}

function entryToSuggestion(
  e: VocabEntry,
  sourceText: string,
  id: string,
  opts: { ambiguous: boolean; fuzzy: boolean },
): Suggestion {
  return {
    id,
    kind: e.kind,
    sourceText,
    displayValue: e.displayName,
    // Context label only when the same input resolved to multiple targets.
    context: opts.ambiguous ? e.kind : undefined,
    fuzzy: opts.fuzzy,
    target: entryTarget(e),
  };
}

// ── Tokeniser ────────────────────────────────────────────────────────────────

export function tokenise(query: string): MatchResult {
  const suggestions: Suggestion[] = [];
  let counter = 0;
  const nextId = () => `ss${counter++}`;

  if (!query.trim()) return { suggestions, fallback: null };

  // 1. Quoted phrases → straight to the substring fallback.
  const quoted: string[] = [];
  const dequoted = query.replace(/"([^"]+)"/g, (_full, inner: string) => {
    const t = inner.trim();
    if (t) quoted.push(t);
    return ' ';
  });

  // 2. Normalise.
  const normalised = normaliseForTokenisation(dequoted);

  // 3. Numeric ranges.
  const { matches: numericMatches, rest } = parseNumericRanges(normalised);
  for (const nm of numericMatches) {
    for (const tgt of nm.targets) {
      suggestions.push({
        id: nextId(),
        kind: 'numeric',
        sourceText: nm.sourceText,
        displayValue: tgt.value,
        fuzzy: false,
        target: { field: 'range', key: tgt.key, value: tgt.value },
      });
    }
  }

  // 4. Word tokens — drop noise words and blanks.
  const words = rest
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !NOISE_WORDS.has(w));

  const unmatched: string[] = [];

  // 5. Greedy n-gram window (longest phrase first).
  let i = 0;
  while (i < words.length) {
    let consumed = 0;
    for (let n = Math.min(MAX_NGRAM, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(' ');

      // A bare 4-digit token is a postcode.
      if (n === 1 && /^\d{4}$/.test(phrase)) {
        suggestions.push({
          id: nextId(),
          kind: 'postcode',
          sourceText: phrase,
          displayValue: phrase,
          fuzzy: false,
          target: { field: 'location', postcodes: [phrase] },
        });
        consumed = 1;
        break;
      }

      const entries = VOCAB.get(phrase);
      if (entries && entries.length) {
        const ambiguous = entries.length > 1;
        for (const e of entries) {
          suggestions.push(entryToSuggestion(e, phrase, nextId(), { ambiguous, fuzzy: false }));
        }
        consumed = n;
        break;
      }
    }
    if (consumed === 0) {
      unmatched.push(words[i]);
      i += 1;
    } else {
      i += consumed;
    }
  }

  // 6. Fuzzy pass — unmatched non-numeric words only (ADR-024 §4.4).
  const stillUnmatched: string[] = [];
  for (const w of unmatched) {
    if (/^\d+$/.test(w)) {
      stillUnmatched.push(w);
      continue;
    }
    const hit = fuzzyMatch(w);
    if (hit) {
      suggestions.push(entryToSuggestion(hit, w, nextId(), { ambiguous: false, fuzzy: true }));
    } else {
      stillUnmatched.push(w);
    }
  }

  // 7. Combined substring fallback — quoted phrases + still-unmatched words.
  const fallbackText = [quoted.join(' '), stillUnmatched.join(' ')]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  const fallback: Suggestion | null = fallbackText
    ? {
        id: nextId(),
        kind: 'substring',
        sourceText: fallbackText,
        displayValue: fallbackText,
        fuzzy: false,
        target: { field: 'keyword', value: fallbackText },
      }
    : null;

  return { suggestions, fallback };
}
