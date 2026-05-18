'use client';

/**
 * SmartSearchField — ADR-024 §1 / §6. The pill-bar R3 text field.
 *
 * Owns the draft input, tokenises it (debounced ~150ms), and renders the
 * suggestion dropdown. Applying a suggestion is delegated to the parent
 * via `onApply` — the parent (`PresetFilters`) routes the structured
 * `target` into the filter state. After an apply, the matched token(s)
 * are stripped from the draft (§6.2). `⌘K` / `Ctrl+K` focuses the field
 * from anywhere; Escape dismisses the dropdown then blurs.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { tokenise } from '@/lib/smart-search/tokeniser';
import { normaliseForTokenisation } from '@/lib/smart-search/normalise';
import type { Suggestion } from '@/lib/smart-search/types';
import SmartSearchDropdown from './SmartSearchDropdown';

interface Props {
  /** Apply one suggestion's structured target to the filter state. */
  onApply: (s: Suggestion) => void;
}

/** Remove every word of `sourceText` (a normalised phrase) from the raw
 *  draft — `normaliseForTokenisation` only collapses whitespace, so token
 *  boundaries line up between the raw and normalised forms. */
function stripSource(draft: string, sourceText: string): string {
  const remove = new Set(
    sourceText.split(/\s+/).map(normaliseForTokenisation).filter(Boolean),
  );
  return draft
    .split(/\s+/)
    .filter((w) => w && !remove.has(normaliseForTokenisation(w)))
    .join(' ');
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-gray-400"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function SmartSearchField({ onApply }: Props) {
  const t = useTranslations('smartSearch');
  const [draft, setDraft] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounce the tokeniser input (~150ms — ADR-024 §6.1).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(draft), 150);
    return () => clearTimeout(id);
  }, [draft]);

  const result = useMemo(() => tokenise(debounced), [debounced]);
  const total = result.suggestions.length + (result.fallback ? 1 : 0);

  // ⌘K / Ctrl+K focuses the field from anywhere on the page (§1.4).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Rotate the placeholder example while the field is unfocused (§1.3).
  useEffect(() => {
    if (open) return;
    const id = setInterval(() => setPlaceholderIdx((i) => (i + 1) % 2), 4000);
    return () => clearInterval(id);
  }, [open]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  function applyOne(s: Suggestion) {
    onApply(s);
    const next = stripSource(draft, s.sourceText);
    setDraft(next);
    setDebounced(next);
    inputRef.current?.focus();
    if (!next.trim()) setOpen(false);
  }

  function applyAll() {
    for (const s of result.suggestions) onApply(s);
    if (result.fallback) onApply(result.fallback);
    setDraft('');
    setDebounced('');
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (open) setOpen(false);
      else inputRef.current?.blur();
    } else if (e.key === 'Enter' && total > 0) {
      e.preventDefault();
      applyAll();
    }
  }

  const showDropdown = open && !!debounced.trim() && total > 0;

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t(placeholderIdx === 0 ? 'placeholder1' : 'placeholder2')}
          aria-label={t('ariaLabel')}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-400 sm:inline">
          ⌘K
        </kbd>
      </div>
      {showDropdown && (
        <SmartSearchDropdown
          suggestions={result.suggestions}
          fallback={result.fallback}
          onApply={applyOne}
          onApplyAll={applyAll}
        />
      )}
    </div>
  );
}
