'use client';

/**
 * TomFilter — ADR-023 R7. Time-on-market threshold chips.
 *
 * TOM is one-sided (the user asks for "fresh listings", not a range), so
 * this is a single-select chip row, not a slider (ADR-023 §3.1). The
 * `≥120d` stale-listings chip is deferred along with `tomMinDays`
 * (ADR-022 saved-filter scope) — only the `≤Nd` "fresh" direction ships.
 *
 * `value` is the max-age threshold in days as a string ('' = no filter).
 */

import { useTranslations } from 'next-intl';

const THRESHOLDS = ['14', '30', '60'] as const;

interface Props {
  /** Max-age in days ('' = All). */
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}

export default function TomFilter({ value, onChange, compact = false }: Props) {
  const t = useTranslations('presetFilters');

  const pill = compact
    ? 'rounded-full px-2 py-0.5 text-[10px] font-medium border'
    : 'rounded-full px-3 py-1 text-xs font-medium border';

  function chip(key: string, label: string, isActive: boolean) {
    return (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={isActive}
        className={`${pill} transition-colors whitespace-nowrap ${
          isActive
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <span className={`${compact ? 'text-[10px] w-24' : 'text-xs w-28'} text-gray-400 font-medium shrink-0 whitespace-nowrap`}>
        {t('tomLabel')}
      </span>
      {/* 'All' is the empty-string value — clears the filter. */}
      {chip('', t('tomAll'), value === '')}
      {THRESHOLDS.map((d) => chip(d, t('tomThreshold', { days: d }), value === d))}
    </div>
  );
}
