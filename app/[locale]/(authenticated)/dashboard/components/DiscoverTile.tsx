'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SavedFilter } from '@/lib/api';
import { FilterValues, EMPTY_FILTERS, savedFilterToValues, resolvePostcodes } from '@/components/FilterBar';

export default function DiscoverTile({
  savedFilters,
}: {
  savedFilters: SavedFilter[];
}) {
  const t = useTranslations('dashboard.discoverTile');

  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS);

  function handleFilterSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    if (!id) {
      setSelectedFilterId(null);
      setFilterValues(EMPTY_FILTERS);
      return;
    }
    const sf = savedFilters.find(f => f.id === id);
    if (sf) {
      setSelectedFilterId(id);
      setFilterValues(savedFilterToValues(sf));
    }
  }

  const set = (field: keyof FilterValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFilterValues(prev => ({ ...prev, [field]: e.target.value }));
    setSelectedFilterId(null); // clear saved filter selection when manually editing
  };

  // Build query params for navigation
  function buildQueryString(): string {
    const params = new URLSearchParams();
    const v = filterValues;
    if (v.keyword) params.set('keyword', v.keyword);
    const postcodes = resolvePostcodes(v.location);
    if (postcodes.length) params.set('postcodes', postcodes.join(','));
    if (v.minPrice) params.set('minPrice', v.minPrice);
    if (v.maxPrice) params.set('maxPrice', v.maxPrice);
    if (v.minPricePerSqm) params.set('minPricePerSqm', v.minPricePerSqm);
    if (v.maxPricePerSqm) params.set('maxPricePerSqm', v.maxPricePerSqm);
    if (v.minSize) params.set('minSize', v.minSize);
    if (v.maxSize) params.set('maxSize', v.maxSize);
    if (v.minRooms) params.set('minRooms', v.minRooms);
    if (v.maxRooms) params.set('maxRooms', v.maxRooms);
    if (v.sortBy && v.sortBy !== 'listedDate') params.set('sortBy', v.sortBy);
    if (v.sortOrder && v.sortOrder !== 'desc') params.set('sortOrder', v.sortOrder);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  const inputClass = 'border border-gray-200 rounded px-2.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';
  const labelClass = 'text-xs text-gray-400 font-medium';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-1">{t('title')}</h3>
      <p className="text-sm text-gray-400 mb-4">{t('subtitle')}</p>

      {/* Saved filter selector */}
      {savedFilters.length > 0 && (
        <div className="mb-3">
          <label className={labelClass}>{t('savedFilter')}</label>
          <select
            value={selectedFilterId ?? ''}
            onChange={handleFilterSelect}
            className={`${inputClass} mt-0.5`}
          >
            <option value="">{t('noFilter')}</option>
            {savedFilters.map(sf => (
              <option key={sf.id} value={sf.id}>{sf.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Filter fields */}
      <div className="space-y-2.5 mb-3">
        {/* Keyword + Location */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('keyword')}</label>
            <input type="text" value={filterValues.keyword} onChange={set('keyword')} placeholder={t('keywordPlaceholder')} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('location')}</label>
            <input type="text" value={filterValues.location} onChange={set('location')} placeholder={t('locationPlaceholder')} className={inputClass} />
          </div>
        </div>

        {/* Price */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('priceFrom')}</label>
            <input type="number" value={filterValues.minPrice} onChange={set('minPrice')} placeholder="€ min" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('priceTo')}</label>
            <input type="number" value={filterValues.maxPrice} onChange={set('maxPrice')} placeholder="€ max" className={inputClass} />
          </div>
        </div>

        {/* Size + Rooms */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('size')}</label>
            <div className="flex gap-1">
              <input type="number" value={filterValues.minSize} onChange={set('minSize')} placeholder="min m²" className={inputClass} />
              <input type="number" value={filterValues.maxSize} onChange={set('maxSize')} placeholder="max m²" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>{t('rooms')}</label>
            <div className="flex gap-1">
              <input type="number" value={filterValues.minRooms} onChange={set('minRooms')} placeholder="min" step="0.5" className={inputClass} />
              <input type="number" value={filterValues.maxRooms} onChange={set('maxRooms')} placeholder="max" step="0.5" className={inputClass} />
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons at bottom */}
      <div className="mt-auto space-y-2 pt-3 border-t border-gray-100">
        <Link
          href={`/search${buildQueryString()}`}
          className="flex items-center justify-between w-full px-3 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <span>🔍 {t('searchButton')}</span>
          <span className="text-xs font-normal opacity-80">{t('searchDesc')}</span>
        </Link>
        <Link
          href="/finder?skipModal=true"
          className="flex items-center justify-between w-full px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          <span>🃏 {t('finderButton')}</span>
          <span className="text-xs font-normal text-gray-400">{t('finderDesc')}</span>
        </Link>
      </div>
    </div>
  );
}
