'use client';

/**
 * PostcodeEntry — ADR-023 R9 / §8. Multi-postcode text field: type a
 * 4-digit Austrian postcode, commit it as a chip with Enter or comma,
 * click × to remove. Replaces the free-text `location` field.
 *
 * `value` is the comma-joined postcode string (same shape `FilterValues
 * .location` already uses) so it round-trips through the existing
 * `resolvePostcodes` helper untouched.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  /** Comma-separated postcode string (FilterValues.location). */
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}

const POSTCODE_RE = /^\d{4}$/;

export default function PostcodeEntry({ value, onChange, compact = false }: Props) {
  const t = useTranslations('presetFilters');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);

  const codes = value.split(',').map((s) => s.trim()).filter(Boolean);

  function commit() {
    const candidate = draft.trim();
    if (!candidate) return;
    if (!POSTCODE_RE.test(candidate)) {
      setError(true);
      return;
    }
    setError(false);
    if (!codes.includes(candidate)) {
      onChange([...codes, candidate].join(', '));
    }
    setDraft('');
  }

  function remove(code: string) {
    onChange(codes.filter((c) => c !== code).join(', '));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && codes.length > 0) {
      // Backspace on an empty input pops the last chip.
      remove(codes[codes.length - 1]);
    }
  }

  const chip = compact
    ? 'rounded-full pl-2 pr-1 py-0.5 text-[10px]'
    : 'rounded-full pl-2.5 pr-1 py-0.5 text-xs';
  const input = `${
    compact ? 'text-[10px] py-0.5 px-1.5 w-24' : 'text-xs py-1 px-2 w-28'
  } border rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 ${
    error ? 'border-rose-300 focus:ring-rose-400' : 'border-gray-200 focus:ring-blue-500'
  }`;

  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 font-medium mr-1`}>
        {t('postcodeLabel')}
      </span>
      {codes.map((code) => (
        <span
          key={code}
          className={`${chip} inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200`}
        >
          {code}
          <button
            type="button"
            onClick={() => remove(code)}
            aria-label={t('postcodeRemove', { code })}
            className="hover:text-blue-900 leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (error) setError(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={t('postcodePlaceholder')}
        className={input}
        aria-label={t('postcodeLabel')}
      />
      {error && (
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-rose-500`}>
          {t('postcodeInvalid')}
        </span>
      )}
    </div>
  );
}
