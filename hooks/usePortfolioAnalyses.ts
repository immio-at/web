'use client';

/**
 * ADR-016 PA2 — usePortfolioAnalyses.
 *
 * Single hook serving both surfaces: the full Funnel-page table and the
 * Dashboard tile. Inputs are simple — usageType + decided toggle + sort
 * + optional limit. Outputs include `analyses` (already sorted +
 * filtered + metrics-attached) and per-tab counts so the tile can show
 * `Rental (28)` style labels.
 *
 * Dual-tier caching: the API client (`lib/api.ts`) holds a 60s
 * portfolio cache; this hook re-derives the filtered/sorted/computed
 * view client-side from that snapshot. Re-rendering the tile or
 * switching tabs does not refetch.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getPortfolioAnalyses, type PortfolioAnalysis } from '@/lib/api';
import {
  computeRowMetrics,
  defaultSortFor,
  isActiveStage,
  isDecidedStage,
  sortAnalyses,
  type RowMetrics,
  type SortState,
} from '@/lib/portfolioAnalyses';

export interface PortfolioRow {
  analysis: PortfolioAnalysis;
  metrics: RowMetrics;
}

export interface UsePortfolioAnalysesOptions {
  usageType: 'rental' | 'flip' | 'owner';
  includeDecided?: boolean;
  sort?: SortState;
  limit?: number;
}

export interface UsePortfolioAnalysesResult {
  rows: PortfolioRow[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  countsByUsageType: { rental: number; flip: number; owner: number };
  /** Number of decided-stage analyses for the active usageType — drives
   *  the `Show decided (N)` toggle label. */
  decidedCount: number;
  refresh: () => void;
}

export function usePortfolioAnalyses(
  opts: UsePortfolioAnalysesOptions,
): UsePortfolioAnalysesResult {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [data, setData] = useState<PortfolioAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!userId) {
      setData([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPortfolioAnalyses()
      .then((list) => {
        if (cancelled) return;
        setData(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // userId guards against token-rotation refetch (ADR-CLAUDE.md guidance —
    // depend on userId not session). version bumps on refresh().
  }, [userId, version]);

  const sort = opts.sort ?? defaultSortFor(opts.usageType);

  const result = useMemo<UsePortfolioAnalysesResult>(() => {
    // Filter to the active usageType for the rows array.
    const ofUsage = data.filter((a) => a.usageType === opts.usageType);

    const stageFiltered = opts.includeDecided
      ? ofUsage
      : ofUsage.filter((a) => isActiveStage(a.property.status));

    // Compute metrics once and pass that through the comparator.
    const withMetrics: PortfolioRow[] = stageFiltered.map((a) => ({
      analysis: a,
      metrics: computeRowMetrics(a),
    }));

    const sorted = sortAnalyses(withMetrics, sort);

    const sliced = opts.limit != null ? sorted.slice(0, opts.limit) : sorted;

    const decidedCount = ofUsage.filter((a) => isDecidedStage(a.property.status)).length;

    const countsByUsageType = {
      rental: data.filter((a) => a.usageType === 'rental').length,
      flip: data.filter((a) => a.usageType === 'flip').length,
      owner: data.filter((a) => a.usageType === 'owner').length,
    };

    return {
      rows: sliced,
      loading,
      error,
      totalCount: data.length,
      countsByUsageType,
      decidedCount,
      refresh: () => setVersion((v) => v + 1),
    };
  }, [data, opts.usageType, opts.includeDecided, opts.limit, sort.key, sort.dir, loading, error]);

  return result;
}
