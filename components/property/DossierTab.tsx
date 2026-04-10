'use client';

/**
 * DossierTab — Property Dossier (ADR-009 DO4 + DO5).
 *
 * Three sections:
 *   1. Documents      — list + upload + download + delete
 *   2. AI Extraction  — Pro-only, button + last-extracted timestamp
 *   3. Structured     — calc-relevant fields with → Apply, plus
 *                       reference fields. MRG warning banner if flagged.
 *
 * Manual inline editing (DO7) and the Exposé-create entry path (DO8)
 * are not in this slice.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Property,
  PropertyDetails,
  PropertyDocument,
  PropertyDetailsApplyableField,
  getPropertyDetails,
  extractPropertyDetails,
  applyPropertyDetailField,
  getDocuments,
  uploadDocument,
  getDocumentDownloadUrl,
  deleteDocument,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProperties } from '@/hooks/useProperties';
import MrgWarningBanner from './MrgWarningBanner';

interface Props {
  property: Property;
  /** Called after a successful → Apply so the parent modal can refresh
   *  the underlying property record (for analysis recalculation). */
  onPropertyApplied?: () => void;
}

const DOC_LABELS = [
  'Exposé', 'Energieausweis', 'Grundriss', 'Provisionsvereinbarung',
  'Widerrufsformular', 'Protokoll', 'Kaufanbot', 'Kaufvertrag', 'Gutachten', 'Sonstiges',
];

const APPLYABLE_FIELDS: PropertyDetailsApplyableField[] = [
  'exposePrice', 'purchaseDate', 'bkUmlagefaehig', 'bkNichtUmlagefaehig',
  'sizeSqmVerified', 'roomsVerified',
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatNumber(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('de-AT');
}

function formatPrice(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '€ ' + Math.round(n).toLocaleString('de-AT');
}

function formatDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-AT');
}

// Years should never be locale-formatted (no thousand separator).
function formatYear(n: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return String(Math.round(n));
}

// Maps a Dossier field to the property column it writes. Mirrors
// FIELD_TO_PROPERTY_COLUMN in property-details.service.ts on the backend.
// Used to optimistically update the useProperties cache so the analyses
// tab and any other consumers see the new value without waiting for a
// network round-trip.
const APPLY_TARGET: Record<PropertyDetailsApplyableField, keyof Property> = {
  exposePrice: 'price',
  purchaseDate: 'purchaseDate',
  bkUmlagefaehig: 'bkUmlagefaehig',
  bkNichtUmlagefaehig: 'bkNichtUmlagefaehig',
  sizeSqmVerified: 'sizeSqm',
  roomsVerified: 'rooms',
};

// ADR-009 default: today + 2 months. Used both for the inline placeholder
// shown next to the purchase-date Apply button and as the value the
// optimistic UI assumes the backend will write when no Dossier value
// exists yet.
function defaultPurchaseDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return d;
}

export default function DossierTab({ property, onPropertyApplied }: Props) {
  const t = useTranslations('dossier');
  const { tier } = useAuth();
  const { optimisticUpdate } = useProperties();
  const isPro = tier === 'pro';

  const [details, setDetails] = useState<PropertyDetails | null>(null);
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Apply state — track which field is currently applying / just applied
  const [applyingField, setApplyingField] = useState<string | null>(null);
  const [appliedField, setAppliedField] = useState<string | null>(null);

  // Document upload state
  const [uploading, setUploading] = useState(false);
  const [docLabel, setDocLabel] = useState<string>('Exposé');
  const [docError, setDocError] = useState<string | null>(null);

  // Initial load — details + documents in parallel
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPropertyDetails(property.id).catch(() => ({ details: null })),
      getDocuments(property.id).catch(() => []),
    ])
      .then(([detailsResp, docs]) => {
        if (cancelled) return;
        setDetails(detailsResp.details);
        setDocuments(docs);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [property.id]);

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleExtract() {
    if (extracting) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const result = await extractPropertyDetails(property.id);
      setDetails(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Backend may return structured errors — surface them in the UI
      if (msg.includes('PRO_REQUIRED')) setExtractError(t('extraction.proRequired'));
      else if (msg.includes('No Exposé')) setExtractError(t('extraction.noExpose'));
      else if (msg.includes('COOLDOWN')) setExtractError(t('extraction.cooldown'));
      else if (msg.includes('DAILY_LIMIT')) setExtractError(t('extraction.dailyLimit'));
      else setExtractError(msg || t('extraction.failed'));
    } finally {
      setExtracting(false);
    }
  }

  // Optimistic apply — show "Applied ✓" immediately, fire the API in
  // the background, also patch the useProperties cache so the analyses
  // tab and any other consumer of the same property see fresh values
  // without waiting for the backend round-trip.
  function handleApply(field: PropertyDetailsApplyableField) {
    if (applyingField) return;

    // Compute the value the backend will write — for purchaseDate when
    // null we mirror the backend's today+2months default; for everything
    // else it's just the Dossier value.
    let value: unknown = details ? (details as unknown as Record<string, unknown>)[field] : null;
    if ((value === null || value === undefined) && field === 'purchaseDate') {
      value = defaultPurchaseDate().toISOString();
    }
    if (value === null || value === undefined) return; // nothing to apply

    // Optimistic visual feedback
    setAppliedField(field);
    setTimeout(() => setAppliedField(null), 2500);

    // Optimistic cache update — patch the parent property record so
    // analyses re-derive from fresh values on the next render.
    const propertyColumn = APPLY_TARGET[field];
    optimisticUpdate(property.id, { [propertyColumn]: value } as Partial<Property>);

    onPropertyApplied?.();

    // Fire the backend write in the background. Roll back the optimistic
    // confirmation if it fails.
    setApplyingField(field);
    applyPropertyDetailField(property.id, field)
      .catch((e) => {
        console.error('Apply failed', e);
        setAppliedField(null);
      })
      .finally(() => setApplyingField(null));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDocError(null);
    try {
      const doc = await uploadDocument(property.id, file, docLabel);
      setDocuments(prev => [doc, ...prev]);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : t('documents.errorUpload'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDownload(doc: PropertyDocument) {
    try {
      const url = await getDocumentDownloadUrl(property.id, doc.id);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Download failed', err);
    }
  }

  async function handleDocDelete(doc: PropertyDocument) {
    if (!confirm(t('documents.confirmDelete', { name: doc.fileName }))) return;
    try {
      await deleteDocument(property.id, doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch (err) {
      console.error('Delete failed', err);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────

  function CalcFieldRow({
    field,
    label,
    value,
    kind,
  }: {
    field: PropertyDetailsApplyableField;
    label: string;
    value: number | string | null;
    kind: 'price' | 'date' | 'number';
  }) {
    const hasValue = value !== null && value !== undefined && value !== '';
    const isApplying = applyingField === field;
    const justApplied = appliedField === field;

    // purchaseDate is special — Apply is always available because the
    // backend falls back to today + 2 months when no value exists.
    const canApply = hasValue || field === 'purchaseDate';

    let displayValue: string;
    if (hasValue && kind === 'date') {
      displayValue = formatDate(value as string);
    } else if (hasValue && kind === 'price') {
      displayValue = formatPrice(typeof value === 'number' ? value : parseFloat(String(value)));
    } else if (hasValue) {
      displayValue = formatNumber(typeof value === 'number' ? value : parseFloat(String(value)));
    } else if (field === 'purchaseDate') {
      // Show the default the Apply button would write
      displayValue = `${formatDate(defaultPurchaseDate().toISOString())} (${t('default')})`;
    } else {
      displayValue = '—';
    }

    return (
      <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
        <span className="text-xs text-gray-500">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${
            hasValue ? 'text-gray-900' : field === 'purchaseDate' ? 'text-gray-400 italic' : 'text-gray-300'
          }`}>
            {displayValue}
          </span>
          {canApply && (
            justApplied ? (
              <span className="text-xs text-emerald-600 font-medium">{t('applied')}</span>
            ) : (
              <button
                onClick={() => handleApply(field)}
                disabled={isApplying}
                title={t('applyTooltip')}
                className="text-xs px-2 py-0.5 rounded border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors"
              >
                {isApplying ? '…' : '→'}
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  function RefField({ label, value }: { label: string; value: unknown }) {
    if (value === null || value === undefined || value === '') return null;
    let display: string;
    if (typeof value === 'boolean') display = value ? t('yes') : t('no');
    else if (typeof value === 'number') display = formatNumber(value);
    else display = String(value);
    return (
      <div className="flex justify-between items-baseline py-1 border-b border-gray-100 last:border-b-0">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-sm text-gray-900">{display}</span>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
            <div className="space-y-2">
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* ─── Section 1: Documents ─────────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          {t('documents.title')} <span className="text-gray-400 font-normal">({documents.length})</span>
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <select
            value={docLabel}
            onChange={(e) => setDocLabel(e.target.value)}
            className="border border-gray-200 rounded px-2 py-1.5 text-xs text-gray-700 bg-white"
          >
            {DOC_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <label className={`text-xs font-medium px-3 py-1.5 rounded border cursor-pointer transition-colors ${
            uploading || documents.length >= 10
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
          }`}>
            {uploading ? t('documents.uploading') : t('documents.upload')}
            <input
              type="file"
              accept=".pdf"
              onChange={handleUpload}
              disabled={uploading || documents.length >= 10}
              className="hidden"
            />
          </label>
          {documents.length >= 10 && (
            <span className="text-xs text-amber-600">{t('documents.maxReached')}</span>
          )}
        </div>

        {docError && (
          <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 text-xs text-red-700">{docError}</div>
        )}

        {documents.length === 0 ? (
          <p className="text-xs text-gray-400 italic">{t('documents.empty')}</p>
        ) : (
          <div className="space-y-1">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 w-24 truncate">{doc.label}</span>
                <button
                  onClick={() => handleDownload(doc)}
                  className="flex-1 text-xs text-left text-blue-600 hover:underline truncate"
                >
                  {doc.fileName}
                </button>
                <span className="text-xs text-gray-400 w-16 text-right">{formatFileSize(doc.fileSize)}</span>
                <button
                  onClick={() => handleDocDelete(doc)}
                  className="text-gray-300 hover:text-red-500 text-xs px-1"
                  title={t('documents.delete')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ─── Section 2: AI Extraction ─────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">{t('extraction.title')}</h3>

        {!isPro ? (
          <div className="bg-slate-50 border border-slate-200 rounded p-3">
            <p className="text-xs text-slate-600 mb-2">🔒 {t('extraction.proLockedHint')}</p>
            <p className="text-xs text-slate-500">{t('extraction.proLockedSub')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-3">{t('extraction.hint')}</p>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExtract}
                disabled={extracting}
                className="text-xs font-medium px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
              >
                {extracting
                  ? t('extraction.extracting')
                  : details?.extractedAt
                    ? t('extraction.reExtract')
                    : t('extraction.extract')}
              </button>
              {details?.extractedAt && (
                <span className="text-xs text-gray-400">
                  {t('extraction.lastExtracted', { when: formatDate(details.extractedAt) })}
                </span>
              )}
            </div>
            {extractError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 mt-2 text-xs text-red-700">{extractError}</div>
            )}
          </>
        )}
      </section>

      {/* ─── Section 3: Structured Property Data ──────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t('fields.title')}</h3>
          {!details && (
            <span className="text-xs text-gray-400 italic">{t('fields.empty')}</span>
          )}
        </div>

        {details?.mrgRisk && <MrgWarningBanner />}

        {details && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* ── Calculator-relevant column ────────────────────────── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-2">
                {t('fields.calcRelevant')}
              </p>
              <div>
                <CalcFieldRow field="exposePrice"          label={t('fields.exposePrice')}          value={details.exposePrice}          kind="price" />
                <CalcFieldRow field="purchaseDate"         label={t('fields.purchaseDate')}         value={details.purchaseDate}         kind="date" />
                <CalcFieldRow field="bkUmlagefaehig"       label={t('fields.bkUmlagefaehig')}       value={details.bkUmlagefaehig}       kind="price" />
                <CalcFieldRow field="bkNichtUmlagefaehig"  label={t('fields.bkNichtUmlagefaehig')}  value={details.bkNichtUmlagefaehig}  kind="price" />
                <CalcFieldRow field="sizeSqmVerified"      label={t('fields.sizeSqmVerified')}      value={details.sizeSqmVerified}      kind="number" />
                <CalcFieldRow field="roomsVerified"        label={t('fields.roomsVerified')}        value={details.roomsVerified}        kind="number" />
              </div>
            </div>

            {/* ── Reference column ──────────────────────────────────── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-2">
                {t('fields.reference')}
              </p>
              <div>
                {/* Location */}
                <RefField label={t('fields.addressStreet')} value={details.addressStreet} />
                <RefField label={t('fields.addressZip')}    value={details.addressZip} />
                <RefField label={t('fields.addressCity')}   value={details.addressCity} />
                {/* Property */}
                <RefField label={t('fields.widmung')}       value={details.widmung} />
                <RefField label={t('fields.etage')}         value={details.etage} />
                <RefField label={t('fields.baujahr')}       value={formatYear(details.baujahr)} />
                <RefField label={t('fields.haustyp')}       value={details.haustyp} />
                <RefField label={t('fields.zustand')}       value={details.zustand} />
                <RefField label={t('fields.beziehbarAb')}   value={details.beziehbarAb ? formatDate(details.beziehbarAb) : null} />
                {/* Size */}
                <RefField label={t('fields.grundflaeche')}  value={details.grundflaeche} />
                <RefField label={t('fields.bathrooms')}     value={details.bathrooms} />
                <RefField label={t('fields.separateWC')}    value={details.separateWC} />
                {/* Features */}
                <RefField label={t('fields.aufzug')}        value={details.aufzug} />
                <RefField label={t('fields.keller')}        value={details.keller} />
                <RefField label={t('fields.aussenflaeche')} value={details.aussenflaeche} />
                <RefField label={t('fields.parkplatz')}     value={details.parkplatz} />
                {/* Technical */}
                <RefField label={t('fields.heizung')}       value={details.heizung} />
                <RefField label={t('fields.boden')}         value={details.boden} />
                <RefField label={t('fields.fenster')}       value={details.fenster} />
                {/* Energy */}
                <RefField label={t('fields.hwbClass')}      value={details.hwbClass} />
                <RefField label={t('fields.hwbValue')}      value={details.hwbValue} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
