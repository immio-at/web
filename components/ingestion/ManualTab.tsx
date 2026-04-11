'use client';

/**
 * ManualTab — minimal property form for manual entry (ADR-010 I5).
 *
 * Seven optional fields (no required). The user can create a record
 * with just a title — the Dossier tab can be enriched later via
 * inline editing. This tab owns its own form values and exposes them
 * to the parent via the `values` + `onChange` props.
 */

import { useTranslations } from 'next-intl';

export interface ManualFormValues {
  title: string;
  price: string;
  sizeSqm: string;
  rooms: string;
  location: string;
  zipCode: string;
  notes: string;
}

export const EMPTY_MANUAL_FORM: ManualFormValues = {
  title: '',
  price: '',
  sizeSqm: '',
  rooms: '',
  location: '',
  zipCode: '',
  notes: '',
};

interface Props {
  values: ManualFormValues;
  onChange: (values: ManualFormValues) => void;
}

export default function ManualTab({ values, onChange }: Props) {
  const t = useTranslations('addProperty.manualTab');

  const set = (field: keyof ManualFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange({ ...values, [field]: e.target.value });
    };

  const inputClass = 'w-full border border-gray-200 rounded px-2.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400';
  const labelClass = 'text-xs text-gray-500 font-medium block mb-1';

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>{t('title')}</label>
        <input
          type="text"
          value={values.title}
          onChange={set('title')}
          placeholder={t('titlePlaceholder')}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('price')}</label>
          <input
            type="number"
            value={values.price}
            onChange={set('price')}
            placeholder="€"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('sizeSqm')}</label>
          <input
            type="number"
            value={values.sizeSqm}
            onChange={set('sizeSqm')}
            placeholder="m²"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t('rooms')}</label>
          <input
            type="number"
            step="0.5"
            value={values.rooms}
            onChange={set('rooms')}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>{t('zipCode')}</label>
          <input
            type="text"
            value={values.zipCode}
            onChange={set('zipCode')}
            placeholder="1010"
            className={inputClass}
          />
        </div>
      </div>

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

      <div>
        <label className={labelClass}>{t('notes')}</label>
        <textarea
          value={values.notes}
          onChange={set('notes')}
          rows={3}
          className={inputClass}
        />
      </div>
    </div>
  );
}
