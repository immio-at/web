'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useProperties } from '@/hooks/useProperties';
import FunnelBoard from '@/components/FunnelBoard';
import PresetFilters from '@/components/PresetFilters';
import AddPropertyButton from '@/components/ingestion/AddPropertyButton';
import { type PresetFilterKey } from '@/lib/preset-filters';
import { type Property } from '@/lib/api';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

export default function FunnelPage() {
  const t = useTranslations('funnel');
  const { filters: savedFilters, remove: removeFilter } = useSavedFilters();
  const { properties } = useProperties();
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(new Set());
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);

  // Deep-link: ?analyse=PROPERTY_ID opens the analysis modal automatically.
  // Reads from window.location.search instead of useSearchParams to avoid
  // the Suspense boundary requirement in Next.js production builds.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const analyseId = params.get('analyse');
    if (!analyseId || properties.length === 0) return;
    const prop = properties.find(p => p.id === analyseId);
    if (prop) setAnalyseProperty(prop);
  }, [properties]);

  function toggleSavedFilter(id: string) {
    setActiveSavedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-2">
        <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
        <p className="text-gray-600 mt-1">{t('subtitle')}</p>
      </div>

      <PresetFilters
        active={activePresets}
        onChange={setActivePresets}
        savedFilters={savedFilters}
        activeSavedFilterIds={activeSavedFilterIds}
        onToggleSavedFilter={toggleSavedFilter}
        onDeleteFilter={removeFilter}
      />

      <FunnelBoard
        activePresets={activePresets}
        activeSavedFilterIds={activeSavedFilterIds}
        savedFilters={savedFilters}
        headerAction={<AddPropertyButton size="lg" />}
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
