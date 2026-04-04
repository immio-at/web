'use client';

import { useTranslations } from 'next-intl';
import FunnelBoard from '@/components/FunnelBoard';

export default function FunnelPage() {
  const t = useTranslations('funnel');
  return (
    <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
        <p className="text-gray-600 mt-1">{t('subtitle')}</p>
      </div>
      <FunnelBoard />
    </div>
  );
}
