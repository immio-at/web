'use client';

import { useTranslations } from 'next-intl';

export default function RecommendedCarousel() {
  const t = useTranslations('dashboard.carousels');

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('recommended')}</h3>
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-6 py-8 text-center">
        <p className="text-sm text-gray-400">{t('recommendedLocked')}</p>
      </div>
    </div>
  );
}
