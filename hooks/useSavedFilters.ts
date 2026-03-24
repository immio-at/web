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

export function useSavedFilters() {
  const { session, loading: authLoading } = useAuth();
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (authLoading || !session) return;
    try {
      setError(null);
      const data = await getSavedFilters();
      setFilters(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Filter');
    } finally {
      setLoading(false);
    }
  }, [authLoading, session]);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (dto: CreateSavedFilterDto) => {
    const created = await createSavedFilter(dto);
    setFilters(prev => [created, ...prev]);
    return created;
  }, []);

  const update = useCallback(async (id: string, dto: UpdateSavedFilterDto) => {
    const updated = await updateSavedFilter(id, dto);
    setFilters(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteSavedFilter(id);
    setFilters(prev => prev.filter(f => f.id !== id));
  }, []);

  return { filters, loading, error, create, update, remove, refresh: fetch };
}
