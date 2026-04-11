'use client';

/**
 * StageSelectorInput — funnel-stage dropdown shared across all three
 * Add Property tabs (ADR-010 I2). Lists every non-terminal stage so the
 * user can decide where the new property lands the moment they create it.
 *
 * Default: investigating. ADR-010 §"Funnel Stage Selector" — `new` is
 * reserved for properties that arrived via email parser, so a manually
 * added property starts at investigating to signal the user has already
 * taken an action.
 */

import { useTranslations } from 'next-intl';

const STAGES = [
  'new',
  'investigating',
  'interested',
  'due_diligence_completed',
  'visited',
  'offer_made',
] as const;

export type StageKey = (typeof STAGES)[number];

interface Props {
  value: StageKey;
  onChange: (next: StageKey) => void;
  disabled?: boolean;
}

export default function StageSelectorInput({ value, onChange, disabled }: Props) {
  const t = useTranslations('addProperty');
  const tStages = useTranslations('funnel.stages');

  // Map snake_case DB key → camelCase i18n key (mirrors STAGE_I18N_KEY in
  // FunnelBoard / PropertyCard / etc).
  const i18nKey: Record<StageKey, string> = {
    new: 'new',
    investigating: 'investigating',
    interested: 'interested',
    due_diligence_completed: 'dueDiligenceCompleted',
    visited: 'visited',
    offer_made: 'offerMade',
  };

  return (
    <div>
      <label className="text-xs text-gray-500 font-medium block mb-1">
        {t('stageSelector.label')}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as StageKey)}
        disabled={disabled}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
      >
        {STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {tStages(i18nKey[stage])}
          </option>
        ))}
      </select>
    </div>
  );
}
