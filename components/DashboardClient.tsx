'use client';

import { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Property, ScrapedListing, SavedFilter, RecentlyViewedItem, reportUnavailable, saveScrapedListing, getScrapedListings } from '@/lib/api';
import { useProperties, markMutationStart, markMutationEnd } from '@/hooks/useProperties';
import { useAuth } from '@/context/AuthContext';
import { trackInteraction, trackScrapedInteraction } from '@/hooks/useInteractionTracker';
import DiscoverTile from '@/app/[locale]/(authenticated)/dashboard/components/DiscoverTile';
import FunnelSummaryTile from '@/app/[locale]/(authenticated)/dashboard/components/FunnelSummaryTile';
import SourcesSetupTile from '@/app/[locale]/(authenticated)/dashboard/components/SourcesSetupTile';
import AnalyticsSnapshotTile from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import PropertyCarousel from '@/app/[locale]/(authenticated)/dashboard/components/PropertyCarousel';
import RecommendedCarousel from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';
import { type CardProperty, type CardActions } from '@/components/PropertyCard';
import { useTranslations } from 'next-intl';

// Prisma serializes Decimal columns as strings — coerce numeric fields here.
function ownPropertyToCard(p: Property): CardProperty {
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
  };
}

function scrapedListingToCard(s: ScrapedListing): CardProperty {
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

export default function DashboardClient({
  properties,
  recentlyViewed,
  immioEmail,
  savedFilters,
}: {
  properties: Property[];
  recentlyViewed?: RecentlyViewedItem[];
  immioEmail: string | null;
  savedFilters: SavedFilter[];
}) {
  const t = useTranslations('dashboard.carousels');
  const { update, optimisticUpdate, optimisticInsert } = useProperties();
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);

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
    onAnalyse: (item: CardProperty) => {
      if (item.source === 'own') {
        trackInteraction(item.id, 'analysis');
        const prop = properties.find(p => p.id === item.id);
        if (prop) setAnalyseProperty(prop);
        return;
      }
      // Scraped — image-tap signals interest. Track view so it surfaces in
      // Recently Viewed; no analysis modal exists for scraped rows.
      if (item.scrapedListingId) {
        trackScrapedInteraction(item.scrapedListingId, 'view');
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
  }, [authLoading, session?.user?.id, searchAgentArrivals.length, scrapedFallback]);

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

  return (
    <div>
      {/* Summary Tiles — 2×2 grid, equal row heights.
          Add Property entry point now lives in the DiscoverTile header. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:auto-rows-fr gap-4 mb-8">
        <DiscoverTile savedFilters={savedFilters} properties={properties} />
        <FunnelSummaryTile properties={properties} />
        <SourcesSetupTile properties={properties} immioEmail={immioEmail} />
        <AnalyticsSnapshotTile properties={properties} />
      </div>

      {/* Carousels */}
      <RecommendedCarousel properties={properties} actions={cardActions} />

      <PropertyCarousel
        title={t('recentlyViewed')}
        cards={recentlyViewedCards}
        emptyMessage={t('recentlyViewedEmpty')}
        actions={cardActions}
      />

      <PropertyCarousel
        title={t('newArrivals')}
        cards={newArrivalCards}
        emptyMessage={t('newArrivalsEmpty')}
        actions={cardActions}
      />

      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}
    </div>
  );
}
