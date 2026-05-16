/**
 * Preset filter definitions and pure filter functions.
 *
 * Used by PresetFilters component and applied client-side on
 * Discover, Finder, and Funnel pages.
 */

import { type BundeslandAbbreviation, getPostcodesByBundesland } from './austria-plz-bundesland';
import { type SavedFilter } from '@/lib/api';
import { savedFilterToValues, resolvePostcodes, type FilterValues } from '@/lib/filter-values';

// ─── Types ───────────────────────────────────────────────────────────────────

export type FunnelStageKey =
  | 'stage_new' | 'stage_investigating' | 'stage_interested'
  | 'stage_due_diligence' | 'stage_offer_made'
  | 'stage_parked' | 'stage_won' | 'stage_not_relevant';

export type PresetFilterKey =
  | 'searchAgents'
  | 'excludeSearchAgents'
  | FunnelStageKey
  | BundeslandAbbreviation;

export type PresetGroup = 'source' | 'stage' | 'state';

export interface PresetFilterDef {
  key: PresetFilterKey;
  labelKey: string; // i18n key under presetFilters namespace
  group: PresetGroup;
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export const PRESET_FILTERS: PresetFilterDef[] = [
  { key: 'searchAgents', labelKey: 'searchAgents', group: 'source' },
  { key: 'excludeSearchAgents', labelKey: 'excludeSearchAgents', group: 'source' },
  { key: 'stage_new', labelKey: 'stageNew', group: 'stage' },
  { key: 'stage_investigating', labelKey: 'stageInvestigating', group: 'stage' },
  { key: 'stage_interested', labelKey: 'stageInterested', group: 'stage' },
  { key: 'stage_due_diligence', labelKey: 'stageDueDiligence', group: 'stage' },
  { key: 'stage_offer_made', labelKey: 'stageOfferMade', group: 'stage' },
  { key: 'stage_parked', labelKey: 'stageParked', group: 'stage' },
  { key: 'stage_won', labelKey: 'stageWon', group: 'stage' },
  { key: 'stage_not_relevant', labelKey: 'stageNotRelevant', group: 'stage' },
  { key: 'W', labelKey: 'W', group: 'state' },
  { key: 'NÖ', labelKey: 'NO', group: 'state' },
  { key: 'OÖ', labelKey: 'OO', group: 'state' },
  { key: 'ST', labelKey: 'ST', group: 'state' },
  { key: 'K', labelKey: 'K', group: 'state' },
  { key: 'S', labelKey: 'S', group: 'state' },
  { key: 'T', labelKey: 'T', group: 'state' },
  { key: 'V', labelKey: 'V', group: 'state' },
  { key: 'B', labelKey: 'B', group: 'state' },
];

// Mutually exclusive groups
const SOURCE_KEYS = new Set<PresetFilterKey>(['searchAgents', 'excludeSearchAgents']);

// ─── Toggle logic ────────────────────────────────────────────────────────────

export function togglePreset(
  active: Set<PresetFilterKey>,
  key: PresetFilterKey,
): Set<PresetFilterKey> {
  const next = new Set(active);
  if (next.has(key)) {
    next.delete(key);
  } else {
    // Source filters are mutually exclusive
    if (SOURCE_KEYS.has(key)) {
      for (const sk of SOURCE_KEYS) next.delete(sk);
    }
    next.add(key);
  }
  return next;
}

// ─── Postcode sets (cached lazily) ───────────────────────────────────────────

const postcodeCache = new Map<BundeslandAbbreviation, Set<string>>();

function getPostcodeSet(abbr: BundeslandAbbreviation): Set<string> {
  let cached = postcodeCache.get(abbr);
  if (!cached) {
    cached = new Set(getPostcodesByBundesland(abbr) ?? []);
    postcodeCache.set(abbr, cached);
  }
  return cached;
}

// ─── Filter application ─────────────────────────────────────────────────────

const STATE_KEYS: BundeslandAbbreviation[] = ['W', 'NÖ', 'OÖ', 'ST', 'K', 'S', 'T', 'V', 'B'];

interface Filterable {
  zipCode: string | null;
  status?: string;
  createdAt?: string;
  emailReceivedAt?: string | null;
  firstSeenAt?: string;
  source?: string;
}

// Map stage preset keys to actual status values
const STAGE_KEY_TO_STATUS: Record<string, string> = {
  stage_new: 'new',
  stage_investigating: 'investigating',
  stage_interested: 'interested',
  stage_due_diligence: 'due_diligence',
  stage_offer_made: 'offer_made',
  stage_parked: 'parked',
  stage_won: 'won',
  stage_not_relevant: 'not_relevant',
};
const ALL_STAGE_KEYS = Object.keys(STAGE_KEY_TO_STATUS);

/**
 * Returns true if the item passes all active preset filters.
 * - Source filter: AND with everything
 * - Time filter: AND with everything
 * - State filters: OR within group, AND with other groups
 */
export function passesPresetFilters<T extends Filterable>(
  item: T,
  active: Set<PresetFilterKey>,
): boolean {
  if (active.size === 0) return true;

  // Source filters — mutually exclusive.
  // Check emailReceivedAt — the reliable indicator of email-parsed origin.
  if (active.has('searchAgents')) {
    if (!item.emailReceivedAt) return false;
  }
  if (active.has('excludeSearchAgents')) {
    if (item.emailReceivedAt) return false;
  }

  // Stage filters — OR within group (like states).
  // Scraped listings without a status pass if any stage filter is active
  // (they haven't been assigned a stage yet).
  const activeStageKeys = ALL_STAGE_KEYS.filter(k => active.has(k as PresetFilterKey));
  if (activeStageKeys.length > 0 && item.status) {
    const allowedStatuses = activeStageKeys.map(k => STAGE_KEY_TO_STATUS[k]);
    if (!allowedStatuses.includes(item.status)) return false;
  }

  // State filters — OR within group
  const activeStates = STATE_KEYS.filter(k => active.has(k));
  if (activeStates.length > 0) {
    if (!item.zipCode) return false;
    const matches = activeStates.some(abbr => getPostcodeSet(abbr).has(item.zipCode!));
    if (!matches) return false;
  }

  return true;
}

// ─── Saved filter helpers ────────────────────────────────────────────────────

/**
 * Returns true if a saved filter contains any location criterion.
 * Used by PresetFilters Row 1 (Bundesland) override logic per ADR-008:
 * when an active saved filter has location, the Bundesland pills are
 * cleared and rendered inactive — the saved filter's location takes
 * precedence.
 */
export function savedFilterHasLocation(sf: SavedFilter): boolean {
  return (sf.postcodes?.length ?? 0) > 0
    || (sf.bezirke?.length ?? 0) > 0
    || (sf.bundeslaender?.length ?? 0) > 0;
}

// ─── FilterValues matching (client-side property filtering) ─────────────────

interface FilterValuesItem {
  price?: number | null;
  sizeSqm?: number | null;
  rooms?: number | null;
  zipCode?: string | null;
  title?: string | null;
  location?: string | null;
  // ADR-022 — chip filter fields. `rentRegulationCategoryEffective` folds
  // in the year-based heuristic and is preferred over the raw column.
  propertyType?: string | null;
  rentRegulationCategory?: string | null;
  rentRegulationCategoryEffective?: string | null;
  // Time-on-market source dates (ADR-023 §3.2 fallback chain).
  platformListedAt?: string | null;
  emailReceivedAt?: string | null;
  firstSeenAt?: string | null;
  createdAt?: string | null;
}

/**
 * Time-on-market age in days, computed from the §3.2 fallback chain.
 * Returns null when no date is available.
 */
function tomAgeDays(p: FilterValuesItem): number | null {
  const raw = p.platformListedAt ?? p.emailReceivedAt ?? p.firstSeenAt ?? p.createdAt ?? null;
  if (!raw) return null;
  const ms = Date.now() - new Date(raw).getTime();
  return Number.isFinite(ms) ? ms / 86_400_000 : null;
}

/**
 * Returns true if a property matches the given FilterValues form state.
 * Used by the Dashboard Discover tile match count, the Filter Modal live
 * count, and the Funnel / Finder client-side filtering when the pill bar
 * is the active filter UI. Pure function — no side effects.
 */
export function passesFilterValues<T extends FilterValuesItem>(p: T, v: FilterValues): boolean {
  const price = p.price != null ? parseFloat(String(p.price)) : null;
  const size = p.sizeSqm ?? null;
  const rooms = p.rooms != null ? parseFloat(String(p.rooms)) : null;

  if (v.keyword) {
    const kw = v.keyword.toLowerCase();
    const title = (p.title ?? '').toLowerCase();
    const location = (p.location ?? '').toLowerCase();
    if (!title.includes(kw) && !location.includes(kw)) return false;
  }
  if (v.minPrice && price != null && price < parseFloat(v.minPrice)) return false;
  if (v.maxPrice && price != null && price > parseFloat(v.maxPrice)) return false;
  if (v.minPricePerSqm && price != null && size != null && size > 0) {
    const ppsm = price / size;
    if (ppsm < parseFloat(v.minPricePerSqm)) return false;
  }
  if (v.maxPricePerSqm && price != null && size != null && size > 0) {
    const ppsm = price / size;
    if (ppsm > parseFloat(v.maxPricePerSqm)) return false;
  }
  if (v.minSize && size != null && size < parseFloat(v.minSize)) return false;
  if (v.maxSize && size != null && size > parseFloat(v.maxSize)) return false;
  if (v.minRooms && rooms != null && rooms < parseFloat(v.minRooms)) return false;
  if (v.maxRooms && rooms != null && rooms > parseFloat(v.maxRooms)) return false;

  const postcodes = resolvePostcodes(v.location);
  if (postcodes.length > 0 && (!p.zipCode || !postcodes.includes(p.zipCode))) return false;

  // ADR-022 chip filters. Empty arrays / blank tom are no-ops, so this is
  // inert until the pill bar populates them.
  if (v.propertyType.length > 0) {
    if (!p.propertyType || !v.propertyType.includes(p.propertyType)) return false;
  }
  if (v.rentRegulationCategory.length > 0) {
    // Match the effective category (stored value or year heuristic).
    // mrg_unknown / NULL never match an active chip selection (§7.4).
    const cat = p.rentRegulationCategoryEffective ?? p.rentRegulationCategory ?? null;
    if (!cat || !v.rentRegulationCategory.includes(cat)) return false;
  }
  if (v.tomMaxDays) {
    const age = tomAgeDays(p);
    if (age == null || age > parseFloat(v.tomMaxDays)) return false;
  }

  return true;
}

// ─── Saved filter matching ──────────────────────────────────────────────────

interface PropertyLike {
  price?: number | null;
  sizeSqm?: number | null;
  rooms?: number | null;
  zipCode?: string | null;
}

/**
 * Returns true if a property matches ANY of the active saved filters (OR logic).
 * Each saved filter's criteria are ANDed internally (price AND size AND rooms AND location).
 */
export function passesSavedFilters<T extends PropertyLike>(
  item: T,
  savedFilters: SavedFilter[],
  activeIds: Set<string>,
): boolean {
  if (activeIds.size === 0) return true;

  return Array.from(activeIds).some(id => {
    const sf = savedFilters.find(f => f.id === id);
    if (!sf) return false;
    const v = savedFilterToValues(sf);

    const price = item.price ? parseFloat(String(item.price)) : null;
    const size = item.sizeSqm != null ? parseFloat(String(item.sizeSqm)) : null;
    const rooms = item.rooms ? parseFloat(String(item.rooms)) : null;

    if (v.minPrice && price != null && price < parseFloat(v.minPrice)) return false;
    if (v.maxPrice && price != null && price > parseFloat(v.maxPrice)) return false;
    if (v.minSize && size != null && size < parseFloat(v.minSize)) return false;
    if (v.maxSize && size != null && size > parseFloat(v.maxSize)) return false;
    if (v.minRooms && rooms != null && rooms < parseFloat(v.minRooms)) return false;
    if (v.maxRooms && rooms != null && rooms > parseFloat(v.maxRooms)) return false;
    const postcodes = resolvePostcodes(v.location);
    if (postcodes.length > 0 && (!item.zipCode || !postcodes.includes(item.zipCode))) return false;
    return true;
  });
}
