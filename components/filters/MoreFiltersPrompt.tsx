'use client';

/**
 * ADR-008 PT3 — single-line "Mehr Filter? Sag uns, was du brauchst →"
 * prompt below the PT2 coming-soon rows. Click opens the existing
 * FeedbackButton drawer (ADR-018 FB5) with category `feature_request`
 * and a prefilled body so testers can tell us which filter axis they
 * would value next.
 *
 * Mechanism: dispatches a `window.CustomEvent('immio:open-feedback-drawer')`
 * that the FeedbackButton component listens for. Keeps the
 * FeedbackButton's internal drawer state encapsulated; no shared hook
 * or context. Same broadcast pattern used for the inbox SSE channel.
 */

import { useTranslations } from 'next-intl';

interface Props {
  compact?: boolean;
}

export default function MoreFiltersPrompt({ compact = false }: Props) {
  const t = useTranslations('presetFilters');

  function handleOpen(): void {
    const description = t('moreFilters.feedbackPrefill');
    window.dispatchEvent(
      new CustomEvent('immio:open-feedback-drawer', {
        detail: { type: 'feature', description },
      }),
    );
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      className={`text-left text-slate-500 hover:text-teal-700 underline-offset-2 hover:underline ${compact ? 'text-[11px]' : 'text-xs'}`}
    >
      {t('moreFilters.prompt')}
    </button>
  );
}
