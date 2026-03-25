'use client';

import { useState } from 'react';
import { useProperties, invalidateCache } from '@/hooks/useProperties';
import { importFromUrl } from '@/lib/api';
import DashboardClient from '@/components/DashboardClient';

export default function DashboardPage() {
  const { properties, loading, error, update, optimisticUpdate } = useProperties();

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
      setImportSuccess(`"${result.property.title || 'Inserat'}" importiert und in Investigating verschoben.`);
      setImportUrl('');
      invalidateCache();
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('409')) {
        setImportError('Dieses Inserat hast du bereits gespeichert.');
      } else if (msg.includes('400')) {
        setImportError('Ungültige URL oder Plattform wird noch nicht unterstützt.');
      } else {
        setImportError('Fehler beim Importieren. Bitte prüfe die URL.');
      }
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-gray-600">Loading properties...</p>
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
        <label className="text-xs text-gray-500 font-medium block mb-2">Inserat per URL importieren</label>
        <div className="flex gap-3">
          <input
            type="url"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            placeholder="https://www.willhaben.at/iad/immobilien/d/..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={importing}
          />
          <button
            type="submit"
            disabled={importing || !importUrl.trim()}
            className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {importing ? 'Importieren...' : 'Importieren'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Unterstützt: Willhaben. Weitere Plattformen folgen.</p>
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
      />
    </div>
  );
}
