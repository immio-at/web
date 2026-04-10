'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { getScrapedListings, getPropertiesFiltered, saveScrapedListing, ScrapedListing, Property, SavedFilter } from '@/lib/api';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import { useAuth } from '@/context/AuthContext';
import { useProperties, invalidateCache } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import FilterBar, {
  FilterValues,
  EMPTY_FILTERS,
  savedFilterToValues,
  valuesToSavedFilterDto,
  isFilterActive,
  resolvePostcodes,
} from '@/components/FilterBar';
import PresetFilters from '@/components/PresetFilters';
import { type PresetFilterKey, passesPresetFilters, passesSavedFilters } from '@/lib/preset-filters';
import { type BundeslandAbbreviation, getPostcodesByBundesland } from '@/lib/austria-plz-bundesland';
import dynamic from 'next/dynamic';
import PropertyCard, { type CardProperty, type CardActions } from '@/components/PropertyCard';
import { updateProperty, reportUnavailable } from '@/lib/api';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

// ─── Unified listing type ────────────────────────────────────────────────────

interface UnifiedListing {
  id: string;
  title: string | null;
  price: number | null;
  sizeSqm: number | null;
  rooms: number | null;
  location: string | null;
  zipCode: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  platform: string;
  source: 'email' | 'scraped';
  savedByUser: boolean;
  // Only present for scraped listings (needed for save action)
  scrapedListingId?: string;
  // Only present for email properties
  status?: string;
  // Time fields for preset filters
  createdAt?: string;
  emailReceivedAt?: string | null;
  firstSeenAt?: string;
}

function propertyToUnified(p: Property): UnifiedListing {
  return {
    id: `prop-${p.id}`,
    title: p.title,
    price: p.price,
    sizeSqm: p.sizeSqm,
    rooms: p.rooms,
    location: p.location,
    zipCode: p.zipCode,
    imageUrl: p.imageUrl,
    sourceUrl: p.sourceUrl,
    platform: p.platform,
    source: 'email',
    savedByUser: true, // already in user's funnel
    status: p.status,
    createdAt: p.createdAt,
    emailReceivedAt: p.emailReceivedAt,
  };
}

function scrapedToUnified(s: ScrapedListing): UnifiedListing {
  return {
    id: `scraped-${s.id}`,
    title: s.title,
    price: s.price ? parseFloat(String(s.price)) : null,
    sizeSqm: s.sizeSqm ? parseFloat(String(s.sizeSqm)) : null,
    rooms: s.rooms ? parseFloat(String(s.rooms)) : null,
    location: s.location,
    zipCode: s.zipCode,
    imageUrl: s.imageUrl,
    sourceUrl: s.sourceUrl,
    platform: s.platform,
    source: 'scraped',
    savedByUser: s.savedByUser,
    scrapedListingId: s.id,
    firstSeenAt: s.firstSeenAt,
  };
}

// ─── Platform display names ───────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  willhaben: 'Willhaben',
  immoscout24: 'ImmoScout24',
  immowelt: 'Immowelt',
  bazar: 'Bazar.at',
  immmo: 'immmo.at',
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

// ─── Build FilterValues from URL search params ──────────────────────────────

function filterValuesFromParams(params: URLSearchParams): FilterValues {
  return {
    keyword: params.get('keyword') ?? '',
    location: params.get('postcodes') ?? '',
    minPrice: params.get('minPrice') ?? '',
    maxPrice: params.get('maxPrice') ?? '',
    minPricePerSqm: params.get('minPricePerSqm') ?? '',
    maxPricePerSqm: params.get('maxPricePerSqm') ?? '',
    minSize: params.get('minSize') ?? '',
    maxSize: params.get('maxSize') ?? '',
    minRooms: params.get('minRooms') ?? '',
    maxRooms: params.get('maxRooms') ?? '',
    sortBy: params.get('sortBy') ?? 'listedDate',
    sortOrder: params.get('sortOrder') ?? 'desc',
    showHidden: false,
  };
}

function hasAnyParam(params: URLSearchParams): boolean {
  return !!(
    params.get('keyword') || params.get('postcodes') ||
    params.get('minPrice') || params.get('maxPrice') ||
    params.get('minPricePerSqm') || params.get('maxPricePerSqm') ||
    params.get('minSize') || params.get('maxSize') ||
    params.get('minRooms') || params.get('maxRooms')
  );
}

type ViewMode = 'grid' | 'table';

// ─── Source badge ────────────────────────────────────────────────────────────

// Track URL clicks for user's own properties
function trackListingClick(listing: UnifiedListing) {
  if (listing.source === 'email') {
    const propertyId = listing.id.replace('prop-', '');
    trackInteraction(propertyId, 'url_click');
  }
}

function SourceBadge({ source, platform }: { source: 'email' | 'scraped'; platform: string }) {
  return (
    <span className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
      source === 'email'
        ? 'bg-teal-50/90 text-teal-700 border-teal-200'
        : 'bg-white/90 text-gray-700 border-gray-200'
    }`}>
      {platformLabel(platform)}
    </span>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────────

function ListingCard({
  listing,
  onSave,
  saving,
}: {
  listing: UnifiedListing;
  onSave: (listing: UnifiedListing) => void;
  saving: boolean;
}) {
  const t = useTranslations('search');
  const priceText = formatPrice(listing.price);
  const ppsmText = formatPricePerSqm(listing.price, listing.sizeSqm);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
      {/* Image */}
      <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackListingClick(listing)} className="block relative h-48 bg-gray-100 overflow-hidden flex-shrink-0">
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={listing.title ?? ''}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover hover:scale-105 transition-transform duration-300"
            loading="lazy"
            unoptimized
          />
        ) : (
          <div className="flex items-center justify-center h-full text-4xl text-gray-300">🏠</div>
        )}
        <SourceBadge source={listing.source} platform={listing.platform} />
      </a>

      {/* Details */}
      <div className="p-4 flex flex-col flex-grow">
        <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackListingClick(listing)}>
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
            {listing.sizeSqm && <span>📏 {Math.round(listing.sizeSqm)} m²</span>}
            {listing.rooms && <span>🏠 {listing.rooms} {t('rooms')}</span>}
          </div>
        </div>

        {/* Save button */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          {listing.savedByUser ? (
            <div className="w-full py-2 text-center text-sm font-medium text-green-600 bg-green-50 rounded-lg border border-green-200">
              ✓ {listing.source === 'email' ? t('inFunnel') : t('saved')}
            </div>
          ) : (
            <button
              onClick={() => onSave(listing)}
              disabled={saving}
              className="w-full py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
            >
              {saving ? t('saving') : t('saveToProperties')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Table row ───────────────────────────────────────────────────────────────

function ListingTableRow({
  listing,
  onSave,
  saving,
  odd,
}: {
  listing: UnifiedListing;
  onSave: (listing: UnifiedListing) => void;
  saving: boolean;
  odd: boolean;
}) {
  const t = useTranslations('search');
  const priceText = formatPrice(listing.price) ?? '—';
  const ppsmText = formatPricePerSqm(listing.price, listing.sizeSqm) ?? '—';

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 ${odd ? 'bg-gray-50/50' : ''}`}>
      <td className="px-4 py-2">
        <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackListingClick(listing)}>
          <div className="relative rounded overflow-hidden bg-gray-100 hover:opacity-80 transition-opacity cursor-pointer" style={{ width: '48px', height: '48px' }}>
            {listing.imageUrl ? (
              <Image src={listing.imageUrl} alt={listing.title ?? ''} fill sizes="48px" className="object-cover" loading="lazy" unoptimized onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <span className="text-xl flex items-center justify-center h-full">🏠</span>
            )}
          </div>
        </a>
      </td>
      <td className="px-4 py-2 max-w-xs">
        <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => trackListingClick(listing)} className="text-gray-900 hover:text-blue-600 font-medium text-sm line-clamp-2">
          {listing.title ?? '—'}
        </a>
      </td>
      <td className="px-4 py-2 font-semibold text-blue-600 text-sm whitespace-nowrap">{priceText}</td>
      <td className="px-4 py-2 text-sm whitespace-nowrap">{listing.sizeSqm ? `${Math.round(listing.sizeSqm)}m²` : '—'}</td>
      <td className="px-4 py-2 text-sm whitespace-nowrap">{listing.rooms || '—'}</td>
      <td className="px-4 py-2 text-sm whitespace-nowrap">{listing.location || '—'}</td>
      <td className="px-4 py-2 text-sm whitespace-nowrap text-gray-500">{ppsmText}</td>
      <td className="px-4 py-2 whitespace-nowrap">
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
          listing.source === 'email'
            ? 'bg-teal-50 text-teal-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {platformLabel(listing.platform)}
        </span>
      </td>
      <td className="px-4 py-2">
        {listing.savedByUser ? (
          <span className="text-green-600 text-xs font-medium">
            ✓ {listing.source === 'email' ? t('inFunnel') : t('saved')}
          </span>
        ) : (
          <button
            onClick={() => onSave(listing)}
            disabled={saving}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? t('saving') : '+ ' + t('saveToProperties')}
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntdeckenPage() {
  const t = useTranslations('search');
  const searchParams = useSearchParams();
  const { session, loading: authLoading } = useAuth();
  const { filters: savedFilters, create: createFilter, remove: removeFilter } = useSavedFilters();
  // Use cached properties from useProperties — avoids a redundant API call on page 1
  const { properties: cachedProperties, loading: propertiesLoading } = useProperties();

  // Read initial view mode from URL
  const [view, setView] = useState<ViewMode>(
    searchParams.get('view') === 'table' ? 'table' : 'grid',
  );

  // Build initial filter values from URL params
  const initialFromUrl = filterValuesFromParams(searchParams);

  // Filter state
  const [filterValues, setFilterValues] = useState<FilterValues>(initialFromUrl);
  const [applied, setApplied] = useState<FilterValues>(initialFromUrl);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Preset + saved filter pill state — initialise from URL params if present
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(() => {
    const raw = searchParams.get('presets');
    return raw ? new Set(raw.split(',') as PresetFilterKey[]) : new Set();
  });
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(() => {
    const raw = searchParams.get('savedFilterIds');
    return raw ? new Set(raw.split(',')) : new Set();
  });

  function toggleSavedFilter(id: string) {
    setActiveSavedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Data state — scraped and user properties tracked separately for progressive rendering
  const [scrapedListings, setScrapedListings] = useState<UnifiedListing[]>([]);
  const [scrapedTotal, setScrapedTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [scrapedLoading, setScrapedLoading] = useState(true);
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveFilterError, setSaveFilterError] = useState<string | null>(null);
  const [saveFilterSuccess, setSaveFilterSuccess] = useState<string | null>(null);

  // Check if any filter beyond defaults is active (needs server-side filtering)
  const hasActiveFilter = useCallback((f: FilterValues) => {
    return !!(f.keyword || f.location || f.minPrice || f.maxPrice ||
      f.minPricePerSqm || f.maxPricePerSqm || f.minSize || f.maxSize ||
      f.minRooms || f.maxRooms);
  }, []);

  // Build filter params from applied state
  const buildFilterParams = useCallback((f: FilterValues) => {
    const postcodes = resolvePostcodes(f.location);
    return {
      keyword: f.keyword || undefined,
      postcodes: postcodes.length > 0 ? postcodes : undefined,
      minPrice: f.minPrice ? parseFloat(f.minPrice) : undefined,
      maxPrice: f.maxPrice ? parseFloat(f.maxPrice) : undefined,
      minPricePerSqm: f.minPricePerSqm ? parseFloat(f.minPricePerSqm) : undefined,
      maxPricePerSqm: f.maxPricePerSqm ? parseFloat(f.maxPricePerSqm) : undefined,
      minSize: f.minSize ? parseFloat(f.minSize) : undefined,
      maxSize: f.maxSize ? parseFloat(f.maxSize) : undefined,
      minRooms: f.minRooms ? parseFloat(f.minRooms) : undefined,
      maxRooms: f.maxRooms ? parseFloat(f.maxRooms) : undefined,
      hideNullPrice: !f.showHidden,
      sortBy: f.sortBy || undefined,
      sortOrder: f.sortOrder || undefined,
    };
  }, []);

  // Resolve active state presets to postcodes for server-side filtering
  const STATE_KEYS: BundeslandAbbreviation[] = ['W', 'NÖ', 'OÖ', 'ST', 'K', 'S', 'T', 'V', 'B'];
  const presetPostcodes = useMemo(() => {
    const activeStates = STATE_KEYS.filter(k => activePresets.has(k));
    if (activeStates.length === 0) return [];
    return activeStates.flatMap(abbr => getPostcodesByBundesland(abbr) ?? []);
  }, [activePresets]);

  // ── Fetch scraped listings — fires immediately, includes preset state postcodes ──
  const fetchScraped = useCallback(async () => {
    if (authLoading || !session) return;
    try {
      setScrapedLoading(true);
      setError(null);
      const filterParams = buildFilterParams(applied);

      // Merge preset state postcodes with FilterBar postcodes
      const allPostcodes = [
        ...(filterParams.postcodes ?? []),
        ...presetPostcodes,
      ];
      if (allPostcodes.length > 0) {
        filterParams.postcodes = [...new Set(allPostcodes)]; // deduplicate
      }

      const scrapedData = await getScrapedListings({ ...filterParams, page });
      setScrapedListings(scrapedData.data.map(scrapedToUnified));
      setScrapedTotal(scrapedData.total);
      setTotalPages(scrapedData.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorLoadingListings'));
    } finally {
      setScrapedLoading(false);
    }
  }, [authLoading, session, applied, page, t, buildFilterParams, presetPostcodes]);

  useEffect(() => { fetchScraped(); }, [fetchScraped]);

  // ── User properties for page 1 — from cache or filtered API call ──
  const [filteredUserProps, setFilteredUserProps] = useState<Property[]>([]);

  useEffect(() => {
    if (page !== 1) { setFilteredUserProps([]); return; }

    if (!hasActiveFilter(applied)) {
      // No filters — use cached properties (updates reactively as cache loads)
      setFilteredUserProps(cachedProperties);
    } else if (!authLoading && session) {
      // Filters active — fetch from server (runs in parallel with scraped fetch)
      const filterParams = buildFilterParams(applied);
      getPropertiesFiltered(filterParams)
        .then(setFilteredUserProps)
        .catch(() => setFilteredUserProps([]));
    }
  }, [page, applied, cachedProperties, hasActiveFilter, authLoading, session, buildFilterParams]);

  // ── Merge scraped + user properties into final listing ──
  const { listings, mergedUserCount } = useMemo(() => {
    const userUnified = filteredUserProps
      .filter(p => p.status !== 'not_relevant' && p.status !== 'delisted')
      .map(propertyToUnified);

    const userSourceUrls = new Set(userUnified.map(u => u.sourceUrl));
    const dedupedScraped = scrapedListings.filter(s => !userSourceUrls.has(s.sourceUrl));

    let merged = page === 1
      ? [...userUnified, ...dedupedScraped]
      : dedupedScraped;

    // Apply preset filters client-side
    if (activePresets.size > 0) {
      merged = merged.filter(l => passesPresetFilters(l, activePresets));
    }

    // Apply saved filter pills (OR across selected saved filters)
    if (activeSavedFilterIds.size > 0) {
      merged = merged.filter(l => passesSavedFilters(l, savedFilters, activeSavedFilterIds));
    }

    const userCount = page === 1
      ? merged.filter(l => l.source === 'email').length
      : 0;

    return { listings: merged, mergedUserCount: userCount };
  }, [scrapedListings, filteredUserProps, page, activePresets, activeSavedFilterIds, savedFilters]);

  const loading = scrapedLoading;

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
      setSaveFilterSuccess(t('filterSaved', { name: created.name }));
      setTimeout(() => setSaveFilterSuccess(null), 4000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('403')) {
        setSaveFilterError(t('filterLimitReached'));
      } else {
        setSaveFilterError(t('filterSaveError'));
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

  async function handleSave(listing: UnifiedListing) {
    if (!listing.scrapedListingId) return; // can't save email properties (already saved)
    setSavingId(listing.id);
    try {
      await saveScrapedListing(listing.scrapedListingId);
      setScrapedListings(prev => prev.map(l => l.id === listing.id ? { ...l, savedByUser: true } : l));
      invalidateCache();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('409')) {
        setScrapedListings(prev => prev.map(l => l.id === listing.id ? { ...l, savedByUser: true } : l));
      }
    } finally {
      setSavingId(null);
    }
  }

  // When preset/saved filter pills are active, use actual displayed count
  // Only client-side-only presets (time, source, saved filters) affect count accuracy.
  // State presets are now sent server-side, so pagination is accurate with them.
  const hasClientOnlyPresets = activePresets.has('searchAgents') || activePresets.has('excludeSearchAgents') ||
    Array.from(activePresets).some(k => k.startsWith('stage_'));
  const presetsActive = hasClientOnlyPresets || activeSavedFilterIds.size > 0;
  // ── Convert UnifiedListing to CardProperty ──
  function listingToCard(l: UnifiedListing): CardProperty {
    return {
      id: l.source === 'email' ? l.id.replace('prop-', '') : l.id,
      title: l.title,
      price: l.price,
      sizeSqm: l.sizeSqm,
      rooms: l.rooms,
      location: l.location,
      zipCode: l.zipCode,
      imageUrl: l.imageUrl,
      sourceUrl: l.sourceUrl,
      platform: l.platform,
      status: l.status,
      source: l.source === 'email' ? 'own' : 'scraped',
      scrapedListingId: l.scrapedListingId,
      emailReceivedAt: l.emailReceivedAt,
    };
  }

  const { update: updateProp, optimisticUpdate } = useProperties();

  const cardActions: CardActions = useMemo(() => ({
    onStageChange: async (item: CardProperty, stage: string) => {
      if (item.source === 'scraped' && item.scrapedListingId) {
        // Save scraped listing to funnel at the selected stage
        try {
          await saveScrapedListing(item.scrapedListingId);
          invalidateCache();
          // Mark as saved in local state
          setScrapedListings(prev => prev.map(l =>
            l.id === `scraped-${item.scrapedListingId}` ? { ...l, savedByUser: true } : l
          ));
        } catch { /* 409 = already saved */ }
      } else {
        // Own property — move to stage
        trackInteraction(item.id, 'status_change');
        updateProp(item.id, { status: stage, movedToStageAt: new Date().toISOString() });
      }
    },
    onAnalyse: (item: CardProperty) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'analysis');
        const prop = cachedProperties.find(p => p.id === item.id);
        if (prop) setAnalyseProperty(prop);
      }
    },
    onReportDead: (item: CardProperty) => {
      if (item.source === 'own') {
        optimisticUpdate(item.id, { listingStatus: 'expired', listingExpiredAt: new Date().toISOString() });
        reportUnavailable(item.id).catch(() => {});
      }
    },
    onDismiss: (item: CardProperty) => {
      if (item.source === 'own') {
        updateProp(item.id, { status: 'not_relevant', movedToStageAt: new Date().toISOString() });
      }
      // For scraped: just hide from view
      if (item.source === 'scraped') {
        setScrapedListings(prev => prev.filter(l => l.id !== `scraped-${item.scrapedListingId}`));
      }
    },
    onUrlClick: (item: CardProperty) => {
      if (item.source === 'own') trackInteraction(item.id, 'url_click');
    },
  }), [updateProp, optimisticUpdate, cachedProperties]);

  const totalResults = presetsActive
    ? listings.length
    : (page === 1 ? mergedUserCount : 0) + scrapedTotal;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">{t('label')}</p>
        <h1 className="text-2xl font-light text-gray-900 tracking-tight">{t('title')}</h1>
      </div>

      {/* Filter bar */}
      <FilterBar
        values={filterValues}
        onChange={setFilterValues}
        onSearch={handleSearch}
        onReset={handleReset}
        onSave={handleSaveFilter}
      />

      <PresetFilters
        active={activePresets}
        onChange={setActivePresets}
        savedFilters={savedFilters}
        activeSavedFilterIds={activeSavedFilterIds}
        onToggleSavedFilter={toggleSavedFilter}
        onDeleteFilter={removeFilter}
        showStages
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
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Results count + view toggle */}
      {!loading && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {listings.length === 0
              ? t('noListingsFound')
              : t('listingsFound', { count: totalResults.toLocaleString('de-AT') })}
            {page === 1 && mergedUserCount > 0 && (
              <span className="text-teal-600 ml-1">
                ({t('includingOwn', { count: mergedUserCount })})
              </span>
            )}
          </p>
          <div className="flex gap-1">
            {(['grid', 'table'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  view === v
                    ? 'bg-slate-700 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {v === 'grid' ? `⊞ ${t('viewGrid')}` : `☰ ${t('viewTable')}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid view */}
      {view === 'grid' && (
        loading ? (
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
              <PropertyCard
                key={listing.id}
                item={listingToCard(listing)}
                actions={cardActions}
              />
            ))}
          </div>
        )
      )}

      {/* Table view */}
      {view === 'table' && (
        loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400 animate-pulse">
            {t('loading')}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-700 w-16">{t('tableImage')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tableTitle')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tablePrice')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tableSize')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tableRooms')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tableLocation')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tablePricePerSqm')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700">{t('tableSource')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-700 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((listing, i) => (
                    <ListingTableRow
                      key={listing.id}
                      listing={listing}
                      onSave={handleSave}
                      saving={savingId === listing.id}
                      odd={i % 2 !== 0}
                    />
                  ))}
                </tbody>
              </table>
              {listings.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {t('noListingsFound')}
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Pagination */}
      {totalPages > 1 && !presetsActive && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page <= 1 || loading}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('paginationPrev')}
          </button>
          <span className="text-sm text-gray-500 px-3">
            {t('paginationPage', { page, total: totalPages })}
          </span>
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page >= totalPages || loading}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('paginationNext')}
          </button>
        </div>
      )}

      {/* Analyse modal */}
      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}
    </div>
  );
}
