'use client';

/**
 * ADR-016 PA5 — PortfolioAnalysisTable.
 *
 * Shared between the full Funnel-page table and the Dashboard tile via
 * the `compact` prop. Compact mode hides sort headers, the decided
 * toggle, and the CSV export button — and limits row count via the
 * hook caller.
 */

import { useTranslations } from 'next-intl';
import type { PortfolioRow } from '@/hooks/usePortfolioAnalyses';
import {
  exportToCsv,
  downloadCsv,
  type SortDir,
  type SortState,
} from '@/lib/portfolioAnalyses';
import PortfolioAnalysisRow from './PortfolioAnalysisRow';

interface Props {
  usageType: 'rental' | 'flip' | 'owner';
  rows: PortfolioRow[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  decidedCount: number;
  includeDecided: boolean;
  onToggleDecided: (next: boolean) => void;
  sort: SortState;
  onSortChange: (s: SortState) => void;
  compact: boolean;
  locale: 'de' | 'en';
  onOpen: (propertyId: string, analysisId: string) => void;
}

interface ColumnSpec {
  key: string;
  labelKey: string; // i18n key under `portfolio.column.*`
  sortable: boolean;
  align?: 'left' | 'right';
}

const COLUMNS_RENTAL: ColumnSpec[] = [
  { key: 'property', labelKey: 'property', sortable: false, align: 'left' },
  { key: 'stage', labelKey: 'stage', sortable: false, align: 'left' },
  { key: 'price', labelKey: 'price', sortable: true, align: 'right' },
  { key: 'sizeSqm', labelKey: 'sizeSqm', sortable: true, align: 'right' },
  { key: 'pricePerSqm', labelKey: 'pricePerSqm', sortable: true, align: 'right' },
  { key: 'cashflowRendite', labelKey: 'cashflowRendite', sortable: true, align: 'right' },
  { key: 'gesamtrenditeEk', labelKey: 'gesamtrenditeEk', sortable: true, align: 'right' },
  { key: 'monthlyCashflow', labelKey: 'monthlyCashflow', sortable: true, align: 'right' },
  { key: 'updatedAt', labelKey: 'lastCalculated', sortable: true, align: 'right' },
  { key: 'flags', labelKey: 'flags', sortable: false, align: 'left' },
];

const COLUMNS_FLIP: ColumnSpec[] = [
  { key: 'property', labelKey: 'property', sortable: false, align: 'left' },
  { key: 'stage', labelKey: 'stage', sortable: false, align: 'left' },
  { key: 'price', labelKey: 'price', sortable: true, align: 'right' },
  { key: 'sizeSqm', labelKey: 'sizeSqm', sortable: true, align: 'right' },
  { key: 'holdingMonths', labelKey: 'holdingMonths', sortable: true, align: 'right' },
  { key: 'resalePrice', labelKey: 'resalePrice', sortable: true, align: 'right' },
  { key: 'netProfit', labelKey: 'netProfit', sortable: true, align: 'right' },
  { key: 'roiEquity', labelKey: 'roiEquity', sortable: true, align: 'right' },
  { key: 'roiAnnualisedCompound', labelKey: 'annualisedCompound', sortable: true, align: 'right' },
  { key: 'updatedAt', labelKey: 'lastCalculated', sortable: true, align: 'right' },
  { key: 'flags', labelKey: 'flags', sortable: false, align: 'left' },
];

const COLUMNS_OWNER: ColumnSpec[] = [
  { key: 'property', labelKey: 'property', sortable: false, align: 'left' },
  { key: 'stage', labelKey: 'stage', sortable: false, align: 'left' },
  { key: 'price', labelKey: 'price', sortable: true, align: 'right' },
  { key: 'sizeSqm', labelKey: 'sizeSqm', sortable: true, align: 'right' },
  { key: 'monthlyCost', labelKey: 'monthlyCost', sortable: true, align: 'right' },
  { key: 'annualCost', labelKey: 'annualCost', sortable: true, align: 'right' },
  { key: 'totalCostOverTerm', labelKey: 'totalCostOverTerm', sortable: true, align: 'right' },
  { key: 'updatedAt', labelKey: 'lastCalculated', sortable: true, align: 'right' },
  { key: 'flags', labelKey: 'flags', sortable: false, align: 'left' },
];

function columnsFor(usageType: 'rental' | 'flip' | 'owner'): ColumnSpec[] {
  if (usageType === 'rental') return COLUMNS_RENTAL;
  if (usageType === 'flip') return COLUMNS_FLIP;
  return COLUMNS_OWNER;
}

export default function PortfolioAnalysisTable({
  usageType,
  rows,
  loading,
  error,
  totalCount,
  decidedCount,
  includeDecided,
  onToggleDecided,
  sort,
  onSortChange,
  compact,
  locale,
  onOpen,
}: Props) {
  const t = useTranslations('portfolio');
  const cols = columnsFor(usageType);

  function handleHeaderClick(col: ColumnSpec) {
    if (!col.sortable) return;
    if (sort.key === col.key) {
      const next: SortDir = sort.dir === 'asc' ? 'desc' : 'asc';
      onSortChange({ key: col.key, dir: next });
    } else {
      // First click on a new column → desc by default for numeric columns,
      // asc for monthlyCost (lower is better — Owner tab default).
      const dir: SortDir = col.key === 'monthlyCost' ? 'asc' : 'desc';
      onSortChange({ key: col.key, dir });
    }
  }

  // ── Compact (tile) mode — no header bar, no toggle, no CSV ──────
  if (compact) {
    return (
      <div className="divide-y divide-slate-100">
        {loading && rows.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-500">{t('loading')}</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-3 py-4 text-xs text-slate-500">{t('tile.empty')}</div>
        )}
        {rows.map((row) => (
          <PortfolioAnalysisRow
            key={row.analysis.id}
            row={row}
            compact={true}
            locale={locale}
            onOpen={onOpen}
          />
        ))}
      </div>
    );
  }

  // ── Full table mode ─────────────────────────────────────────────
  function handleExport() {
    const result = exportToCsv(rows, usageType);
    downloadCsv(result);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleDecided(!includeDecided)}
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border ${
              includeDecided
                ? 'bg-slate-700 text-white border-slate-700'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {t('toggle.showDecided', { count: decidedCount })}
          </button>
          <span className="text-xs text-slate-500">
            {t('rowCount', { count: rows.length, total: totalCount })}
          </span>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={rows.length === 0}
          className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('export.csv')}
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-3 py-2 text-${col.align ?? 'left'} text-[11px] font-semibold uppercase tracking-wide text-slate-600 ${
                    col.sortable ? 'cursor-pointer select-none hover:text-slate-900' : ''
                  }`}
                  onClick={() => handleHeaderClick(col)}
                >
                  <span className="inline-flex items-center gap-1">
                    {t(`column.${col.labelKey}`)}
                    {col.sortable && sort.key === col.key && (
                      <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-sm text-slate-500">
                  {t('loading')}
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-8 text-center text-sm text-slate-500">
                  {includeDecided
                    ? t(`tab.${usageType}.empty`)
                    : decidedCount > 0
                      ? t('emptyActiveButDecided', { count: decidedCount })
                      : t(`tab.${usageType}.empty`)}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <PortfolioAnalysisRow
                key={row.analysis.id}
                row={row}
                compact={false}
                locale={locale}
                onOpen={onOpen}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
