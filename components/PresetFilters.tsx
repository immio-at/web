'use client';

import { useTranslations } from 'next-intl';
import { SavedFilter } from '@/lib/api';
import {
  PRESET_FILTERS,
  type PresetFilterKey,
  type PresetGroup,
  togglePreset,
} from '@/lib/preset-filters';

export default function PresetFilters({
  active,
  onChange,
  savedFilters,
  activeSavedFilterIds,
  onToggleSavedFilter,
}: {
  active: Set<PresetFilterKey>;
  onChange: (next: Set<PresetFilterKey>) => void;
  savedFilters?: SavedFilter[];
  activeSavedFilterIds?: Set<string>;
  onToggleSavedFilter?: (id: string) => void;
}) {
  const t = useTranslations('presetFilters');

  function handleToggle(key: PresetFilterKey) {
    onChange(togglePreset(active, key));
  }

  const groups: PresetGroup[] = ['source', 'time', 'state'];
  const hasAnySavedActive = activeSavedFilterIds && activeSavedFilterIds.size > 0;
  const hasAnyActive = active.size > 0 || hasAnySavedActive;

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-2">
      {groups.map((group, gi) => (
        <span key={group} className="contents">
          {gi > 0 && <span className="w-px h-5 bg-gray-200 mx-1" />}
          {PRESET_FILTERS.filter(f => f.group === group).map(f => {
            const isActive = active.has(f.key);
            return (
              <button
                key={f.key}
                onClick={() => handleToggle(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {t(f.labelKey)}
              </button>
            );
          })}
        </span>
      ))}

      {/* Saved filters as amber pills */}
      {savedFilters && savedFilters.length > 0 && onToggleSavedFilter && (
        <>
          <span className="w-px h-5 bg-gray-200 mx-1" />
          {savedFilters.map(sf => {
            const isActive = activeSavedFilterIds?.has(sf.id) ?? false;
            return (
              <button
                key={sf.id}
                onClick={() => onToggleSavedFilter(sf.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap max-w-[140px] truncate ${
                  isActive
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
                title={sf.name}
              >
                {sf.name}
              </button>
            );
          })}
        </>
      )}

      {hasAnyActive && (
        <>
          <span className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={() => {
              onChange(new Set());
              // Clear saved filters by toggling each active one off
              if (activeSavedFilterIds && onToggleSavedFilter) {
                for (const id of activeSavedFilterIds) onToggleSavedFilter(id);
              }
            }}
            className="text-xs text-gray-400 hover:text-gray-600 px-1"
          >
            {t('clearAll')}
          </button>
        </>
      )}
    </div>
  );
}
