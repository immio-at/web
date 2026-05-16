/**
 * ADR-022 — Shared property-type & rent-regulation normalisation (frontend).
 *
 * Mirror of `backend/src/common/property-normalisation.ts`. Keep the two in
 * sync — the normalisation table is maintained centrally (ADR-022 §6.2).
 * The frontend uses this for the Manuell-tab type dropdown, the heuristic
 * badge rendering, and the filter chip <-> value mapping.
 */

// ── Canonical value sets ─────────────────────────────────────────────────────

/** Six canonical property types (ADR-022 §5.1 / ADR-023 chips). */
export type PropertyType =
  | 'wohnung'
  | 'haus'
  | 'zinshaus'
  | 'gewerbe'
  | 'grundstueck'
  | 'garage';

export const PROPERTY_TYPES: readonly PropertyType[] = [
  'wohnung',
  'haus',
  'zinshaus',
  'gewerbe',
  'grundstueck',
  'garage',
] as const;

/**
 * Regulatory categories (ADR-022 §7.1) — regulatory meaning, not colloquial
 * construction era. Surfaced in the UI as Altbau / Wiederaufbau / Neubau.
 */
export type RentRegulationCategory =
  | 'mrg_full'
  | 'mrg_partial'
  | 'mrg_unknown'
  | 'free';

export const RENT_REGULATION_CATEGORIES: readonly RentRegulationCategory[] = [
  'mrg_full',
  'mrg_partial',
  'mrg_unknown',
  'free',
] as const;

/** The three user-selectable filter chips map to these confident values. */
export const SELECTABLE_RENT_REGULATION: readonly RentRegulationCategory[] = [
  'mrg_full',
  'mrg_partial',
  'free',
] as const;

/** UI chip <-> regulatory value (ADR-022 §7.4). `mrg_unknown` has no chip. */
export const REGULATION_CHIP_TO_VALUE: Record<string, RentRegulationCategory> = {
  altbau: 'mrg_full',
  wiederaufbau: 'mrg_partial',
  neubau: 'free',
};

/** Provenance enum — used by every `*Source` column (ADR-022 §1.2). */
export type PropertySource =
  | 'parsed'
  | 'inferred'
  | 'extension'
  | 'extracted'
  | 'user';

// ── Property type normalisation ──────────────────────────────────────────────

const TYPE_KEYWORDS: ReadonlyArray<readonly [PropertyType, readonly string[]]> = [
  ['garage', ['garage', 'stellplatz', 'tiefgarage', 'abstellplatz', 'autoabstellplatz', 'carport', 'pkw-abstellplatz']],
  ['grundstueck', ['grundstück', 'grundstueck', 'baugrund', 'bauland', 'baufläche', 'bauflaeche', 'bauparzelle', 'parzelle']],
  ['zinshaus', ['zinshaus', 'anlageobjekt', 'anlagenobjekt', 'anlageimmobilie', 'renditeobjekt', 'mehrfamilienhaus', 'wohnhaus', 'mietshaus', 'mietobjekt']],
  ['gewerbe', ['büro', 'buero', 'geschäftslokal', 'geschaeftslokal', 'geschäftsfläche', 'gewerbe', 'gewerbeobjekt', 'gewerbeimmobilie', 'lager', 'lagerhalle', 'praxis', 'ordination', 'betriebsobjekt', 'lokal', 'einzelhandel']],
  ['haus', ['einfamilienhaus', 'doppelhaus', 'reihenhaus', 'reihenhaushälfte', 'villa', 'bungalow', 'landhaus', 'siedlungshaus', 'fertighaus', 'haus']],
  ['wohnung', ['eigentumswohnung', 'dachgeschosswohnung', 'dachgeschoss', 'dachgeschoß', 'maisonette', 'penthouse', 'loft', 'garconniere', 'garçonniere', 'mietwohnung', 'vorsorgewohnung', 'wohnung', 'apartment', 'appartement']],
];

/**
 * Normalise a raw type string to a canonical PropertyType, or null when no
 * confident match is found. NULL is a valid output (ADR-022 §6.3).
 */
export function normalisePropertyType(raw: string | null | undefined): PropertyType | null {
  if (!raw) return null;
  const haystack = raw.toLowerCase().trim();
  if (!haystack) return null;
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return null;
}

// ── Rent regulation heuristic & normalisation ────────────────────────────────

/** Year-based heuristic for rent regulation category (ADR-022 §7.1). */
export function computeRentRegulationFromBaujahr(
  baujahr: number | null | undefined,
): RentRegulationCategory | null {
  if (baujahr == null || !Number.isFinite(baujahr) || baujahr < 1000 || baujahr > 2100) {
    return null;
  }
  if (baujahr <= 1945) return 'mrg_full';
  if (baujahr <= 1960) return 'mrg_partial';
  if (baujahr <= 1975) return 'mrg_unknown';
  return 'free';
}

/**
 * Derive rent regulation category from a raw construction-era string plus
 * (optionally) baujahr — the year is the primary signal (ADR-022 §6.2).
 */
export function normaliseRentRegulationFromHaustyp(
  raw: string | null | undefined,
  baujahr: number | null | undefined,
): RentRegulationCategory | null {
  const fromYear = computeRentRegulationFromBaujahr(baujahr);
  if (fromYear) return fromYear;
  if (!raw) return null;
  const h = raw.toLowerCase().trim();
  if (h.includes('gründerzeit') || h.includes('gruenderzeit') || h.includes('altbau')) {
    return 'mrg_full';
  }
  return null;
}

/**
 * The effective regulatory category for display: prefer the stored value,
 * fall back to the heuristic from baujahr. Returns the value and whether it
 * was inferred (heuristic) — drives the §7.5 badge selection.
 */
export function effectiveRentRegulation(
  stored: RentRegulationCategory | null | undefined,
  storedSource: PropertySource | null | undefined,
  baujahr: number | null | undefined,
): { category: RentRegulationCategory | null; inferred: boolean } {
  if (stored) {
    return { category: stored, inferred: storedSource === 'inferred' };
  }
  const heuristic = computeRentRegulationFromBaujahr(baujahr);
  return { category: heuristic, inferred: heuristic != null };
}
