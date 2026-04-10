'use client';

/**
 * /settings/filters — Saved Filter management page (ADR-008 F6).
 *
 * Lists every saved filter the user owns, ordered oldest-first per the
 * ADR. Each row offers Edit and Delete. The page-level "New filter"
 * button opens the same FilterModal used by the pill bar `+`. A tier
 * limit indicator shows usage vs cap and disables creation at the cap.
 *
 * No new backend endpoints — uses the existing useSavedFilters() hook
 * and FilterModal. Cross-page sync is automatic via the hook's
 * broadcast pattern.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { SavedFilter } from '@/lib/api';
import FilterModal from '@/components/filters/FilterModal';

// Tier filter caps. Mirrors backend SavedFiltersService rules — keep in
// sync with the backend if tier rules change.
const TIER_LIMITS: Record<string, number> = {
  free: 2,
  light: 12,
  pro: Infinity,
};

function formatLimit(limit: number): string {
  return limit === Infinity ? '∞' : String(limit);
}

function summariseFilter(sf: SavedFilter, t: (k: string) => string): string {
  const parts: string[] = [];

  // Location
  if (sf.postcodes && sf.postcodes.length > 0) {
    if (sf.postcodes.length <= 3) {
      parts.push(sf.postcodes.join(', '));
    } else {
      parts.push(`${sf.postcodes.length} ${t('postcodes')}`);
    }
  } else if (sf.bundeslaender && sf.bundeslaender.length > 0) {
    parts.push(sf.bundeslaender.join(', '));
  }

  // Price range
  if (sf.priceMin != null || sf.priceMax != null) {
    const min = sf.priceMin != null ? `€${(sf.priceMin / 1000).toFixed(0)}k` : '';
    const max = sf.priceMax != null ? `€${(sf.priceMax / 1000).toFixed(0)}k` : '';
    parts.push(`${min}–${max}`);
  }

  // Size range
  if (sf.sizeMin != null || sf.sizeMax != null) {
    const min = sf.sizeMin != null ? `${sf.sizeMin}` : '';
    const max = sf.sizeMax != null ? `${sf.sizeMax}` : '';
    parts.push(`${min}–${max} m²`);
  }

  // Rooms
  if (sf.roomsMin != null || sf.roomsMax != null) {
    const min = sf.roomsMin != null ? `${sf.roomsMin}` : '';
    const max = sf.roomsMax != null ? `${sf.roomsMax}` : '';
    parts.push(`${min}–${max} ${t('rooms')}`);
  }

  return parts.join(' · ') || t('noCriteria');
}

export default function SettingsFiltersPage() {
  const t = useTranslations('settingsFilters');
  const { tier } = useAuth();
  const { filters, loading, remove } = useSavedFilters();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const limit = TIER_LIMITS[tier] ?? TIER_LIMITS.free;
  const used = filters.length;
  const atLimit = used >= limit;

  // Oldest-first per ADR-008
  const sortedFilters = [...filters].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  function openCreate() {
    setModalMode('create');
    setEditingFilter(null);
    setModalOpen(true);
  }

  function openEdit(sf: SavedFilter) {
    setModalMode('edit');
    setEditingFilter(sf);
    setModalOpen(true);
  }

  async function handleDelete(sf: SavedFilter) {
    if (deletingId) return;
    if (!confirm(t('confirmDelete', { name: sf.name }))) return;
    setDeletingId(sf.id);
    try {
      await remove(sf.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb / back link */}
      <Link
        href="/settings"
        className="text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1 mb-3"
      >
        <span>←</span>
        <span>{t('backToSettings')}</span>
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('subtitle')}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-mono uppercase tracking-widest text-gray-400">
            {t('usage')}
          </p>
          <p className={`text-lg font-semibold ${atLimit ? 'text-amber-600' : 'text-gray-900'}`}>
            {used} / {formatLimit(limit)}
          </p>
        </div>
      </div>

      {/* New filter button (or upgrade prompt at limit) */}
      {atLimit ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800 font-medium mb-1">{t('limitReachedTitle')}</p>
          <p className="text-xs text-amber-700">{t('limitReachedHint', { tier })}</p>
        </div>
      ) : (
        <button
          onClick={openCreate}
          className="mb-6 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + {t('newFilter')}
        </button>
      )}

      {/* Filter list */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : sortedFilters.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm text-gray-400">{t('emptyState')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFilters.map(sf => (
            <div
              key={sf.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{sf.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{summariseFilter(sf, t)}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => openEdit(sf)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-gray-200 rounded transition-colors"
                >
                  {t('edit')}
                </button>
                <button
                  onClick={() => handleDelete(sf)}
                  disabled={deletingId === sf.id}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded transition-colors disabled:opacity-50"
                >
                  {deletingId === sf.id ? t('deleting') : t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <FilterModal
        open={modalOpen}
        mode={modalMode}
        editingFilter={editingFilter}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
