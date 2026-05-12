'use client';

/**
 * ADR-020 v1.1 II8 — inbox list view (paginated, newest first).
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { getInbox, InboundEmail } from '@/lib/api';
import InboxRow from './InboxRow';

export default function InboxList() {
  const t = useTranslations('inbox');
  const locale = useLocale();
  const [items, setItems] = useState<InboundEmail[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInbox(targetPage);
      setItems((prev) => (targetPage === 1 ? res.items : [...prev, ...res.items]));
      setHasMore(res.hasMore);
      setPage(targetPage);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  function handleRead(id: string): void {
    setItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, readAt: new Date().toISOString() } : m)),
    );
  }

  if (loading && items.length === 0) {
    return <p className="text-sm text-gray-500 p-6">{t('loading')}</p>;
  }
  if (error) {
    return (
      <p className="text-sm text-red-600 p-6">
        {t('errorPrefix')}: {error}
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-center p-12">
        <p className="text-sm text-gray-500">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <ul>
        {items.map((m) => (
          <InboxRow key={m.id} message={m} locale={locale} onRead={handleRead} />
        ))}
      </ul>
      {hasMore && (
        <div className="border-t border-gray-100 p-3 text-center">
          <button
            type="button"
            onClick={() => load(page + 1)}
            disabled={loading}
            className="text-sm text-teal-700 hover:text-teal-800 font-medium disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMore')}
          </button>
        </div>
      )}
    </div>
  );
}
