import { useState, useEffect, useCallback } from 'react';
import {
  getSavedFilters,
  createSavedFilter,
  updateSavedFilter,
  deleteSavedFilter,
  SavedFilter,
  CreateSavedFilterDto,
  UpdateSavedFilterDto,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// ─── Module-level cache (same pattern as useProperties) ─────────────────────
let filterCache: SavedFilter[] | null = null;
let filterCacheTimestamp = 0;
const FILTER_CACHE_TTL_MS = 60_000; // re-fetch after 60 seconds
const filterListeners = new Set<(filters: SavedFilter[]) => void>();

function notifyFilterListeners(filters: SavedFilter[]) {
  filterListeners.forEach(fn => fn(filters));
}

export function useSavedFilters() {
  const { session, loading: authLoading } = useAuth();
  const [filters, setFilters] = useState<SavedFilter[]>(filterCache ?? []);
  const [loading, setLoading] = useState(filterCache === null);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (authLoading || !session) return;
    try {
      setError(null);
      const data = await getSavedFilters();
      filterCache = data;
      filterCacheTimestamp = Date.now();
      setFilters(data);
      notifyFilterListeners(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Filter');
    } finally {
      setLoading(false);
    }
  }, [authLoading, session]);

  useEffect(() => {
    filterListeners.add(setFilters);
    return () => { filterListeners.delete(setFilters); };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!session) return;

    const cacheAge = Date.now() - filterCacheTimestamp;
    if (filterCache !== null && cacheAge < FILTER_CACHE_TTL_MS) {
      setFilters(filterCache);
      setLoading(false);
      return;
    }
    fetch();
  }, [authLoading, session, fetch]);

  const create = useCallback(async (dto: CreateSavedFilterDto) => {
    const created = await createSavedFilter(dto);
    filterCache = [created, ...(filterCache ?? [])];
    notifyFilterListeners(filterCache);
    return created;
  }, []);

  const update = useCallback(async (id: string, dto: UpdateSavedFilterDto) => {
    const updated = await updateSavedFilter(id, dto);
    filterCache = (filterCache ?? []).map(f => f.id === id ? updated : f);
    notifyFilterListeners(filterCache);
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteSavedFilter(id);
    filterCache = (filterCache ?? []).filter(f => f.id !== id);
    notifyFilterListeners(filterCache);
  }, []);

  return { filters, loading, error, create, update, remove, refresh: fetch };
}
