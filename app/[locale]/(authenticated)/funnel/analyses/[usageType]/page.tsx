'use client';

/**
 * ADR-016 PA6 — full-page portfolio analyses table.
 *
 * Three deep-linkable tabs: /funnel/analyses/rental | /flip | /owner.
 * Sort, filter, and modal-open state are captured in query parameters
 * so views are bookmarkable and the browser back button works naturally.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useUserListings } from '@/hooks/useUserListings';
import { usePortfolioAnalyses } from '@/hooks/usePortfolioAnalyses';
import {
  defaultSortFor,
  type SortDir,
  type SortState,
} from '@/lib/portfolioAnalyses';
import PortfolioAnalysisTable from '@/components/portfolio/PortfolioAnalysisTable';
import { Link } from '@/i18n/navigation';
import type { UserListing } from '@/lib/api';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

const VALID_USAGE_TYPES = ['rental', 'flip', 'owner'] as const;
type UsageType = (typeof VALID_USAGE_TYPES)[number];

export default function PortfolioAnalysesPage() {
  const t = useTranslations('portfolio');
  const locale = useLocale() as 'de' | 'en';
  const router = useRouter();
  const params = useParams<{ usageType: string; locale: string }>();
  const searchParams = useSearchParams();
  const { properties } = useUserListings();

  const usageTypeParam = params?.usageType ?? 'rental';
  const usageType: UsageType = VALID_USAGE_TYPES.includes(usageTypeParam as UsageType)
    ? (usageTypeParam as UsageType)
    : 'rental';

  // ── URL-state ──────────────────────────────────────────────────
  const sortKey = searchParams.get('sort');
  const sortDir = searchParams.get('dir') as SortDir | null;
  const includeDecided = searchParams.get('decided') === 'true';
  const modalAnalysisId = searchParams.get('modal');

  const sort: SortState = sortKey
    ? { key: sortKey, dir: sortDir === 'asc' ? 'asc' : 'desc' }
    : defaultSortFor(usageType);

  const { rows, loading, error, totalCount, decidedCount, countsByUsageType } =
    usePortfolioAnalyses({ usageType, includeDecided, sort });

  function setQueryParams(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null) sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname);
  }

  function handleSortChange(s: SortState) {
    setQueryParams({ sort: s.key, dir: s.dir });
  }

  function handleToggleDecided(next: boolean) {
    setQueryParams({ decided: next ? 'true' : null });
  }

  function handleOpenRow(propertyId: string, analysisId: string) {
    setQueryParams({ modal: analysisId });
    void propertyId;
  }

  function handleCloseModal() {
    setQueryParams({ modal: null });
  }

  // ── Resolve modal property + initial analysis ──────────────────
  const modalProperty: UserListing | null = useMemo(() => {
    if (!modalAnalysisId) return null;
    const row = rows.find((r) => r.analysis.id === modalAnalysisId);
    if (!row) return null;
    return properties.find((p) => p.id === row.analysis.propertyId) ?? null;
  }, [modalAnalysisId, rows, properties]);

  // ── Tabs ────────────────────────────────────────────────────────
  const tabs: { key: UsageType; count: number }[] = [
    { key: 'rental', count: countsByUsageType.rental },
    { key: 'flip', count: countsByUsageType.flip },
    { key: 'owner', count: countsByUsageType.owner },
  ];

  return (
    <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('title')}</h2>
          <p className="text-slate-600 mt-1 text-sm">{t('subtitle', { total: totalCount })}</p>
        </div>
        <Link
          href="/funnel"
          className="text-sm text-slate-600 hover:text-slate-900 underline"
        >
          ← {t('backToFunnel')}
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map(({ key, count }) => {
            const active = key === usageType;
            return (
              <Link
                key={key}
                href={`/funnel/analyses/${key}`}
                className={`pb-3 text-sm font-medium border-b-2 ${
                  active
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t(`tab.${key}.label`)}
                <span className="ml-1.5 text-xs text-slate-400">({count})</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <PortfolioAnalysisTable
        usageType={usageType}
        rows={rows}
        loading={loading}
        error={error}
        totalCount={totalCount}
        decidedCount={decidedCount}
        includeDecided={includeDecided}
        onToggleDecided={handleToggleDecided}
        sort={sort}
        onSortChange={handleSortChange}
        compact={false}
        locale={locale}
        onOpen={handleOpenRow}
      />

      {modalProperty && (
        <PropertyAnalysisModal
          property={modalProperty}
          initialViewMode="analyses"
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
