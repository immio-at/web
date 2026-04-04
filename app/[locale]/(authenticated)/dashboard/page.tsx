'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useProperties, invalidateCache } from '@/hooks/useProperties';
import { importFromUrl } from '@/lib/api';
import { useInteractionTracker } from '@/hooks/useInteractionTracker';
import DashboardClient from '@/components/DashboardClient';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { properties, loading, error, update, optimisticUpdate } = useProperties();
  const { track, getRecent, getMost } = useInteractionTracker();
  const [, setInteractionTick] = useState(0); // force re-render on interaction

  const handleInteraction = useCallback((id: string) => {
    track(id);
    setInteractionTick(t => t + 1); // trigger re-render so carousels update
  }, [track]);

  // URL import state
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleImportUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    setImportSuccess(null);
    try {
      const result = await importFromUrl(importUrl.trim(), 'investigating');
      setImportSuccess(t('urlImport.successMessage', { title: result.property.title || t('urlImport.defaultTitle') }));
      setImportUrl('');
      invalidateCache();
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('urlImport.errorUnknown');
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-gray-600">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">⚠️ {error}</p>
        </div>
      )}

      {/* URL Import */}
      <form onSubmit={handleImportUrl} className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
        <label className="text-xs text-gray-500 font-medium block mb-2">{t('urlImport.label')}</label>
        <div className="flex gap-3">
          <input
            type="url"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            placeholder={t('urlImport.placeholder')}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={importing}
          />
          <button
            type="submit"
            disabled={importing || !importUrl.trim()}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importing ? t('urlImport.importing') : t('urlImport.import')}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">{t('urlImport.supportedPlatforms')}</p>
        {importSuccess && (
          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2.5">
            <p className="text-green-800 text-sm">✓ {importSuccess}</p>
          </div>
        )}
        {importError && (
          <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-2.5">
            <p className="text-red-800 text-sm">{importError}</p>
          </div>
        )}
      </form>

      <DashboardClient
        properties={properties}
        onUpdate={update}
        onOptimisticUpdate={optimisticUpdate}
        onInteraction={handleInteraction}
        recentIds={getRecent(15)}
        frequentIds={getMost(15)}
      />
    </div>
  );
}
