'use client';

/**
 * ExposeTab — Pro-only PDF upload (ADR-010 I4).
 *
 * Wraps the existing createPropertyFromExpose flow. Free / Light users
 * see a locked state with an upgrade prompt instead of the file picker.
 * The parent AddPropertyModal handles the actual upload via the
 * shared submit handler — this tab just owns the file selection state.
 */

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
  errorMessage: string | null;
}

export default function ExposeTab({ file, onFileChange, errorMessage }: Props) {
  const t = useTranslations('addProperty.exposeTab');
  const { tier } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const isPro = tier === 'pro';

  if (!isPro) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
        <div className="text-2xl mb-2">📎</div>
        <p className="text-sm font-semibold text-slate-700 mb-1">{t('proLockedTitle')}</p>
        <p className="text-xs text-slate-500 mb-3">{t('proLockedBody')}</p>
        <span className="inline-block text-xs font-medium px-3 py-1.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
          {t('upgradePrompt')}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-lg px-4 py-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <div className="text-2xl mb-1">📎</div>
        {file ? (
          <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
        ) : (
          <p className="text-sm text-gray-500">{t('dropZone')}</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1">{t('hint')}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
