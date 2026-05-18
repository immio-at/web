/**
 * ADR-024 §10.1 — smart-search shared types.
 *
 * The tokeniser is pure: it takes a query string and returns `Suggestion`s
 * carrying a structured `target`. The component layer (`PresetFilters`)
 * applies the target to the filter state; the tokeniser never touches
 * `FilterValues` directly. This keeps the tokeniser unit-testable.
 */

export type SuggestionKind =
  | 'propertyType'
  | 'rentRegulation'
  | 'bundesland'
  | 'postcode'
  | 'district'
  | 'numeric'
  | 'substring';

/** The eight range-slider fields a numeric token can route to. */
export type RangeKey =
  | 'minPrice'
  | 'maxPrice'
  | 'minSize'
  | 'maxSize'
  | 'minPricePerSqm'
  | 'maxPricePerSqm'
  | 'minRooms'
  | 'maxRooms';

/**
 * What a suggestion does when applied — a discriminated union consumed by
 * `PresetFilters.applySuggestion`. Kept structural (no `FilterValues`
 * import) so the tokeniser stays pure.
 */
export type SuggestionTarget =
  | { field: 'propertyType'; value: string }
  | { field: 'rentRegulationCategory'; value: string }
  | { field: 'bundesland'; presetKey: string }
  | { field: 'location'; postcodes: string[] }
  | { field: 'range'; key: RangeKey; value: string }
  | { field: 'keyword'; value: string };

export interface Suggestion {
  /** Stable key for React rendering + dedup. */
  id: string;
  kind: SuggestionKind;
  /** The raw input fragment this suggestion consumed — stripped from the
   *  field's draft when the suggestion is applied (ADR-024 §6.2). */
  sourceText: string;
  /**
   * The canonical value/label this resolves to. For chip targets it is the
   * canonical chip value (`wohnung`, `mrg_full`, the Bundesland preset key);
   * the component resolves it to a locale-aware display string. For
   * numeric / substring kinds it is a human-readable fragment.
   */
  displayValue: string;
  /** Disambiguation context i18n key (e.g. `rentRegulation` vs `district`)
   *  — set only when the same input token resolved to multiple targets. */
  context?: string;
  /** True for a fuzzy "did you mean …" suggestion. Never auto-applied. */
  fuzzy: boolean;
  target: SuggestionTarget;
}

export interface MatchResult {
  /** Strict, numeric and fuzzy suggestions, in input order. */
  suggestions: Suggestion[];
  /** Combined substring fallback when unmatched text remains, else null. */
  fallback: Suggestion | null;
}
