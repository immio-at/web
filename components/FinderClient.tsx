'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useProperties, invalidateCache, markMutationStart, markMutationEnd } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { UserListing, getScrapedListings, saveScrapedListing, Listing, reportUnavailable } from '@/lib/api';
import { trackInteraction, trackScrapedInteraction } from '@/hooks/useInteractionTracker';
import { useAuth } from '@/context/AuthContext';
import PresetFilters from '@/components/PresetFilters';
import PropertyCard, { type ListingCard, type CardActions } from '@/components/PropertyCard';
import { type PresetFilterKey, passesPresetFilters, passesSavedFilters, passesFilterValues } from '@/lib/preset-filters';
import { type BundeslandAbbreviation, getPostcodesByBundesland } from '@/lib/austria-plz-bundesland';
import { EMPTY_FILTERS, type FilterValues } from '@/lib/filter-values';
import { PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';
import Link from 'next/link';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

// ─── Unified card type for Finder ────────────────────────────────────────────

interface FinderCard {
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
  source: 'own' | 'scraped';
  // For own properties — needed for update/track
  propertyId?: string;
  // For scraped — needed for save
  scrapedListingId?: string;
  // For preset filters
  emailReceivedAt?: string | null;
  createdAt?: string;
  firstSeenAt?: string;
  // Per-UserListing content counters — drives the analyse-button colour on
  // PropertyCard. Own rows carry the real counts; scraped rows default
  // to 0 (no backing UserListing yet).
  analysisCount?: number;
  documentCount?: number;
}

function propertyToCard(p: UserListing): FinderCard {
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
    source: 'own',
    propertyId: p.id,
    emailReceivedAt: p.emailReceivedAt,
    createdAt: p.createdAt,
    analysisCount: p.analysisCount ?? 0,
    documentCount: p.documentCount ?? 0,
  };
}

// Source-agnostic deck ordering. The user can opt into source-only views via
// the searchAgents preset filter; when no source preset is active the deck
// must mix own + scraped by the active sort criterion.
function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function finderSortKey(c: FinderCard, sortBy: string): number | null {
  switch (sortBy) {
    case 'price':
      return num(c.price);
    case 'pricePerSqm': {
      const p = num(c.price);
      const s = num(c.sizeSqm);
      return p != null && s != null && s > 0 ? p / s : null;
    }
    case 'size':
      return num(c.sizeSqm);
    case 'rooms':
      return num(c.rooms);
    case 'listedDate': {
      const d = c.firstSeenAt ?? c.emailReceivedAt ?? c.createdAt ?? null;
      return d ? new Date(d).getTime() : null;
    }
    default:
      return null;
  }
}

function sortFinderCards(cards: FinderCard[], sortBy: string, sortOrder: string): FinderCard[] {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    const av = finderSortKey(a, sortBy);
    const bv = finderSortKey(b, sortBy);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function scrapedToCard(s: Listing): FinderCard {
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
    scrapedListingId: s.id,
    firstSeenAt: s.firstSeenAt,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const STATE_KEYS: BundeslandAbbreviation[] = ['W', 'NÖ', 'OÖ', 'ST', 'K', 'S', 'T', 'V', 'B'];

export default function FinderClient({
  initialPresets,
  initialSavedFilterIds,
}: {
  initialPresets?: Set<PresetFilterKey>;
  initialSavedFilterIds?: Set<string>;
} = {}) {
  const t = useTranslations('finder');
  const tPreset = useTranslations('presetFilters');
  const { session, loading: authLoading } = useAuth();
  const { properties: allOwn, loading: propsLoading, update, optimisticUpdate, optimisticInsert } = useProperties();
  const { filters: savedFilters, remove: removeFilter } = useSavedFilters();
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(initialPresets ?? new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(initialSavedFilterIds ?? new Set());

  // Scraped listings state
  const [scrapedCards, setScrapedCards] = useState<FinderCard[]>([]);
  const [scrapedLoading, setScrapedLoading] = useState(true);

  // ADR-023 §5.3 — consolidated pill bar state. Sort is part of it (R8).
  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [filterExpanded, setFilterExpanded] = useState(false);
  // Sort feeds both the deck order and the scraped fetch — driven by the
  // pill bar's SortDropdown.
  const effSortBy = filterValues.sortBy;
  const effSortOrder: 'asc' | 'desc' = filterValues.sortOrder === 'asc' ? 'asc' : 'desc';

  function toggleSavedFilter(id: string) {
    setActiveSavedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Resolve state presets to postcodes for server-side filtering
  const presetPostcodes = useMemo(() => {
    const activeStates = STATE_KEYS.filter(k => activePresets.has(k));
    if (activeStates.length === 0) return [];
    return activeStates.flatMap(abbr => getPostcodesByBundesland(abbr) ?? []);
  }, [activePresets]);

  // Fetch scraped listings — re-fetches when state presets or sort change.
  // Pull multiple pages so the swipe deck doesn't flicker in size when a
  // filter change shifts which listings overlap with the user's already-
  // saved sourceUrls (backend returns 20 per page; one page of scraped
  // minus overlaps sometimes leaves only a handful of cards).
  const MAX_FINDER_PAGES = 5; // up to 100 scraped listings in the deck
  const fetchScraped = useCallback(async () => {
    if (authLoading || !session) return;
    try {
      setScrapedLoading(true);
      const baseParams: Record<string, unknown> = {
        hideNullPrice: true,
        sortBy: effSortBy,
        sortOrder: effSortOrder,
      };
      if (presetPostcodes.length > 0) {
        baseParams.postcodes = presetPostcodes;
      }
      // Fetch page 1 first so we know the true total page count, then
      // parallel-fetch the rest up to MAX_FINDER_PAGES.
      const first = await getScrapedListings({ ...baseParams, page: 1 } as any);
      const extraPages = Math.min(first.totalPages ?? 1, MAX_FINDER_PAGES) - 1;
      let data = first.data;
      if (extraPages > 0) {
        const rest = await Promise.all(
          Array.from({ length: extraPages }, (_, i) =>
            getScrapedListings({ ...baseParams, page: i + 2 } as any).then(r => r.data),
          ),
        );
        data = data.concat(...rest);
      }
      setScrapedCards(data.map(scrapedToCard));
    } catch {
      setScrapedCards([]);
    } finally {
      setScrapedLoading(false);
    }
    // session?.user?.id (stable) — see search/page.tsx note.
  }, [authLoading, session?.user?.id, presetPostcodes, effSortBy, effSortOrder]);

  useEffect(() => { fetchScraped(); }, [fetchScraped]);

  // Track which scraped cards the user has dismissed or saved (by id)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Merge own properties (status new) + scraped listings, apply filters
  const cards = useMemo(() => {
    // Own properties with status 'new'
    const ownCards = allOwn
      .filter(p => p.status === 'new')
      .map(propertyToCard);

    // Exclude scraped listings already saved by user (by sourceUrl)
    const ownSourceUrls = new Set(allOwn.map(p => p.sourceUrl));
    const filteredScraped = scrapedCards.filter(
      s => !ownSourceUrls.has(s.sourceUrl) && !dismissedIds.has(s.id)
    );

    // Source-agnostic merge — let the sort criterion decide order across both
    // sources. The searchAgents preset is how the user opts into a one-source
    // view if they want it.
    let merged = [...ownCards, ...filteredScraped];

    // Apply preset filters (client-side: searchAgents, time)
    if (activePresets.size > 0) {
      merged = merged.filter(c => passesPresetFilters(c, activePresets));
    }

    // Apply saved filter pills
    if (activeSavedFilterIds.size > 0) {
      merged = merged.filter(c => passesSavedFilters(c, savedFilters, activeSavedFilterIds));
    }

    // ADR-023 — pill bar criteria, applied only when it is the active
    // filter UI. Inert while PILL_BAR_ONLY_FILTERS is off.
    if (PILL_BAR_ONLY_FILTERS) {
      merged = merged.filter(c => passesFilterValues(c, filterValues));
    }

    return sortFinderCards(merged, effSortBy, effSortOrder);
  }, [allOwn, scrapedCards, dismissedIds, activePresets, activeSavedFilterIds, savedFilters, effSortBy, effSortOrder, filterValues]);

  const [current, setCurrent] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  // Holds the UserListing to render in the analyse modal. Set by image-tap
  // on either an own card (open on the cached UserListing) or a scraped card
  // (auto-save at status 'new' first, then open on the new UserListing —
  // matches forwarded-email behaviour).
  const [analyseProperty, setAnalyseProperty] = useState<UserListing | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Reset card index when filters change
  useEffect(() => { setCurrent(0); }, [activePresets, activeSavedFilterIds]);

  const card = cards[current];
  const total = cards.length;

  async function handleAction(action: string) {
    if (!card) return;

    if (action === 'open') {
      if (card.propertyId) trackInteraction(card.propertyId, 'url_click');
      else if (card.scrapedListingId) trackScrapedInteraction(card.scrapedListingId, 'url_click');
      window.open(card.sourceUrl, '_blank');
      setDragX(0);
      setDragY(0);
      return;
    }

    if (action === 'analyse') {
      void openAnalyseFor(card);
      setDragX(0);
      setDragY(0);
      return;
    }

    // Swipe right (investigating) or left (not_relevant)
    setLastAction(action);
    setDragX(0);
    setDragY(0);
    setTimeout(() => setLastAction(null), 300);

    if (card.source === 'own' && card.propertyId) {
      // Own property — update status
      if (action !== 'not_relevant') trackInteraction(card.propertyId, 'status_change');
      setCurrent(c => c + 1);
      update(card.propertyId, {
        status: action === 'interested' ? 'investigating' : action,
        movedToStageAt: new Date().toISOString(),
      });
    } else if (card.source === 'scraped' && card.scrapedListingId) {
      if (action === 'investigating') {
        // Scraped — save to funnel
        setCurrent(c => c + 1);
        try {
          const { property } = await saveScrapedListing(card.scrapedListingId);
          optimisticInsert(property);
        } catch {
          // 409 = already saved, ignore
        }
      } else {
        // Scraped — dismiss (skip, don't save)
        setDismissedIds(prev => new Set(prev).add(card.id));
        setCurrent(c => c + 1);
      }
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current || !isDragging) return;
    setDragX(e.clientX - dragStart.current.x);
    setDragY(e.clientY - dragStart.current.y);
  }

  async function onPointerUp() {
    const absX = Math.abs(dragX);
    const absY = Math.abs(dragY);

    if (absX > absY) {
      if (dragX > 100) await handleAction('investigating');
      else if (dragX < -100) await handleAction('not_relevant');
      else { setDragX(0); setDragY(0); }
    } else {
      if (dragY < -100) await handleAction('open');
      else if (dragY > 100) await handleAction('analyse');
      else { setDragX(0); setDragY(0); }
    }

    dragStart.current = null;
    setIsDragging(false);
  }

  const swipeIntent =
    Math.abs(dragX) > Math.abs(dragY)
      ? dragX > 50 ? 'investigating' : dragX < -50 ? 'not_relevant' : null
      : dragY < -50 ? 'open' : dragY > 50 ? 'analyse' : null;

  const overlayConfig: Record<string, { bg: string; label: string }> = {
    investigating:  { bg: 'bg-emerald-500', label: card?.source === 'scraped' ? t('overlay.save') : t('overlay.investigating') },
    not_relevant:   { bg: 'bg-rose-500',    label: card?.source === 'scraped' ? t('overlay.skip') : t('overlay.notRelevant') },
    open:           { bg: 'bg-blue-500',    label: t('overlay.openListing') },
    analyse:        { bg: 'bg-amber-500',   label: t('overlay.analyse') },
  };

  const overlayOpacity = Math.min(
    Math.max(Math.abs(dragX), Math.abs(dragY)) / 150,
    0.85
  );

  // Convert FinderCard to ListingCard for PropertyCard component
  function finderCardToCardProperty(c: FinderCard): ListingCard {
    return {
      id: c.source === 'own' && c.propertyId ? c.propertyId : c.id,
      title: c.title,
      price: c.price,
      sizeSqm: c.sizeSqm,
      rooms: c.rooms,
      location: c.location,
      zipCode: c.zipCode,
      imageUrl: c.imageUrl,
      sourceUrl: c.sourceUrl,
      platform: c.platform,
      source: c.source,
      scrapedListingId: c.scrapedListingId,
      emailReceivedAt: c.emailReceivedAt,
      analysisCount: c.analysisCount ?? 0,
      documentCount: c.documentCount ?? 0,
    };
  }

  // Resolve "open the analysis modal for this card" — works for both own
  // and scraped. Scraped auto-saves at status 'new' (matches forwarded
  // landing) and opens on the freshly-created UserListing. Re-using an
  // existing UserListing (saved-then-undone, or saved from another surface)
  // is preferred to a duplicate POST.
  async function openAnalyseFor(item: ListingCard): Promise<void> {
    if (item.source === 'own') {
      const prop = allOwn.find(p => p.id === item.id);
      if (!prop) return;
      trackInteraction(prop.id, 'analysis');
      setAnalyseProperty(prop);
      return;
    }
    if (!item.scrapedListingId) return;
    trackScrapedInteraction(item.scrapedListingId, 'view');
    const existing = item.sourceUrl
      ? allOwn.find(p => p.sourceUrl === item.sourceUrl)
      : null;
    if (existing) {
      trackInteraction(existing.id, 'analysis');
      setAnalyseProperty(existing);
      return;
    }
    try {
      const { property } = await saveScrapedListing(item.scrapedListingId, 'new');
      optimisticInsert(property);
      trackInteraction(property.id, 'analysis');
      setAnalyseProperty(property);
    } catch {
      // 409 — race with another tab. Silent; user can re-tap.
    }
  }

  // Card actions for the PropertyCard component
  const cardActions: CardActions = useMemo(() => ({
    onSaveToFunnel: async (item: ListingCard) => {
      // Own at 'new' → promote to investigating (ADR-012 v1.2). Finder's
      // existing swipe-right behaviour already does this — this path is the
      // heart-icon variant and uses the same update call. We DON'T advance
      // `current` here: the card stays put under the user's pointer like a
      // confirmation, mirroring Discover's "remove only on next page load".
      if (item.source === 'own' && item.status === 'new') {
        update(item.id, {
          status: 'investigating',
          movedToStageAt: new Date().toISOString(),
        });
        return;
      }
      if (item.source !== 'scraped' || !item.scrapedListingId) return;
      setLastAction('investigating');
      setCurrent(c => c + 1);
      setDragX(0); setDragY(0);
      setTimeout(() => setLastAction(null), 300);
      try {
        const { property } = await saveScrapedListing(item.scrapedListingId);
        optimisticInsert(property);
      } catch { /* 409 */ }
    },
    onAnalyse: (item: ListingCard) => {
      void openAnalyseFor(item);
      setDragX(0); setDragY(0);
    },
    onReportDead: (item: ListingCard) => {
      if (item.source === 'own') {
        optimisticUpdate(item.id, { listingStatus: 'expired', listingExpiredAt: new Date().toISOString() });
        markMutationStart();
        reportUnavailable(item.id)
          .catch(() => {})
          .finally(() => markMutationEnd());
      } else {
        setCurrent(c => c + 1);
        setDragX(0); setDragY(0);
        setDismissedIds(prev => new Set(prev).add(`scraped-${item.scrapedListingId}`));
      }
    },
    onDismiss: (item: ListingCard) => {
      setLastAction('not_relevant');
      setCurrent(c => c + 1);
      setDragX(0); setDragY(0);
      setTimeout(() => setLastAction(null), 300);

      if (item.source === 'own') {
        update(item.id, { status: 'not_relevant', movedToStageAt: new Date().toISOString() });
      } else {
        setDismissedIds(prev => new Set(prev).add(`scraped-${item.scrapedListingId}`));
      }
    },
    onUrlClick: (item: ListingCard) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'url_click');
      } else if (item.scrapedListingId) {
        trackScrapedInteraction(item.scrapedListingId, 'url_click');
      }
    },
  }), [update, optimisticUpdate, optimisticInsert]);

  const loading = propsLoading || scrapedLoading;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-gray-400">{t('loading')}</p>
    </div>
  );

  const allReviewed = current >= total;

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-4 px-4 pb-8 w-full">

      {/* Preset + saved filter pills.
          ADR-023 §5.3 — when the pill bar is the filter UI it renders in
          compact mode, collapsed behind a "Filter" expander (mid-triage,
          sliders are noise). While the flag is off it renders as today. */}
      {PILL_BAR_ONLY_FILTERS ? (
        <div className="w-full max-w-2xl">
          <button
            type="button"
            onClick={() => setFilterExpanded((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-full px-3 py-1"
          >
            {tPreset('filterToggle')} {filterExpanded ? '▴' : '▾'}
          </button>
          {filterExpanded && (
            <div className="mt-2">
              <PresetFilters
                active={activePresets}
                onChange={setActivePresets}
                savedFilters={savedFilters}
                activeSavedFilterIds={activeSavedFilterIds}
                onToggleSavedFilter={toggleSavedFilter}
                onDeleteFilter={removeFilter}
                align="center"
                compact
                values={filterValues}
                onValuesChange={setFilterValues}
              />
            </div>
          )}
        </div>
      ) : (
        <PresetFilters
          active={activePresets}
          onChange={setActivePresets}
          savedFilters={savedFilters}
          activeSavedFilterIds={activeSavedFilterIds}
          onToggleSavedFilter={toggleSavedFilter}
          onDeleteFilter={removeFilter}
          align="center"
        />
      )}


      {allReviewed ? (
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="text-center px-8 max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('allCaughtUp.title')}</h2>
            <p className="text-gray-500 mb-2">{t('allCaughtUp.subtitle', { total })}</p>
            <p className="text-sm text-gray-400 mb-8">{t('allCaughtUp.widenHint')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => { setCurrent(0); setDismissedIds(new Set()); }}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('allCaughtUp.startOver')}
              </button>
              <Link
                href="/dashboard"
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors text-center"
              >
                {t('allCaughtUp.backToDashboard')}
              </Link>
              <Link
                href="/funnel"
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors text-center"
              >
                {t('allCaughtUp.goToFunnel')}
              </Link>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Card */}
      <div
        className="relative w-full max-w-sm mx-auto cursor-grab active:cursor-grabbing select-none"
        style={{
          transform: `translateX(${dragX}px) translateY(${dragY}px) rotate(${dragX * 0.04}deg)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Drag overlay */}
        {swipeIntent && (
          <div
            className={`absolute inset-0 z-10 rounded-2xl ${overlayConfig[swipeIntent].bg} flex items-center justify-center`}
            style={{ opacity: overlayOpacity }}
          >
            <span className="text-white text-2xl font-bold tracking-wide">
              {overlayConfig[swipeIntent].label}
            </span>
          </div>
        )}

        {/* Action flash */}
        {lastAction && overlayConfig[lastAction] && (
          <div className={`absolute inset-0 z-10 rounded-2xl flex items-center justify-center ${overlayConfig[lastAction].bg}`}>
            <span className="text-white text-2xl font-bold">{overlayConfig[lastAction].label}</span>
          </div>
        )}

        {/* PropertyCard with stage dropdown, analyse, report, dismiss */}
        <div className="pointer-events-auto">
          <PropertyCard item={finderCardToCardProperty(card)} actions={cardActions} />
        </div>
      </div>

      {/* Swipe directions hint */}
      <div className="flex gap-6 text-xs text-gray-400 text-center mt-3">
        <span>{card.source === 'scraped' ? t('directions.leftScraped') : t('directions.left')}</span>
        <span>{t('directions.up')}</span>
        <span>{t('directions.down')}</span>
        <span>{card.source === 'scraped' ? t('directions.rightScraped') : t('directions.right')}</span>
      </div>

      {/* Progress count */}
      <div className="text-gray-400 text-xs mt-2">{t('progress', { current: current + 1, total })}</div>

      {/* Analyse modal — opens on both own and (auto-saved) scraped cards. */}
      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}
      </>
      )}
    </div>
  );
}
