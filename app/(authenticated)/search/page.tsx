'use client';

import { useState, useEffect, useCallback } from 'react';
import { getScrapedListings, saveScrapedListing, ScrapedListing, SavedFilter } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { invalidateCache } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import FilterBar, {
  FilterValues,
  EMPTY_FILTERS,
  savedFilterToValues,
  valuesToSavedFilterDto,
  isFilterActive,
} from '@/components/FilterBar';

// ─── Platform display names ───────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  raiffeisen: 'Raiffeisen',
  sreal: 's REAL',
  oerag: 'ÖRAG',
  remax: 'RE/MAX',
};

function platformLabel(platform: string) {
  return PLATFORM_LABELS[platform] ?? platform;
}

// ─── Price formatter ──────────────────────────────────────────────────────────

function formatPrice(price: number | null) {
  if (!price) return null;
  return '€ ' + Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatPricePerSqm(price: number | null, size: number | null) {
  if (!price || !size || size <= 0) return null;
  const ppsm = Math.round(price / size);
  return '€ ' + ppsm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '/m²';
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({
  listing,
  onSave,
  saving,
}: {
  listing: ScrapedListing;
  onSave: (listing: ScrapedListing) => void;
  saving: boolean;
}) {
  const priceText = formatPrice(listing.price ? parseFloat(String(listing.price)) : null);
  const ppsmText = formatPricePerSqm(
    listing.price ? parseFloat(String(listing.price)) : null,
    listing.sizeSqm ? parseFloat(String(listing.sizeSqm)) : null,
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Image */}
      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className="block relative h-48 bg-gray-100 overflow-hidden flex-shrink-0">
        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt={listing.title ?? ''}
            className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-4xl text-gray-300">🏠</div>
        )}
        {/* Platform badge */}
        <span className="absolute top-2 left-2 bg-white/90 text-gray-700 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-gray-200">
          {platformLabel(listing.platform)}
        </span>
      </a>

      {/* Details */}
      <div className="p-4 flex flex-col flex-grow">
        <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer">
          <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 hover:text-blue-600 transition-colors leading-snug">
            {listing.title ?? '—'}
          </h3>
        </a>

        <div className="space-y-1 text-sm text-gray-600 flex-grow">
          {priceText && (
            <div className="text-lg font-semibold text-blue-600">{priceText}</div>
          )}
          {ppsmText && (
            <div className="text-xs text-gray-400">{ppsmText}</div>
          )}
          {listing.location && <div className="text-xs">📍 {listing.location}</div>}
          <div className="flex items-center gap-3 text-xs">
            {listing.sizeSqm && <span>📏 {Math.round(parseFloat(String(listing.sizeSqm)))} m²</span>}
            {listing.rooms && <span>🏠 {listing.rooms} Zimmer</span>}
          </div>
        </div>

        {/* Save button */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          {listing.savedByUser ? (
            <div className="w-full py-2 text-center text-sm font-medium text-green-600 bg-green-50 rounded-lg border border-green-200">
              ✓ Gespeichert
            </div>
          ) : (
            <button
              onClick={() => onSave(listing)}
              disabled={saving}
              className="w-full py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {saving ? 'Speichern...' : '+ Zu meinen Immobilien'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntdeckenPage() {
  const { session, loading: authLoading } = useAuth();
  const { filters: savedFilters, create: createFilter, remove: removeFilter } = useSavedFilters();

  // Filter state
  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterValues>(EMPTY_FILTERS);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Data state
  const [listings, setListings] = useState<ScrapedListing[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveFilterError, setSaveFilterError] = useState<string | null>(null);
  const [saveFilterSuccess, setSaveFilterSuccess] = useState<string | null>(null);


  const fetchListings = useCallback(async () => {
    if (authLoading || !session) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getScrapedListings({
        platform: applied.platform || undefined,
        zipCode: applied.zipCode || undefined,
        minPrice: applied.minPrice ? parseFloat(applied.minPrice) : undefined,
        maxPrice: applied.maxPrice ? parseFloat(applied.maxPrice) : undefined,
        minPricePerSqm: applied.minPricePerSqm ? parseFloat(applied.minPricePerSqm) : undefined,
        maxPricePerSqm: applied.maxPricePerSqm ? parseFloat(applied.maxPricePerSqm) : undefined,
        minSize: applied.minSize ? parseFloat(applied.minSize) : undefined,
        maxSize: applied.maxSize ? parseFloat(applied.maxSize) : undefined,
        minRooms: applied.minRooms ? parseFloat(applied.minRooms) : undefined,
        maxRooms: applied.maxRooms ? parseFloat(applied.maxRooms) : undefined,
        sortBy: applied.sortBy || undefined,
        sortOrder: applied.sortOrder || undefined,
        page,
      });
      setListings(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Inserate');
    } finally {
      setLoading(false);
    }
  }, [authLoading, session, applied, page]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  function handleSearch() {
    setApplied({ ...filterValues });
    setPage(1);
  }

  function handleReset() {
    setFilterValues(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setActiveFilterId(null);
    setPage(1);
  }

  function handleLoadFilter(sf: SavedFilter) {
    const vals = savedFilterToValues(sf);
    setFilterValues(vals);
    setApplied(vals);
    setActiveFilterId(sf.id);
    setPage(1);
  }

  async function handleSaveFilter(name: string) {
    if (!isFilterActive(filterValues)) return;
    setSaveFilterError(null);
    setSaveFilterSuccess(null);
    try {
      const created = await createFilter(valuesToSavedFilterDto(filterValues, name));
      setActiveFilterId(created.id);
      setSaveFilterSuccess(`Filter "${created.name}" gespeichert.`);
      setTimeout(() => setSaveFilterSuccess(null), 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('403')) {
        setSaveFilterError('Filter-Limit erreicht (max. 2). Lösche einen bestehenden Filter oder upgrade für mehr.');
      } else {
        setSaveFilterError('Fehler beim Speichern des Filters.');
      }
    }
  }

  async function handleDeleteFilter(id: string) {
    await removeFilter(id);
    if (activeFilterId === id) setActiveFilterId(null);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(listing: ScrapedListing) {
    setSavingId(listing.id);
    try {
      await saveScrapedListing(listing.id);
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, savedByUser: true } : l));
      invalidateCache();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('409')) {
        setListings(prev => prev.map(l => l.id === listing.id ? { ...l, savedByUser: true } : l));
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">Entdecken</p>
        <h1 className="text-2xl font-light text-gray-900 tracking-tight">Inserate entdecken</h1>
        <p className="text-sm text-gray-500 mt-1">
          Täglich aktualisierte Immobilien von Raiffeisen, s REAL, ÖRAG und RE/MAX.
        </p>
      </div>

      {/* Filter bar */}
      <FilterBar
        values={filterValues}
        onChange={setFilterValues}
        onSearch={handleSearch}
        onReset={handleReset}
        onSave={handleSaveFilter}
        savedFilters={savedFilters}
        onLoadFilter={handleLoadFilter}
        onDeleteFilter={handleDeleteFilter}
        activeFilterId={activeFilterId}
      />

      {/* Save filter feedback */}
      {saveFilterSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <p className="text-green-800 text-sm">✓ {saveFilterSuccess}</p>
        </div>
      )}
      {saveFilterError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <p className="text-amber-800 text-sm">{saveFilterError}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-gray-500 mb-4">
          {total === 0 ? 'Keine Inserate gefunden.' : `${total.toLocaleString('de-AT')} Inserate gefunden`}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="h-48 bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
                <div className="h-8 bg-gray-100 rounded mt-3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listings.map(listing => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onSave={handleSave}
              saving={savingId === listing.id}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1 || loading}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Zurück
          </button>
          <span className="text-sm text-gray-500 px-3">
            Seite {page} von {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Weiter →
          </button>
        </div>
      )}

    </div>
  );
}
