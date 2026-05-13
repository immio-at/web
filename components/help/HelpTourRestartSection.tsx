'use client';

/**
 * ADR-021 HH4 — Tour-restart section. Wipes the per-user localStorage
 * completion flag and routes to /dashboard so the tour fires on mount.
 */

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { restartOnboardingTour } from './OnboardingTour';

export default function HelpTourRestartSection() {
  const t = useTranslations('help.tour');
  const router = useRouter();
  const { session } = useAuth();

  function handleRestart(): void {
    const userId = session?.user?.id;
    if (!userId) return;
    restartOnboardingTour(userId);
    router.push('/dashboard');
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('heading')}</h2>
      <p className="text-sm text-gray-600 mb-4">{t('description')}</p>
      <button
        onClick={handleRestart}
        className="text-sm font-medium px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors"
      >
        {t('restartButton')}
      </button>
    </section>
  );
}
