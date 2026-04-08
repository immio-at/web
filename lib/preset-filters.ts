/**
 * Preset filter definitions and pure filter functions.
 *
 * Used by PresetFilters component and applied client-side on
 * Discover, Finder, and Funnel pages.
 */

import { type BundeslandAbbreviation, getPostcodesByBundesland } from './austria-plz-bundesland';
import { type SavedFilter } from '@/lib/api';
import { savedFilterToValues, resolvePostcodes } from '@/components/FilterBar';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PresetFilterKey =
  | 'searchAgents'
  | 'last24h'
  | 'lastWeek'
  | BundeslandAbbreviation;

export type PresetGroup = 'source' | 'time' | 'state';

export interface PresetFilterDef {
  key: PresetFilterKey;
  labelKey: string; // i18n key under presetFilters namespace
  group: PresetGroup;
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export const PRESET_FILTERS: PresetFilterDef[] = [
  { key: 'searchAgents', labelKey: 'searchAgents', group: 'source' },
  { key: 'last24h', labelKey: 'last24h', group: 'time' },
  { key: 'lastWeek', labelKey: 'lastWeek', group: 'time' },
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

// Time filters are mutually exclusive
const TIME_KEYS = new Set<PresetFilterKey>(['last24h', 'lastWeek']);

// ─── Toggle logic ────────────────────────────────────────────────────────────

export function togglePreset(
  active: Set<PresetFilterKey>,
  key: PresetFilterKey,
): Set<PresetFilterKey> {
  const next = new Set(active);
  if (next.has(key)) {
    next.delete(key);
  } else {
    // Time filters are mutually exclusive
    if (TIME_KEYS.has(key)) {
      for (const tk of TIME_KEYS) next.delete(tk);
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
  createdAt?: string;
  emailReceivedAt?: string | null;
  firstSeenAt?: string;
  source?: 'email' | 'scraped';
}

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

  // Source filter — "Search Agents" means email-parsed only.
  // Always check emailReceivedAt — it's the reliable indicator.
  // Properties saved from scraped listings have source='email' but
  // no emailReceivedAt, so checking source alone would be wrong.
  if (active.has('searchAgents')) {
    if (!item.emailReceivedAt) return false;
  }

  // Time filter
  const now = Date.now();
  if (active.has('last24h')) {
    const ref = item.emailReceivedAt || item.firstSeenAt || item.createdAt;
    if (!ref || now - new Date(ref).getTime() > 24 * 60 * 60 * 1000) return false;
  }
  if (active.has('lastWeek')) {
    const ref = item.emailReceivedAt || item.firstSeenAt || item.createdAt;
    if (!ref || now - new Date(ref).getTime() > 7 * 24 * 60 * 60 * 1000) return false;
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
