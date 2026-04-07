'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Property } from '@/lib/api';

export default function AnalyticsSnapshotTile({ properties }: { properties: Property[] }) {
  const t = useTranslations('dashboard.analyticsTile');

  const totalSaved = useMemo(
    () => properties.filter(p => p.status !== 'not_relevant' && p.status !== 'delisted').length,
    [properties],
  );

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold text-gray-900">{t('title')}</h3>
          <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {t('comingSoon')}
          </span>
        </div>

        <div className="text-center py-6">
          <div className="text-4xl font-bold text-gray-900">{totalSaved}</div>
          <div className="text-sm text-gray-500 mt-1">{t('totalSaved')}</div>
        </div>
      </div>

      <Link
        href="/analytics"
        className="mt-3 block w-full text-center text-sm font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg py-2.5 transition-colors"
      >
        {t('cta')}
      </Link>
    </div>
  );
}
