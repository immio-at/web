'use client';

import { useTranslations } from 'next-intl';
import { SavedFilter } from '@/lib/api';
import {
  PRESET_FILTERS,
  type PresetFilterKey,
  togglePreset,
} from '@/lib/preset-filters';

export default function PresetFilters({
  active,
  onChange,
  savedFilters,
  activeSavedFilterIds,
  onToggleSavedFilter,
  align = 'left',
}: {
  active: Set<PresetFilterKey>;
  onChange: (next: Set<PresetFilterKey>) => void;
  savedFilters?: SavedFilter[];
  activeSavedFilterIds?: Set<string>;
  onToggleSavedFilter?: (id: string) => void;
  align?: 'left' | 'center';
}) {
  const t = useTranslations('presetFilters');

  function handleToggle(key: PresetFilterKey) {
    onChange(togglePreset(active, key));
  }

  const hasAnySavedActive = activeSavedFilterIds && activeSavedFilterIds.size > 0;
  const hasAnyActive = active.size > 0 || hasAnySavedActive;

  const stageFilters = PRESET_FILTERS.filter(f => f.group === 'stage');
  const stateFilters = PRESET_FILTERS.filter(f => f.group === 'state');
  const sourceFilters = PRESET_FILTERS.filter(f => f.group === 'source');

  function PillButton({ filterKey, labelKey }: { filterKey: PresetFilterKey; labelKey: string }) {
    const isActive = active.has(filterKey);
    return (
      <button
        onClick={() => handleToggle(filterKey)}
        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap ${
          isActive
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {t(labelKey)}
      </button>
    );
  }

  const justify = align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <div className="space-y-1.5 py-2">
      {/* Row 1: Austrian states + source presets + saved filters + clear all */}
      <div className={`flex flex-wrap items-center gap-1.5 ${justify}`}>
        {stateFilters.map(f => (
          <PillButton key={f.key} filterKey={f.key} labelKey={f.labelKey} />
        ))}

        {sourceFilters.length > 0 && (
          <span className="w-px h-5 bg-gray-200 mx-1" />
        )}
        {sourceFilters.map(f => (
          <PillButton key={f.key} filterKey={f.key} labelKey={f.labelKey} />
        ))}

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

      {/* Row 2: Funnel stages */}
      <div className={`flex flex-wrap items-center gap-1.5 ${justify}`}>
        {stageFilters.map(f => (
          <PillButton key={f.key} filterKey={f.key} labelKey={f.labelKey} />
        ))}
      </div>
    </div>
  );
}
