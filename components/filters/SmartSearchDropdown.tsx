'use client';

/**
 * SmartSearchDropdown — ADR-024 §6.1. The floating suggestion panel below
 * the smart-search field. Lists the recognised suggestions, then the
 * substring fallback (if any), then a combined "Apply all N" action when
 * more than one suggestion is offered.
 *
 * `position: absolute` so it overlays the criteria rows rather than
 * pushing them down. Dismissal (Escape / click-outside) is owned by the
 * parent `SmartSearchField`.
 */

import { useTranslations } from 'next-intl';
import type { Suggestion } from '@/lib/smart-search/types';
import SmartSearchSuggestion from './SmartSearchSuggestion';

interface Props {
  suggestions: Suggestion[];
  fallback: Suggestion | null;
  onApply: (s: Suggestion) => void;
  onApplyAll: () => void;
}

export default function SmartSearchDropdown({
  suggestions,
  fallback,
  onApply,
  onApplyAll,
}: Props) {
  const t = useTranslations('smartSearch');
  const applyCount = suggestions.length + (fallback ? 1 : 0);

  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[280px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      {suggestions.map((s) => (
        <SmartSearchSuggestion key={s.id} suggestion={s} onApply={onApply} />
      ))}
      {fallback && (
        <SmartSearchSuggestion key={fallback.id} suggestion={fallback} onApply={onApply} />
      )}
      {applyCount > 1 && (
        <button
          type="button"
          onClick={onApplyAll}
          className="mt-1 w-full border-t border-gray-100 px-3 py-1.5 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50"
        >
          {t('applyAll', { count: applyCount })}
        </button>
      )}
    </div>
  );
}
