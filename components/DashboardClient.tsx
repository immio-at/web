'use client';

import { useState, useMemo } from 'react';
import { Property, SavedFilter } from '@/lib/api';
import PropertyAnalysisModal from '@/components/PropertyAnalysisModal';
import FunnelSummaryTile from '@/app/[locale]/(authenticated)/dashboard/components/FunnelSummaryTile';
import AnalyticsSnapshotTile from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import BrowseTile from '@/app/[locale]/(authenticated)/dashboard/components/BrowseTile';
import SourcesSetupTile from '@/app/[locale]/(authenticated)/dashboard/components/SourcesSetupTile';
import PropertyCarousel from '@/app/[locale]/(authenticated)/dashboard/components/PropertyCarousel';
import RecommendedCarousel from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';
import { useTranslations } from 'next-intl';

type InteractionFn = (id: string, type?: 'view' | 'analysis' | 'url_click' | 'status_change') => void;

const TERMINAL_STAGES = ['not_relevant', 'delisted', 'won', 'parked'];

export default function DashboardClient({
  properties,
  onInteraction,
  recentlyViewed,
  immioEmail,
  lastFilter,
}: {
  properties: Property[];
  onInteraction?: InteractionFn;
  recentlyViewed?: Property[];
  immioEmail: string | null;
  lastFilter?: SavedFilter | null;
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
      .filter(p => !TERMINAL_STAGES.includes(p.status) && p.listingStatus !== 'expired')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
  }, [properties]);

  return (
    <div>
      {/* Summary Tiles — 4-column grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <FunnelSummaryTile properties={properties} />
        <AnalyticsSnapshotTile properties={properties} />
        <BrowseTile lastFilter={lastFilter} />
        <SourcesSetupTile properties={properties} immioEmail={immioEmail} />
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
