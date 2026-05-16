'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { getScrapedListings, getPropertiesFiltered, saveScrapedListing, ScrapedListing, Property, SavedFilter } from '@/lib/api';
import { TERMINAL_STAGES } from '@/lib/constants';
import { trackInteraction, trackScrapedInteraction } from '@/hooks/useInteractionTracker';
import { useAuth } from '@/context/AuthContext';
import { useProperties, invalidateCache, markMutationStart, markMutationEnd } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import FilterBar from '@/components/FilterBar';
import { PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';
import {
  FilterValues,
  EMPTY_FILTERS,
  savedFilterToValues,
  valuesToSavedFilterDto,
  isFilterActive,
  resolvePostcodes,
} from '@/lib/filter-values';
import PresetFilters from '@/components/PresetFilters';
import SortControl from '@/components/SortControl';
import UndoToastStack, { type UndoToastEntry } from '@/components/UndoToastStack';
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
  // ADR-022 §7.5 — effective rent-regulation state (own properties only).
  rentRegulationCategory?: string | null;
  rentRegulationSource?: string | null;
  baujahr?: number | null;
  propertyType?: string | null;
  // Time fields for preset filters
  createdAt?: string;
  emailReceivedAt?: string | null;
  firstSeenAt?: string;
  // Per-Property content counters. Email rows pass through from the
  // Property; scraped rows default to 0 (no backing Property yet) but
  // are upgraded in listingToCard when an existing own row matches by
  // sourceUrl — so a "previously engaged" scraped tile still surfaces
  // its analyses/docs indicator.
  analysisCount?: number;
  documentCount?: number;
}

function propertyToUnified(p: Property): UnifiedListing {
  // Prisma serializes Decimal columns as strings even though the TS type
  // says number — coerce here so sort/compare ops behave numerically.
  return {
    id: `prop-${p.id}`,
    title: p.title,
    price: p.price != null ? parseFloat(String(p.price)) : null,
    sizeSqm: p.sizeSqm != null ? parseFloat(String(p.sizeSqm)) : null,
    rooms: p.rooms != null ? parseFloat(String(p.rooms)) : null,
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
    analysisCount: p.analysisCount ?? 0,
    documentCount: p.documentCount ?? 0,
    rentRegulationCategory: p.rentRegulationCategoryEffective ?? null,
    rentRegulationSource: p.rentRegulationCategorySourceEffective ?? null,
    baujahr: p.baujahr ?? null,
    propertyType: p.propertyType ?? null,
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

// ─── Client-side sort across the merged listing array ───────────────────────

// Defensive numeric coercion — at runtime, fields can arrive as Prisma-serialized
// strings ("199900") even when the TS type says `number`. `Number()` turns those
// into real numbers and yields NaN for unparseable input, which we then null out
// so the comparator's null-handling path catches them.
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function sortKey(l: UnifiedListing, sortBy: string): number | null {
  switch (sortBy) {
    case 'price':
      return num(l.price);
    case 'pricePerSqm': {
      const p = num(l.price);
      const s = num(l.sizeSqm);
      return p != null && s != null && s > 0 ? p / s : null;
    }
    case 'size':
      return num(l.sizeSqm);
    case 'rooms':
      return num(l.rooms);
    case 'listedDate': {
      const d = l.firstSeenAt ?? l.emailReceivedAt ?? l.createdAt ?? null;
      return d ? new Date(d).getTime() : null;
    }
    default:
      return null;
  }
}

function sortMergedListings(
  listings: UnifiedListing[],
  sortBy: string,
  sortOrder: string,
): UnifiedListing[] {
  const dir = sortOrder === 'asc' ? 1 : -1;
  // Copy so we don't mutate the source arrays the useMemo depends on.
  return [...listings].sort((a, b) => {
    const av = sortKey(a, sortBy);
    const bv = sortKey(b, sortBy);
    // Nulls always last regardless of direction — more useful than nulls-first
    // on desc, which would shove unpriced listings to the top.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
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
    // ADR-022 chip criteria — comma-separated in the URL, '' for TOM.
    propertyType: (params.get('propertyType') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    rentRegulationCategory: (params.get('rentRegulationCategory') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    tomMaxDays: params.get('tomMaxDays') ?? '',
    sortBy: params.get('sortBy') ?? 'listedDate',
    sortOrder: params.get('sortOrder') ?? 'desc',
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

// Fires url_click on the listing the user clicked through to, regardless of
// source. Own properties hit /properties/:id/interactions; scraped listings
// hit /scraped-listings/:id/interactions. Both feed Recently Viewed.
function trackListingClick(listing: UnifiedListing) {
  if (listing.source === 'email') {
    const propertyId = listing.id.replace('prop-', '');
    trackInteraction(propertyId, 'url_click');
    return;
  }
  if (listing.scrapedListingId) {
    trackScrapedInteraction(listing.scrapedListingId, 'url_click');
  }
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
        <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {platformLabel(listing.platform)}
        </span>
      </td>
      <td className="px-4 py-2">
        {listing.savedByUser ? (
          <span className="text-green-600 text-xs font-medium">
            ✓ {t('inFunnel')}
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

// ─── State persistence across navigation ────────────────────────────────────
// Module-level cache so /search → /funnel → /search keeps the user's filters,
// sort, page, view mode, dismissed/promoted sets, and scroll position. Lost
// only on full page reload or sign-out (cleared via clearAllUserCaches in
// AuthContext to avoid leaking selections between users on the same tab).

interface DiscoverStateCache {
  filterValues: FilterValues;
  applied: FilterValues;
  activeFilterId: string | null;
  page: number;
  activePresets: PresetFilterKey[];
  activeSavedFilterIds: string[];
  view: ViewMode;
  dismissedIds: string[];
  locallyPromotedIds: string[];
  scrollY: number;
}

let discoverStateCache: DiscoverStateCache | null = null;

export function clearDiscoverStateCache(): void {
  discoverStateCache = null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EntdeckenPage() {
  const t = useTranslations('search');
  const searchParams = useSearchParams();
  const { session, loading: authLoading } = useAuth();
  const { filters: savedFilters, create: createFilter, remove: removeFilter } = useSavedFilters();
  // Use cached properties from useProperties — avoids a redundant API call on page 1
  const { properties: cachedProperties, loading: propertiesLoading } = useProperties();

  // Lazy initializers — restore from the module-level cache first, fall back
  // to URL params, then defaults. Cache wins so users hopping between Discover
  // and Funnel land back exactly where they were. URL params still drive
  // first-time sessions and deep-link navigation from the dashboard tile.
  const cached = discoverStateCache;

  const [view, setView] = useState<ViewMode>(() =>
    cached?.view ?? (searchParams.get('view') === 'table' ? 'table' : 'grid')
  );

  const initialFromUrl = filterValuesFromParams(searchParams);

  const [filterValues, setFilterValues] = useState<FilterValues>(
    () => cached?.filterValues ?? initialFromUrl,
  );
  const [applied, setApplied] = useState<FilterValues>(
    () => cached?.applied ?? initialFromUrl,
  );

  // ADR-023 §9.1 — when the pill bar is the filter UI there is no Search
  // button: every adjustment auto-applies after a 300ms debounce. While the
  // flag is off this effect is inert (handleSearch drives `applied`).
  useEffect(() => {
    if (!PILL_BAR_ONLY_FILTERS) return;
    const h = setTimeout(() => setApplied({ ...filterValues }), 300);
    return () => clearTimeout(h);
  }, [filterValues]);
  const [activeFilterId, setActiveFilterId] = useState<string | null>(
    () => cached?.activeFilterId ?? null,
  );
  const [page, setPage] = useState(() => cached?.page ?? 1);

  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(() => {
    if (cached) return new Set(cached.activePresets);
    const raw = searchParams.get('presets');
    return raw ? new Set(raw.split(',') as PresetFilterKey[]) : new Set();
  });
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(() => {
    if (cached) return new Set(cached.activeSavedFilterIds);
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

  // ── Dismiss UX state ─────────────────────────────────────────────────────
  // Keep dismissed listing ids in a synchronous local set so the card hides
  // instantly even when a filter-active refetch is in flight. `undoSnapshots`
  // stores enough state to restore each entry — own properties remember their
  // prior status; scraped listings remember the UnifiedListing itself.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => cached ? new Set(cached.dismissedIds) : new Set(),
  );
  const [undoEntries, setUndoEntries] = useState<UndoToastEntry[]>([]);
  const undoSnapshotsRef = useRef<Map<string, {
    source: 'own' | 'scraped';
    ownId?: string;
    previousStatus?: string;
    scrapedListing?: UnifiedListing;
  }>>(new Map());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveFilterError, setSaveFilterError] = useState<string | null>(null);
  const [saveFilterSuccess, setSaveFilterSuccess] = useState<string | null>(null);

  // Capture scrollY on unmount so a remount can restore it. Save on every
  // navigation away — don't bother throttling scroll events; window.scrollY
  // is cheap to read and we only read it once.
  useEffect(() => {
    return () => {
      if (discoverStateCache) {
        discoverStateCache.scrollY = window.scrollY;
      }
    };
  }, []);

  // Restore scroll position once, after the first non-loading render so the
  // page actually has the height to scroll into. Subsequent renders (cache
  // hits, filter changes, etc.) don't re-fire this.
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (scrollRestoredRef.current) return;
    if (scrapedLoading) return;
    const savedY = discoverStateCache?.scrollY ?? 0;
    if (savedY > 0) {
      // Defer one frame so the layout pass completes before scrollTo.
      requestAnimationFrame(() => window.scrollTo(0, savedY));
    }
    scrollRestoredRef.current = true;
  }, [scrapedLoading]);

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
      // ADR-022 §8 — chip filters resolved server-side. Empty arrays send
      // nothing, so this is inert until the pill bar populates them.
      propertyType: f.propertyType.length > 0 ? f.propertyType : undefined,
      rentRegulationCategory:
        f.rentRegulationCategory.length > 0 ? f.rentRegulationCategory : undefined,
      hideNullPrice: true,
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
      // Don't reference `t` here — keeping it out of fetchScraped's dep
      // closure so the callback stays referentially stable across re-renders
      // of EntdeckenPage (re-renders happen on every Supabase auth-state
      // event, even ones that don't change the user). The page's own error
      // banner reads from a stable i18n key elsewhere.
      setError(e instanceof Error ? e.message : 'Error loading listings');
    } finally {
      setScrapedLoading(false);
    }
    // Depend on session?.user?.id (stable) instead of `session` (new
    // reference on every Supabase token refresh) so a refresh on tab focus
    // doesn't refetch the page as if the user re-ran the search.
    // `t` excluded for the same reason — see the in-body comment.
  }, [authLoading, session?.user?.id, applied, page, buildFilterParams, presetPostcodes]);

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
  }, [page, applied, cachedProperties, hasActiveFilter, authLoading, session?.user?.id, buildFilterParams]);

  // Track ids the user has promoted out of `new` during this Discover
  // session. We keep these visible (heart fills green, card stays in
  // place) until the next mount of /search. The module-level cache means
  // "next mount" is now actually "next time the user hops away and back
  // *after* navigating somewhere that resets the cache" — i.e., a sign-out
  // or full reload. Mid-session navigations (Funnel → Discover) preserve
  // the set so the user can keep clicking through their queue without
  // promoted cards re-appearing.
  const [locallyPromotedIds, setLocallyPromotedIds] = useState<Set<string>>(
    () => cached ? new Set(cached.locallyPromotedIds) : new Set(),
  );

  // ── Persist Discover state across navigation ───────────────────────────────
  // Save the current selection on every relevant change so a Funnel-and-back
  // hop restores exactly what the user had. Scroll position is captured
  // separately by an unmount-cleanup effect above.
  useEffect(() => {
    discoverStateCache = {
      filterValues,
      applied,
      activeFilterId,
      page,
      activePresets: [...activePresets],
      activeSavedFilterIds: [...activeSavedFilterIds],
      view,
      dismissedIds: [...dismissedIds],
      locallyPromotedIds: [...locallyPromotedIds],
      scrollY: discoverStateCache?.scrollY ?? 0,
    };
  }, [
    filterValues, applied, activeFilterId, page,
    activePresets, activeSavedFilterIds, view,
    dismissedIds, locallyPromotedIds,
  ]);

  // ── Merge scraped + user properties into final listing ──
  const { listings, mergedUserCount } = useMemo(() => {
    // Discover surface = "things not yet in the active funnel": own at
    // status='new' (auto-imported, not yet considered) + unsaved scraped.
    // Properties promoted out of 'new' during this session stay visible
    // until next mount via locallyPromotedIds.
    const userUnified = filteredUserProps
      .filter(p =>
        (p.status === 'new' || locallyPromotedIds.has(p.id)) &&
        p.listingStatus !== 'expired'
      )
      .map(propertyToUnified);

    // Dedup against ACTIVE own (status not in TERMINAL_STAGES) — a property
    // the user explicitly moved to not_relevant / delisted shouldn't keep
    // suppressing its scraped twin, otherwise an "undo save" leaves the
    // listing permanently invisible on Discover with no path back.
    const activeOwnByUrl = new Map<string, Property>();
    for (const p of cachedProperties) {
      if (!TERMINAL_STAGES.has(p.status)) activeOwnByUrl.set(p.sourceUrl, p);
    }
    const dedupedScraped = scrapedListings.filter(s => !activeOwnByUrl.has(s.sourceUrl));

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

    // Hide dismissed listings (local-only, zero-lag — survives the undo
    // window and persists until the user navigates away or undoes).
    if (dismissedIds.size > 0) {
      merged = merged.filter(l => !dismissedIds.has(l.id));
    }

    // Client-side sort across the merged list. The backend already orders
    // each source query, but the page-1 merge prepends own-properties (cache
    // order) ahead of scraped listings, breaking a uniform sort. Re-sorting
    // here makes "Sort by price" cover both groups.
    merged = sortMergedListings(merged, applied.sortBy, applied.sortOrder);

    const userCount = page === 1
      ? merged.filter(l => l.source === 'email').length
      : 0;

    return { listings: merged, mergedUserCount: userCount };
  }, [scrapedListings, filteredUserProps, cachedProperties, locallyPromotedIds, page, activePresets, activeSavedFilterIds, savedFilters, dismissedIds, applied.sortBy, applied.sortOrder]);

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
    // For scraped, derive savedByUser AND content counts from current
    // cache so (a) an own-Property at not_relevant / delisted doesn't
    // keep forcing the heart filled, and (b) a scraped tile that maps
    // to an existing own Property still surfaces the analyse-button
    // blue if the user has analyses/docs against the underlying row.
    let derivedSavedByUser = l.savedByUser;
    let analysisCount = l.analysisCount ?? 0;
    let documentCount = l.documentCount ?? 0;
    if (l.source === 'scraped') {
      const own = cachedProperties.find(p => p.sourceUrl === l.sourceUrl);
      derivedSavedByUser = !!own && !TERMINAL_STAGES.has(own.status);
      if (own) {
        analysisCount = own.analysisCount ?? 0;
        documentCount = own.documentCount ?? 0;
      }
    }
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
      savedByUser: derivedSavedByUser,
      analysisCount,
      documentCount,
      // ADR-022 §7.5 — regulation badge fields are only meaningful for own
      // properties (heuristic needs a Dossier baujahr). Scraped tiles omit
      // them so the "Baujahr unbekannt" badge doesn't fire on every row.
      rentRegulationCategory: l.source === 'email' ? l.rentRegulationCategory : undefined,
      rentRegulationSource: l.source === 'email' ? l.rentRegulationSource : undefined,
      baujahr: l.source === 'email' ? l.baujahr : undefined,
      propertyType: l.source === 'email' ? l.propertyType : undefined,
    };
  }

  const { update: updateProp, optimisticUpdate, optimisticInsert } = useProperties();

  // Shared instant-hide helper for both ⚠ report-dead and ✕ dismiss.
  // Adds the card to dismissedIds (zero-lag local filter), snapshots
  // enough state for undo, and pushes an undo toast entry.
  function hideCard(listingId: string, item: CardProperty) {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(listingId);
      return next;
    });
    if (item.source === 'own') {
      const prev = cachedProperties.find(p => p.id === item.id);
      undoSnapshotsRef.current.set(listingId, {
        source: 'own',
        ownId: item.id,
        previousStatus: prev?.status ?? 'new',
      });
    } else {
      const existing = scrapedListings.find(l => l.id === listingId);
      if (existing) {
        undoSnapshotsRef.current.set(listingId, {
          source: 'scraped',
          scrapedListing: existing,
        });
      }
    }
    setUndoEntries(entries => [
      ...entries,
      { id: listingId, label: item.title ?? '', createdAt: Date.now() },
    ]);
  }

  const cardActions: CardActions = useMemo(() => ({
    onSaveToFunnel: async (item: CardProperty) => {
      // Own at status 'new' → promote to 'investigating'. The card stays
      // visible because the id gets added to locallyPromotedIds; next mount
      // recomputes from current data and the now-investigating row drops.
      if (item.source === 'own' && item.status === 'new') {
        setLocallyPromotedIds(prev => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        updateProp(item.id, {
          status: 'investigating',
          movedToStageAt: new Date().toISOString(),
        });
        return;
      }
      if (item.source !== 'scraped' || !item.scrapedListingId) return;
      const scraped = scrapedListings.find(l => l.id === `scraped-${item.scrapedListingId}`);
      // If the user already has a Property for this listing (from a prior
      // save+undo cycle), re-promote it instead of POSTing a new save —
      // the backend would 409 on the duplicate sourceUrl. Treat any
      // existing match (even past 'investigating') as a re-promote: the
      // user's intent is "put this back in the funnel".
      const existing = scraped
        ? cachedProperties.find(p => p.sourceUrl === scraped.sourceUrl)
        : null;
      if (existing) {
        updateProp(existing.id, {
          status: 'investigating',
          movedToStageAt: new Date().toISOString(),
        });
        setScrapedListings(prev => prev.map(l =>
          l.id === `scraped-${item.scrapedListingId}` ? { ...l, savedByUser: true } : l
        ));
        return;
      }
      try {
        const { property } = await saveScrapedListing(item.scrapedListingId);
        optimisticInsert(property);
        setScrapedListings(prev => prev.map(l =>
          l.id === `scraped-${item.scrapedListingId}` ? { ...l, savedByUser: true } : l
        ));
      } catch { /* 409 = already saved */ }
    },
    // ADR-012 v1.2 — re-click filled house to undo. Both paths are
    // soft-only: own reverts to status 'new'; scraped sets the matching
    // Property to 'not_relevant' so the row is out of the active funnel
    // but the DB record (and any analyses/notes) survive — the user can
    // recover via Funnel's not_relevant column or by re-clicking the
    // heart on the same Discover tile (re-promotes to investigating).
    onUndoSave: async (item: CardProperty) => {
      if (item.source === 'own') {
        setLocallyPromotedIds(prev => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        updateProp(item.id, {
          status: 'new',
          movedToStageAt: new Date().toISOString(),
        });
        return;
      }
      if (!item.scrapedListingId) return;
      const scraped = scrapedListings.find(l => l.id === `scraped-${item.scrapedListingId}`);
      if (!scraped) return;
      const matching = cachedProperties.find(p => p.sourceUrl === scraped.sourceUrl);
      // Flip the local flag immediately so the heart goes outline; on next
      // mount, listingToCard's derived savedByUser will reflect the
      // not_relevant status.
      setScrapedListings(prev => prev.map(l =>
        l.id === `scraped-${item.scrapedListingId}` ? { ...l, savedByUser: false } : l
      ));
      if (!matching) return;
      updateProp(matching.id, {
        status: 'not_relevant',
        movedToStageAt: new Date().toISOString(),
      });
    },
    onAnalyse: async (item: CardProperty) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'analysis');
        const prop = cachedProperties.find(p => p.id === item.id);
        if (prop) setAnalyseProperty(prop);
        return;
      }
      // Scraped — open the same modal as forwarded properties. The user's
      // mental model is "click any property to see details" regardless of
      // source. If a Property row already exists for this listing (prior
      // save / undo cycle), reuse it; otherwise auto-create at status
      // 'new' — matches where forwarded emails land, doesn't pollute the
      // funnel kanban, and the row stays visible on Discover via the
      // existing own@new filter.
      if (!item.scrapedListingId) return;
      trackScrapedInteraction(item.scrapedListingId, 'view');
      const scraped = scrapedListings.find(l => l.id === `scraped-${item.scrapedListingId}`);
      const existing = scraped
        ? cachedProperties.find(p => p.sourceUrl === scraped.sourceUrl)
        : null;
      if (existing) {
        trackInteraction(existing.id, 'analysis');
        setAnalyseProperty(existing);
        return;
      }
      try {
        const { property } = await saveScrapedListing(item.scrapedListingId, 'new');
        optimisticInsert(property);
        setScrapedListings(prev => prev.map(l =>
          l.id === `scraped-${item.scrapedListingId}` ? { ...l, savedByUser: true } : l
        ));
        trackInteraction(property.id, 'analysis');
        setAnalyseProperty(property);
      } catch {
        // 409 — race: another tab created it. Refetch is the recovery
        // path; user can re-click. Silent.
      }
    },
    onReportDead: (item: CardProperty) => {
      const listingId = item.source === 'own'
        ? `prop-${item.id}`
        : `scraped-${item.scrapedListingId}`;
      hideCard(listingId, item);
      if (item.source === 'own') {
        optimisticUpdate(item.id, { listingStatus: 'expired', listingExpiredAt: new Date().toISOString() });
        markMutationStart();
        reportUnavailable(item.id)
          .catch(() => {})
          .finally(() => markMutationEnd());
      }
    },
    onDismiss: (item: CardProperty) => {
      const listingId = item.source === 'own'
        ? `prop-${item.id}`
        : `scraped-${item.scrapedListingId}`;
      hideCard(listingId, item);
      if (item.source === 'own') {
        updateProp(item.id, { status: 'not_relevant', movedToStageAt: new Date().toISOString() });
      }
    },
    onUrlClick: (item: CardProperty) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'url_click');
      } else if (item.scrapedListingId) {
        trackScrapedInteraction(item.scrapedListingId, 'url_click');
      }
    },
  }), [updateProp, optimisticUpdate, optimisticInsert, cachedProperties, scrapedListings]);

  const handleUndoDismiss = useCallback((listingId: string) => {
    const snapshot = undoSnapshotsRef.current.get(listingId);
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
    setUndoEntries(entries => entries.filter(e => e.id !== listingId));
    undoSnapshotsRef.current.delete(listingId);
    if (!snapshot) return;
    if (snapshot.source === 'own' && snapshot.ownId) {
      updateProp(snapshot.ownId, {
        status: snapshot.previousStatus ?? 'new',
        movedToStageAt: new Date().toISOString(),
      });
    }
    // Scraped listings auto-restore via the dismissedIds filter — no state
    // mutation needed since the UnifiedListing stays in scrapedListings.
  }, [updateProp]);

  const handleUndoExpire = useCallback((listingId: string) => {
    setUndoEntries(entries => entries.filter(e => e.id !== listingId));
    undoSnapshotsRef.current.delete(listingId);
    // dismissedIds stays — card remains hidden even after the toast fades.
  }, []);

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

      {/* Filter bar — ADR-023 C2/C3: the legacy FilterBar form renders only
          while PILL_BAR_ONLY_FILTERS is off. When the flag flips, the
          consolidated pill bar below (R4–R9) is the sole filter surface. */}
      {!PILL_BAR_ONLY_FILTERS && (
        <FilterBar
          values={filterValues}
          onChange={setFilterValues}
          onSearch={handleSearch}
          onReset={handleReset}
          onSave={handleSaveFilter}
        />
      )}

      <PresetFilters
        active={activePresets}
        onChange={setActivePresets}
        savedFilters={savedFilters}
        activeSavedFilterIds={activeSavedFilterIds}
        onToggleSavedFilter={toggleSavedFilter}
        onDeleteFilter={removeFilter}
        showStages
        values={filterValues}
        onValuesChange={setFilterValues}
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

      {/* Prominent sort + view toggle + results count */}
      {!loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* ADR-023 §4 — superseded by the pill bar's SortDropdown when
                the consolidated filter UI is live. */}
            {!PILL_BAR_ONLY_FILTERS && (
            <SortControl
              sortBy={applied.sortBy}
              sortOrder={applied.sortOrder}
              onChange={(sortBy, sortOrder) => {
                setFilterValues(v => ({ ...v, sortBy, sortOrder }));
                setApplied(a => ({ ...a, sortBy, sortOrder }));
              }}
            />
            )}
            <p className="text-sm text-gray-500">
              {listings.length === 0
                ? t('noListingsFound')
                : t('listingsFound', { count: totalResults.toLocaleString('de-AT') })}
            </p>
          </div>
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

      <UndoToastStack
        entries={undoEntries}
        onUndo={handleUndoDismiss}
        onExpire={handleUndoExpire}
      />
    </div>
  );
}
