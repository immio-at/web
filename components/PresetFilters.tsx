'use client';

import { useTranslations } from 'next-intl';
import {
  PRESET_FILTERS,
  type PresetFilterKey,
  type PresetGroup,
  togglePreset,
} from '@/lib/preset-filters';

export default function PresetFilters({
  active,
  onChange,
}: {
  active: Set<PresetFilterKey>;
  onChange: (next: Set<PresetFilterKey>) => void;
}) {
  const t = useTranslations('presetFilters');

  function handleToggle(key: PresetFilterKey) {
    onChange(togglePreset(active, key));
  }

  // Group filters for rendering with separators
  const groups: PresetGroup[] = ['source', 'time', 'state'];

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
      {active.size > 0 && (
        <>
          <span className="w-px h-5 bg-gray-200 mx-1" />
          <button
            onClick={() => onChange(new Set())}
            className="text-xs text-gray-400 hover:text-gray-600 px-1"
          >
            {t('clearAll')}
          </button>
        </>
      )}
    </div>
  );
}
