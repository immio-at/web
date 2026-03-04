import { useState, useEffect, useCallback } from 'react';
import { getProperties, Property, updateProperty } from '@/lib/api';

// ─── Module-level cache ───────────────────────────────────────────────────────
// Stored outside the hook so it persists across page navigations.
// All components that call useProperties share the same cache.
//
// Why module-level and not React context?
// - Simpler: no provider needed, works anywhere in the tree
// - Fast: synchronously available on first render (no useContext lookup)
// - Good enough: single user, single session, data doesn't change between
//   navigations unless the user or a background email triggers it

let cache: Property[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // re-fetch from server after 30 seconds

// Listeners allow multiple mounted components to receive cache updates
// e.g. if Dashboard and Funnel were both mounted simultaneously
const listeners = new Set<(properties: Property[]) => void>();

function notifyListeners(properties: Property[]) {
  listeners.forEach(fn => fn(properties));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProperties() {
  // Initialise with cache immediately — no loading flash if cache is warm
  const [properties, setProperties] = useState<Property[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);
  const [error, setError] = useState<string | null>(null);

  const fetchFromServer = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const data = await getProperties();

      // Update cache
      cache = data;
      cacheTimestamp = Date.now();

      // Update this component + any other mounted components
      setProperties(data);
      notifyListeners(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Register this component as a listener so cache updates from
    // other components (e.g. a background refresh) propagate here too
    listeners.add(setProperties);

    const cacheAge = Date.now() - cacheTimestamp;
    const cacheIsStale = cacheAge > CACHE_TTL_MS;

    if (cache === null) {
      // No cache yet — full fetch with loading spinner
      fetchFromServer(true);
    } else if (cacheIsStale) {
      // Cache exists but is old — show cached data instantly, refresh silently
      setProperties(cache);
      setLoading(false);
      fetchFromServer(false);
    } else {
      // Cache is fresh — use it immediately, no network call
      setProperties(cache);
      setLoading(false);
    }

    return () => {
      listeners.delete(setProperties);
    };
  }, [fetchFromServer]);

  // ── Optimistic update ───────────────────────────────────────────────────────
  // Components can call this instead of updateProperty directly.
  // It updates the cache and all listeners immediately, then saves to the DB.
  // This means moving a card in Funnel is reflected instantly on Dashboard too.

  const update = useCallback(async (
    id: string,
    data: { status?: string; notes?: string; movedToStageAt?: string }
  ) => {
    // Apply optimistically to cache first
    if (cache) {
      cache = cache.map(p => p.id === id ? { ...p, ...data } : p);
      notifyListeners(cache);
    }

    // Persist to DB
    await updateProperty(id, data);
  }, []);

  return { properties, loading, error, refresh: () => fetchFromServer(true), update };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Call invalidateCache() after any operation that changes the full property
// list (e.g. a new email arrives and you want to force a fresh fetch).

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
}
