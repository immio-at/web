import { useState, useEffect, useCallback } from 'react';
import { getProperties, Property, updateProperty } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

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
  const { session, loading: authLoading } = useAuth();

  // Initialise with cache immediately — no loading flash if cache is warm
  const [properties, setProperties] = useState<Property[]>(cache ?? []);
  const [loading, setLoading] = useState(true);
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
    return () => { listeners.delete(setProperties); };
  }, []);

  useEffect(() => {
    // Wait for AuthContext to finish loading before attempting any fetch.
    // On page refresh, Supabase needs a moment to restore the session from
    // storage. Firing getProperties() before the session is ready causes
    // getAuthToken() to redirect to /?signin=true — which is what was
    // causing the Funnel and Finder to redirect to dashboard on refresh.
    if (authLoading) return;

    // No session means the user isn't logged in — don't fetch
    if (!session) return;

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
  }, [authLoading, session, fetchFromServer]);

  // ── Optimistic update (status / notes / movedToStageAt) ────────────────────
  // Persists to the DB via PATCH /properties/:id.
  // Updates cache and all listeners immediately before the API call resolves.

  const update = useCallback(async (
    id: string,
    data: { status?: string; notes?: string; movedToStageAt?: string }
  ) => {
    if (cache) {
      cache = cache.map(p => p.id === id ? { ...p, ...data } : p);
      notifyListeners(cache);
    }
    await updateProperty(id, data);
  }, []);

  // ── Optimistic local-only update (arbitrary Property fields) ───────────────
  // Use this for actions that call their own API function directly
  // (e.g. reportUnavailable, delistProperty) and only need the local cache
  // updated immediately without going through PATCH /properties/:id.
  //
  // The caller is responsible for firing the API call. If the API call fails,
  // the cache will be corrected on the next TTL refresh (30 seconds).

  const optimisticUpdate = useCallback((id: string, data: Partial<Property>) => {
    if (cache) {
      cache = cache.map(p => p.id === id ? { ...p, ...data } : p);
      notifyListeners(cache);
    }
  }, []);

  return {
    properties,
    loading,
    error,
    refresh: () => fetchFromServer(true),
    update,
    optimisticUpdate,
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Call invalidateCache() after any operation that changes the full property
// list (e.g. a new email arrives and you want to force a fresh fetch).

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
}
