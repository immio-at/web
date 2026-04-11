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
const CACHE_TTL_MS = 120_000; // re-fetch from server after 2 minutes

// Listeners allow multiple mounted components to receive cache updates
// e.g. if Dashboard and Funnel were both mounted simultaneously
const listeners = new Set<(properties: Property[]) => void>();

function notifyListeners(properties: Property[]) {
  listeners.forEach(fn => fn(properties));
}

/**
 * Wipe the properties cache and notify all subscribed components with an
 * empty array. Called by AuthContext on sign-out and on any session userId
 * change to prevent the previous user's data from leaking into the next
 * user's session.
 */
export function clearPropertiesCache(): void {
  cache = null;
  cacheTimestamp = 0;
  notifyListeners([]);
}

import { TERMINAL_STAGES } from '@/lib/constants';

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
  // Updates cache and all listeners immediately, then persists to the DB.
  //
  // Mirrors the backend business rule: if the new status is not a terminal
  // stage, listingStatus is reset to 'active' and listingExpiredAt is cleared.
  // This means the "Nicht mehr verfügbar" badge disappears instantly when the
  // user moves a property back into any active funnel stage.

  const update = useCallback(async (
    id: string,
    data: { status?: string; notes?: string; movedToStageAt?: string }
  ) => {
    // Build the optimistic patch — mirrors what the backend will do
    const patch: Partial<Property> = { ...data };

    if (data.status && !TERMINAL_STAGES.has(data.status)) {
      patch.listingStatus = 'active';
      patch.listingExpiredAt = null;
    }

    // Apply optimistically to cache first
    if (cache) {
      cache = cache.map(p => p.id === id ? { ...p, ...patch } : p);
      notifyListeners(cache);
    }

    // Persist to DB
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

  // ── Optimistic insert (ADR-010 I6) ────────────────────────────────────────
  // Prepend a brand-new property to the cache and notify all listeners,
  // so a card created via the Add Property modal appears in the Funnel /
  // Dashboard / Discover lists instantly without waiting for a refetch.
  // Caller is responsible for the API call — this function only touches
  // the local cache.
  const optimisticInsert = useCallback((property: Property) => {
    if (cache) {
      // De-dupe in case the same id was already inserted (e.g. between
      // optimistic insert and a follow-up refresh)
      cache = [property, ...cache.filter(p => p.id !== property.id)];
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
    optimisticInsert,
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Call invalidateCache() after any operation that changes the full property
// list (e.g. a new email arrives and you want to force a fresh fetch).

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
}

// Prefetch properties into module cache — call during auth init
// so the cache is warm before any page component mounts.
export async function prefetchProperties() {
  if (cache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;
  try {
    const data = await getProperties();
    cache = data;
    cacheTimestamp = Date.now();
    notifyListeners(data);
  } catch {
    // Silently ignore — page-level fetch will retry
  }
}
