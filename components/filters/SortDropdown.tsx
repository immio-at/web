'use client';

/**
 * SortDropdown — ADR-023 R8. Sort field + direction, inline in the pill
 * bar. Absorbs the standalone `SortControl.tsx` (deleted in C4).
 */

import { useTranslations } from 'next-intl';

const SORT_FIELDS = ['listedDate', 'price', 'pricePerSqm', 'size', 'rooms'] as const;

interface Props {
  sortBy: string;
  sortOrder: string;
  onChange: (next: { sortBy: string; sortOrder: string }) => void;
  compact?: boolean;
}

export default function SortDropdown({ sortBy, sortOrder, onChange, compact = false }: Props) {
  const t = useTranslations('presetFilters');

  const select = `${
    compact ? 'text-[10px] py-0.5 px-1.5' : 'text-xs py-1 px-2'
  } border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500`;

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <span className={`${compact ? 'text-[10px] w-24' : 'text-xs w-28'} text-gray-400 font-medium shrink-0 whitespace-nowrap`}>
        {t('sortLabel')}
      </span>
      <select
        value={sortBy}
        onChange={(e) => onChange({ sortBy: e.target.value, sortOrder })}
        className={select}
        aria-label={t('sortLabel')}
      >
        {SORT_FIELDS.map((f) => (
          <option key={f} value={f}>
            {t(`sortField.${f}`)}
          </option>
        ))}
      </select>
      <select
        value={sortOrder}
        onChange={(e) => onChange({ sortBy, sortOrder: e.target.value })}
        className={select}
        aria-label={t('sortDirection')}
      >
        <option value="desc">{t('sortDesc')}</option>
        <option value="asc">{t('sortAsc')}</option>
      </select>
    </div>
  );
}
