'use client';

/**
 * SmartSearchField — ADR-024 §8.3 lazy wrapper.
 *
 * The heavy implementation (the tokeniser, Fuse.js and the bilingual
 * vocabulary — `SmartSearchFieldImpl`) is `next/dynamic`-imported only
 * once the user focuses the field or presses ⌘K. Until then this renders
 * just the resting chrome, so the smart-search chunk stays out of the
 * Discover route's first-load JS for users who never search.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import type { Suggestion } from '@/lib/smart-search/types';
import { useShortcutLabel } from './useShortcutLabel';

interface Props {
  onApply: (s: Suggestion) => void;
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

/** The field's resting chrome — pixel-identical to `SmartSearchFieldImpl`'s
 *  resting state, so activation causes no layout shift. The input is
 *  `readOnly`: focusing it activates the field; the real (typeable) input
 *  arrives with the dynamically-imported implementation. */
function RestingShell({
  placeholder,
  ariaLabel,
  onFocus,
}: {
  placeholder: string;
  ariaLabel: string;
  onFocus?: () => void;
}) {
  const shortcut = useShortcutLabel();
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
        <SearchIcon />
        <input
          type="text"
          readOnly
          placeholder={placeholder}
          aria-label={ariaLabel}
          onFocus={onFocus}
          className="min-w-0 flex-1 cursor-text bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-gray-200 px-1 py-0.5 text-[10px] text-gray-400 sm:inline">
          {shortcut}
        </kbd>
      </div>
    </div>
  );
}

// The heavy field — loaded on demand. `loading` shows the resting chrome
// so there is no flicker while the chunk arrives.
const SmartSearchFieldImpl = dynamic(() => import('./SmartSearchFieldImpl'), {
  ssr: false,
  loading: function ImplLoading() {
    const t = useTranslations('smartSearch');
    return <RestingShell placeholder={t('placeholder1')} ariaLabel={t('ariaLabel')} />;
  },
});

export default function SmartSearchField({ onApply }: Props) {
  const t = useTranslations('smartSearch');
  const [activated, setActivated] = useState(false);

  // ⌘K / Ctrl+K activates the field before the user has focused it; once
  // activated the implementation's own ⌘K handler takes over.
  useEffect(() => {
    if (activated) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActivated(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activated]);

  if (activated) {
    return <SmartSearchFieldImpl onApply={onApply} autoFocus />;
  }

  return (
    <RestingShell
      placeholder={t('placeholder1')}
      ariaLabel={t('ariaLabel')}
      onFocus={() => setActivated(true)}
    />
  );
}
