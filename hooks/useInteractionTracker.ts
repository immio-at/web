/**
 * useInteractionTracker
 *
 * Tracks user interactions with both own properties and scraped listings via
 * the backend API. An "interaction" is any engagement: opening the URL,
 * opening the analysis modal, or changing status (excluding not_relevant).
 *
 * Fires POST /properties/:id/interactions for own records, or
 * POST /scraped-listings/:id/interactions for scraped — fire-and-forget,
 * non-blocking. Recently viewed data is fetched via
 * GET /properties/recently-viewed and includes both kinds.
 */

import { useCallback, useRef } from 'react';
import {
  trackInteraction as apiTrackInteraction,
  trackScrapedInteraction as apiTrackScrapedInteraction,
  getRecentlyViewed as apiGetRecentlyViewed,
  RecentlyViewedItem,
} from '@/lib/api';

export type InteractionType = 'view' | 'analysis' | 'url_click' | 'status_change' | 'makler_contact';

export function trackInteraction(propertyId: string, type: InteractionType = 'view') {
  apiTrackInteraction(propertyId, type).catch(() => {
    // Silently ignore tracking failures
  });
}

export function trackScrapedInteraction(scrapedListingId: string, type: InteractionType = 'view') {
  apiTrackScrapedInteraction(scrapedListingId, type).catch(() => {
    // Silently ignore tracking failures
  });
}

export function useInteractionTracker() {
  // Debounce rapid duplicate interactions on the same target (property OR
  // scraped listing) — keyed by source-prefix:id:type to avoid collisions
  // between an own and a scraped row that happen to share an internal id.
  const recentRef = useRef<Map<string, number>>(new Map());

  const track = useCallback((propertyId: string, type: InteractionType = 'view') => {
    const key = `own:${propertyId}:${type}`;
    const now = Date.now();
    const lastTracked = recentRef.current.get(key);
    if (lastTracked && now - lastTracked < 2000) return;
    recentRef.current.set(key, now);
    trackInteraction(propertyId, type);
  }, []);

  const trackScraped = useCallback((scrapedListingId: string, type: InteractionType = 'view') => {
    const key = `scraped:${scrapedListingId}:${type}`;
    const now = Date.now();
    const lastTracked = recentRef.current.get(key);
    if (lastTracked && now - lastTracked < 2000) return;
    recentRef.current.set(key, now);
    trackScrapedInteraction(scrapedListingId, type);
  }, []);

  const getRecentlyViewed = useCallback(
    async (limit: number = 20): Promise<RecentlyViewedItem[]> => {
      try {
        return await apiGetRecentlyViewed(limit);
      } catch {
        return [];
      }
    },
    [],
  );

  return { track, trackScraped, getRecentlyViewed };
}
