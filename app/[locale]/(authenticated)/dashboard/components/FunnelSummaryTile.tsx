'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Property } from '@/lib/api';

const FUNNEL_STAGES = ['investigating', 'interested', 'due_diligence_completed', 'visited', 'offer_made', 'parked', 'won'];

const STAGE_I18N_KEY: Record<string, string> = {
  investigating: 'investigating', interested: 'interested',
  due_diligence_completed: 'dueDiligenceCompleted', visited: 'visited', offer_made: 'offerMade',
  parked: 'parked', won: 'won',
};

function formatPrice(n: number): string {
  return '€ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function FunnelSummaryTile({ properties }: { properties: Property[] }) {
  const t = useTranslations('dashboard.funnelTile');
  const tStages = useTranslations('funnel.stages');

  const stages = useMemo(() => {
    const result: { key: string; count: number; total: number }[] = [];

    for (const stage of FUNNEL_STAGES) {
      const inStage = properties.filter(p => p.status === stage);
      const total = inStage.reduce((sum, p) => {
        const price = p.price ? parseFloat(String(p.price)) : 0;
        return sum + price;
      }, 0);
      result.push({ key: stage, count: inStage.length, total });
    }

    return result;
  }, [properties]);

  const totalCount = stages.reduce((a, s) => a + s.count, 0);
  const totalValue = stages.reduce((a, s) => a + s.total, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-1">{t('title')}</h3>
      <p className="text-sm text-gray-400 mb-4">{t('description')}</p>

      {/* Stage breakdown */}
      <div className="flex-1">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs text-gray-400 font-medium mb-1.5 px-2">
          <span>{t('colStage')}</span>
          <span className="text-right w-8">#</span>
          <span className="text-right w-24">{t('colTotal')}</span>
          <span className="text-right w-24">{t('colAvg')}</span>
        </div>

        <div className="space-y-1">
          {stages.map(stage => {
            const avg = stage.count > 0 ? stage.total / stage.count : 0;
            return (
              <div
                key={stage.key}
                className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-2 py-1.5 rounded ${
                  stage.count > 0 ? 'bg-slate-50' : ''
                }`}
              >
                <span className={`text-sm ${stage.count > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                  {tStages(STAGE_I18N_KEY[stage.key])}
                </span>
                <span className={`text-right text-sm font-medium w-8 ${stage.count > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                  {stage.count}
                </span>
                <span className={`text-right text-xs w-24 ${stage.count > 0 ? 'text-gray-600' : 'text-gray-300'}`}>
                  {stage.count > 0 ? formatPrice(stage.total) : '—'}
                </span>
                <span className={`text-right text-xs w-24 ${stage.count > 0 ? 'text-gray-400' : 'text-gray-300'}`}>
                  {stage.count > 0 ? formatPrice(avg) : '—'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="border-t border-gray-100 mt-3 pt-2 px-2">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-sm font-semibold">
            <span className="text-gray-700">{t('total')}</span>
            <span className="text-right text-gray-900 w-8">{totalCount}</span>
            <span className="text-right text-gray-900 w-24">{totalValue > 0 ? formatPrice(totalValue) : '—'}</span>
            <span className="text-right text-gray-900 w-24">
              {totalCount > 0 ? formatPrice(totalValue / totalCount) : '—'}
            </span>
          </div>
        </div>
      </div>

      <Link
        href="/funnel"
        className="mt-3 block text-center text-sm font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg py-2 transition-colors"
      >
        {t('cta')}
      </Link>
    </div>
  );
}
