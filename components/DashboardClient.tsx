'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { UserListing, Listing, SavedFilter, RecentlyViewedItem, reportUnavailable, saveScrapedListing, getScrapedListings } from '@/lib/api';
import { useProperties, markMutationStart, markMutationEnd } from '@/hooks/useProperties';
import { useAuth } from '@/context/AuthContext';
import { trackInteraction, trackScrapedInteraction } from '@/hooks/useInteractionTracker';
import DiscoverTile from '@/app/[locale]/(authenticated)/dashboard/components/DiscoverTile';
import SourcesSetupTile from '@/app/[locale]/(authenticated)/dashboard/components/SourcesSetupTile';
import AnalyticsSnapshotTile from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import DashboardAnalysisTile from '@/app/[locale]/(authenticated)/dashboard/components/DashboardAnalysisTile';
import PropertyCarousel from '@/app/[locale]/(authenticated)/dashboard/components/PropertyCarousel';
import RecommendedCarousel from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';
import { type CardProperty, type CardActions } from '@/components/PropertyCard';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// Prisma serializes Decimal columns as strings — coerce numeric fields here.
function ownPropertyToCard(p: UserListing): CardProperty {
  return {
    id: p.id,
    title: p.title,
    price: p.price != null ? parseFloat(String(p.price)) : null,
    sizeSqm: p.sizeSqm != null ? parseFloat(String(p.sizeSqm)) : null,
    rooms: p.rooms != null ? parseFloat(String(p.rooms)) : null,
    location: p.location,
    zipCode: p.zipCode,
    imageUrl: p.imageUrl,
    sourceUrl: p.sourceUrl,
    platform: p.platform,
    status: p.status,
    listingStatus: p.listingStatus,
    source: 'own',
    emailReceivedAt: p.emailReceivedAt,
    analysisCount: p.analysisCount ?? 0,
    documentCount: p.documentCount ?? 0,
  };
}

function scrapedListingToCard(s: Listing): CardProperty {
  return {
    id: `scraped-${s.id}`,
    title: s.title,
    price: s.price != null ? parseFloat(String(s.price)) : null,
    sizeSqm: s.sizeSqm != null ? parseFloat(String(s.sizeSqm)) : null,
    rooms: s.rooms != null ? parseFloat(String(s.rooms)) : null,
    location: s.location,
    zipCode: s.zipCode,
    imageUrl: s.imageUrl,
    sourceUrl: s.sourceUrl,
    platform: s.platform,
    source: 'scraped',
    scrapedListingId: s.id,
    savedByUser: s.savedByUser,
  };
}

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

// Stages excluded from New Arrivals carousel — terminal + completed stages
const EXCLUDED_FROM_ARRIVALS = new Set(['not_relevant', 'delisted', 'won', 'parked']);

// Carousel placeholder shown while the property list is still loading — the
// carousels genuinely need `properties`, so they skeleton rather than flash
// a "locked" / "empty" state. The summary tiles below mount regardless.
function CarouselSkeleton() {
  return (
    <div className="mb-6">
      <div className="h-4 bg-gray-100 rounded w-32 mb-3 animate-pulse" />
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-48 bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse">
            <div className="h-28 bg-gray-100" />
            <div className="p-2 space-y-2">
              <div className="h-3 bg-gray-100 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardClient({
  properties,
  propertiesLoading = false,
  recentlyViewed,
  immioEmail,
  savedFilters,
}: {
  properties: UserListing[];
  propertiesLoading?: boolean;
  recentlyViewed?: RecentlyViewedItem[];
  immioEmail: string | null;
  savedFilters: SavedFilter[];
}) {
  const t = useTranslations('dashboard.carousels');
  const { update, optimisticUpdate, optimisticInsert } = useProperties();
  const [analyseProperty, setAnalyseProperty] = useState<UserListing | null>(null);

  // Card actions — shared across all carousels. Carousels can now mix own +
  // scraped cards (Recommended scoring, New Arrivals fallback), so each
  // handler branches on item.source.
  const cardActions: CardActions = useMemo(() => ({
    onSaveToFunnel: async (item: CardProperty) => {
      // Own at status 'new' → promote to 'investigating' (the new house-icon
      // semantic per ADR-012 v1.2: gray = pre-funnel, click moves into the
      // active funnel).
      if (item.source === 'own' && item.status === 'new') {
        update(item.id, {
          status: 'investigating',
          movedToStageAt: new Date().toISOString(),
        });
        return;
      }
      if (item.source !== 'scraped' || !item.scrapedListingId) return;
      try {
        const { property } = await saveScrapedListing(item.scrapedListingId);
        optimisticInsert(property);
      } catch { /* 409 = already saved */ }
    },
    onAnalyse: async (item: CardProperty) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'analysis');
        const prop = properties.find(p => p.id === item.id);
        if (prop) setAnalyseProperty(prop);
        return;
      }
      // Scraped — open the same modal as forwarded properties. Reuse an
      // existing UserListing by sourceUrl if present (prior save / undo);
      // otherwise auto-create at status 'new' so it lands where forwarded
      // emails do, without polluting the funnel kanban.
      if (!item.scrapedListingId) return;
      trackScrapedInteraction(item.scrapedListingId, 'view');
      const existing = item.sourceUrl
        ? properties.find(p => p.sourceUrl === item.sourceUrl)
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
        // 409 — race: another tab created it. User can re-click.
      }
    },
    onReportDead: (item: CardProperty) => {
      // Listing-expiry signal only applies to own properties — the scraper
      // pipeline has its own soft-delete mechanism.
      if (item.source !== 'own') return;
      optimisticUpdate(item.id, { listingStatus: 'expired', listingExpiredAt: new Date().toISOString() });
      markMutationStart();
      reportUnavailable(item.id)
        .catch(() => {})
        .finally(() => markMutationEnd());
    },
    onDismiss: (item: CardProperty) => {
      // Own → mark not_relevant. Scraped dismissal isn't persisted from
      // the dashboard for now (the search page has its own dismissedIds
      // local-state pattern); leave as a soft no-op so the X is harmless.
      if (item.source !== 'own') return;
      update(item.id, { status: 'not_relevant', movedToStageAt: new Date().toISOString() });
    },
    onUrlClick: (item: CardProperty) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'url_click');
      } else if (item.scrapedListingId) {
        trackScrapedInteraction(item.scrapedListingId, 'url_click');
      }
    },
  }), [properties, update, optimisticUpdate, optimisticInsert]);

  // New Arrivals — defaults to search-agent-sourced properties (emailReceivedAt
  // non-null), so users see the listings their portal subscriptions delivered.
  // Falls back to the latest scraped listings only when the user has not yet
  // configured / received any search-agent emails — that way the carousel
  // never sits empty with an "set up your search agents" message dominating
  // the dashboard.
  const searchAgentArrivals = useMemo<CardProperty[]>(() => {
    return properties
      .filter(p =>
        p.emailReceivedAt != null &&
        !EXCLUDED_FROM_ARRIVALS.has(p.status) &&
        p.listingStatus !== 'expired'
      )
      .sort((a, b) => {
        const ta = new Date(a.emailReceivedAt ?? a.createdAt).getTime();
        const tb = new Date(b.emailReceivedAt ?? b.createdAt).getTime();
        return tb - ta;
      })
      .slice(0, 20)
      .map(ownPropertyToCard);
  }, [properties]);

  const { session, loading: authLoading } = useAuth();
  const [scrapedFallback, setScrapedFallback] = useState<CardProperty[] | null>(null);

  useEffect(() => {
    if (authLoading || !session) return;
    // Wait for the real property list before deciding on the fallback —
    // firing while `properties` is still [] would trigger a wasted scraped
    // fetch that gets discarded the moment search-agent arrivals load.
    if (propertiesLoading) return;
    if (searchAgentArrivals.length > 0) { setScrapedFallback(null); return; }
    if (scrapedFallback !== null) return; // already fetched
    getScrapedListings({
      page: 1,
      hideNullPrice: true,
      sortBy: 'listedDate',
      sortOrder: 'desc',
    } as any)
      .then(r => setScrapedFallback(r.data.slice(0, 20).map(scrapedListingToCard)))
      .catch(() => setScrapedFallback([]));
    // session?.user?.id is stable across token refresh; the full `session`
    // object reference changes on each refresh and would refetch the
    // fallback every time the tab regained focus.
  }, [authLoading, session?.user?.id, propertiesLoading, searchAgentArrivals.length, scrapedFallback]);

  const newArrivalCards = searchAgentArrivals.length > 0
    ? searchAgentArrivals
    : (scrapedFallback ?? []);

  const recentlyViewedCards = useMemo<CardProperty[]>(() => {
    return (recentlyViewed ?? []).map(item =>
      item.kind === 'own'
        ? ownPropertyToCard(item.property)
        : scrapedListingToCard(item.listing),
    );
  }, [recentlyViewed]);

  const tEmpty = useTranslations('dashboard.empty');
  const hasNoOwnProperties = properties.length === 0;

  return (
    <div>
      {/* ADR-021 HH9 — empty-state forwarding-setup link. Surfaces when the
          user has zero properties; routes to the Help page's email forwarding
          section so a fresh tester has a clear next-action. Suppressed while
          the property list is still loading so it doesn't flash on every load. */}
      {!propertiesLoading && hasNoOwnProperties && (
        <div className="mb-6 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm text-teal-900">{tEmpty('noPropertiesYet')}</p>
          <Link
            href="/help#forwarding"
            className="text-sm font-medium text-teal-700 hover:text-teal-800 underline whitespace-nowrap"
          >
            {tEmpty('setupForwardingLink')} →
          </Link>
        </div>
      )}

      {/* Carousels — top of the page. Recommended → Recently Viewed → New Arrivals.
          ADR-021 HH8 tour anchor `dashboard-first-card`: every carousel passes
          the id to its first card; `document.querySelector` matches the first
          one in document order (Recommended → Recently Viewed → New Arrivals)
          so the spotlight follows the topmost non-empty carousel without
          coordination state between sibling components.
          While the property list loads the carousels skeleton — they all
          depend on `properties` so there is nothing meaningful to show yet. */}
      {propertiesLoading ? (
        <>
          <CarouselSkeleton />
          <CarouselSkeleton />
          <CarouselSkeleton />
        </>
      ) : (
        <>
          <RecommendedCarousel
            properties={properties}
            actions={cardActions}
            firstCardTourId="dashboard-first-card"
          />

          <PropertyCarousel
            title={t('recentlyViewed')}
            cards={recentlyViewedCards}
            emptyMessage={t('recentlyViewedEmpty')}
            actions={cardActions}
            firstCardTourId="dashboard-first-card"
          />

          <PropertyCarousel
            title={t('newArrivals')}
            cards={newArrivalCards}
            emptyMessage={t('newArrivalsEmpty')}
            actions={cardActions}
            firstCardTourId="dashboard-first-card"
          />
        </>
      )}

      {/* Summary tiles — 2×2 grid below the carousels. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:auto-rows-fr gap-4 mt-8 mb-8">
        <DiscoverTile savedFilters={savedFilters} properties={properties} />
        <DashboardAnalysisTile />
        <SourcesSetupTile properties={properties} immioEmail={immioEmail} />
        <AnalyticsSnapshotTile properties={properties} />
      </div>

      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}
    </div>
  );
}
