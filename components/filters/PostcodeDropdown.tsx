'use client';

/**
 * PostcodeDropdown — ADR-023 R9 / §10.5.4. Multi-select dropdown with a
 * typeahead, replacing the free-text `PostcodeEntry`.
 *
 * The trigger shows the committed postcodes inline ("1010, 1040"),
 * collapsing past three. The panel has a typeahead input that filters the
 * ~2,000 Austrian postcodes as the user types; matches render as a
 * checklist. Selected postcodes are pinned at the top of the panel so
 * they can always be unchecked. `value` is the comma-joined postcode
 * string (same shape `FilterValues.location` already uses), so it
 * round-trips through `resolvePostcodes` untouched.
 *
 * Deviation from §10.5.4: the typeahead matches postcode *numbers* only.
 * The §10.5.4 "type 'Inn' → 1010 Innere Stadt" place-name discovery would
 * need a postcode→place-name dataset, which `austria-plz-bundesland` does
 * not carry. Numeric typeahead over 2,000 codes is shipped; place-name
 * search is a future enrichment.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  /** Comma-separated postcode string (FilterValues.location). */
  value: string;
  onChange: (next: string) => void;
  /** Every Austrian postcode — from `getAllPostcodes()`. */
  allPostcodes: string[];
  placeholder: string;
  searchPlaceholder: string;
  searchHint: string;
  moreLabel: (n: number) => string;
  compact?: boolean;
}

const MAX_MATCHES = 40;

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Check() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function PostcodeDropdown({
  value,
  onChange,
  allPostcodes,
  placeholder,
  searchPlaceholder,
  searchHint,
  moreLabel,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const codes = useMemo(
    () => value.split(',').map((s) => s.trim()).filter(Boolean),
    [value],
  );
  const codeSet = useMemo(() => new Set(codes), [codes]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Typeahead matches — numeric prefix match, capped, excluding already-selected.
  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return allPostcodes
      .filter((pc) => pc.startsWith(q) && !codeSet.has(pc))
      .slice(0, MAX_MATCHES);
  }, [query, allPostcodes, codeSet]);

  function toggle(pc: string) {
    if (codeSet.has(pc)) onChange(codes.filter((c) => c !== pc).join(', '));
    else onChange([...codes, pc].join(', '));
  }

  const triggerText =
    codes.length === 0
      ? placeholder
      : codes.length <= 3
        ? codes.join(', ')
        : `${codes.slice(0, 3).join(', ')}, ${moreLabel(codes.length - 3)}`;

  const triggerSize = compact
    ? 'rounded-full px-2 py-0.5 text-[10px]'
    : 'rounded-full px-3 py-1 text-xs';

  function row(pc: string, isSel: boolean) {
    return (
      <button
        key={pc}
        type="button"
        role="option"
        aria-selected={isSel}
        onClick={() => toggle(pc)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
      >
        <span
          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
            isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
          }`}
        >
          {isSel && <Check />}
        </span>
        {pc}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${triggerSize} inline-flex items-center gap-1.5 border font-medium transition-colors whitespace-nowrap ${
          codes.length > 0
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        <span className="truncate max-w-[220px]">{triggerText}</span>
        <Chevron />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-[280px] w-[220px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          <div className="px-2 pb-1 pt-0.5">
            <input
              type="text"
              inputMode="numeric"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {/* Selected codes pinned at the top so they can always be removed. */}
          {codes.map((pc) => row(pc, true))}
          {matches.length > 0 && matches.map((pc) => row(pc, false))}
          {query.trim() && matches.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400">—</p>
          )}
          {!query.trim() && (
            <p className="px-3 py-1.5 text-[11px] text-gray-400">{searchHint}</p>
          )}
        </div>
      )}
    </div>
  );
}
