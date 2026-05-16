/**
 * Filter values — the shared shape and helpers for IMMIO's filter UI.
 *
 * ADR-023 §10.2 / C1 — extracted verbatim from `components/FilterBar.tsx` so
 * the filter primitives live in a non-component module. The pill bar, the
 * FilterModal, the page containers and `preset-filters.ts` all import from
 * here. `FilterBar.tsx` itself is deleted in ADR-023 C4; this module
 * outlives it. C1 is a pure move — zero behaviour change.
 */

import type { SavedFilter, CreateSavedFilterDto } from '@/lib/api';
import { getPostcodesByBundesland } from '@/lib/austria-plz-bundesland';

// ─── Filter values type ──────────────────────────────────────────────────────

export interface FilterValues {
  keyword: string;
  location: string; // free text: postcodes and/or Bundesland names, comma-separated
  minPrice: string;
  maxPrice: string;
  minPricePerSqm: string;
  maxPricePerSqm: string;
  minSize: string;
  maxSize: string;
  minRooms: string;
  maxRooms: string;
  sortBy: string;
  sortOrder: string;
}

export const EMPTY_FILTERS: FilterValues = {
  keyword: '',
  location: '',
  minPrice: '',
  maxPrice: '',
  minPricePerSqm: '',
  maxPricePerSqm: '',
  minSize: '',
  maxSize: '',
  minRooms: '',
  maxRooms: '',
  sortBy: 'listedDate',
  sortOrder: 'desc',
};

/**
 * Resolve a location string into an array of postcodes.
 * Accepts comma-separated mix of raw postcodes and Bundesland names/abbreviations.
 * e.g. "Wien, 2340, NÖ" → all Wien postcodes + "2340" + all NÖ postcodes
 */
export function resolvePostcodes(location: string): string[] {
  if (!location.trim()) return [];
  const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
  const postcodes = new Set<string>();

  for (const part of parts) {
    // Check if it's a raw 4-digit postcode
    if (/^\d{4}$/.test(part)) {
      postcodes.add(part);
      continue;
    }
    // Try resolving as Bundesland
    const blPostcodes = getPostcodesByBundesland(part);
    if (blPostcodes) {
      blPostcodes.forEach((p) => postcodes.add(p));
    }
  }
  return Array.from(postcodes);
}

// Convert a SavedFilter from API into FilterValues for the form
export function savedFilterToValues(sf: SavedFilter): FilterValues {
  return {
    keyword: '',
    location: sf.postcodes?.join(', ') ?? '',
    minPrice: sf.priceMin != null ? String(sf.priceMin) : '',
    maxPrice: sf.priceMax != null ? String(sf.priceMax) : '',
    minPricePerSqm: sf.pricePerSqmMin != null ? String(sf.pricePerSqmMin) : '',
    maxPricePerSqm: sf.pricePerSqmMax != null ? String(sf.pricePerSqmMax) : '',
    minSize: sf.sizeMin != null ? String(sf.sizeMin) : '',
    maxSize: sf.sizeMax != null ? String(sf.sizeMax) : '',
    minRooms: sf.roomsMin != null ? String(sf.roomsMin) : '',
    maxRooms: sf.roomsMax != null ? String(sf.roomsMax) : '',
    sortBy: sf.sortBy ?? 'listedDate',
    sortOrder: sf.sortOrder ?? 'desc',
  };
}

// Convert FilterValues to a DTO for creating/updating a saved filter
export function valuesToSavedFilterDto(v: FilterValues, name?: string): CreateSavedFilterDto {
  return {
    name: name || undefined,
    priceMin: v.minPrice ? parseFloat(v.minPrice) : null,
    priceMax: v.maxPrice ? parseFloat(v.maxPrice) : null,
    pricePerSqmMin: v.minPricePerSqm ? parseFloat(v.minPricePerSqm) : null,
    pricePerSqmMax: v.maxPricePerSqm ? parseFloat(v.maxPricePerSqm) : null,
    sizeMin: v.minSize ? parseFloat(v.minSize) : null,
    sizeMax: v.maxSize ? parseFloat(v.maxSize) : null,
    roomsMin: v.minRooms ? parseFloat(v.minRooms) : null,
    roomsMax: v.maxRooms ? parseFloat(v.maxRooms) : null,
    postcodes: resolvePostcodes(v.location),
    sources: ['all'],
    sortBy: v.sortBy || 'listedDate',
    sortOrder: v.sortOrder || 'desc',
  };
}

export function isFilterActive(v: FilterValues): boolean {
  return !!(
    v.keyword || v.location || v.minPrice || v.maxPrice ||
    v.minPricePerSqm || v.maxPricePerSqm || v.minSize || v.maxSize ||
    v.minRooms || v.maxRooms
  );
}
