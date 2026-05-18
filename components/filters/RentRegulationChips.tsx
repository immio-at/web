'use client';

/**
 * RentRegulationChips — ADR-023 R5. Three multi-select chips wired to the
 * `rentRegulationCategory` filter (ADR-022 `Property.rentRegulationCategory`).
 *
 * The UI labels are the familiar colloquial construction-era terms
 * (Altbau / Wiederaufbau / Neubau); the underlying values are *regulatory*
 * (mrg_full / mrg_partial / free) — ADR-022 §7.6. `mrg_unknown` is never
 * a chip (§7.4): properties in the uncertain era are surfaced unfiltered
 * but excluded when any chip is active.
 */

import { useTranslations } from 'next-intl';

// chip key (i18n suffix under `classification.*`) -> regulatory value.
const REGULATION_CHIPS: ReadonlyArray<{ labelKey: string; value: string }> = [
  { labelKey: 'altbau', value: 'mrg_full' },
  { labelKey: 'wiederaufbau', value: 'mrg_partial' },
  { labelKey: 'neubau', value: 'free' },
];

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}

export default function RentRegulationChips({ value, onChange, compact = false }: Props) {
  const t = useTranslations('presetFilters');
  const selected = new Set(value);

  function toggle(v: string) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange([...next]);
  }

  const pill = compact
    ? 'rounded-full px-2 py-0.5 text-[10px] font-medium border'
    : 'rounded-full px-3 py-1 text-xs font-medium border';

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <span className={`${compact ? 'text-[10px] w-24' : 'text-xs w-28'} text-gray-400 font-medium shrink-0 whitespace-nowrap`}>
        {t('classification.label')}
      </span>
      {REGULATION_CHIPS.map(({ labelKey, value: v }) => {
        const isActive = selected.has(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            aria-pressed={isActive}
            className={`${pill} transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`classification.${labelKey}`)}
          </button>
        );
      })}
    </div>
  );
}
