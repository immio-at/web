'use client';

/**
 * ADR-021 HH7 — Feedback section.
 *
 * No new button; this is a discoverability backup for the existing
 * floating FeedbackButton (ADR-018) and Settings → Feedback entry.
 */

import { useTranslations } from 'next-intl';

export default function HelpFeedbackSection() {
  const t = useTranslations('help.feedback');

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('heading')}</h2>
      <p className="text-sm text-gray-600 whitespace-pre-line">{t('description')}</p>
    </section>
  );
}
