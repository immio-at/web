'use client';

/**
 * SmartSearchSuggestion — ADR-024 §6.1. One row in the smart-search
 * suggestion dropdown: the action label on the left, a kind tag on the
 * right. Fuzzy suggestions read "Did you mean …?"; the substring fallback
 * reads the honest "searching title and description" badge (§5.1).
 */

import { useTranslations } from 'next-intl';
import type { Suggestion, SuggestionTarget } from '@/lib/smart-search/types';

interface Props {
  suggestion: Suggestion;
  onApply: (s: Suggestion) => void;
}

// rentRegulationCategory canonical value → the `classification.*` i18n key.
const REGULATION_LABEL_KEY: Record<string, string> = {
  mrg_full: 'altbau',
  mrg_partial: 'wiederaufbau',
  free: 'neubau',
};
// Bundesland preset key → its `presetFilters` label key.
const BUNDESLAND_LABEL_KEY: Record<string, string> = {
  W: 'W',
  'NÖ': 'NO',
  'OÖ': 'OO',
  ST: 'ST',
  K: 'K',
  S: 'S',
  T: 'T',
  V: 'V',
  B: 'B',
};

export default function SmartSearchSuggestion({ suggestion: s, onApply }: Props) {
  const t = useTranslations('smartSearch');
  const tp = useTranslations('presetFilters');

  function valueLabel(target: SuggestionTarget): string {
    switch (target.field) {
      case 'propertyType':
        return tp(`propertyType.${target.value}`);
      case 'rentRegulationCategory':
        return tp(`classification.${REGULATION_LABEL_KEY[target.value] ?? target.value}`);
      case 'bundesland':
        return tp(BUNDESLAND_LABEL_KEY[target.presetKey] ?? target.presetKey);
      case 'location':
        return s.displayValue; // district display name or the raw postcode
      case 'range':
        return t(`numeric.${target.key}`, { value: target.value });
      case 'keyword':
        return s.displayValue;
    }
  }

  const label = valueLabel(s.target);

  // Primary line.
  const primary =
    s.kind === 'substring'
      ? t('substringFallback', { text: label })
      : s.fuzzy
        ? t('didYouMean', { label })
        : t('applyFilter', { label });

  // Right-hand kind tag.
  const kindTag = t(`kind.${s.kind}`);

  return (
    <button
      type="button"
      onClick={() => onApply(s)}
      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-blue-50 transition-colors"
    >
      <span className="text-xs text-gray-700 truncate">
        {primary}
        {s.kind === 'substring' && (
          <span className="text-gray-400"> {t('substringHint')}</span>
        )}
      </span>
      <span className="shrink-0 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
        {kindTag}
      </span>
    </button>
  );
}
