'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Property, SavedFilter } from '@/lib/api';
import DiscoverTile from '@/app/[locale]/(authenticated)/dashboard/components/DiscoverTile';
import FunnelSummaryTile from '@/app/[locale]/(authenticated)/dashboard/components/FunnelSummaryTile';
import SourcesSetupTile from '@/app/[locale]/(authenticated)/dashboard/components/SourcesSetupTile';
import AnalyticsSnapshotTile from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import PropertyCarousel from '@/app/[locale]/(authenticated)/dashboard/components/PropertyCarousel';
import RecommendedCarousel from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';
import { useTranslations } from 'next-intl';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

type InteractionFn = (id: string, type?: 'view' | 'analysis' | 'url_click' | 'status_change') => void;

// Stages excluded from New Arrivals carousel — terminal + completed stages
const EXCLUDED_FROM_ARRIVALS = new Set(['not_relevant', 'delisted', 'won', 'parked']);

export default function DashboardClient({
  properties,
  onInteraction,
  recentlyViewed,
  immioEmail,
  savedFilters,
}: {
  properties: Property[];
  onInteraction?: InteractionFn;
  recentlyViewed?: Property[];
  immioEmail: string | null;
  savedFilters: SavedFilter[];
}) {
  const t = useTranslations('dashboard.carousels');
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);

  function handleAnalyse(p: Property) {
    onInteraction?.(p.id, 'analysis');
    setAnalyseProperty(p);
  }

  // New Arrivals — 20 most recent non-terminal, non-expired properties
  const newArrivals = useMemo(() => {
    return properties
      .filter(p => !EXCLUDED_FROM_ARRIVALS.has(p.status) && p.listingStatus !== 'expired')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
  }, [properties]);

  return (
    <div>
      {/* Summary Tiles — 2×2 grid, equal row heights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:auto-rows-fr gap-4 mb-8">
        <DiscoverTile savedFilters={savedFilters} properties={properties} />
        <FunnelSummaryTile properties={properties} />
        <SourcesSetupTile properties={properties} immioEmail={immioEmail} />
        <AnalyticsSnapshotTile properties={properties} />
      </div>

      {/* Carousels */}
      <PropertyCarousel
        title={t('newArrivals')}
        properties={newArrivals}
        emptyMessage={t('newArrivalsEmpty')}
        onInteraction={onInteraction}
        onAnalyse={handleAnalyse}
      />

      <PropertyCarousel
        title={t('recentlyViewed')}
        properties={recentlyViewed ?? []}
        emptyMessage={t('recentlyViewedEmpty')}
        onInteraction={onInteraction}
        onAnalyse={handleAnalyse}
      />

      <RecommendedCarousel />

      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}
    </div>
  );
}
