/**
 * ADR-021 HH3 — /help route.
 *
 * Four sections in vertical order: Tour Restart → Starting from Scratch
 * → Email Forwarding → Feedback. Page is short enough to scroll; no
 * tabs, no accordion, no left-nav.
 */

import { getTranslations } from 'next-intl/server';
import HelpTourRestartSection from '@/components/help/HelpTourRestartSection';
import HelpGettingStartedSection from '@/components/help/HelpGettingStartedSection';
import HelpForwardingSection from '@/components/help/HelpForwardingSection';
import HelpFeedbackSection from '@/components/help/HelpFeedbackSection';

export default async function HelpPage() {
  const t = await getTranslations('help');
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('pageTitle')}</h1>
      <div className="space-y-6">
        <HelpTourRestartSection />
        <HelpGettingStartedSection />
        <HelpForwardingSection />
        <HelpFeedbackSection />
      </div>
    </div>
  );
}
