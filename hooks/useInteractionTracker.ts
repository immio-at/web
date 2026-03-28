/**
 * useInteractionTracker
 *
 * Tracks user interactions with properties in localStorage.
 * An "interaction" is any engagement: opening the URL, opening the analysis modal,
 * changing status, reporting unavailable, etc.
 *
 * Stores: { [propertyId]: { count: number, lastInteractedAt: number (epoch ms) } }
 *
 * Tech debt: migrate to backend table for cross-device persistence.
 */

import { useCallback, useRef } from 'react';

const STORAGE_KEY = 'immio_property_interactions';

interface InteractionRecord {
  count: number;
  lastInteractedAt: number;
}

type InteractionMap = Record<string, InteractionRecord>;

function loadInteractions(): InteractionMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveInteractions(data: InteractionMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function trackInteraction(propertyId: string) {
  const data = loadInteractions();
  const existing = data[propertyId];
  data[propertyId] = {
    count: (existing?.count ?? 0) + 1,
    lastInteractedAt: Date.now(),
  };
  saveInteractions(data);
}

export function getRecentlyInteracted(limit: number = 15): string[] {
  const data = loadInteractions();
  return Object.entries(data)
    .sort(([, a], [, b]) => b.lastInteractedAt - a.lastInteractedAt)
    .slice(0, limit)
    .map(([id]) => id);
}

export function getMostInteracted(limit: number = 15): string[] {
  const data = loadInteractions();
  return Object.entries(data)
    .filter(([, r]) => r.count > 1) // only show properties interacted with more than once
    .sort(([, a], [, b]) => b.count - a.count || b.lastInteractedAt - a.lastInteractedAt)
    .slice(0, limit)
    .map(([id]) => id);
}

export function useInteractionTracker() {
  // Use ref to avoid re-renders on every interaction
  const dataRef = useRef<InteractionMap>(loadInteractions());

  const track = useCallback((propertyId: string) => {
    trackInteraction(propertyId);
    dataRef.current = loadInteractions();
  }, []);

  const getRecent = useCallback((limit: number = 15) => getRecentlyInteracted(limit), []);
  const getMost = useCallback((limit: number = 15) => getMostInteracted(limit), []);

  return { track, getRecent, getMost };
}
