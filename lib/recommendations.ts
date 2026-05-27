/**
 * Recommendation engine — derives user investment criteria from funnel
 * properties and scores candidates against them.
 *
 * Weights: postcode/state = 10, price = 8, price/m² = 5, size = 4
 */

import { UserListing } from './api';
import { getBundeslandByPostcode } from './austria-plz-bundesland';

// ─── Criteria derivation ─────────────────────────────────────────────────────

export interface DerivedCriteria {
  postcodes: Set<string>;
  states: Set<string>;
  priceMin: number | null;
  priceMax: number | null;
  pricePerSqmMin: number | null;
  pricePerSqmMax: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
}

const FUNNEL_STATUSES = new Set([
  'investigating', 'interested', 'due_diligence',
  'offer_made', 'parked', 'won',
]);

export function deriveCriteria(properties: UserListing[]): DerivedCriteria | null {
  const funnel = properties.filter(p => FUNNEL_STATUSES.has(p.status));
  if (funnel.length < 5) return null;

  const postcodes = new Set<string>();
  const states = new Set<string>();
  const prices: number[] = [];
  const pricesPerSqm: number[] = [];
  const sizes: number[] = [];

  for (const p of funnel) {
    if (p.zipCode) {
      postcodes.add(p.zipCode);
      const state = getBundeslandByPostcode(p.zipCode);
      if (state) states.add(state);
    }
    if (p.price) {
      const price = parseFloat(String(p.price));
      if (price > 0) prices.push(price);
    }
    if (p.pricePerSqm) {
      const ppsm = parseFloat(String(p.pricePerSqm));
      if (ppsm > 0) pricesPerSqm.push(ppsm);
    }
    if (p.sizeSqm && p.sizeSqm > 0) sizes.push(p.sizeSqm);
  }

  return {
    postcodes,
    states,
    priceMin: prices.length > 0 ? Math.min(...prices) : null,
    priceMax: prices.length > 0 ? Math.max(...prices) : null,
    pricePerSqmMin: pricesPerSqm.length > 0 ? Math.min(...pricesPerSqm) : null,
    pricePerSqmMax: pricesPerSqm.length > 0 ? Math.max(...pricesPerSqm) : null,
    sizeMin: sizes.length > 0 ? Math.min(...sizes) : null,
    sizeMax: sizes.length > 0 ? Math.max(...sizes) : null,
  };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

const WEIGHT_LOCATION = 10;
const WEIGHT_PRICE = 8;
const WEIGHT_PRICE_PER_SQM = 5;
const WEIGHT_SIZE = 4;

/**
 * Scores a candidate property against derived criteria.
 * Returns 0–27 (sum of weights). Higher = better match.
 */
export function scoreProperty(p: UserListing, criteria: DerivedCriteria): number {
  let score = 0;

  // Location: exact postcode match = full weight, same state = half weight
  if (p.zipCode) {
    if (criteria.postcodes.has(p.zipCode)) {
      score += WEIGHT_LOCATION;
    } else {
      const state = getBundeslandByPostcode(p.zipCode);
      if (state && criteria.states.has(state)) {
        score += WEIGHT_LOCATION * 0.5;
      }
    }
  }

  // Price: within range = full weight, within 20% buffer = half weight
  if (p.price && criteria.priceMin !== null && criteria.priceMax !== null) {
    const price = parseFloat(String(p.price));
    const buffer = (criteria.priceMax - criteria.priceMin) * 0.2;
    const lo = criteria.priceMin - buffer;
    const hi = criteria.priceMax + buffer;
    if (price >= criteria.priceMin && price <= criteria.priceMax) {
      score += WEIGHT_PRICE;
    } else if (price >= lo && price <= hi) {
      score += WEIGHT_PRICE * 0.5;
    }
  }

  // Price per m²: within range = full weight, within 20% buffer = half
  if (p.pricePerSqm && criteria.pricePerSqmMin !== null && criteria.pricePerSqmMax !== null) {
    const ppsm = parseFloat(String(p.pricePerSqm));
    const buffer = (criteria.pricePerSqmMax - criteria.pricePerSqmMin) * 0.2;
    const lo = criteria.pricePerSqmMin - buffer;
    const hi = criteria.pricePerSqmMax + buffer;
    if (ppsm >= criteria.pricePerSqmMin && ppsm <= criteria.pricePerSqmMax) {
      score += WEIGHT_PRICE_PER_SQM;
    } else if (ppsm >= lo && ppsm <= hi) {
      score += WEIGHT_PRICE_PER_SQM * 0.5;
    }
  }

  // Size: within range = full weight, within 20% buffer = half
  if (p.sizeSqm && criteria.sizeMin !== null && criteria.sizeMax !== null) {
    const buffer = (criteria.sizeMax - criteria.sizeMin) * 0.2;
    const lo = criteria.sizeMin - buffer;
    const hi = criteria.sizeMax + buffer;
    if (p.sizeSqm >= criteria.sizeMin && p.sizeSqm <= criteria.sizeMax) {
      score += WEIGHT_SIZE;
    } else if (p.sizeSqm >= lo && p.sizeSqm <= hi) {
      score += WEIGHT_SIZE * 0.5;
    }
  }

  return score;
}

/**
 * Get recommended properties from the user's own collection.
 * Filters to status='new', scores against criteria, returns top N.
 */
export function getRecommendedOwn(
  properties: UserListing[],
  criteria: DerivedCriteria,
  limit = 20,
): UserListing[] {
  return properties
    .filter(p => p.status === 'new')
    .map(p => ({ property: p, score: scoreProperty(p, criteria) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.property);
}
