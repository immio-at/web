/**
 * useInteractionTracker
 *
 * Tracks user interactions with properties via the backend API.
 * An "interaction" is any engagement: opening the URL, opening the analysis modal,
 * or changing status (excluding not_relevant dismiss).
 *
 * Fires POST /properties/:id/interactions — fire-and-forget, non-blocking.
 * Recently viewed data is fetched via GET /properties/recently-viewed.
 */

import { useCallback, useRef } from 'react';
import {
  trackInteraction as apiTrackInteraction,
  getRecentlyViewed as apiGetRecentlyViewed,
  Property,
} from '@/lib/api';

export type InteractionType = 'view' | 'analysis' | 'url_click' | 'status_change';

export function trackInteraction(propertyId: string, type: InteractionType = 'view') {
  // Fire-and-forget — don't block UI on tracking
  apiTrackInteraction(propertyId, type).catch(() => {
    // Silently ignore tracking failures
  });
}

export function useInteractionTracker() {
  // Use ref to debounce rapid duplicate interactions on the same property
  const recentRef = useRef<Map<string, number>>(new Map());

  const track = useCallback((propertyId: string, type: InteractionType = 'view') => {
    // Debounce: skip if same property tracked within last 2 seconds
    const key = `${propertyId}:${type}`;
    const now = Date.now();
    const lastTracked = recentRef.current.get(key);
    if (lastTracked && now - lastTracked < 2000) return;
    recentRef.current.set(key, now);

    trackInteraction(propertyId, type);
  }, []);

  const getRecentlyViewed = useCallback(
    async (limit: number = 20): Promise<Property[]> => {
      try {
        return await apiGetRecentlyViewed(limit);
      } catch {
        return [];
      }
    },
    [],
  );

  return { track, getRecentlyViewed };
}
