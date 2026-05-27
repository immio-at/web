'use client';

/**
 * useModalMode — per-property modal-mode memory (ADR-012 v1.1, PC7+PC8).
 *
 * Persists the user's last-used PropertyAnalysisModal mode (Analysen vs
 * Objektdaten/Dossier) per property in localStorage so reopening the same
 * property restores the user's last choice.
 *
 * Resolution order on mount:
 *   1. localStorage entry for this propertyId  →  use it
 *   2. caller-supplied initialViewMode prop    →  first-time default override
 *      (used by ADR-010's post-submit flow to put new properties into
 *      Objektdaten by default)
 *   3. fallback                                →  'dossier' (Objektdaten)
 *
 * The stored value is the internal discriminant ('analyses' | 'dossier'),
 * NOT the localised label. Switching the UI language must not invalidate
 * the user's stored mode.
 *
 * All localStorage access is wrapped in try/catch — Safari private mode
 * and exotic browsers can throw on access. Failures degrade silently
 * (in-memory state still works; just no persistence).
 */

import { useCallback, useState } from 'react';

export type ModalMode = 'analyses' | 'dossier';

const STORAGE_PREFIX = 'immio.modalMode.';

function storageKey(propertyId: string): string {
  return STORAGE_PREFIX + propertyId;
}

function readStored(propertyId: string): ModalMode | null {
  try {
    const raw = localStorage.getItem(storageKey(propertyId));
    if (raw === 'analyses' || raw === 'dossier') return raw;
    return null;
  } catch {
    return null;
  }
}

function writeStored(propertyId: string, mode: ModalMode): void {
  try {
    localStorage.setItem(storageKey(propertyId), mode);
  } catch {
    // Safari private mode / quota / SecurityError — ignore.
  }
}

/**
 * Returns `[mode, setMode]`. `setMode` updates state AND writes to
 * localStorage synchronously, so subsequent opens of the same property
 * restore the choice.
 */
export function useModalMode(
  propertyId: string,
  initialViewMode?: ModalMode,
): [ModalMode, (next: ModalMode) => void] {
  // Lazy initial state — read localStorage exactly once on mount.
  const [mode, setModeState] = useState<ModalMode>(() => {
    const stored = readStored(propertyId);
    if (stored) return stored;
    if (initialViewMode) return initialViewMode;
    return 'dossier';
  });

  const setMode = useCallback(
    (next: ModalMode) => {
      setModeState(next);
      writeStored(propertyId, next);
    },
    [propertyId],
  );

  return [mode, setMode];
}

/**
 * Best-effort cleanup of orphaned localStorage entries (PC8). Pass the
 * set of currently-known propertyIds; any `immio.modalMode.{id}` key
 * whose id is absent from the set is removed. Fire-and-forget — runs
 * once per app boot from `useUserListings` after the first successful
 * fetch.
 */
export function pruneOrphanedModalModes(activePropertyIds: Set<string>): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      const id = key.slice(STORAGE_PREFIX.length);
      if (!activePropertyIds.has(id)) toRemove.push(key);
    }
    for (const key of toRemove) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    }
  } catch {
    // localStorage unavailable — nothing to prune.
  }
}
