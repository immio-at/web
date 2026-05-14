'use client';

/**
 * AdminUnacknowledgedToast (ADR-018 §5.5) — persistent toast displayed
 * at the top of EVERY authenticated page for admins, showing the count
 * of unacknowledged feedback reports. Polls every 30 seconds. Click →
 * `/reports?unacknowledged=true`. Not dismissible (by design — see
 * ADR §5.5; the only way to clear it is to acknowledge each report).
 *
 * Component self-gates on `isAdmin` so it's safe to render at the
 * shared authenticated layout level — no-op for non-admin users.
 * Moved out of `/admin/layout.tsx` and into the global authenticated
 * layout (2026-05-14) so admins see new-issue alerts from any page,
 * not just `/admin/*`.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { getUnacknowledgedFeedbackCount } from '@/lib/api';

const POLL_INTERVAL_MS = 30_000;

export default function AdminUnacknowledgedToast() {
  const t = useTranslations('admin.feedback');
  const { isAdmin } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    async function tick() {
      try {
        const { count } = await getUnacknowledgedFeedbackCount();
        if (!cancelled) setCount(count);
      } catch {
        // Swallow — toast just won't update; fine for tester volume.
      }
    }
    void tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;
  if (count == null || count === 0) return null;

  return (
    <Link
      href="/reports?unacknowledged=true"
      className="block bg-amber-100 hover:bg-amber-200 border-b border-amber-300 px-4 py-2.5 text-sm text-amber-900 font-medium transition-colors"
    >
      <span className="mr-2">⚠</span>
      {t('unacknowledgedToast', { count })}
      <span className="ml-2 underline">→</span>
    </Link>
  );
}
