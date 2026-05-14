'use client';

/**
 * ADR-008 PT2 — generic disabled "coming soon" chip row. Used twice in
 * `PresetFilters.tsx` for property type and classification.
 *
 * Chip appearance is identical to Bundesland pills in shape and size,
 * but rendered in a disabled style: muted background, muted border,
 * lower text contrast. Click and keyboard activation are suppressed.
 * Chips are focusable for screen-reader announcement but
 * `aria-disabled="true"`. A row-level "Kommt bald" / "Coming soon"
 * label sits to the right of the chip group.
 *
 * No interaction: this is a roadmap signal, not a filter.
 */

import { useTranslations } from 'next-intl';

interface ComingSoonChip {
  key: string;
  labelKey: string; // i18n key, looked up under presetFilters.*
}

interface Props {
  /** i18n key for the row label prefix (e.g. presetFilters.propertyType.label). */
  labelKey: string;
  /** Disabled chips to render. */
  chips: ComingSoonChip[];
  /** Smaller pill size — matches the compact prop on PresetFilters. */
  compact?: boolean;
}

export default function ComingSoonRow({ labelKey, chips, compact = false }: Props) {
  const t = useTranslations('presetFilters');

  const pillBase = compact
    ? 'inline-flex items-center px-2 py-0.5 rounded-full text-[11px]'
    : 'inline-flex items-center px-2.5 py-1 rounded-full text-xs';
  const pillDisabled = 'bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed select-none';

  const tooltip = t('comingSoonTooltip');

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <span className="text-slate-400 font-medium">{t(labelKey)}:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          tabIndex={0}
          aria-disabled="true"
          title={tooltip}
          onClick={(e) => e.preventDefault()}
          className={`${pillBase} ${pillDisabled}`}
        >
          {t(chip.labelKey)}
        </button>
      ))}
      <span className="ml-1 text-slate-400 italic">{t('comingSoon')}</span>
    </div>
  );
}
