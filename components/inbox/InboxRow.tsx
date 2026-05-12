'use client';

/**
 * ADR-020 v1.1 II8 — inbox row with expand-in-place.
 *
 * Click row → expand body inline + fire PATCH /inbox/:id/read on first
 * expansion. Renders bodyText first; falls back to sanitised bodyHtml;
 * falls back to a "body unavailable" notice. failureReason drives a
 * help line at the bottom of the expanded body.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { InboundEmail, markInboxRead } from '@/lib/api';

function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.floor((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (seconds < 60) return rtf.format(-seconds, 'second');
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
  return rtf.format(-Math.floor(seconds / 86400), 'day');
}

export default function InboxRow({
  message,
  locale,
  onRead,
}: {
  message: InboundEmail;
  locale: string;
  onRead: (id: string) => void;
}) {
  const t = useTranslations('inbox');
  const tCat = useTranslations('inbox.senderCategory');
  const tReason = useTranslations('inbox.failureReason');
  const [expanded, setExpanded] = useState(false);
  const [unread, setUnread] = useState(!message.readAt);

  async function handleToggle(): Promise<void> {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && unread) {
      setUnread(false);
      onRead(message.id);
      try {
        await markInboxRead(message.id);
      } catch {
        // SSE will retry; not worth blocking the UX.
      }
    }
  }

  const senderLabel = tCat.has(message.senderCategory)
    ? tCat(message.senderCategory as 'gmail_forwarding')
    : message.senderCategory;
  const subject = message.subject?.trim() || t('noSubject');
  const reasonHelp = tReason.has(message.failureReason)
    ? tReason(message.failureReason as 'gmail_confirmation')
    : null;

  return (
    <li className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3"
        aria-expanded={expanded}
      >
        <span
          className={`mt-1.5 inline-block w-2 h-2 rounded-full flex-shrink-0 ${
            unread ? 'bg-teal-600' : 'bg-transparent'
          }`}
          aria-label={unread ? t('unreadIndicator') : ''}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <span className={`text-sm ${unread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
              {senderLabel}
            </span>
            <span
              className="text-xs text-gray-400 flex-shrink-0"
              title={new Date(message.receivedAt).toLocaleString()}
            >
              {relativeTime(message.receivedAt, locale)}
            </span>
          </div>
          <p className={`text-sm truncate ${unread ? 'text-gray-800' : 'text-gray-600'}`}>
            {subject}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 mt-3 mb-1">
            <strong>{t('fromLabel')}:</strong> {message.fromAddress}
          </p>
          <p className="text-xs text-gray-500 mb-3">
            <strong>{t('subjectLabel')}:</strong> {subject}
          </p>

          <div className="bg-white border border-gray-200 rounded-lg p-3 mb-3 max-h-96 overflow-y-auto">
            {message.bodyText ? (
              <pre className="text-xs text-gray-800 whitespace-pre-wrap font-sans">
                {message.bodyText}
              </pre>
            ) : message.bodyHtml ? (
              // Allowlist gate at the controller boundary means only senders we
              // explicitly approve reach this surface. bodyHtml is rendered as
              // inert text — not innerHTML — to keep the surface defensive.
              <pre className="text-xs text-gray-800 whitespace-pre-wrap font-sans">
                {message.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
              </pre>
            ) : (
              <p className="text-xs text-gray-400 italic">{t('bodyUnavailable')}</p>
            )}
          </div>

          {reasonHelp && (
            <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              {reasonHelp}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
