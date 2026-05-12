'use client';

/**
 * ADR-021 HH1 + HH2 — first-run guided tour.
 *
 * Mounted at the authenticated layout level (sibling to FeedbackButton +
 * SSEProvider). Auto-fires on first visit to /dashboard when:
 *   - localStorage flag immio.onboardingTour.completed is absent
 *   - router pathname is /dashboard
 *   - viewport width >= 600px (tour disabled on mobile per HH1 spec)
 *   - no property modal is open (data-property-modal-open attr absent)
 *
 * Skip / Finish / Esc all set the flag the same way. Re-trigger from
 * /help wipes the flag and routes to /dashboard.
 *
 * Uses react-joyride v3's `onEvent` callback + `EVENTS.TOUR_END` to
 * detect both finish and skip outcomes. The Skip button is enabled via
 * `options.buttons = ['back', 'skip', 'primary']`.
 */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { EventData, Step } from 'react-joyride';
import { EVENTS } from 'react-joyride';
import { usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';

// react-joyride uses document/window during module init.
const Joyride = dynamic(
  () => import('react-joyride').then((m) => m.Joyride),
  { ssr: false },
);

export const TOUR_COMPLETED_KEY = 'immio.onboardingTour.completed';
const MIN_VIEWPORT_WIDTH = 600;
const START_DELAY_MS = 800; // wait for dashboard data fetches to settle

function readCompleted(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCompleted(value: boolean): void {
  try {
    if (value) localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    else localStorage.removeItem(TOUR_COMPLETED_KEY);
  } catch {
    // private mode / quota — fall back to in-memory (tour re-fires next reload)
  }
}

/** Imperative restart used by the Help page tour-restart button. */
export function restartOnboardingTour(): void {
  writeCompleted(false);
}

export default function OnboardingTour() {
  const t = useTranslations('help.tour');
  const pathname = usePathname();
  const { session, loading: authLoading } = useAuth();
  const [run, setRun] = useState(false);

  const steps = useMemo<Step[]>(
    () => [
      {
        target: 'body',
        placement: 'center',
        title: t('steps.1.title'),
        content: t('steps.1.body'),
        skipBeacon: true,
      },
      {
        target: '[data-tour-id="dashboard-sources-tile"]',
        content: t('steps.2.body'),
      },
      {
        target: '[data-tour-id="nav-funnel"]',
        content: t('steps.3.body'),
      },
      {
        target: '[data-tour-id="nav-finder"]',
        content: t('steps.4.body'),
      },
      {
        target: '[data-tour-id="nav-discover"]',
        content: t('steps.5.body'),
      },
      {
        target: '[data-tour-id="dashboard-first-card"]',
        content: t('steps.6.body'),
      },
      {
        target: '[data-tour-id="nav-help"]',
        content: t('steps.7.body'),
      },
    ],
    [t],
  );

  useEffect(() => {
    if (authLoading || !session?.user?.id) return;
    if (pathname !== '/dashboard') return;
    if (readCompleted()) return;
    if (typeof window === 'undefined') return;
    if (window.innerWidth < MIN_VIEWPORT_WIDTH) return;
    // Acceptance criterion 13: don't fire over an open property modal.
    if (document.querySelector('[data-property-modal-open]')) return;

    const handle = setTimeout(() => {
      // Re-check the modal predicate at fire time — a user might open one
      // during the START_DELAY_MS window.
      if (document.querySelector('[data-property-modal-open]')) return;
      setRun(true);
    }, START_DELAY_MS);

    return () => clearTimeout(handle);
    // session?.user?.id is stable across token refresh; full session
    // reference rotates every ~hour. Pathname is what we actually care
    // about for first-run detection.
  }, [pathname, session?.user?.id, authLoading]);

  function handleEvent(data: EventData): void {
    // TOUR_END fires for both finish (last step → primary) and skip
    // (skip button OR Esc). Both count as completion — we don't
    // distinguish.
    if (data.type === EVENTS.TOUR_END) {
      writeCompleted(true);
      setRun(false);
    }
  }

  if (!run) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={handleEvent}
      locale={{
        back: t('back'),
        close: t('close'),
        last: t('finish'),
        next: t('next'),
        skip: t('skip'),
      }}
      options={{
        buttons: ['back', 'skip', 'primary'],
        showProgress: true,
        overlayClickAction: false, // don't dismiss on overlay click; force Skip/Finish
        primaryColor: '#0d9488', // teal-600 — matches IMMIO accent
        zIndex: 10000,
      }}
    />
  );
}
