'use client';

/**
 * MrgWarningBanner — amber MRG risk signal banner (ADR-009).
 *
 * Shown in:
 *   - Dossier tab Section 3 header (this slice — DO4)
 *   - Rental analysis tab header (next slice — DO6)
 *
 * MRG risk is an AI-inferred SIGNAL, never a legal classification.
 * The copy is deliberately careful: "Mögliches MRG-Objekt", "Signale
 * deuten auf", "Rechtliche Beratung wird empfohlen". Any change to
 * this wording must preserve that hedging.
 */

import { useTranslations } from 'next-intl';

export default function MrgWarningBanner() {
  const t = useTranslations('dossier.mrgWarning');
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
      <span className="text-amber-600 text-lg leading-none">⚠</span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-900">{t('title')}</p>
        <p className="text-xs text-amber-800 mt-0.5">{t('body')}</p>
      </div>
    </div>
  );
}
