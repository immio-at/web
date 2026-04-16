'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { SavedFilter, CreateSavedFilterDto } from '@/lib/api';
import { resolveBundesland, getPostcodesByBundesland } from '@/lib/austria-plz-bundesland';
import AddPropertyButton from '@/components/ingestion/AddPropertyButton';

// ─── Filter values type ──────────────────────────────────────────────────────

export interface FilterValues {
  keyword: string;
  location: string; // free text: postcodes and/or Bundesland names, comma-separated
  minPrice: string;
  maxPrice: string;
  minPricePerSqm: string;
  maxPricePerSqm: string;
  minSize: string;
  maxSize: string;
  minRooms: string;
  maxRooms: string;
  sortBy: string;
  sortOrder: string;
}

export const EMPTY_FILTERS: FilterValues = {
  keyword: '',
  location: '',
  minPrice: '',
  maxPrice: '',
  minPricePerSqm: '',
  maxPricePerSqm: '',
  minSize: '',
  maxSize: '',
  minRooms: '',
  maxRooms: '',
  sortBy: 'listedDate',
  sortOrder: 'desc',
};

/**
 * Resolve a location string into an array of postcodes.
 * Accepts comma-separated mix of raw postcodes and Bundesland names/abbreviations.
 * e.g. "Wien, 2340, NÖ" → all Wien postcodes + "2340" + all NÖ postcodes
 */
export function resolvePostcodes(location: string): string[] {
  if (!location.trim()) return [];
  const parts = location.split(',').map(s => s.trim()).filter(Boolean);
  const postcodes = new Set<string>();

  for (const part of parts) {
    // Check if it's a raw 4-digit postcode
    if (/^\d{4}$/.test(part)) {
      postcodes.add(part);
      continue;
    }
    // Try resolving as Bundesland
    const blPostcodes = getPostcodesByBundesland(part);
    if (blPostcodes) {
      blPostcodes.forEach(p => postcodes.add(p));
    }
  }
  return Array.from(postcodes);
}

// Convert a SavedFilter from API into FilterValues for the form
export function savedFilterToValues(sf: SavedFilter): FilterValues {
  return {
    keyword: '',
    location: sf.postcodes?.join(', ') ?? '',
    minPrice: sf.priceMin != null ? String(sf.priceMin) : '',
    maxPrice: sf.priceMax != null ? String(sf.priceMax) : '',
    minPricePerSqm: sf.pricePerSqmMin != null ? String(sf.pricePerSqmMin) : '',
    maxPricePerSqm: sf.pricePerSqmMax != null ? String(sf.pricePerSqmMax) : '',
    minSize: sf.sizeMin != null ? String(sf.sizeMin) : '',
    maxSize: sf.sizeMax != null ? String(sf.sizeMax) : '',
    minRooms: sf.roomsMin != null ? String(sf.roomsMin) : '',
    maxRooms: sf.roomsMax != null ? String(sf.roomsMax) : '',
    sortBy: sf.sortBy ?? 'listedDate',
    sortOrder: sf.sortOrder ?? 'desc',
  };
}

// Convert FilterValues to a DTO for creating/updating a saved filter
export function valuesToSavedFilterDto(v: FilterValues, name?: string): CreateSavedFilterDto {
  return {
    name: name || undefined,
    priceMin: v.minPrice ? parseFloat(v.minPrice) : null,
    priceMax: v.maxPrice ? parseFloat(v.maxPrice) : null,
    pricePerSqmMin: v.minPricePerSqm ? parseFloat(v.minPricePerSqm) : null,
    pricePerSqmMax: v.maxPricePerSqm ? parseFloat(v.maxPricePerSqm) : null,
    sizeMin: v.minSize ? parseFloat(v.minSize) : null,
    sizeMax: v.maxSize ? parseFloat(v.maxSize) : null,
    roomsMin: v.minRooms ? parseFloat(v.minRooms) : null,
    roomsMax: v.maxRooms ? parseFloat(v.maxRooms) : null,
    postcodes: resolvePostcodes(v.location),
    sources: ['all'],
    sortBy: v.sortBy || 'listedDate',
    sortOrder: v.sortOrder || 'desc',
  };
}

export function isFilterActive(v: FilterValues): boolean {
  return !!(
    v.keyword || v.location || v.minPrice || v.maxPrice ||
    v.minPricePerSqm || v.maxPricePerSqm || v.minSize || v.maxSize ||
    v.minRooms || v.maxRooms
  );
}

// ─── Sort options ────────────────────────────────────────────────────────────

// ─── Component ───────────────────────────────────────────────────────────────

interface FilterBarProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onSearch: () => void;
  onReset: () => void;
  onSave?: (name: string) => void;
  savedFilters?: SavedFilter[];
  onLoadFilter?: (filter: SavedFilter) => void;
  onDeleteFilter?: (id: string) => void;
  activeFilterId?: string | null;
}

export default function FilterBar({
  values,
  onChange,
  onSearch,
  onReset,
  onSave,
  savedFilters,
  onLoadFilter,
  onDeleteFilter,
  activeFilterId,
}: FilterBarProps) {
  const t = useTranslations('filter');
  const [showSavedDropdown, setShowSavedDropdown] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSavedDropdown(false);
      }
    }
    if (showSavedDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSavedDropdown]);

  useEffect(() => {
    if (showSaveModal) saveInputRef.current?.focus();
  }, [showSaveModal]);

  const set = (field: keyof FilterValues) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => onChange({ ...values, [field]: e.target.value });

  const inputClass = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'text-xs text-gray-500 font-medium';

  function handleSaveSubmit() {
    if (onSave) onSave(saveName.trim());
    setShowSaveModal(false);
    setSaveName('');
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <form onSubmit={e => { e.preventDefault(); onSearch(); }}>

          {/* Line 1: Keyword + Location */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className={labelClass}>{t('keyword')}</label>
              <input
                type="text"
                value={values.keyword}
                onChange={set('keyword')}
                placeholder={t('keywordPlaceholder')}
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className={labelClass}>{t('location')}</label>
              <input
                type="text"
                value={values.location}
                onChange={set('location')}
                placeholder={t('locationPlaceholder')}
                className={`${inputClass} w-full`}
              />
            </div>
          </div>

          {/* Line 2: Price + Price/m² */}
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('priceFrom')}</label>
              <input type="number" value={values.minPrice} onChange={set('minPrice')} placeholder={t('priceFromPlaceholder')} className={`${inputClass} w-36`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('priceTo')}</label>
              <input type="number" value={values.maxPrice} onChange={set('maxPrice')} placeholder={t('priceToPlaceholder')} className={`${inputClass} w-36`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('pricePerSqmFrom')}</label>
              <input type="number" value={values.minPricePerSqm} onChange={set('minPricePerSqm')} placeholder={t('pricePerSqmFromPlaceholder')} className={`${inputClass} w-32`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('pricePerSqmTo')}</label>
              <input type="number" value={values.maxPricePerSqm} onChange={set('maxPricePerSqm')} placeholder={t('pricePerSqmToPlaceholder')} className={`${inputClass} w-32`} />
            </div>
          </div>

          {/* Line 3: Size + Rooms + primary actions (AddProperty + Search) */}
          <div className="flex flex-wrap gap-3 items-end mt-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('sizeFrom')}</label>
              <input type="number" value={values.minSize} onChange={set('minSize')} placeholder={t('sizeFromPlaceholder')} className={`${inputClass} w-28`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('sizeTo')}</label>
              <input type="number" value={values.maxSize} onChange={set('maxSize')} placeholder={t('sizeToPlaceholder')} className={`${inputClass} w-28`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('roomsFrom')}</label>
              <input type="number" value={values.minRooms} onChange={set('minRooms')} placeholder={t('roomsFromPlaceholder')} step="0.5" className={`${inputClass} w-24`} />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>{t('roomsTo')}</label>
              <input type="number" value={values.maxRooms} onChange={set('maxRooms')} placeholder={t('roomsToPlaceholder')} step="0.5" className={`${inputClass} w-24`} />
            </div>

            <div className="flex-1" />

            <AddPropertyButton size="lg" />

            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t('search')}
            </button>
          </div>

          {/* Actions row: Saved-filter selector + secondary buttons */}
          <div className="flex flex-wrap gap-3 items-center mt-3">
            {/* Saved filter selector */}
            {savedFilters && savedFilters.length > 0 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowSavedDropdown(!showSavedDropdown)}
                  className={`${inputClass} text-left truncate flex items-center gap-2 min-w-[140px]`}
                >
                  <span className="truncate text-xs">
                    {activeFilterId
                      ? savedFilters.find(f => f.id === activeFilterId)?.name ?? t('filter')
                      : t('savedFilters')}
                  </span>
                  <span className="text-gray-400 text-xs">▾</span>
                </button>
                {showSavedDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[220px] max-h-64 overflow-y-auto">
                    {savedFilters.map(sf => (
                      <div
                        key={sf.id}
                        className={`flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer ${
                          sf.id === activeFilterId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                        }`}
                      >
                        <span
                          className="truncate flex-1"
                          onClick={() => { onLoadFilter?.(sf); setShowSavedDropdown(false); }}
                        >
                          {sf.name}
                        </span>
                        {onDeleteFilter && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onDeleteFilter(sf.id); }}
                            className="ml-2 text-gray-400 hover:text-red-500 text-xs flex-shrink-0"
                            title={t('deleteTitle')}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {isFilterActive(values) && (
              <button
                type="button"
                onClick={onReset}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t('reset')}
              </button>
            )}

            {onSave && isFilterActive(values) && (
              <button
                type="button"
                onClick={() => setShowSaveModal(true)}
                className="px-4 py-2 text-sm text-teal-600 hover:text-teal-700 hover:bg-teal-50 border border-teal-200 rounded-lg transition-colors"
              >
                {t('saveFilter')}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Save filter modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('saveModal.title')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('saveModal.description')}
            </p>
            <input
              ref={saveInputRef}
              type="text"
              value={saveName}
              onChange={e => setSaveName(e.target.value)}
              placeholder={t('saveModal.placeholder')}
              maxLength={150}
              className={`${inputClass} w-full mb-4`}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveSubmit(); }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowSaveModal(false); setSaveName(''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t('saveModal.cancel')}
              </button>
              <button
                onClick={handleSaveSubmit}
                className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('saveModal.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
