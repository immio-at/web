'use client';

/**
 * AddFromExposeButton — ADR-009 DO8 entry point.
 *
 * Pro-only file picker that uploads an Exposé PDF, lets the backend
 * create a new property record + run extraction, refreshes the
 * properties cache, and opens the Property Analysis Modal in Dossier
 * mode on the new property.
 *
 * For non-Pro users the button is rendered but locked — clicking
 * shows an upgrade hint instead of opening the picker.
 */

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Property, createPropertyFromExpose } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProperties } from '@/hooks/useProperties';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

export default function AddFromExposeButton() {
  const t = useTranslations('dossier.fromExpose');
  const { tier } = useAuth();
  const { refresh } = useProperties();
  const inputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProperty, setCreatedProperty] = useState<Property | null>(null);
  const [showLockedHint, setShowLockedHint] = useState(false);

  const isPro = tier === 'pro';

  function handleClick() {
    if (uploading) return;
    if (!isPro) {
      setShowLockedHint(true);
      setTimeout(() => setShowLockedHint(false), 4000);
      return;
    }
    inputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await createPropertyFromExpose(file);
      // Refresh the properties cache so the new record appears
      // immediately on Dashboard / Funnel / Discover
      await refresh();
      setCreatedProperty(result.property);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('PRO_REQUIRED')) setError(t('errorProRequired'));
      else if (msg.includes('PDF')) setError(t('errorPdfOnly'));
      else if (msg.includes('zu groß') || msg.includes('size')) setError(t('errorTooLarge'));
      else if (msg.includes('DAILY_LIMIT')) setError(t('errorDailyLimit'));
      else setError(msg || t('errorGeneric'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={uploading}
        title={isPro ? t('tooltip') : t('proLockedTooltip')}
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
          uploading
            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-wait'
            : isPro
              ? 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-blue-300'
              : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
        }`}
      >
        <span>📎</span>
        <span>{uploading ? t('uploading') : t('button')}</span>
        {!isPro && <span className="text-[10px] text-amber-600">PRO</span>}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFile}
        className="hidden"
      />

      {error && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 max-w-sm">
          {error}
        </div>
      )}

      {showLockedHint && !isPro && (
        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800 max-w-sm">
          {t('proLockedHint')}
        </div>
      )}

      {createdProperty && (
        <PropertyAnalysisModal
          property={createdProperty}
          onClose={() => setCreatedProperty(null)}
        />
      )}
    </>
  );
}
