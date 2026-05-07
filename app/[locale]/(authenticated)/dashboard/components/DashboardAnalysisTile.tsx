'use client';

/**
 * ADR-016 PA7 — Dashboard analyses tile.
 *
 * Compact version of the portfolio table. Three internal tabs (Rental /
 * Flip / Owner), top-5 per tab by the same default sort as the full
 * table. Last-active tab persisted in localStorage so the tile shows
 * what the user was last looking at, not always Rental.
 */

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useProperties } from '@/hooks/useProperties';
import { usePortfolioAnalyses } from '@/hooks/usePortfolioAnalyses';
import { defaultSortFor } from '@/lib/portfolioAnalyses';
import PortfolioAnalysisTable from '@/components/portfolio/PortfolioAnalysisTable';
import { Link } from '@/i18n/navigation';
import type { Property } from '@/lib/api';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

const TILE_TAB_LS_KEY = 'dashboard.analyses-tile.activeTab';
type UsageType = 'rental' | 'flip' | 'owner';

export default function DashboardAnalysisTile() {
  const t = useTranslations('portfolio');
  const locale = useLocale() as 'de' | 'en';
  const { properties } = useProperties();

  // ── Active tab ─────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<UsageType>('rental');
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TILE_TAB_LS_KEY);
      if (stored === 'rental' || stored === 'flip' || stored === 'owner') {
        setActiveTab(stored);
      }
    } catch {
      /* private mode */
    }
  }, []);

  function selectTab(tab: UsageType) {
    setActiveTab(tab);
    try {
      localStorage.setItem(TILE_TAB_LS_KEY, tab);
    } catch {
      /* private mode */
    }
  }

  const sort = defaultSortFor(activeTab);
  const { rows, loading, error, totalCount, decidedCount, countsByUsageType } =
    usePortfolioAnalyses({
      usageType: activeTab,
      includeDecided: false,
      sort,
      limit: 5,
    });

  // ── Click-through to modal ─────────────────────────────────────
  const [modalProperty, setModalProperty] = useState<Property | null>(null);
  function handleOpen(propertyId: string, _analysisId: string) {
    void _analysisId;
    const prop = properties.find((p) => p.id === propertyId);
    if (prop) setModalProperty(prop);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-base font-semibold text-gray-900">{t('tile.title')}</h3>
        <span className="text-xs text-slate-500">{t('tile.savedCount', { count: totalCount })}</span>
      </div>

      <div className="flex border-b border-slate-100 -mx-5">
        {(['rental', 'flip', 'owner'] as const).map((tab) => {
          const active = tab === activeTab;
          const count = countsByUsageType[tab];
          return (
            <button
              key={tab}
              type="button"
              onClick={() => selectTab(tab)}
              className={`flex-1 px-3 py-2 text-xs font-medium ${
                active
                  ? 'text-slate-900 border-b-2 border-slate-900 -mb-px'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t(`tab.${tab}.label`)} <span className="text-slate-400">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 -mx-5">
        <PortfolioAnalysisTable
          usageType={activeTab}
          rows={rows}
          loading={loading}
          error={error}
          totalCount={totalCount}
          decidedCount={decidedCount}
          includeDecided={false}
          onToggleDecided={() => {
            /* tile is glance-only — toggle lives on the full table */
          }}
          sort={sort}
          onSortChange={() => {
            /* sort fixed to default on the tile */
          }}
          compact={true}
          locale={locale}
          onOpen={handleOpen}
        />
      </div>

      <Link
        href={`/funnel/analyses/${activeTab}`}
        className="mt-3 block w-full text-center text-sm font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg py-2.5 transition-colors"
      >
        {t('tile.viewAll')}
      </Link>

      {modalProperty && (
        <PropertyAnalysisModal
          property={modalProperty}
          initialViewMode="analyses"
          onClose={() => setModalProperty(null)}
        />
      )}
    </div>
  );
}
