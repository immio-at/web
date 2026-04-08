'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Property, SavedFilter } from '@/lib/api';
import { FilterValues, EMPTY_FILTERS, savedFilterToValues, resolvePostcodes } from '@/components/FilterBar';
import { type PresetFilterKey, PRESET_FILTERS, togglePreset, passesPresetFilters } from '@/lib/preset-filters';

export default function DiscoverTile({
  savedFilters,
  properties,
}: {
  savedFilters: SavedFilter[];
  properties: Property[];
}) {
  const t = useTranslations('dashboard.discoverTile');
  const tp = useTranslations('presetFilters');

  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(new Set());

  function toggleSavedFilter(id: string) {
    setActiveSavedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const set = (field: keyof FilterValues) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setFilterValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  // ── Live count: how many of user's properties match current filters ──
  const matchCount = useMemo(() => {
    return properties.filter(p => {
      // Exclude terminal
      if (p.status === 'not_relevant' || p.status === 'delisted') return false;

      // Preset filters
      if (activePresets.size > 0 && !passesPresetFilters(p, activePresets)) return false;

      // Saved filter criteria (OR across selected saved filters, AND with presets)
      if (activeSavedFilterIds.size > 0) {
        const matchesAnySaved = Array.from(activeSavedFilterIds).some(id => {
          const sf = savedFilters.find(f => f.id === id);
          if (!sf) return false;
          const v = savedFilterToValues(sf);
          return passesFilterValues(p, v);
        });
        if (!matchesAnySaved) return false;
      }

      // Form field filters
      if (!passesFilterValues(p, filterValues)) return false;

      return true;
    }).length;
  }, [properties, activePresets, activeSavedFilterIds, savedFilters, filterValues]);

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

  const hasAnyFilter = activePresets.size > 0 || activeSavedFilterIds.size > 0 ||
    !!filterValues.keyword || !!filterValues.location ||
    !!filterValues.minPrice || !!filterValues.maxPrice ||
    !!filterValues.minSize || !!filterValues.maxSize ||
    !!filterValues.minRooms || !!filterValues.maxRooms;

  const inputClass = 'border border-gray-200 rounded px-2.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';
  const labelClass = 'text-xs text-gray-400 font-medium';

  // Preset + saved filter pill groups
  const presetGroups = [
    { key: 'source', items: PRESET_FILTERS.filter(f => f.group === 'source') },
    { key: 'time', items: PRESET_FILTERS.filter(f => f.group === 'time') },
    { key: 'state', items: PRESET_FILTERS.filter(f => f.group === 'state') },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-1">{t('title')}</h3>
      <p className="text-sm text-gray-400 mb-3">{t('subtitle')}</p>

      {/* Preset + Saved filter pills */}
      <div className="flex flex-wrap items-center gap-1 mb-3">
        {presetGroups.map((group, gi) => (
          <span key={group.key} className="contents">
            {gi > 0 && <span className="w-px h-4 bg-gray-200 mx-0.5" />}
            {group.items.map(f => {
              const isActive = activePresets.has(f.key);
              return (
                <button
                  key={f.key}
                  onClick={() => setActivePresets(togglePreset(activePresets, f.key))}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {tp(f.labelKey)}
                </button>
              );
            })}
          </span>
        ))}

        {/* Saved filters as pills */}
        {savedFilters.length > 0 && (
          <>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            {savedFilters.map(sf => {
              const isActive = activeSavedFilterIds.has(sf.id);
              return (
                <button
                  key={sf.id}
                  onClick={() => toggleSavedFilter(sf.id)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium border transition-colors whitespace-nowrap max-w-[120px] truncate ${
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
      </div>

      {/* Filter fields */}
      <div className="space-y-2 mb-3">
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
          {hasAnyFilter ? (
            <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">
              {matchCount} {t('matchCount')}
            </span>
          ) : (
            <span className="text-xs font-normal opacity-80">{t('searchDesc')}</span>
          )}
        </Link>
        <Link
          href={`/finder?skipModal=true${buildQueryString().replace('?', '&')}`}
          className="flex items-center justify-between w-full px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
        >
          <span>🃏 {t('finderButton')}</span>
          <span className="text-xs font-normal text-gray-400">{t('finderDesc')}</span>
        </Link>
      </div>
    </div>
  );
}

// ── Helper: check if a property passes FilterValues criteria ──
function passesFilterValues(p: Property, v: FilterValues): boolean {
  const price = p.price ? parseFloat(String(p.price)) : null;
  const size = p.sizeSqm ?? null;
  const rooms = p.rooms ? parseFloat(String(p.rooms)) : null;

  if (v.keyword) {
    const kw = v.keyword.toLowerCase();
    const title = (p.title ?? '').toLowerCase();
    const location = (p.location ?? '').toLowerCase();
    if (!title.includes(kw) && !location.includes(kw)) return false;
  }
  if (v.minPrice && price != null && price < parseFloat(v.minPrice)) return false;
  if (v.maxPrice && price != null && price > parseFloat(v.maxPrice)) return false;
  if (v.minSize && size != null && size < parseFloat(v.minSize)) return false;
  if (v.maxSize && size != null && size > parseFloat(v.maxSize)) return false;
  if (v.minRooms && rooms != null && rooms < parseFloat(v.minRooms)) return false;
  if (v.maxRooms && rooms != null && rooms > parseFloat(v.maxRooms)) return false;

  const postcodes = resolvePostcodes(v.location);
  if (postcodes.length > 0 && (!p.zipCode || !postcodes.includes(p.zipCode))) return false;

  return true;
}
