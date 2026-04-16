'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import FunnelBoard from '@/components/FunnelBoard';
import PresetFilters from '@/components/PresetFilters';
import AddPropertyButton from '@/components/ingestion/AddPropertyButton';
import { type PresetFilterKey } from '@/lib/preset-filters';

export default function FunnelPage() {
  const t = useTranslations('funnel');
  const { filters: savedFilters, remove: removeFilter } = useSavedFilters();
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(new Set());

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
    </div>
  );
}
