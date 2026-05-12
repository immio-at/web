'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Property, getInboxUnreadCount } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';

const KNOWN_PLATFORMS = ['willhaben', 'immoscout24', 'immowelt', 'bazar', 'immmo'];

const PLATFORM_LABELS: Record<string, string> = {
  willhaben: 'Willhaben',
  immoscout24: 'ImmoScout24',
  immowelt: 'Immowelt',
  bazar: 'Bazar.at',
  immmo: 'immmo.at',
};

export default function SourcesSetupTile({
  properties,
  immioEmail,
}: {
  properties: Property[];
  immioEmail: string | null;
}) {
  const t = useTranslations('dashboard.sourcesTile');
  const [copied, setCopied] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { session, loading: authLoading } = useAuth();

  function handleCopy() {
    if (!immioEmail) return;
    navigator.clipboard.writeText(immioEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ADR-020 v1.1 II8 — fetch inbox unread count, refresh on inbox SSE.
  const refreshUnread = useCallback(async () => {
    try {
      const res = await getInboxUnreadCount();
      setUnreadCount(res.count ?? 0);
    } catch {
      // Silent — the indicator just won't appear; tile keeps working.
    }
  }, []);

  useEffect(() => {
    if (authLoading || !session?.user?.id) return;
    void refreshUnread();
    function handleSseInbox(e: Event) {
      const detail = (e as CustomEvent).detail as { type?: string } | undefined;
      if (detail?.type === 'inbox') void refreshUnread();
    }
    window.addEventListener('immio:cache-invalidation', handleSseInbox);
    return () => window.removeEventListener('immio:cache-invalidation', handleSseInbox);
  }, [authLoading, session?.user?.id, refreshUnread]);

  const platformStatus = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const result: Record<string, { active: boolean; lastReceived: string | null }> = {};

    for (const platform of KNOWN_PLATFORMS) {
      result[platform] = { active: false, lastReceived: null };
    }

    for (const p of properties) {
      const platform = p.platform;
      if (!KNOWN_PLATFORMS.includes(platform)) continue;

      const receivedAt = p.emailReceivedAt ? new Date(p.emailReceivedAt).getTime() : 0;

      if (!result[platform].lastReceived || receivedAt > new Date(result[platform].lastReceived!).getTime()) {
        result[platform].lastReceived = p.emailReceivedAt;
      }

      if (receivedAt > thirtyDaysAgo) {
        result[platform].active = true;
      }
    }

    return result;
  }, [properties]);

  return (
    <div
      data-tour-id="dashboard-sources-tile"
      className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full"
    >
      <h3 className="text-base font-semibold text-gray-900 mb-3">{t('title')}</h3>

      {/* Email forwarding section */}
      {immioEmail && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">{t('forwardHint')}</p>
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <p className="text-sm font-mono font-medium text-gray-900 select-all truncate flex-1">{immioEmail}</p>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      )}

      {/* Platform status list */}
      <div className="space-y-2 flex-1">
        {KNOWN_PLATFORMS.map(platform => (
          <div key={platform} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {platformStatus[platform].active ? (
                <span className="text-green-500 text-sm">✓</span>
              ) : (
                <span className="text-amber-400 text-sm">○</span>
              )}
              <span className="text-sm text-gray-700">{PLATFORM_LABELS[platform]}</span>
            </div>
            {platformStatus[platform].active && platformStatus[platform].lastReceived ? (
              <span className="text-xs text-gray-400">
                {new Date(platformStatus[platform].lastReceived!).toLocaleDateString('de-AT')}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{t('notConfigured')}</span>
            )}
          </div>
        ))}
      </div>

      {/* Inbox unread indicator — only renders when count > 0 */}
      {unreadCount > 0 && (
        <Link
          href="/inbox"
          className="mt-3 pt-3 border-t border-gray-100 text-sm text-teal-700 hover:text-teal-800 font-medium flex items-center gap-1"
        >
          {unreadCount === 1
            ? t('unreadSingle')
            : t('unreadPlural', { count: unreadCount })}
          <span aria-hidden> →</span>
        </Link>
      )}
    </div>
  );
}
