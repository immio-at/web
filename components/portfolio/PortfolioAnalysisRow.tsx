'use client';

/**
 * ADR-016 PA4 — PortfolioAnalysisRow.
 *
 * Single row used by both the full Funnel-page table and the compact
 * Dashboard tile. The `compact` prop drives image size, column visibility,
 * and flag rendering — not behaviour. Click target opens the property
 * modal in Analysen mode with the matching analysis tab pre-selected.
 */

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { PortfolioRow } from '@/hooks/usePortfolioAnalyses';
import {
  computeDriftFlag,
  formatEur,
  formatHeadlineMetric,
  formatInteger,
  formatPercent,
  isDecidedStage,
} from '@/lib/portfolioAnalyses';

const STAGE_I18N_KEY: Record<string, string> = {
  new: 'new',
  investigating: 'investigating',
  interested: 'interested',
  due_diligence: 'dueDiligence',
  offer_made: 'offerMade',
  parked: 'parked',
  won: 'won',
  not_relevant: 'notRelevant',
};

const STAGE_HEADER_COLOR: Record<string, string> = {
  investigating: 'bg-orange-100 text-orange-900',
  interested: 'bg-orange-200 text-orange-900',
  due_diligence: 'bg-blue-300 text-blue-900',
  offer_made: 'bg-blue-400 text-white',
  won: 'bg-green-600 text-white',
  parked: 'bg-slate-200 text-slate-800',
  new: 'bg-slate-100 text-slate-700',
  not_relevant: 'bg-slate-100 text-slate-500',
  delisted: 'bg-slate-100 text-slate-500',
};

interface Props {
  row: PortfolioRow;
  compact: boolean;
  locale: 'de' | 'en';
  onOpen: (propertyId: string, analysisId: string) => void;
}

function pricePerSqm(price: number | string | null, size: number | string | null): number | null {
  if (price == null || size == null) return null;
  const p = typeof price === 'number' ? price : parseFloat(String(price));
  const s = typeof size === 'number' ? size : parseFloat(String(size));
  if (!Number.isFinite(p) || !Number.isFinite(s) || s <= 0) return null;
  return p / s;
}

export default function PortfolioAnalysisRow({ row, compact, locale, onOpen }: Props) {
  const t = useTranslations('portfolio');
  const stageT = useTranslations('funnel.stages');
  const a = row.analysis;
  const m = row.metrics;
  const drift = computeDriftFlag(a);
  const decided = isDecidedStage(a.property.status);

  const imgSize = compact ? 32 : 40;
  const imgClass = compact ? 'w-8 h-8' : 'w-10 h-10';
  const stageKey = STAGE_I18N_KEY[a.property.status] ?? a.property.status;
  const stageColor = decided
    ? 'bg-slate-100 text-slate-500'
    : STAGE_HEADER_COLOR[a.property.status] ?? 'bg-slate-100 text-slate-700';

  const propertyCell = (
    <div className="flex items-center gap-3 min-w-0">
      {a.property.imageUrl ? (
        <Image
          src={a.property.imageUrl}
          alt=""
          width={imgSize}
          height={imgSize}
          className={`${imgClass} rounded object-cover flex-shrink-0`}
          unoptimized
        />
      ) : (
        <div className={`${imgClass} rounded bg-slate-200 flex-shrink-0`} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900">
          {a.property.title ?? t('untitled')}
        </div>
        <div className="truncate text-xs text-slate-500">
          {a.name ?? t('unnamedAnalysis')}
        </div>
      </div>
    </div>
  );

  const stagePill = (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${stageColor}`}>
      {stageT(stageKey)}
    </span>
  );

  // ── Compact (tile) row ──────────────────────────────────────────
  if (compact) {
    const headline = formatHeadlineMetric(m, locale);
    return (
      <button
        type="button"
        onClick={() => onOpen(a.propertyId, a.id)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left"
      >
        <div className="flex-1 min-w-0">{propertyCell}</div>
        <div className="text-xs text-slate-600 hidden sm:block">
          {formatEur(toNum(a.property.price), locale)}
        </div>
        <div className="text-xs text-slate-600 hidden md:block">
          {formatInteger(toNum(a.property.sizeSqm), locale)} m²
        </div>
        <div className="text-xs text-slate-600 hidden lg:block">
          {formatEur(pricePerSqm(a.property.price, a.property.sizeSqm), locale)}/m²
        </div>
        <div className="text-sm font-semibold text-slate-900 whitespace-nowrap">{headline}</div>
      </button>
    );
  }

  // ── Full table row ──────────────────────────────────────────────
  const columns: React.ReactNode[] = [];

  // UserListing
  columns.push(<td key="property" className="px-3 py-2 max-w-xs">{propertyCell}</td>);
  // Stage
  columns.push(<td key="stage" className="px-3 py-2 whitespace-nowrap">{stagePill}</td>);
  // Price
  columns.push(<td key="price" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatEur(toNum(a.property.price), locale)}</td>);
  // m²
  columns.push(<td key="size" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatInteger(toNum(a.property.sizeSqm), locale)}</td>);

  if (m.kind === 'rental') {
    columns.push(<td key="ppsqm" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatEur(pricePerSqm(a.property.price, a.property.sizeSqm), locale)}</td>);
    columns.push(<td key="cfr" className="px-3 py-2 text-right whitespace-nowrap text-sm font-semibold">{formatPercent(m.cashflowRendite, locale, 2)}</td>);
    columns.push(<td key="ger" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatPercent(m.gesamtrenditeEk, locale, 2)}</td>);
    columns.push(<td key="cf" className={`px-3 py-2 text-right whitespace-nowrap text-sm ${m.monthlyCashflow < 0 ? 'text-red-600' : ''}`}>{formatEur(m.monthlyCashflow, locale)}</td>);
  } else if (m.kind === 'flip') {
    columns.push(<td key="hold" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatInteger(m.holdingMonths, locale)}</td>);
    columns.push(<td key="resale" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatEur(m.resalePrice, locale)}</td>);
    columns.push(<td key="netp" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatEur(m.netProfit, locale)}</td>);
    columns.push(<td key="roi" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatPercent(m.roiEquity, locale, 1)}</td>);
    columns.push(<td key="ann" className="px-3 py-2 text-right whitespace-nowrap text-sm font-semibold">{formatPercent(m.roiAnnualisedCompound, locale, 1)}</td>);
  } else {
    columns.push(<td key="mc" className="px-3 py-2 text-right whitespace-nowrap text-sm font-semibold">{formatEur(m.monthlyCost, locale)}</td>);
    columns.push(<td key="ac" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatEur(m.annualCost, locale)}</td>);
    columns.push(<td key="tot" className="px-3 py-2 text-right whitespace-nowrap text-sm">{formatEur(m.totalCostOverTerm, locale)}</td>);
  }

  // Last calculated
  const updated = new Date(a.updatedAt);
  const days = Math.floor((Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24));
  const relative = days === 0 ? t('today') : days === 1 ? t('yesterday') : `${days}${locale === 'de' ? 'd' : 'd'}`;
  columns.push(
    <td key="updated" className="px-3 py-2 text-right whitespace-nowrap text-xs text-slate-500" title={updated.toLocaleString(locale === 'de' ? 'de-AT' : 'en-AT')}>
      {relative}
    </td>,
  );

  // Flags
  columns.push(
    <td key="flags" className="px-3 py-2 whitespace-nowrap">
      <div className="flex flex-wrap gap-1">
        {drift.active && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-medium"
            title={
              locale === 'de'
                ? `Aktuell ${formatEur(toNum(a.property.price), locale)}, in Analyse ${formatEur(a.listPrice, locale)} (${formatPercent(drift.pct, locale, 2)})`
                : `Currently ${formatEur(toNum(a.property.price), locale)}, in analysis ${formatEur(a.listPrice, locale)} (${formatPercent(drift.pct, locale, 2)})`
            }
          >
            {t('flag.priceChanged')}
          </span>
        )}
        {a.legalStructure === 'gmbh' && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-medium">
            {t('flag.gmbh')}
            {m.kind === 'flip' && m.gmbhVariant && (
              <span className="ml-1 px-1 rounded bg-slate-300 text-slate-900 text-[9px]">
                {m.gmbhVariant === 'distributed' ? t('flag.gmbhDistributed') : t('flag.gmbhRetained')}
              </span>
            )}
          </span>
        )}
        {!a.financing && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[10px] font-medium">
            {t('flag.cash')}
          </span>
        )}
      </div>
    </td>,
  );

  return (
    <tr
      className="border-b border-slate-200 hover:bg-slate-50 cursor-pointer"
      onClick={() => onOpen(a.propertyId, a.id)}
    >
      {columns}
    </tr>
  );
}

function toNum(v: number | string | null): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
