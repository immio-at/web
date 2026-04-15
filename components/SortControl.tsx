'use client';

import { useTranslations } from 'next-intl';

export const SORT_OPTIONS = [
  { value: 'listedDate', labelKey: 'sort.listedDate' as const },
  { value: 'price', labelKey: 'sort.price' as const },
  { value: 'pricePerSqm', labelKey: 'sort.pricePerSqm' as const },
  { value: 'size', labelKey: 'sort.size' as const },
  { value: 'rooms', labelKey: 'sort.rooms' as const },
];

interface Props {
  sortBy: string;
  sortOrder: 'asc' | 'desc' | string;
  onChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  className?: string;
}

/**
 * Standalone sort control (ADR-013 follow-up).
 *
 * Pulled out of FilterBar so it can sit prominently above listing grids
 * and inside full-screen flows like Finder. Changes fire `onChange`
 * immediately — pages auto-refresh results without a Search click.
 */
export default function SortControl({ sortBy, sortOrder, onChange, className = '' }: Props) {
  const t = useTranslations('filterBar');
  const order: 'asc' | 'desc' = sortOrder === 'asc' ? 'asc' : 'desc';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <label className="text-xs font-medium text-gray-500">{t('sortLabel')}</label>
      <select
        value={sortBy}
        onChange={e => onChange(e.target.value, order)}
        className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onChange(sortBy, order === 'asc' ? 'desc' : 'asc')}
        title={order === 'asc' ? t('sortAscending') : t('sortDescending')}
        aria-label={order === 'asc' ? t('sortAscending') : t('sortDescending')}
        className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        {order === 'asc' ? '↑' : '↓'}
      </button>
    </div>
  );
}
