'use client';

/**
 * ADR-021 HH5 — Email Forwarding section. Text-only for v1 per the
 * agreed scope; each step uses precise UI nomenclature so users can
 * navigate by reading. Screenshots ship if testers report difficulty.
 *
 * The Outlook + Apple Mail sub-sections each carry an honest "Known
 * gap during tester phase" note — ADR-020 v1.1 deferred those
 * forwarding-confirmation sender patterns pending account access.
 *
 * The Help-page id="forwarding" anchor is the target of the Dashboard
 * empty-state link (HH9) and Section 2 internal links.
 */

import { useTranslations } from 'next-intl';

export default function HelpForwardingSection() {
  const t = useTranslations('help.forwarding');

  return (
    <section id="forwarding" className="bg-white border border-gray-200 rounded-xl p-6 scroll-mt-20">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('heading')}</h2>
      <p className="text-sm text-gray-600 mb-6 whitespace-pre-line">{t('preamble')}</p>

      {/* Gmail */}
      <h3 className="text-base font-semibold text-gray-800 mb-3">
        {t('gmail.heading')}
      </h3>
      <p className="text-sm text-gray-600 mb-3">{t('gmail.intro')}</p>
      <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5 mb-3">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <li key={n}>{t(`gmail.steps.${n}` as const)}</li>
        ))}
      </ol>
      <p className="text-sm text-gray-600 mb-8">{t('gmail.verify')}</p>

      {/* Outlook */}
      <h3 className="text-base font-semibold text-gray-800 mb-3">
        {t('outlook.heading')}
      </h3>
      <p className="text-sm text-gray-600 mb-3">{t('outlook.intro')}</p>
      <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5 mb-3">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <li key={n}>{t(`outlook.steps.${n}` as const)}</li>
        ))}
      </ol>
      <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 mb-8">
        <strong>⚠ {t('outlook.gapTitle')}</strong> — {t('outlook.gapBody')}
      </div>

      {/* Apple Mail */}
      <h3 className="text-base font-semibold text-gray-800 mb-3">
        {t('apple.heading')}
      </h3>
      <p className="text-sm text-gray-600 mb-3">{t('apple.intro')}</p>
      <ol className="space-y-2 text-sm text-gray-700 list-decimal pl-5 mb-3">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <li key={n}>{t(`apple.steps.${n}` as const)}</li>
        ))}
      </ol>
      <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
        <strong>⚠ {t('apple.gapTitle')}</strong> — {t('apple.gapBody')}
      </div>
    </section>
  );
}
