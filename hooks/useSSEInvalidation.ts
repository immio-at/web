'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { clearPropertiesCache } from './useProperties';
import { clearSavedFiltersCache } from './useSavedFilters';
import { clearAnalyticsCache } from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import { clearRecommendedCache } from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://backend-production-e03a.up.railway.app';

const MAX_RECONNECT_DELAY = 30_000;

/**
 * Establishes an SSE connection to the backend's cache invalidation
 * endpoint. When the server emits an event, the corresponding
 * module-level cache is cleared and all mounted hooks refetch.
 *
 * Falls back gracefully to TTL polling when SSE is unavailable
 * (backend not deployed yet, network error, etc.).
 *
 * Reconnects with exponential backoff on error (3s → 6s → 12s → 30s cap).
 */
export function useSSEInvalidation(): void {
  const { session, loading: authLoading } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectDelayRef = useRef(3000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Don't connect until auth is resolved and we have a token
    if (authLoading || !session?.access_token) {
      cleanup();
      return;
    }

    connect(session.access_token);

    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, authLoading]);

  function connect(token: string) {
    cleanup();

    const url = `${API_URL}/cache-invalidation/subscribe?token=${encodeURIComponent(token)}`;

    try {
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event: MessageEvent) => {
        // Heartbeat events have empty data — ignore
        if (!event.data) return;

        try {
          const { type } = JSON.parse(event.data);
          switch (type) {
            case 'properties':
              clearPropertiesCache();
              clearRecommendedCache();
              break;
            case 'saved-filters':
              clearSavedFiltersCache();
              break;
            case 'analytics':
              clearAnalyticsCache();
              break;
          }
        } catch {
          // Malformed event — ignore, TTL fallback handles it
        }
      };

      es.onopen = () => {
        // Reset backoff on successful connection
        reconnectDelayRef.current = 3000;
      };

      es.onerror = () => {
        // Close the broken connection and schedule a reconnect
        es.close();
        eventSourceRef.current = null;
        scheduleReconnect(token);
      };
    } catch {
      // EventSource constructor can throw on invalid URL — fall back to polling
      scheduleReconnect(token);
    }
  }

  function scheduleReconnect(token: string) {
    if (reconnectTimerRef.current) return; // Already scheduled

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      // Double the delay for next time, capped at MAX_RECONNECT_DELAY
      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        MAX_RECONNECT_DELAY,
      );
      connect(token);
    }, reconnectDelayRef.current);
  }

  function cleanup() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }
}
