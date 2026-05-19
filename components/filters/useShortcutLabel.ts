'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The platform-correct label for the smart-search focus shortcut.
 *
 * The shortcut itself works everywhere (`SmartSearchField` listens for
 * `metaKey || ctrlKey`), but the hint must show the key the user actually
 * has: `⌘K` on macOS, otherwise the localised Ctrl label ("Strg K" / "Ctrl
 * K"). Detection runs post-mount — `navigator` is not available during SSR,
 * and the non-Mac label is the safe pre-hydration default.
 */
export function useShortcutLabel(): string {
  const t = useTranslations('smartSearch');
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const ua = `${navigator.platform || ''} ${navigator.userAgent || ''}`;
    setIsMac(/Mac|iPhone|iPad|iPod/.test(ua));
  }, []);

  return isMac ? '⌘K' : t('shortcutKey');
}
