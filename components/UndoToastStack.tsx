'use client';

/**
 * UndoToastStack — bottom-left stack of dismiss toasts with an Undo button.
 *
 * Each entry lingers for `durationMs` (default 5s). Entries stack upward so
 * the newest sits at the bottom. The parent owns the list; this component
 * renders + fires onUndo when the user clicks "Rückgängig".
 */

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export interface UndoToastEntry {
  /** Stable id — matches whatever the parent uses to identify the dismissed item. */
  id: string;
  /** Human-readable label (e.g. property title). */
  label: string;
  /** Epoch ms — when this entry was created. Used to auto-expire. */
  createdAt: number;
}

interface Props {
  entries: UndoToastEntry[];
  onUndo: (id: string) => void;
  onExpire: (id: string) => void;
  durationMs?: number;
}

export default function UndoToastStack({ entries, onUndo, onExpire, durationMs = 5000 }: Props) {
  const t = useTranslations('undoToast');

  // Per-entry expiry timers. Each entry gets its own setTimeout keyed to
  // createdAt so the 5-second countdown is stable across re-renders.
  useEffect(() => {
    const timers = entries.map(entry => {
      const remaining = durationMs - (Date.now() - entry.createdAt);
      if (remaining <= 0) {
        onExpire(entry.id);
        return null;
      }
      return setTimeout(() => onExpire(entry.id), remaining);
    });
    return () => {
      for (const t of timers) if (t) clearTimeout(t);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.map(e => e.id).join('|'), durationMs]);

  if (entries.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-col-reverse gap-2 pointer-events-none">
      {entries.map(entry => (
        <div
          key={entry.id}
          className="pointer-events-auto flex items-center gap-3 bg-slate-800 text-white text-sm rounded-lg shadow-lg px-3 py-2 max-w-sm"
        >
          <span className="text-xs opacity-75 whitespace-nowrap">{t('dismissed')}</span>
          <span className="truncate text-xs flex-1 min-w-0" title={entry.label}>
            {entry.label || t('untitled')}
          </span>
          <button
            type="button"
            onClick={() => onUndo(entry.id)}
            className="text-xs font-medium text-teal-300 hover:text-teal-200 whitespace-nowrap"
          >
            {t('undo')}
          </button>
        </div>
      ))}
    </div>
  );
}
