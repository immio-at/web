'use client';

/**
 * ADR-021 HH6 — Starting from scratch.
 *
 * Two sub-sections per spec:
 *  a) Narrative — "Your first 30 minutes" (numbered 4-step sequence).
 *  b) Reference — "The four ingestion paths" (paragraph per path,
 *     plus the browser extension as a fifth bullet — spec lists five).
 *
 * Internal links route via the i18n-aware navigation Link so locale
 * prefixes are preserved.
 */

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function HelpGettingStartedSection() {
  const t = useTranslations('help.gettingStarted');

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('heading')}</h2>
      <p className="text-sm text-gray-600 mb-6">{t('intro')}</p>

      {/* 2a — narrative */}
      <h3 className="text-base font-semibold text-gray-800 mb-3">
        {t('firstSession.heading')}
      </h3>
      <ol className="space-y-3 text-sm text-gray-700 mb-8 list-decimal pl-5">
        <li>
          <a href="#forwarding" className="text-teal-700 hover:text-teal-800 underline">
            {t('firstSession.step1.link')}
          </a>
          <span> — {t('firstSession.step1.detail')}</span>
        </li>
        <li>
          <Link href="/search" className="text-teal-700 hover:text-teal-800 underline">
            {t('firstSession.step2.link')}
          </Link>
          <span> — {t('firstSession.step2.detail')}</span>
        </li>
        <li>
          <Link href="/finder" className="text-teal-700 hover:text-teal-800 underline">
            {t('firstSession.step3.link')}
          </Link>
          <span> — {t('firstSession.step3.detail')}</span>
        </li>
        <li>
          <Link href="/funnel" className="text-teal-700 hover:text-teal-800 underline">
            {t('firstSession.step4.link')}
          </Link>
          <span> — {t('firstSession.step4.detail')}</span>
        </li>
      </ol>

      {/* 2b — reference */}
      <h3 className="text-base font-semibold text-gray-800 mb-3">
        {t('paths.heading')}
      </h3>
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          <strong>{t('paths.email.label')}</strong> — {t('paths.email.body')}{' '}
          <a href="#forwarding" className="text-teal-700 hover:text-teal-800 underline">
            {t('paths.email.link')}
          </a>
          .
        </p>
        <p>
          <strong>{t('paths.url.label')}</strong> — {t('paths.url.body')}
        </p>
        <p>
          <strong>{t('paths.expose.label')}</strong> — {t('paths.expose.body')}
        </p>
        <p>
          <strong>{t('paths.manual.label')}</strong> — {t('paths.manual.body')}
        </p>
        <p>
          <strong>{t('paths.extension.label')}</strong> — {t('paths.extension.body')}
        </p>
      </div>
    </section>
  );
}
