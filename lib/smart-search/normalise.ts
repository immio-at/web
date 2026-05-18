/**
 * ADR-024 §2.4 — Unicode normalisation for smart-search tokenisation.
 *
 * One-way, deterministic. Every user input string AND every vocabulary
 * entry passes through this before comparison, so `Grundstück`,
 * `grundstueck`, `GRUNDSTÜCK` all collapse to the same internal form.
 * Never reversed for display — the display layer is locale-aware, the
 * recognition layer is locale-blind.
 */
export function normaliseForTokenisation(input: string): string {
  return input
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ü/g, 'ue')
    .replace(/ö/g, 'oe')
    .replace(/ä/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();
}
