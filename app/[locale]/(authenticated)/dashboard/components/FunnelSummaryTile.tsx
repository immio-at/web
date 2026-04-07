'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Property } from '@/lib/api';

const ACTIVE_STAGES = ['investigating', 'interested', 'visit_booked', 'visited', 'offer_made'];

const STAGE_I18N_KEY: Record<string, string> = {
  investigating: 'investigating', interested: 'interested',
  visit_booked: 'visitBooked', visited: 'visited', offer_made: 'offerMade',
};

export default function FunnelSummaryTile({ properties }: { properties: Property[] }) {
  const t = useTranslations('dashboard.funnelTile');
  const tStages = useTranslations('funnel.stages');

  const stats = useMemo(() => {
    const stageCounts: Record<string, number> = {};
    let totalValue = 0;
    let expiredCount = 0;

    for (const p of properties) {
      if (ACTIVE_STAGES.includes(p.status)) {
        stageCounts[p.status] = (stageCounts[p.status] ?? 0) + 1;
        if (p.price) totalValue += parseFloat(String(p.price));
      }
      if (p.listingStatus === 'expired' && p.status !== 'delisted') {
        expiredCount++;
      }
    }

    const activeCount = Object.values(stageCounts).reduce((a, b) => a + b, 0);
    return { stageCounts, totalValue, expiredCount, activeCount };
  }, [properties]);

  const hasDeals = stats.activeCount > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between h-full">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('title')}</h3>

        {hasDeals ? (
          <>
            <div className="space-y-1.5 mb-3">
              {ACTIVE_STAGES.filter(s => stats.stageCounts[s]).map(stage => (
                <div key={stage} className="flex justify-between text-sm">
                  <span className="text-gray-600">{tStages(STAGE_I18N_KEY[stage])}</span>
                  <span className="font-medium text-gray-900">{stats.stageCounts[stage]}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">{t('activeDeals')}</span>
                <span className="font-semibold text-gray-900">{stats.activeCount}</span>
              </div>
              {stats.totalValue > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('totalValue')}</span>
                  <span className="font-semibold text-blue-600">
                    {'€ ' + Math.round(stats.totalValue).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                  </span>
                </div>
              )}
              {stats.expiredCount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">{t('expiredCount')}</span>
                  <span className="font-medium text-amber-600">{stats.expiredCount}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 mb-3">{t('empty')}</p>
        )}
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
