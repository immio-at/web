'use client';

import { useTranslations } from 'next-intl';

export default function AnalyticsPage() {
  const t = useTranslations('analytics');
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-3">{t('label')}</p>
        <h1 className="text-3xl font-light text-primary tracking-tight mb-4">
          {t('title')}
        </h1>
        <p className="text-sm text-gray-400 font-light leading-relaxed mb-8">
          {t('description')}
        </p>
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-full">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          {t('comingSoon')}
        </span>
      </div>
    </div>
  );
}
