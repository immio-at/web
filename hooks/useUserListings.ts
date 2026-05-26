import { useState, useEffect, useCallback } from 'react';
import { getUserListings, UserListing, updateProperty } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { pruneOrphanedModalModes } from '@/hooks/useModalMode';
import { pruneOrphanedAnalysisDrafts } from '@/hooks/useAnalysisDraft';

// ─── Module-level cache ───────────────────────────────────────────────────────
// Stored outside the hook so it persists across page navigations.
// All components that call useUserListings share the same cache.
//
// Why module-level and not React context?
// - Simpler: no provider needed, works anywhere in the tree
// - Fast: synchronously available on first render (no useContext lookup)
// - Good enough: single user, single session, data doesn't change between
//   navigations unless the user or a background email triggers it

let cache: UserListing[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 120_000; // re-fetch from server after 2 minutes

// ADR-012 v1.1 PC8 — one-shot localStorage cleanup for orphaned
// `immio.modalMode.{propertyId}` entries. Runs once per app boot after the
// first successful properties fetch, so a property the user dismissed in a
// previous session doesn't leave a stale modal-mode entry behind.
let modalModePruned = false;
// ADR-003 v2.2 / DR6 — same one-shot pattern for analysis-draft entries.
// Cheap, runs on the same fetch trigger.
let analysisDraftsPruned = false;

// Mutation guard — counter + post-mutation cooldown. Prevents an SSE-triggered
// refetch from overwriting an in-flight optimistic patch. The previous
// timestamp-only guard had two real failure modes:
//
//   1. Slow PATCH (>2s on a busy Railway dyno): optimistic patch armed at
//      T=0, guard expires at T=2, an SSE event from any source between
//      T=2 and PATCH-completes lets a refetch through that hasn't yet seen
//      the user's update — the cache gets clobbered with stale data and
//      the funnel card hops back.
//   2. "optimisticUpdate + side-API" callers (handleReportUnavailable,
//      handleDelist, dossier apply field) only marked the optimistic
//      moment, not the duration of their async API call.
//
// Counter pattern handles arbitrary mutation durations. Cooldown bridges the
// micro-gap between the in-flight count dropping to zero and the SSE event
// that the just-completed PATCH triggered.
let inFlightMutations = 0;
let lastMutationCompletedAt = 0;
const POST_MUTATION_COOLDOWN_MS = 5000;

function shouldSkipRefresh(): boolean {
  if (inFlightMutations > 0) return true;
  return Date.now() - lastMutationCompletedAt < POST_MUTATION_COOLDOWN_MS;
}

/** Caller is starting an async mutation. Pair with markMutationEnd in a
 *  finally block. Used for "optimisticUpdate + separate fire-and-forget API
 *  call" patterns where the hook can't wrap the API itself. */
export function markMutationStart() {
  inFlightMutations++;
  lastMutationCompletedAt = Date.now();
}

/** Decrements the in-flight count and arms the post-mutation cooldown so the
 *  next SSE-triggered refresh waits for the backend to settle. */
export function markMutationEnd() {
  inFlightMutations = Math.max(0, inFlightMutations - 1);
  lastMutationCompletedAt = Date.now();
}

/** Optimistic-only mutation (no separate API call to bracket). Just arms the
 *  cooldown — used by `optimisticUpdate` / `optimisticInsert` / `optimisticRemove`. */
function markLocalMutation() {
  lastMutationCompletedAt = Date.now();
}

// Listeners allow multiple mounted components to receive cache updates
// e.g. if Dashboard and Funnel were both mounted simultaneously
const listeners = new Set<(properties: UserListing[]) => void>();

function notifyListeners(properties: UserListing[]) {
  listeners.forEach(fn => fn(properties));
}

// ADR-025 M2b / perf-sweep #73 — progressive page-load against
// GET /user-listings?page=N. Page 1 lands fast (cold Funnel/Dashboard paint),
// then the remaining pages stream in and accumulate so the full-set consumers
// (Funnel kanban, Discover dedup, Recommended scoring, Recently Viewed) still
// converge on the complete list. Each page updates the module cache + notifies
// listeners; `onFirstPage` lets the caller drop its loading state after the
// first window. Returns the fully-accumulated array. (Backend owns the page
// size; the client just walks pages until hasMore is false.)
async function loadUserListingsProgressive(
  onFirstPage?: () => void,
): Promise<UserListing[]> {
  let acc: UserListing[] = [];
  let page = 1;
  for (;;) {
    const res = await getUserListings(page);
    acc = page === 1 ? res.data : acc.concat(res.data);
    cache = acc;
    cacheTimestamp = Date.now();
    notifyListeners(acc);
    if (page === 1) onFirstPage?.();
    if (!res.hasMore) break;
    page++;
  }
  return acc;
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
  // Re-arm the one-shot modal-mode + analysis-draft prunes so the next
  // user's sign-in sweeps any entries the previous user left behind.
  // UUID collisions can't happen, but the pruners remove anything not in
  // the new user's cache so this keeps localStorage tidy.
  modalModePruned = false;
  analysisDraftsPruned = false;
  notifyListeners([]);
}

import { TERMINAL_STAGES } from '@/lib/constants';

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUserListings() {
  const { session, loading: authLoading } = useAuth();

  // Initialise with cache immediately — no loading flash if cache is warm
  const [properties, setProperties] = useState<UserListing[]>(cache ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFromServer = useCallback(async (showLoading: boolean) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      // Progressive page-load: page 1 paints fast (loading off after the
      // first window), the rest stream into the cache so the full-set
      // consumers still converge on everything. loadUserListingsProgressive
      // updates cache + notifies listeners per page.
      const data = await loadUserListingsProgressive(() => {
        setProperties(cache ?? []);
        setLoading(false);
      });
      setProperties(data);

      // PC8 — prune orphaned modal-mode localStorage entries once per
      // app boot. Cheap (no network), runs after we know the full
      // property list, fire-and-forget on failure.
      if (!modalModePruned) {
        modalModePruned = true;
        pruneOrphanedModalModes(new Set(data.map(p => p.id)));
      }
      // DR6 — same pass for analysis-draft entries. The empty
      // validTabKeysByProperty argument means we only clean keys whose
      // property is no longer in the cache (the dominant orphan case);
      // UUID-keyed drafts for deleted analyses are kept and reaped later
      // by the modal's own per-property validation. Tester-phase
      // tradeoff: avoid an extra getAnalyses-per-property fan-out at
      // boot time.
      if (!analysisDraftsPruned) {
        analysisDraftsPruned = true;
        pruneOrphanedAnalysisDrafts(new Set(data.map(p => p.id)), new Map());
      }
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
    // session?.user?.id is stable across token refresh — `session` itself
    // gets a new object reference on every Supabase token rotation, which
    // would re-run this effect on tab focus and reset cached UI state.
  }, [authLoading, session?.user?.id, fetchFromServer]);

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
    const patch: Partial<UserListing> = { ...data };

    if (data.status && !TERMINAL_STAGES.has(data.status)) {
      patch.listingStatus = 'active';
      patch.listingExpiredAt = null;
    }

    // Apply optimistically to cache first
    if (cache) {
      cache = cache.map(p => p.id === id ? { ...p, ...patch } : p);
      notifyListeners(cache);
    }

    // Persist to DB. Counter-bracketed so any SSE refresh racing our own
    // PATCH is suppressed for the full duration of the mutation, regardless
    // of how long Railway takes to respond.
    markMutationStart();
    try {
      await updateProperty(id, data);
    } finally {
      markMutationEnd();
    }
  }, []);

  // ── Optimistic local-only update (arbitrary UserListing fields) ───────────────
  // Use this for actions that call their own API function directly
  // (e.g. reportUnavailable, delistProperty) and only need the local cache
  // updated immediately without going through PATCH /properties/:id.
  //
  // The caller is responsible for firing the API call. If the API call fails,
  // the cache will be corrected on the next TTL refresh (30 seconds).

  const optimisticUpdate = useCallback((id: string, data: Partial<UserListing>) => {
    if (cache) {
      cache = cache.map(p => p.id === id ? { ...p, ...data } : p);
      notifyListeners(cache);
    }
    markLocalMutation();
  }, []);

  // ── Optimistic remove ─────────────────────────────────────────────────────
  // Drop a property from the cache + notify all listeners. Used by the
  // Discover heart re-click-undo path on a just-saved scraped listing —
  // the caller still fires DELETE /properties/:id; this just keeps the UI
  // in sync without waiting for the round-trip.
  const optimisticRemove = useCallback((id: string) => {
    if (cache) {
      cache = cache.filter(p => p.id !== id);
      notifyListeners(cache);
    }
    markLocalMutation();
  }, []);

  // ── Optimistic insert (ADR-010 I6) ────────────────────────────────────────
  // Prepend a brand-new property to the cache and notify all listeners,
  // so a card created via the Add UserListing modal appears in the Funnel /
  // Dashboard / Discover lists instantly without waiting for a refetch.
  // Caller is responsible for the API call — this function only touches
  // the local cache.
  const optimisticInsert = useCallback((property: UserListing) => {
    if (cache) {
      // De-dupe in case the same id was already inserted (e.g. between
      // optimistic insert and a follow-up refresh)
      cache = [property, ...cache.filter(p => p.id !== property.id)];
      notifyListeners(cache);
    }
    markLocalMutation();
  }, []);

  return {
    properties,
    loading,
    error,
    refresh: () => fetchFromServer(true),
    update,
    optimisticUpdate,
    optimisticInsert,
    optimisticRemove,
  };
}

// ─── Cache helpers ────────────────────────────────────────────────────────────
// Call invalidateCache() after any operation that changes the full property
// list (e.g. a new email arrives and you want to force a fresh fetch).

export function invalidateCache() {
  cache = null;
  cacheTimestamp = 0;
}

/**
 * SSE 'properties' handler — refetch in place and notify listeners with the
 * fresh server state.
 *
 * We deliberately DO NOT call notifyListeners([]) here (unlike
 * clearPropertiesCache, which is for sign-out). Doing so wipes every mounted
 * consumer's UI to empty until the refetch completes — on a slow connection
 * that flashes as "properties disappeared" right after an optimistic insert.
 *
 * On fetch failure the cache stays null so the next mount retries.
 */
export async function refreshPropertiesFromServer(): Promise<void> {
  // If a mutation is in-flight or the post-mutation cooldown is active, skip.
  // The cache already reflects authoritative optimistic state and a GET here
  // could land before the backend has fully settled the user's change.
  if (shouldSkipRefresh()) return;
  cacheTimestamp = 0;
  try {
    // Full unbounded fetch (no page arg) — SSE refresh is a post-mutation
    // reconcile where correctness beats first-paint speed, and the guard
    // re-check below relies on a single settled snapshot.
    const data = await getUserListings();
    // Re-check after the GET resolves — a mutation may have started while
    // we were waiting on the network. Replacing cache now would clobber
    // that fresh optimistic patch and the user would see a hop.
    if (shouldSkipRefresh()) return;
    cache = data;
    cacheTimestamp = Date.now();
    notifyListeners(data);
  } catch {
    cache = null;
  }
}

// Prefetch properties into module cache — call during auth init
// so the cache is warm before any page component mounts.
export async function prefetchProperties() {
  if (cache !== null && Date.now() - cacheTimestamp < CACHE_TTL_MS) return;
  try {
    // Progressive page-load — warms the cache fast (page 1) and fills in the
    // rest in the background, same as the hook's own fetch path.
    await loadUserListingsProgressive();
  } catch {
    // Silently ignore — page-level fetch will retry
  }
}
