'use client';

/**
 * PropertyTypeChips — ADR-023 R4. Six multi-select chips wired to the
 * `propertyType` filter (ADR-022 `UserListing.propertyType`). Replaces the
 * inert `ComingSoonRow` for the type row.
 *
 * Controlled: `value` is the selected canonical type array; `onChange`
 * receives the next array. Chip labels stay colloquial German in both
 * locales (Austrian terms of art — ADR-022 §12).
 */

import { useTranslations } from 'next-intl';

// Canonical PropertyType values (ADR-022 §5.1). Order matches the legacy
// ComingSoonRow so the row reads identically once wired.
const TYPE_CHIPS = ['haus', 'wohnung', 'zinshaus', 'garage', 'gewerbe', 'grundstueck'] as const;

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
}

export default function PropertyTypeChips({ value, onChange, compact = false }: Props) {
  const t = useTranslations('presetFilters');
  const selected = new Set(value);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  }

  const pill = compact
    ? 'rounded-full px-2 py-0.5 text-[10px] font-medium border'
    : 'rounded-full px-3 py-1 text-xs font-medium border';

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <span className={`${compact ? 'text-[10px] w-24' : 'text-xs w-28'} text-gray-400 font-medium shrink-0 whitespace-nowrap`}>
        {t('propertyType.label')}
      </span>
      {TYPE_CHIPS.map((key) => {
        const isActive = selected.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={isActive}
            className={`${pill} transition-colors whitespace-nowrap ${
              isActive
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {t(`propertyType.${key}`)}
          </button>
        );
      })}
    </div>
  );
}
