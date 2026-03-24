'use client';

import { useState, useEffect, useCallback } from 'react';
import { getScrapedListings, saveScrapedListing, ScrapedListing } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { invalidateCache } from '@/hooks/useProperties';

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

  // Filter inputs (live state)
  const [platform, setPlatform] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Applied filters (only change on submit)
  const [applied, setApplied] = useState({ platform: '', zipCode: '', minPrice: '', maxPrice: '', page: 1 });

  // Data state
  const [listings, setListings] = useState<ScrapedListing[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

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
        page: applied.page,
      });
      setListings(data.data);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden der Inserate');
    } finally {
      setLoading(false);
    }
  }, [authLoading, session, applied]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setApplied({ platform, zipCode, minPrice, maxPrice, page: 1 });
  }

  function handlePageChange(newPage: number) {
    setApplied(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSave(listing: ScrapedListing) {
    setSavingId(listing.id);
    try {
      await saveScrapedListing(listing.id);
      // Mark as saved in the local list
      setListings(prev => prev.map(l => l.id === listing.id ? { ...l, savedByUser: true } : l));
      // Invalidate the properties cache so Dashboard/Funnel picks up the new property
      invalidateCache();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      // 409 = already saved — update UI anyway
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
          Täglich aktualisierte Immobilien von Raiffeisen, s REAL und ÖRAG.
        </p>
      </div>

      {/* Filter bar */}
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <label className="text-xs text-gray-500 font-medium">Plattform</label>
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Alle Plattformen</option>
            <option value="raiffeisen">Raiffeisen</option>
            <option value="sreal">s REAL</option>
            <option value="oerag">ÖRAG</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">PLZ</label>
          <input
            type="text"
            value={zipCode}
            onChange={e => setZipCode(e.target.value)}
            placeholder="z.B. 1010"
            maxLength={4}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Preis von (€)</label>
          <input
            type="number"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            placeholder="z.B. 200000"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Preis bis (€)</label>
          <input
            type="number"
            value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            placeholder="z.B. 500000"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Suchen
        </button>

        {(applied.platform || applied.zipCode || applied.minPrice || applied.maxPrice) && (
          <button
            type="button"
            onClick={() => {
              setPlatform(''); setZipCode(''); setMinPrice(''); setMaxPrice('');
              setApplied({ platform: '', zipCode: '', minPrice: '', maxPrice: '', page: 1 });
            }}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Zurücksetzen
          </button>
        )}
      </form>

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
            onClick={() => handlePageChange(applied.page - 1)}
            disabled={applied.page <= 1 || loading}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Zurück
          </button>
          <span className="text-sm text-gray-500 px-3">
            Seite {applied.page} von {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(applied.page + 1)}
            disabled={applied.page >= totalPages || loading}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Weiter →
          </button>
        </div>
      )}

    </div>
  );
}
