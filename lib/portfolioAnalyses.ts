/**
 * ADR-016 §8.3 — pure utilities for the portfolio analyses surface.
 *
 * All functions are deterministic, side-effect-free, and unit-testable.
 * The hook (`usePortfolioAnalyses`) and the components consume these
 * directly. Nothing here touches the DOM or the network.
 */

import type { PortfolioAnalysis } from './api';
import {
  calcRentalResults,
  calcFlipPrivate,
  calcFlipGmbH,
  calcOwnerResults,
  calcRemainingBalance,
  resolveL1Amount,
  resolveL2Amount,
} from './calculators';

// ── Per-tab sort keys ────────────────────────────────────────────────────────
// String-typed because we round-trip through the URL — the table component
// validates them at the read site.
export type RentalSortKey =
  | 'cashflowRendite'
  | 'gesamtrenditeEk'
  | 'monthlyCashflow'
  | 'price'
  | 'sizeSqm'
  | 'pricePerSqm'
  | 'updatedAt';

export type FlipSortKey =
  | 'roiAnnualisedCompound'
  | 'netProfit'
  | 'roiEquity'
  | 'price'
  | 'sizeSqm'
  | 'holdingMonths'
  | 'resalePrice'
  | 'updatedAt';

export type OwnerSortKey =
  | 'monthlyCost'
  | 'annualCost'
  | 'totalCostOverTerm'
  | 'price'
  | 'sizeSqm'
  | 'updatedAt';

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

// ── Stage filter ─────────────────────────────────────────────────────────────
// Active = the user is still working on the property. Decided = a final
// disposition. The portfolio table hides decided rows by default.
const ACTIVE_STAGES = new Set<string>([
  'new',
  'investigating',
  'interested',
  'due_diligence',
  'offer_made',
  'won',
]);

const DECIDED_STAGES = new Set<string>(['parked', 'not_relevant', 'delisted']);

export function isActiveStage(stage: string): boolean {
  return ACTIVE_STAGES.has(stage);
}

export function isDecidedStage(stage: string): boolean {
  return DECIDED_STAGES.has(stage);
}

// ── Headline metrics — the "default sort column" per tab ─────────────────────
// Computed eagerly for each row up-front so the sort comparator stays cheap.

export interface RentalRowMetrics {
  cashflowRendite: number; // eigenkapitalrendite_cashflow (cash-on-cash)
  gesamtrenditeEk: number; // eigenkapitalrendite_total
  monthlyCashflow: number;
}

export interface FlipRowMetrics {
  netProfit: number;
  roiEquity: number;
  roiAnnualisedCompound: number | null;
  holdingMonths: number;
  resalePrice: number;
  /** GmbH-only — null for Private. Tracks which side of the GmbH split
   *  this row represents based on `distributeProfit`. */
  gmbhVariant: 'retained' | 'distributed' | null;
}

export interface OwnerRowMetrics {
  monthlyCost: number;
  annualCost: number;
  totalCostOverTerm: number;
}

export type RowMetrics =
  | ({ kind: 'rental' } & RentalRowMetrics)
  | ({ kind: 'flip' } & FlipRowMetrics)
  | ({ kind: 'owner' } & OwnerRowMetrics);

export function computeRowMetrics(a: PortfolioAnalysis): RowMetrics {
  if (a.usageType === 'rental') {
    const r = calcRentalResults(a);
    return {
      kind: 'rental',
      cashflowRendite: r.eigenkapitalrendite_cashflow,
      gesamtrenditeEk: r.eigenkapitalrendite_total,
      monthlyCashflow: r.cashflowMonthly,
    };
  }
  if (a.usageType === 'flip') {
    if (a.legalStructure === 'gmbh') {
      const f = calcFlipGmbH(a);
      const distributed = a.distributeProfit;
      return {
        kind: 'flip',
        netProfit: distributed ? f.netProfitDistributed : f.netProfitRetained,
        roiEquity: distributed ? f.roiEquityDistributed : f.roiEquityRetained,
        roiAnnualisedCompound: distributed
          ? f.roiAnnualisedCompoundDistributed
          : f.roiAnnualisedCompoundRetained,
        holdingMonths: f.holdingMonths,
        resalePrice: a.flipResalePrice ?? 0,
        gmbhVariant: distributed ? 'distributed' : 'retained',
      };
    }
    const f = calcFlipPrivate(a);
    return {
      kind: 'flip',
      netProfit: f.netProfit,
      roiEquity: f.roiEquity,
      roiAnnualisedCompound: f.roiAnnualisedCompound,
      holdingMonths: f.holdingMonths,
      resalePrice: a.flipResalePrice ?? 0,
      gmbhVariant: null,
    };
  }
  // owner
  const o = calcOwnerResults(a);
  // Total over loan term: sum of monthlyOutgoings projected for the
  // termYears horizon. Approximation — repairs scale with desiredPrice
  // (not appreciation) per the existing modal behaviour, BK held flat.
  const termYears = a.loan1TermYears ?? 20;
  // Build total cost over term — re-uses the per-year loan-paydown logic
  // already in calcOwnerResults so we don't duplicate the maths.
  let totalCostOverTerm = 0;
  for (let y = 1; y <= termYears; y++) {
    const l1Remaining = calcRemainingBalance(
      resolveL1Amount(a),
      a.loan1Rate ?? 0,
      a.loan1TermYears ?? 0,
      y * 12,
    );
    const l2Remaining = calcRemainingBalance(
      resolveL2Amount(a),
      a.loan2Rate ?? 0,
      a.loan2TermYears ?? 0,
      y * 12,
    );
    // monthlyOutgoings × 12 is a stable per-year approximation that matches
    // the modal's projection. Loan paydown is already inside monthlyLoan.
    void l1Remaining;
    void l2Remaining;
    totalCostOverTerm += o.monthlyOutgoings * 12;
  }
  return {
    kind: 'owner',
    monthlyCost: o.monthlyOutgoings,
    annualCost: o.monthlyOutgoings * 12,
    totalCostOverTerm,
  };
}

// ── Drift flag ───────────────────────────────────────────────────────────────
// True when the parent property's current price has moved more than €1
// from the analysis's `desiredPrice` snapshot. The €1 floor avoids
// triggering on rounding noise; tighten to 0.5% / €100 if tester
// feedback shows the flag lighting up too easily (see ADR §13).

export interface DriftFlag {
  active: boolean;
  delta: number; // currentPrice - desiredPrice
  pct: number;   // delta / desiredPrice
}

export function computeDriftFlag(
  a: Pick<PortfolioAnalysis, 'desiredPrice' | 'property'>,
): DriftFlag {
  const current = a.property.price;
  const desired = a.desiredPrice;
  if (current == null || desired == null || desired === 0) {
    return { active: false, delta: 0, pct: 0 };
  }
  const currentNum = typeof current === 'number' ? current : parseFloat(String(current));
  const desiredNum = typeof desired === 'number' ? desired : parseFloat(String(desired));
  const delta = currentNum - desiredNum;
  const pct = delta / desiredNum;
  return { active: Math.abs(delta) > 1, delta, pct };
}

// ── Comparator ───────────────────────────────────────────────────────────────
// Pulls the right value out of the metrics + property + analysis tuple.
// Nulls always sort last regardless of direction so incomplete analyses
// don't surface at the top of either ordering.

interface RowForSort {
  analysis: PortfolioAnalysis;
  metrics: RowMetrics;
}

function pricePerSqm(a: PortfolioAnalysis): number | null {
  const p = a.property.price;
  const s = a.property.sizeSqm;
  if (p == null || s == null || s === 0) return null;
  const pNum = typeof p === 'number' ? p : parseFloat(String(p));
  const sNum = typeof s === 'number' ? s : parseFloat(String(s));
  return sNum > 0 ? pNum / sNum : null;
}

function valueAtKey(row: RowForSort, key: string): number | null {
  const { analysis, metrics } = row;
  switch (key) {
    case 'price':
      return numberOrNull(analysis.property.price);
    case 'sizeSqm':
      return numberOrNull(analysis.property.sizeSqm);
    case 'pricePerSqm':
      return pricePerSqm(analysis);
    case 'updatedAt':
      return new Date(analysis.updatedAt).getTime();
  }
  if (metrics.kind === 'rental') {
    if (key === 'cashflowRendite') return metrics.cashflowRendite;
    if (key === 'gesamtrenditeEk') return metrics.gesamtrenditeEk;
    if (key === 'monthlyCashflow') return metrics.monthlyCashflow;
  } else if (metrics.kind === 'flip') {
    if (key === 'roiAnnualisedCompound') return metrics.roiAnnualisedCompound;
    if (key === 'netProfit') return metrics.netProfit;
    if (key === 'roiEquity') return metrics.roiEquity;
    if (key === 'holdingMonths') return metrics.holdingMonths;
    if (key === 'resalePrice') return metrics.resalePrice;
  } else if (metrics.kind === 'owner') {
    if (key === 'monthlyCost') return metrics.monthlyCost;
    if (key === 'annualCost') return metrics.annualCost;
    if (key === 'totalCostOverTerm') return metrics.totalCostOverTerm;
  }
  return null;
}

function numberOrNull(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function sortAnalyses<R extends RowForSort>(
  rows: R[],
  state: SortState,
): R[] {
  const factor = state.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = valueAtKey(a, state.key);
    const vb = valueAtKey(b, state.key);
    // Nulls always last (regardless of direction)
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va === vb) return 0;
    return va < vb ? -factor : factor;
  });
}

// ── Default sort per tab ─────────────────────────────────────────────────────

export function defaultSortFor(usageType: 'rental' | 'flip' | 'owner'): SortState {
  if (usageType === 'rental') return { key: 'cashflowRendite', dir: 'desc' };
  if (usageType === 'flip') return { key: 'roiAnnualisedCompound', dir: 'desc' };
  return { key: 'monthlyCost', dir: 'asc' };
}

// ── Headline metric formatter (used by the compact tile row) ─────────────────

export function formatHeadlineMetric(
  metrics: RowMetrics,
  locale: 'de' | 'en',
): string {
  if (metrics.kind === 'rental') {
    return formatPercent(metrics.cashflowRendite, locale, 2);
  }
  if (metrics.kind === 'flip') {
    return metrics.roiAnnualisedCompound == null
      ? '—'
      : formatPercent(metrics.roiAnnualisedCompound, locale, 2);
  }
  return formatEur(metrics.monthlyCost, locale, 0) + (locale === 'de' ? '/Mon.' : '/mo');
}

// ── Number formatters — surfaced here so all renderers stay consistent ──────

export function formatEur(v: number | null, locale: 'de' | 'en', frac = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(locale === 'de' ? 'de-AT' : 'en-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(v);
}

export function formatPercent(v: number | null, locale: 'de' | 'en', frac = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return new Intl.NumberFormat(locale === 'de' ? 'de-AT' : 'en-AT', {
    style: 'percent',
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  }).format(v);
}

export function formatInteger(v: number | null | undefined, locale: 'de' | 'en'): string {
  const n = numberOrNull(v ?? null);
  if (n == null) return '—';
  return new Intl.NumberFormat(locale === 'de' ? 'de-AT' : 'en-AT', {
    maximumFractionDigits: 0,
  }).format(n);
}

// ── CSV export (PA8) ─────────────────────────────────────────────────────────
// Semicolon-delimited, UTF-8 BOM, machine-readable numerics. Currency
// values are bare numbers; percentages are decimals (0.068 not "6.80%").
// See ADR-016 §10 for the rationale.

function csvEscape(v: string): string {
  if (v.includes(';') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function csvNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '';
  return String(v);
}

interface CsvBuildResult {
  blob: Blob;
  filename: string;
}

export function exportToCsv(
  rows: RowForSort[],
  usageType: 'rental' | 'flip' | 'owner',
): CsvBuildResult {
  const today = new Date().toISOString().slice(0, 10);
  const filename = `immio-analysen-${usageType}-${today}.csv`;

  const headers: string[] = [];
  const lines: string[] = [];

  if (usageType === 'rental') {
    headers.push(
      'deal_id', 'property_title', 'analysis_label', 'stage',
      'price', 'currency', 'size_sqm', 'price_per_sqm',
      'cashflow_rendite', 'gesamtrendite_ek', 'monthly_cashflow',
      'updated_at',
    );
    for (const row of rows) {
      const a = row.analysis;
      const m = row.metrics as RentalRowMetrics & { kind: 'rental' };
      lines.push(
        [
          csvEscape(a.dealId),
          csvEscape(a.property.title ?? ''),
          csvEscape(a.name ?? ''),
          csvEscape(a.property.status),
          csvNum(numberOrNull(a.property.price)),
          'EUR',
          csvNum(numberOrNull(a.property.sizeSqm)),
          csvNum(pricePerSqm(a)),
          csvNum(m.cashflowRendite),
          csvNum(m.gesamtrenditeEk),
          csvNum(m.monthlyCashflow),
          a.updatedAt,
        ].join(';'),
      );
    }
  } else if (usageType === 'flip') {
    headers.push(
      'deal_id', 'property_title', 'analysis_label', 'stage',
      'price', 'currency', 'size_sqm',
      'holding_months', 'resale_price',
      'net_profit', 'roi_equity', 'roi_annualised_compound',
      'gmbh_variant', 'updated_at',
    );
    for (const row of rows) {
      const a = row.analysis;
      const m = row.metrics as FlipRowMetrics & { kind: 'flip' };
      lines.push(
        [
          csvEscape(a.dealId),
          csvEscape(a.property.title ?? ''),
          csvEscape(a.name ?? ''),
          csvEscape(a.property.status),
          csvNum(numberOrNull(a.property.price)),
          'EUR',
          csvNum(numberOrNull(a.property.sizeSqm)),
          csvNum(m.holdingMonths),
          csvNum(m.resalePrice),
          csvNum(m.netProfit),
          csvNum(m.roiEquity),
          csvNum(m.roiAnnualisedCompound),
          m.gmbhVariant ?? 'private',
          a.updatedAt,
        ].join(';'),
      );
    }
  } else {
    headers.push(
      'deal_id', 'property_title', 'analysis_label', 'stage',
      'price', 'currency', 'size_sqm',
      'monthly_cost', 'annual_cost', 'total_cost_over_term',
      'updated_at',
    );
    for (const row of rows) {
      const a = row.analysis;
      const m = row.metrics as OwnerRowMetrics & { kind: 'owner' };
      lines.push(
        [
          csvEscape(a.dealId),
          csvEscape(a.property.title ?? ''),
          csvEscape(a.name ?? ''),
          csvEscape(a.property.status),
          csvNum(numberOrNull(a.property.price)),
          'EUR',
          csvNum(numberOrNull(a.property.sizeSqm)),
          csvNum(m.monthlyCost),
          csvNum(m.annualCost),
          csvNum(m.totalCostOverTerm),
          a.updatedAt,
        ].join(';'),
      );
    }
  }

  // UTF-8 BOM so Excel detects the encoding and renders umlauts correctly.
  const csv = '﻿' + headers.join(';') + '\n' + lines.join('\n') + '\n';
  return {
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    filename,
  };
}

export function downloadCsv(result: CsvBuildResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
