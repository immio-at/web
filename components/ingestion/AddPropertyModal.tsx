'use client';

/**
 * AddPropertyModal — unified Add Property entry point (ADR-010 I2).
 *
 * Three tabs across the top: Webseite (URL paste), Exposé (PDF upload,
 * Pro), Manuell (minimal form). A shared funnel-stage selector and a
 * shared submit button live at the bottom and apply to whichever tab
 * is active.
 *
 * On success, the modal closes and the parent's `onCreated` callback
 * fires with the new property — the parent decides what to do (open
 * the property modal on the Dossier tab, refresh caches, etc).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Property,
  createManualProperty,
  createPropertyFromExpose,
  createPropertyFromUrl,
} from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
// Note: useProperties is consumed for its optimisticInsert + refresh
// helpers. We do an instant cache patch first (so the new card shows
// up in Funnel/Dashboard/Discover with no perceptible delay) and then
// fire a background refresh to reconcile any server-side defaults.
import StageSelectorInput, { type StageKey } from './StageSelectorInput';
import UrlTab from './UrlTab';
import ExposeTab from './ExposeTab';
import ManualTab, { EMPTY_MANUAL_FORM, type ManualFormValues } from './ManualTab';

type TabKey = 'url' | 'expose' | 'manual';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (property: Property) => void;
}

export default function AddPropertyModal({ open, onClose, onCreated }: Props) {
  const t = useTranslations('addProperty');
  const { refresh, optimisticInsert } = useProperties();

  const [tab, setTab] = useState<TabKey>('url');
  const [stage, setStage] = useState<StageKey>('investigating');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-tab input state
  const [url, setUrl] = useState('');
  const [exposeFile, setExposeFile] = useState<File | null>(null);
  const [manualValues, setManualValues] = useState<ManualFormValues>(EMPTY_MANUAL_FORM);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setTab('url');
    setStage('investigating');
    setSubmitting(false);
    setError(null);
    setUrl('');
    setExposeFile(null);
    setManualValues(EMPTY_MANUAL_FORM);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function clearError() {
    if (error) setError(null);
  }

  // ── Submit ────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (submitting) return;
    setError(null);

    let property: Property | null = null;
    setSubmitting(true);
    try {
      if (tab === 'url') {
        if (!url.trim()) {
          setError(t('errors.urlRequired'));
          setSubmitting(false);
          return;
        }
        property = await createPropertyFromUrl(url.trim(), stage);
      } else if (tab === 'expose') {
        if (!exposeFile) {
          setError(t('errors.fileRequired'));
          setSubmitting(false);
          return;
        }
        const result = await createPropertyFromExpose(exposeFile, stage);
        property = result.property;
      } else {
        const dto = {
          title: manualValues.title || null,
          price: manualValues.price ? parseFloat(manualValues.price) : null,
          sizeSqm: manualValues.sizeSqm ? parseFloat(manualValues.sizeSqm) : null,
          rooms: manualValues.rooms ? parseFloat(manualValues.rooms) : null,
          location: manualValues.location || null,
          zipCode: manualValues.zipCode || null,
          notes: manualValues.notes || null,
          status: stage,
        };
        property = await createManualProperty(dto);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Map structured backend errors to friendly i18n strings
      if (msg.includes('UNSUPPORTED_URL')) {
        setError(t('errors.unsupportedUrl'));
      } else if (msg.includes('PRO_REQUIRED')) {
        setError(t('errors.proRequired'));
      } else if (msg.includes('PDF')) {
        setError(t('errors.pdfOnly'));
      } else if (msg.includes('zu groß')) {
        setError(t('errors.tooLarge'));
      } else if (msg.includes('DAILY_LIMIT')) {
        setError(t('errors.dailyLimit'));
      } else if (msg.includes('bereits')) {
        setError(t('errors.duplicate'));
      } else if (msg.includes('ungültig') || msg.includes('Invalid')) {
        setError(t('errors.invalidUrl'));
      } else {
        setError(msg || t('errors.generic'));
      }
      setSubmitting(false);
      return;
    }

    if (property) {
      // Optimistic insert — the new card appears in every list view
      // (Funnel, Dashboard, Discover) instantly via the useProperties
      // listener broadcast. The follow-up refresh reconciles any
      // server-side defaults the optimistic copy might be missing
      // (e.g. pricePerSqm generated column, createdAt server timestamp).
      optimisticInsert(property);
      refresh().catch(() => undefined);
      onCreated(property);
      onClose();
    }
    setSubmitting(false);
  }

  if (!open) return null;

  const tabs: { key: TabKey; icon: string; label: string }[] = [
    { key: 'url', icon: '🔗', label: t('tabs.url') },
    { key: 'expose', icon: '📎', label: t('tabs.expose') },
    { key: 'manual', icon: '✏️', label: t('tabs.manual') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 31, 61, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-3 flex items-start justify-between border-b border-gray-100">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">IMMIO</p>
            <h2 className="text-xl font-semibold text-gray-900">{t('title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 pt-3">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => { setTab(tb.key); clearError(); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                tab === tb.key
                  ? 'bg-white border border-gray-200 border-b-white text-gray-900 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{tb.icon}</span>
              <span>{tb.label}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1 border-t border-gray-200">
          {tab === 'url' && (
            <UrlTab value={url} onChange={(v) => { setUrl(v); clearError(); }} errorMessage={error} />
          )}
          {tab === 'expose' && (
            <ExposeTab file={exposeFile} onFileChange={(f) => { setExposeFile(f); clearError(); }} errorMessage={error} />
          )}
          {tab === 'manual' && (
            <ManualTab values={manualValues} onChange={(v) => { setManualValues(v); clearError(); }} />
          )}
          {tab === 'manual' && error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 space-y-3">
          <StageSelectorInput value={stage} onChange={setStage} disabled={submitting} />
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? t('submitting') : t('submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
