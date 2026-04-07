'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SavedFilter, importFromUrl } from '@/lib/api';
import { invalidateCache } from '@/hooks/useProperties';

export default function BrowseTile({
  lastFilter,
}: {
  lastFilter?: SavedFilter | null;
}) {
  const t = useTranslations('dashboard.browseTile');

  // URL import (moved from top of old dashboard)
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const result = await importFromUrl(importUrl.trim(), 'investigating');
      setImportMsg({ type: 'success', text: t('importSuccess', { title: result.property.title || 'Inserat' }) });
      setImportUrl('');
      invalidateCache();
      setTimeout(() => setImportMsg(null), 5000);
    } catch (e) {
      setImportMsg({ type: 'error', text: e instanceof Error ? e.message : t('importError') });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between h-full">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('title')}</h3>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <Link
            href="/search"
            className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-center"
          >
            <span className="text-lg">🔍</span>
            <span className="text-xs font-medium text-gray-700">{t('search')}</span>
          </Link>
          <Link
            href="/finder"
            className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-center"
          >
            <span className="text-lg">🃏</span>
            <span className="text-xs font-medium text-gray-700">{t('finder')}</span>
          </Link>
          <Link
            href="/search?view=table"
            className="flex flex-col items-center gap-1 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors text-center"
          >
            <span className="text-lg">📋</span>
            <span className="text-xs font-medium text-gray-700">{t('table')}</span>
          </Link>
        </div>

        {lastFilter && (
          <p className="text-xs text-gray-400 mb-3">
            {t('lastFilter')}: <span className="text-gray-600">{lastFilter.name}</span>
          </p>
        )}

        {/* URL Import — secondary action */}
        <form onSubmit={handleImport} className="mt-2">
          <label className="text-[10px] text-gray-400 font-medium block mb-1">{t('urlImport')}</label>
          <div className="flex gap-1.5">
            <input
              type="url"
              value={importUrl}
              onChange={e => setImportUrl(e.target.value)}
              placeholder="https://willhaben.at/..."
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
              disabled={importing}
            />
            <button
              type="submit"
              disabled={importing || !importUrl.trim()}
              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
            >
              {importing ? '...' : '+'}
            </button>
          </div>
          {importMsg && (
            <p className={`text-[10px] mt-1 ${importMsg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {importMsg.text}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
