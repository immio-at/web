'use client';

/**
 * FilterModalForm — form fields for create/edit of a saved filter.
 *
 * Field set per ADR-008: title, location, price, price/m², size, rooms,
 * sort. Reuses FilterValues so the existing valuesToSavedFilterDto and
 * passesFilterValues helpers work without translation.
 *
 * No buttons here — the parent FilterModal owns Update/Save/Cancel and
 * the live property count.
 */

import { useTranslations } from 'next-intl';
import type { FilterValues } from '@/components/FilterBar';

interface Props {
  name: string;
  onNameChange: (next: string) => void;
  values: FilterValues;
  onValuesChange: (next: FilterValues) => void;
}

export default function FilterModalForm({ name, onNameChange, values, onValuesChange }: Props) {
  const t = useTranslations('filter');
  const tm = useTranslations('presetFilters');

  const set = (field: keyof FilterValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      onValuesChange({ ...values, [field]: e.target.value });
    };

  const inputClass = 'border border-gray-200 rounded px-2.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';
  const labelClass = 'text-xs text-gray-500 font-medium';

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className={labelClass}>{tm('filterName')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={tm('filterNamePlaceholder')}
          className={inputClass}
        />
      </div>

      {/* Location */}
      <div>
        <label className={labelClass}>{t('location')}</label>
        <input
          type="text"
          value={values.location}
          onChange={set('location')}
          placeholder={t('locationPlaceholder')}
          className={inputClass}
        />
      </div>

      {/* Price */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('priceFrom')}</label>
          <input
            type="number"
            value={values.minPrice}
            onChange={set('minPrice')}
            placeholder={t('priceFromPlaceholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('priceTo')}</label>
          <input
            type="number"
            value={values.maxPrice}
            onChange={set('maxPrice')}
            placeholder={t('priceToPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      {/* Price/m² */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('pricePerSqmFrom')}</label>
          <input
            type="number"
            value={values.minPricePerSqm}
            onChange={set('minPricePerSqm')}
            placeholder={t('pricePerSqmFromPlaceholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('pricePerSqmTo')}</label>
          <input
            type="number"
            value={values.maxPricePerSqm}
            onChange={set('maxPricePerSqm')}
            placeholder={t('pricePerSqmToPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      {/* Size */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('sizeFrom')}</label>
          <input
            type="number"
            value={values.minSize}
            onChange={set('minSize')}
            placeholder={t('sizeFromPlaceholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('sizeTo')}</label>
          <input
            type="number"
            value={values.maxSize}
            onChange={set('maxSize')}
            placeholder={t('sizeToPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      {/* Rooms */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('roomsFrom')}</label>
          <input
            type="number"
            step="0.5"
            value={values.minRooms}
            onChange={set('minRooms')}
            placeholder={t('roomsFromPlaceholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('roomsTo')}</label>
          <input
            type="number"
            step="0.5"
            value={values.maxRooms}
            onChange={set('maxRooms')}
            placeholder={t('roomsToPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      {/* Sort */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{tm('sortBy')}</label>
          <select value={values.sortBy} onChange={set('sortBy')} className={inputClass}>
            <option value="listedDate">{t('sort.listedDate')}</option>
            <option value="price">{t('sort.price')}</option>
            <option value="pricePerSqm">{t('sort.pricePerSqm')}</option>
            <option value="size">{t('sort.size')}</option>
            <option value="rooms">{t('sort.rooms')}</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>{tm('sortOrder')}</label>
          <select value={values.sortOrder} onChange={set('sortOrder')} className={inputClass}>
            <option value="desc">{t('sortDescending')}</option>
            <option value="asc">{t('sortAscending')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
