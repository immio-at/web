'use client';

/**
 * SmartSearchToast — ADR-024 §12.4. A one-time "what's new" toast pointing
 * the user at the smart-search field on their first Discover visit after
 * the C5 release. Dismissible; shown once per user (a per-user-id
 * localStorage flag, same pattern as the onboarding-tour completion flag).
 * Auto-hides after 12s. Mounted only when `SMART_SEARCH_ENABLED` is on.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';

const seenKey = (userId: string) => `immio.smartSearchToast.seen:${userId}`;

export default function SmartSearchToast() {
  const t = useTranslations('smartSearch');
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [visible, setVisible] = useState(false);

  // Decide once per user — mark seen the moment we choose to show it, so a
  // reload doesn't re-fire it.
  useEffect(() => {
    if (!userId) return;
    try {
      if (localStorage.getItem(seenKey(userId))) return;
      localStorage.setItem(seenKey(userId), '1');
      setVisible(true);
    } catch {
      // localStorage unavailable (private mode) — just skip the toast.
    }
  }, [userId]);

  // Auto-dismiss.
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => setVisible(false), 12_000);
    return () => clearTimeout(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[100] flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg bg-gray-900 px-4 py-3 text-white shadow-lg">
      <span className="text-sm">{t('toastNew')}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={t('toastDismiss')}
        className="shrink-0 text-lg leading-none text-gray-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
