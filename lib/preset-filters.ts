/**
 * Preset filter definitions and pure filter functions.
 *
 * Used by PresetFilters component and applied client-side on
 * Discover, Finder, and Funnel pages.
 */

import { type BundeslandAbbreviation, getPostcodesByBundesland } from './austria-plz-bundesland';

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

  // Source filter — "Search Agents" means email-parsed only
  if (active.has('searchAgents')) {
    if (item.source !== undefined) {
      // UnifiedListing — has explicit source field
      if (item.source !== 'email') return false;
    } else {
      // Property — check emailReceivedAt
      if (!item.emailReceivedAt) return false;
    }
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
