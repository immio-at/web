'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useUserListings } from '@/hooks/useUserListings';
import FunnelBoard from '@/components/FunnelBoard';
import PresetFilters from '@/components/PresetFilters';
import AddPropertyButton from '@/components/ingestion/AddPropertyButton';
import { Link } from '@/i18n/navigation';
import { type PresetFilterKey } from '@/lib/preset-filters';
import { type UserListing } from '@/lib/api';
import { EMPTY_FILTERS, type FilterValues } from '@/lib/filter-values';
import { PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

export default function FunnelPage() {
  const t = useTranslations('funnel');
  const tPortfolio = useTranslations('portfolio');
  const tPreset = useTranslations('presetFilters');
  const { filters: savedFilters, remove: removeFilter } = useSavedFilters();
  const { properties } = useUserListings();
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(new Set());
  const [analyseProperty, setAnalyseProperty] = useState<UserListing | null>(null);
  // ADR-023 §5.2 — the consolidated pill bar's live filter state. Inert
  // while PILL_BAR_ONLY_FILTERS is off (FunnelBoard ignores it).
  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [filterExpanded, setFilterExpanded] = useState(false);

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

      {/* ADR-023 §5.3 — pill bar collapsed behind a toggle button, matching
          the Finder pattern. Funnel is mid-funnel triage; the filter sliders
          are noise most of the time. */}
      {PILL_BAR_ONLY_FILTERS ? (
        <div className="mb-3">
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
                showStages
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
          showStages={PILL_BAR_ONLY_FILTERS}
          values={filterValues}
          onValuesChange={setFilterValues}
        />
      )}

      <FunnelBoard
        activePresets={activePresets}
        activeSavedFilterIds={activeSavedFilterIds}
        savedFilters={savedFilters}
        filterValues={filterValues}
        headerAction={
          <div className="flex items-center gap-2">
            <Link
              href="/funnel/analyses/rental"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 3h18v18H3z" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
              {tPortfolio('button.label')}
            </Link>
            <AddPropertyButton size="lg" />
          </div>
        }
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
