'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { getAnalyticsSummary, AnalyticsSummary } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const STAGE_I18N_KEY: Record<string, string> = {
  new: 'new', investigating: 'investigating', interested: 'interested',
  due_diligence: 'dueDiligence', offer_made: 'offerMade',
  parked: 'parked', won: 'won',
};

const INTERACTION_TYPE_KEY: Record<string, string> = {
  view: 'views', analysis: 'analyses', url_click: 'urlClicks', status_change: 'statusChanges',
};

const ANALYSIS_TYPE_KEY: Record<string, string> = {
  owner: 'owner', rental: 'rental', flip: 'flip',
};

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${Math.round(n / 1_000)}k`;
  return `€${Math.round(n)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('de-AT');
}

// Simple bar chart using divs
function BarChart({ items, color }: { items: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map(item => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-28 text-right truncate">{item.label}</span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className={`h-full rounded-full ${color} transition-all duration-500`}
              style={{ width: `${Math.max((item.value / max) * 100, item.value > 0 ? 4 : 0)}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-900 w-8 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// Activity heatmap — last 30 days as small blocks
function ActivityHeatmap({ data }: { data: { date: string; count: number }[] }) {
  const t = useTranslations('analytics.timeline');

  // Fill all 30 days
  const days = useMemo(() => {
    const map = new Map(data.map(d => [d.date.split('T')[0], d.count]));
    const result: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      result.push({ date: key, count: map.get(key) ?? 0 });
    }
    return result;
  }, [data]);

  const max = Math.max(...days.map(d => d.count), 1);

  if (data.length === 0) {
    return <p className="text-sm text-gray-400">{t('noData')}</p>;
  }

  return (
    <div className="flex gap-1 items-end h-20">
      {days.map(d => (
        <div
          key={d.date}
          className="flex-1 bg-teal-500 rounded-t transition-all duration-300"
          style={{
            height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 2)}%`,
            opacity: d.count > 0 ? 0.4 + (d.count / max) * 0.6 : 0.1,
          }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const t = useTranslations('analytics');
  const tStages = useTranslations('funnel.stages');
  const { session, loading: authLoading } = useAuth();

  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !session) return;
    getAnalyticsSummary()
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : t('error')))
      .finally(() => setLoading(false));
  }, [authLoading, session, t]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-gray-500">{t('loading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error ?? t('error')}</p>
        </div>
      </div>
    );
  }

  const interactionMap: Record<string, number> = {};
  for (const i of data.interactionCounts.byType) interactionMap[i.type] = i.count;

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">{t('label')}</p>
        <h1 className="text-2xl font-light text-gray-900 tracking-tight">{t('title')}</h1>
      </div>

      {/* Top row — 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label={t('portfolio.total')} value={formatNumber(data.properties.total)} />
        <StatCard label={t('portfolio.totalValue')} value={formatPrice(data.properties.totalValue)} accent />
        <StatCard label={t('portfolio.avgPrice')} value={formatPrice(data.properties.avgPrice)} />
        <StatCard label={t('activity.total')} value={formatNumber(data.interactionCounts.total)} />
      </div>

      {/* Second row — Activity + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* Activity breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">{t('activity.title')}</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MiniStat label={t('activity.last7')} value={formatNumber(data.interactionCounts.last7Days)} />
            <MiniStat label={t('activity.last30')} value={formatNumber(data.interactionCounts.last30Days)} />
          </div>
          <div className="space-y-2">
            {['view', 'analysis', 'url_click', 'status_change'].map(type => (
              <div key={type} className="flex justify-between text-sm">
                <span className="text-gray-600">{t(`activity.${INTERACTION_TYPE_KEY[type]}`)}</span>
                <span className="font-medium text-gray-900">{formatNumber(interactionMap[type] ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Funnel distribution */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">{t('funnel.title')}</h3>
          <BarChart
            items={data.funnelDistribution.map(s => ({
              label: tStages(STAGE_I18N_KEY[s.stage] ?? s.stage),
              value: s.count,
            }))}
            color="bg-teal-500"
          />
        </div>
      </div>

      {/* Third row — Timeline + Analyses + Milestones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Activity timeline */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">{t('timeline.title')}</h3>
          <ActivityHeatmap data={data.activityTimeline} />
        </div>

        {/* Analyses breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">{t('analysesBreakdown.title')}</h3>
          {data.analysisCounts.total > 0 ? (
            <div className="space-y-3">
              {data.analysisCounts.byType.map(a => (
                <div key={a.type} className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{t(`analysesBreakdown.${ANALYSIS_TYPE_KEY[a.type] ?? a.type}`)}</span>
                  <span className="text-lg font-bold text-gray-900">{a.count}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Gesamt</span>
                <span className="text-lg font-bold text-gray-900">{data.analysisCounts.total}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t('analysesBreakdown.none')}</p>
          )}
        </div>

        {/* Milestones */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">{t('milestones.title')}</h3>
          {data.milestones.length > 0 ? (
            <div className="space-y-2">
              {data.milestones.map(m => (
                <div key={m.key} className="flex items-center gap-2 text-sm">
                  <span className="text-teal-500">&#9733;</span>
                  <span className="text-gray-700">{t(`milestones.${m.key}`)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t('milestones.none')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <div className={`text-2xl font-bold ${accent ? 'text-teal-600' : 'text-gray-900'}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  );
}
