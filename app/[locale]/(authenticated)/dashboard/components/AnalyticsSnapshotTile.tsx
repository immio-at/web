'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { UserListing, getAnalyticsSummary, AnalyticsSummary } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const INTERACTION_TYPE_KEY: Record<string, string> = {
  view: 'views', analysis: 'analyses', url_click: 'urlClicks', status_change: 'statusChanges',
};

function formatNumber(n: number): string {
  return n.toLocaleString('de-AT');
}

// Module-level cache for analytics — avoids re-fetching on every Dashboard visit
let analyticsCache: AnalyticsSummary | null = null;
let analyticsCacheTimestamp = 0;
const ANALYTICS_CACHE_TTL_MS = 300_000; // 5 minutes

// Mounted tiles subscribe here so an SSE 'analytics' event can push fresh
// data straight into them. Clearing the cache alone never re-rendered
// anything — the tile only refetched on mount / userId change.
const listeners = new Set<(d: AnalyticsSummary) => void>();

/**
 * Wipe the analytics cache. Called by AuthContext on sign-out and
 * session-change to prevent the previous user's analytics from leaking.
 */
export function clearAnalyticsCache(): void {
  analyticsCache = null;
  analyticsCacheTimestamp = 0;
}

/**
 * SSE 'analytics' handler — refetch the summary and push it into every
 * mounted tile. Unlike clearAnalyticsCache (sign-out), this keeps the UI
 * live: a mutation elsewhere now reflects in the dashboard snapshot without
 * waiting for a remount or the 5-minute TTL.
 */
export async function refreshAnalyticsFromServer(): Promise<void> {
  try {
    const d = await getAnalyticsSummary();
    analyticsCache = d;
    analyticsCacheTimestamp = Date.now();
    listeners.forEach(fn => fn(d));
  } catch {
    // Leave the existing cache in place — the TTL path retries on next mount.
  }
}

export default function AnalyticsSnapshotTile({ properties }: { properties: UserListing[] }) {
  const t = useTranslations('dashboard.analyticsTile');
  const ta = useTranslations('analytics');
  const { session, loading: authLoading } = useAuth();

  const [data, setData] = useState<AnalyticsSummary | null>(analyticsCache);

  // Subscribe so refreshAnalyticsFromServer (SSE 'analytics' event) can push
  // fresh data into this tile without a remount.
  useEffect(() => {
    listeners.add(setData);
    return () => { listeners.delete(setData); };
  }, []);

  useEffect(() => {
    if (authLoading || !session) return;
    const cacheAge = Date.now() - analyticsCacheTimestamp;
    if (analyticsCache && cacheAge < ANALYTICS_CACHE_TTL_MS) {
      setData(analyticsCache);
      return;
    }
    getAnalyticsSummary().then(d => {
      analyticsCache = d;
      analyticsCacheTimestamp = Date.now();
      setData(d);
    }).catch(() => {});
    // session?.user?.id stable across token refresh.
  }, [authLoading, session?.user?.id]);

  const totalSaved = properties.filter(
    p => p.status !== 'not_relevant' && p.status !== 'delisted'
  ).length;

  // Build interaction map from analytics data
  const interactionMap: Record<string, number> = {};
  if (data) {
    for (const i of data.interactionCounts.byType) interactionMap[i.type] = i.count;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{t('title')}</h3>

      {!data ? (
        // Loading skeleton
        <div className="flex-1 space-y-3 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="h-4 bg-gray-100 rounded w-3/4" />
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {/* Activity summary */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-gray-900">{formatNumber(data.interactionCounts.total)}</span>
              <span className="text-xs text-gray-400">{ta('activity.total')}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {['view', 'analysis', 'url_click', 'status_change'].map(type => (
                <div key={type} className="flex justify-between text-xs">
                  <span className="text-gray-500">{ta(`activity.${INTERACTION_TYPE_KEY[type]}`)}</span>
                  <span className="font-medium text-gray-700">{formatNumber(interactionMap[type] ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
              <span>{ta('activity.last7')}: <span className="font-semibold text-gray-600">{formatNumber(data.interactionCounts.last7Days)}</span></span>
              <span>{ta('activity.last30')}: <span className="font-semibold text-gray-600">{formatNumber(data.interactionCounts.last30Days)}</span></span>
            </div>
          </div>

          {/* Milestones */}
          {data.milestones.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{ta('milestones.title')}</h4>
              <div className="flex flex-wrap gap-1.5">
                {data.milestones.map(m => (
                  <span key={m.key} className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
                    <span className="text-teal-500">&#9733;</span>
                    {ta(`milestones.${m.key}`)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Link
        href="/analytics"
        className="mt-3 block w-full text-center text-sm font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg py-2.5 transition-colors"
      >
        {t('cta')}
      </Link>
    </div>
  );
}
