'use client';

import { useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Property, SavedFilter, reportUnavailable, delistProperty, saveScrapedListing } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import DiscoverTile from '@/app/[locale]/(authenticated)/dashboard/components/DiscoverTile';
import FunnelSummaryTile from '@/app/[locale]/(authenticated)/dashboard/components/FunnelSummaryTile';
import SourcesSetupTile from '@/app/[locale]/(authenticated)/dashboard/components/SourcesSetupTile';
import AnalyticsSnapshotTile from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import PropertyCarousel from '@/app/[locale]/(authenticated)/dashboard/components/PropertyCarousel';
import RecommendedCarousel from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';
import { type CardProperty, type CardActions } from '@/components/PropertyCard';
import { useTranslations } from 'next-intl';

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
  recentlyViewed?: Property[];
  immioEmail: string | null;
  savedFilters: SavedFilter[];
}) {
  const t = useTranslations('dashboard.carousels');
  const { update, optimisticUpdate, optimisticInsert } = useProperties();
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);

  // Card actions — shared across all carousels. Recommended carousel may include
  // scraped listings, so onSaveToFunnel is wired for them (own items never hit it).
  const cardActions: CardActions = useMemo(() => ({
    onSaveToFunnel: async (item: CardProperty) => {
      if (item.source !== 'scraped' || !item.scrapedListingId) return;
      try {
        const { property } = await saveScrapedListing(item.scrapedListingId);
        optimisticInsert(property);
      } catch { /* 409 = already saved */ }
    },
    onAnalyse: (item: CardProperty) => {
      trackInteraction(item.id, 'analysis');
      const prop = properties.find(p => p.id === item.id);
      if (prop) setAnalyseProperty(prop);
    },
    onReportDead: (item: CardProperty) => {
      optimisticUpdate(item.id, { listingStatus: 'expired', listingExpiredAt: new Date().toISOString() });
      reportUnavailable(item.id).catch(() => {});
    },
    onDismiss: (item: CardProperty) => {
      update(item.id, { status: 'not_relevant', movedToStageAt: new Date().toISOString() });
    },
    onUrlClick: (item: CardProperty) => {
      trackInteraction(item.id, 'url_click');
    },
  }), [properties, update, optimisticUpdate]);

  // New Arrivals — 20 most recent non-terminal, non-expired properties
  const newArrivals = useMemo(() => {
    return properties
      .filter(p => !EXCLUDED_FROM_ARRIVALS.has(p.status) && p.listingStatus !== 'expired')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
  }, [properties]);

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
        properties={recentlyViewed ?? []}
        emptyMessage={t('recentlyViewedEmpty')}
        actions={cardActions}
      />

      <PropertyCarousel
        title={t('newArrivals')}
        properties={newArrivals}
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
