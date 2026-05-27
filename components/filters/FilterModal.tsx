'use client';

/**
 * FilterModal — create / edit a saved filter (ADR-008 F3).
 *
 * Modes:
 *   - create: empty form, "Save as New + Apply" button only
 *   - edit:   pre-filled from `editingFilter`, both "Update + Apply"
 *             and "Save as New + Apply" buttons
 *
 * Live count (debounced 400ms): own properties matching the form +
 * public listings total returned by GET /listings with the
 * same criteria. Updates as the user types.
 *
 * On success, calls `onApply(filter)` with the created/updated record.
 * The parent decides what apply means (activate active filter ID set,
 * or populate dashboard tile fields).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SavedFilter, getScrapedListings } from '@/lib/api';
import {
  EMPTY_FILTERS,
  FilterValues,
  savedFilterToValues,
  valuesToSavedFilterDto,
  resolvePostcodes,
} from '@/lib/filter-values';
import { passesFilterValues } from '@/lib/preset-filters';
import { PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';
import { useUserListings } from '@/hooks/useUserListings';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import FilterModalForm from './FilterModalForm';

// ADR-023 R4/R5 — chip labels stay colloquial German in both locales
// (these are Austrian terms of art — ADR-022 §12 / ADR-023 §1.1).
const TYPE_LABELS: Record<string, string> = {
  wohnung: 'Wohnung',
  haus: 'Haus',
  zinshaus: 'Zinshaus',
  gewerbe: 'Gewerbe',
  grundstueck: 'Grundstück',
  garage: 'Garage',
};
const REGULATION_LABELS: Record<string, string> = {
  mrg_full: 'Altbau',
  mrg_partial: 'Wiederaufbau',
  free: 'Neubau',
};

// Format a min/max pair into "a – b" / "ab a" / "bis b" (or '' when empty).
function fmtRange(min: string, max: string, unit: string, suffix = ''): string {
  const a = min ? `${unit}${min}${suffix}` : '';
  const b = max ? `${unit}${max}${suffix}` : '';
  if (a && b) return `${a} – ${b}`;
  if (a) return `ab ${a}`;
  if (b) return `bis ${b}`;
  return '';
}

/**
 * Read-only summary of every active filter criterion carried into the
 * saved filter (ADR-023 §6.1 "Kriterien (Übersicht)"). Renders nothing
 * when no criterion is set.
 */
function FilterCriteriaSummary({
  values,
  t,
}: {
  values: FilterValues;
  t: ReturnType<typeof useTranslations>;
}) {
  const rows: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string) => {
    if (value) rows.push({ label, value });
  };

  push(t('rangePrice'), fmtRange(values.minPrice, values.maxPrice, '€'));
  push(t('rangePricePerSqm'), fmtRange(values.minPricePerSqm, values.maxPricePerSqm, '€', '/m²'));
  push(t('rangeSize'), fmtRange(values.minSize, values.maxSize, '', ' m²'));
  push(t('rangeRooms'), fmtRange(values.minRooms, values.maxRooms, '', ' Zi.'));
  push(t('postcodeLabel'), values.location);
  if (values.propertyType.length > 0) {
    push(t('summaryPropertyType'), values.propertyType.map((v) => TYPE_LABELS[v] ?? v).join(', '));
  }
  if (values.rentRegulationCategory.length > 0) {
    push(
      t('summaryRentRegulation'),
      values.rentRegulationCategory.map((v) => REGULATION_LABELS[v] ?? v).join(', '),
    );
  }
  if (values.tomMaxDays) {
    push(t('summaryTom'), t('summaryTomValue', { days: values.tomMaxDays }));
  }

  if (rows.length === 0) {
    return (
      <p className="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-400 italic">
        {t('noCriteria')}
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-3">
      <p className="text-xs font-medium text-gray-500 mb-1.5">{t('furtherCriteria')}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.label} className="text-sm text-gray-700 flex gap-2">
            <span className="text-gray-400">{r.label}:</span>
            <span>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  editingFilter?: SavedFilter | null;
  /** Pre-fill form values in create mode (ADR-013 FU4). Ignored in edit mode. */
  initialValues?: FilterValues | null;
  onClose: () => void;
  onApply?: (filter: SavedFilter, isNew: boolean) => void;
}

export default function FilterModal({ open, mode, editingFilter, initialValues, onClose, onApply }: Props) {
  const t = useTranslations('presetFilters');
  const { properties } = useUserListings();
  const { create, update } = useSavedFilters();

  const [name, setName] = useState('');
  const [values, setValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live count state
  const [scrapedTotal, setScrapedTotal] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    if (mode === 'edit' && editingFilter) {
      setName(editingFilter.name);
      setValues(savedFilterToValues(editingFilter));
    } else {
      setName('');
      setValues(initialValues ?? EMPTY_FILTERS);
    }
  }, [open, mode, editingFilter, initialValues]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ── Own property count — instant from cached useUserListings() ─────────────
  const ownCount = useMemo(() => {
    return properties.filter(p => {
      if (p.status === 'not_relevant' || p.status === 'delisted') return false;
      return passesFilterValues(p, values);
    }).length;
  }, [properties, values]);

  // ── Public-listing count — debounced fetch from GET /listings ──────────
  useEffect(() => {
    if (!open) return;
    setCountLoading(true);
    const handle = setTimeout(async () => {
      try {
        const params: Record<string, unknown> = {
          page: 1,
          hideNullPrice: true,
        };
        const postcodes = resolvePostcodes(values.location);
        if (postcodes.length) params.postcodes = postcodes;
        if (values.minPrice) params.minPrice = parseFloat(values.minPrice);
        if (values.maxPrice) params.maxPrice = parseFloat(values.maxPrice);
        if (values.minPricePerSqm) params.minPricePerSqm = parseFloat(values.minPricePerSqm);
        if (values.maxPricePerSqm) params.maxPricePerSqm = parseFloat(values.maxPricePerSqm);
        if (values.minSize) params.minSize = parseFloat(values.minSize);
        if (values.maxSize) params.maxSize = parseFloat(values.maxSize);
        if (values.minRooms) params.minRooms = parseFloat(values.minRooms);
        if (values.maxRooms) params.maxRooms = parseFloat(values.maxRooms);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await getScrapedListings(params as any);
        setScrapedTotal(data.total);
      } catch {
        setScrapedTotal(null);
      } finally {
        setCountLoading(false);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [open, values]);

  const totalCount = ownCount + (scrapedTotal ?? 0);

  // ── Submit handlers ──────────────────────────────────────────────────────
  async function handleSaveAsNew() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await create(valuesToSavedFilterDto(values, name.trim() || undefined));
      onApply?.(created, true);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('FILTER_LIMIT_REACHED') ? t('filterLimitReached') : msg || t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate() {
    if (submitting || !editingFilter) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await update(editingFilter.id, valuesToSavedFilterDto(values, name.trim() || undefined));
      onApply?.(updated, false);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 31, 61, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-start justify-between border-b border-gray-100">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">IMMIO</p>
            <h2 className="text-xl font-semibold text-gray-900">
              {mode === 'edit' ? t('editFilterTitle') : t('createFilterTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        {/* Form body — scrollable */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {/* ADR-023 §6 — when the pill bar is the filter UI the modal is a
              naming-only dialog: a name field plus a read-only summary of
              the criteria the pill bar already holds. While the flag is off
              the legacy configuration form (FilterModalForm) is shown. */}
          {PILL_BAR_ONLY_FILTERS ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {t('nameLabel')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                placeholder={t('namePlaceholder')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <FilterCriteriaSummary values={values} t={t} />
            </div>
          ) : (
            <>
              <FilterModalForm
                name={name}
                onNameChange={setName}
                values={values}
                onValuesChange={setValues}
              />
              {/* ADR-022 — the chip criteria (type / regulation / TOM) are
                  set on the pill bar, not in this form; surface them so the
                  user sees the full filter they are about to save. */}
              <FilterCriteriaSummary values={values} t={t} />
            </>
          )}
        </div>

        {/* Footer — live count + action buttons */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{t('liveCountLabel')}</span>
            <span className="font-semibold text-gray-900">
              {countLoading && scrapedTotal === null ? '…' : `${totalCount.toLocaleString('de-AT')} ${t('matches')}`}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
            <div className="flex-1" />
            {mode === 'edit' && (
              <button
                onClick={handleUpdate}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? t('saving') : t('updateAndApply')}
              </button>
            )}
            <button
              onClick={handleSaveAsNew}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? t('saving') : t('saveAsNewAndApply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
