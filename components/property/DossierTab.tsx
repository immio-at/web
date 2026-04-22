'use client';

/**
 * DossierTab — Property Dossier (ADR-009 DO4 + DO5 + DO7).
 *
 * Three sections:
 *   1. Documents      — list + upload + download + delete
 *   2. AI Extraction  — Pro-only, button + last-extracted timestamp
 *   3. Structured     — calc-relevant fields with → Apply, plus
 *                       reference fields. Every field is inline-
 *                       editable (DO7). MRG banner if flagged.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Property,
  PropertyDetails,
  PropertyDocument,
  PropertyDetailsApplyableField,
  UpdatePropertyDetailsDto,
  getPropertyDetails,
  updatePropertyDetails,
  extractPropertyDetails,
  applyPropertyDetailField,
  getDocuments,
  uploadDocument,
  getDocumentDownloadUrl,
  updateDocumentLabel,
  deleteDocument,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useProperties } from '@/hooks/useProperties';
import MrgWarningBanner from './MrgWarningBanner';
import EditableField, { type FieldKind } from './EditableField';
import DueDiligencePanel from '@/components/due-diligence/DueDiligencePanel';

interface Props {
  property: Property;
  /** Called immediately after a → Apply click so the parent can sync
   *  open analysis drafts with the new value (analyses keep their own
   *  per-row copies of price / BK / purchaseDate that don't otherwise
   *  refresh until the user reloads the modal). */
  onPropertyApplied?: (field: PropertyDetailsApplyableField, value: unknown) => void;
}

const DOC_LABELS = [
  'Exposé', 'Energieausweis', 'Grundbuchauszug', 'Grundriss', 'Provisionsvereinbarung',
  'Widerrufsformular', 'Protokoll', 'Kaufanbot', 'Kaufvertrag', 'Gutachten', 'Sonstiges',
];

// Keyword → label. First match wins. Case-insensitive substring on the
// filename (stripped of extension). Unknown names fall back to Sonstiges
// so the user can correct it post-upload via the inline dropdown.
const LABEL_KEYWORDS: { keyword: string; label: string }[] = [
  { keyword: 'grundbuch', label: 'Grundbuchauszug' },
  { keyword: 'gba',       label: 'Grundbuchauszug' },
  { keyword: 'expose',    label: 'Exposé' },
  { keyword: 'exposé',    label: 'Exposé' },
  { keyword: 'exposee',   label: 'Exposé' },
  { keyword: 'energie',   label: 'Energieausweis' },
  { keyword: 'eaw',       label: 'Energieausweis' },
  { keyword: 'hwb',       label: 'Energieausweis' },
  { keyword: 'grundriss', label: 'Grundriss' },
  { keyword: 'plan',      label: 'Grundriss' },
  { keyword: 'provision', label: 'Provisionsvereinbarung' },
  { keyword: 'makler',    label: 'Provisionsvereinbarung' },
  { keyword: 'widerruf',  label: 'Widerrufsformular' },
  { keyword: 'protokoll', label: 'Protokoll' },
  { keyword: 'jahresabrechnung', label: 'Protokoll' },
  { keyword: 'abrechnung', label: 'Protokoll' },
  { keyword: 'betriebskosten', label: 'Protokoll' },
  { keyword: 'bk_abr', label: 'Protokoll' },
  { keyword: 'bk abr', label: 'Protokoll' },
  { keyword: 'hausverwaltung', label: 'Protokoll' },
  { keyword: 'kaufanbot', label: 'Kaufanbot' },
  { keyword: 'anbot',     label: 'Kaufanbot' },
  { keyword: 'kaufvertrag', label: 'Kaufvertrag' },
  { keyword: 'vertrag',   label: 'Kaufvertrag' },
  { keyword: 'gutachten', label: 'Gutachten' },
  { keyword: 'nutzwert',  label: 'Gutachten' },
  { keyword: 'bewertung', label: 'Gutachten' },
];

function inferLabelFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '').toLowerCase();
  for (const { keyword, label } of LABEL_KEYWORDS) {
    if (stem.includes(keyword)) return label;
  }
  return 'Sonstiges';
}

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

// ── Field config for inline editing (DO7) ────────────────────────────────────
// Maps every editable Dossier field to its input kind. Enum options mirror
// the backend ENUMS in extraction.service.ts — keep both in sync if values
// change. Labels are the raw enum values for now (i18n later).
type FieldName = keyof PropertyDetails;

const FIELD_CONFIG: Partial<Record<FieldName, { kind: FieldKind; options?: string[] }>> = {
  exposePrice: { kind: 'number' },
  purchaseDate: { kind: 'date' },
  bkUmlagefaehig: { kind: 'number' },
  bkNichtUmlagefaehig: { kind: 'number' },
  sizeSqmVerified: { kind: 'number' },
  roomsVerified: { kind: 'number' },
  addressStreet: { kind: 'text' },
  addressZip: { kind: 'text' },
  addressCity: { kind: 'text' },
  etage: { kind: 'integer' },
  aufzug: { kind: 'boolean' },
  keller: { kind: 'boolean' },
  aussenflaeche: { kind: 'enum', options: ['none', 'balkon', 'terrasse', 'loggia'] },
  parkplatz: { kind: 'enum', options: ['none', 'tiefgarage', 'carport', 'freiplatz'] },
  baujahr: { kind: 'integer' },
  zustand: { kind: 'enum', options: ['erstbezug', 'neuwertig', 'gepflegt', 'renovierungsbeduerftig', 'sanierungsbeduerftig'] },
  haustyp: { kind: 'enum', options: ['altbau', 'gruenderzeit', 'neubau', 'dachausbau'] },
  beziehbarAb: { kind: 'date' },
  heizung: { kind: 'enum', options: ['fernwaerme', 'gas', 'waermepumpe', 'pellets', 'nachtspeicher', 'sonstiges'] },
  boden: { kind: 'enum', options: ['parkett', 'fliesen', 'laminat', 'teppich', 'sonstiges'] },
  fenster: { kind: 'enum', options: ['holz', 'holz_alu', 'kunststoff', 'sonstiges'] },
  bathrooms: { kind: 'integer' },
  separateWC: { kind: 'boolean' },
  widmung: { kind: 'enum', options: ['wohnung', 'einfamilienhaus', 'mehrfamilienhaus', 'dachgeschoss', 'buero', 'geschaeftslokal', 'anlagenobjekt', 'grundstueck', 'sonstiges'] },
  grundflaeche: { kind: 'integer' },
  hwbClass: { kind: 'enum', options: ['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] },
  hwbValue: { kind: 'number' },
};

function fieldOptions(field: FieldName): { value: string; label: string }[] {
  const cfg = FIELD_CONFIG[field];
  if (!cfg?.options) return [];
  return cfg.options.map(v => ({ value: v, label: v }));
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
  const [docError, setDocError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

    // Tell the parent so it can sync open analysis drafts that hold
    // their own per-analysis copies of these fields (BK, list price,
    // purchase date).
    onPropertyApplied?.(field, value);

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

  // ── Manual inline edit (DO7) ─────────────────────────────────────────────
  // Optimistic: update local state first, fire PATCH in background, roll
  // back if the call fails. The Dossier row is the source of truth — the
  // user has to click → Apply separately to push a value to the property.
  async function handleFieldEdit(field: FieldName, next: unknown) {
    if (!details) {
      // No Dossier row yet — create one with just this field
      try {
        const dto: UpdatePropertyDetailsDto = { [field]: next } as UpdatePropertyDetailsDto;
        const created = await updatePropertyDetails(property.id, dto);
        setDetails(created);
      } catch (e) {
        console.error('Field edit failed', e);
      }
      return;
    }

    const before = details;
    setDetails({ ...details, [field]: next as never });
    try {
      const dto: UpdatePropertyDetailsDto = { [field]: next } as UpdatePropertyDetailsDto;
      const updated = await updatePropertyDetails(property.id, dto);
      setDetails(updated);
    } catch (e) {
      console.error('Field edit failed', e);
      setDetails(before);
    }
  }

  async function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (files.length === 0) {
      setDocError(t('documents.errorPdfOnly'));
      return;
    }
    const slotsLeft = 10 - documents.length;
    const toUpload = files.slice(0, slotsLeft);
    const overflow = files.length > slotsLeft;

    setUploading(true);
    setDocError(null);
    try {
      const results = await Promise.allSettled(
        toUpload.map(f => uploadDocument(property.id, f, inferLabelFromFilename(f.name))),
      );
      const newDocs: PropertyDocument[] = [];
      const failures: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled') newDocs.push(r.value);
        else failures.push(`${toUpload[i].name}: ${r.reason instanceof Error ? r.reason.message : 'failed'}`);
      }
      if (newDocs.length > 0) setDocuments(prev => [...newDocs, ...prev]);
      if (failures.length > 0) setDocError(failures.join('\n'));
      else if (overflow) setDocError(t('documents.maxReached'));
    } finally {
      setUploading(false);
    }
  }

  function handleUploadInput(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    // Only clear when leaving the container (not when moving over children)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleLabelChange(doc: PropertyDocument, newLabel: string) {
    if (newLabel === doc.label) return;
    const before = documents;
    setDocuments(prev => prev.map(d => (d.id === doc.id ? { ...d, label: newLabel } : d)));
    try {
      await updateDocumentLabel(property.id, doc.id, newLabel);
    } catch (err) {
      console.error('Label update failed', err);
      setDocuments(before);
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

  // Format helper for the Calc rows — chooses display string by `kind`.
  function formatCalcValue(value: number | string | null, kind: 'price' | 'date' | 'number'): string {
    const hasValue = value !== null && value !== undefined && value !== '';
    if (!hasValue) return '—';
    if (kind === 'date') return formatDate(value as string);
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return kind === 'price' ? formatPrice(n) : formatNumber(n);
  }

  // Format helper for reference rows — switches on the JS type since the
  // PropertyDetails interface is heterogeneous.
  function formatRefValue(field: FieldName, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? t('yes') : t('no');
    if (field === 'baujahr') return formatYear(value as number);
    if (field === 'beziehbarAb') return formatDate(value as string);
    if (typeof value === 'number') return formatNumber(value);
    return String(value);
  }

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

    // Display string. For purchaseDate when null we still show the default
    // (today + 2 months) so the user can preview what Apply would write.
    let display: string;
    if (hasValue) {
      display = formatCalcValue(value, kind);
    } else if (field === 'purchaseDate') {
      display = `${formatDate(defaultPurchaseDate().toISOString())} (${t('default')})`;
    } else {
      display = '—';
    }

    // Map the calc kind to an EditableField kind. Number/date are direct;
    // 'price' becomes 'number' for editing (the formatter still renders €).
    const editKind: FieldKind = kind === 'date' ? 'date' : 'number';

    return (
      <div className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-b-0">
        <span className="text-xs text-gray-500">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            <EditableField
              kind={editKind}
              value={value}
              display={display}
              onSave={(next) => handleFieldEdit(field, next)}
              emptyAsPlaceholder={!hasValue}
            />
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

  // Reference field — every field is editable. Empty values render as
  // "—" but are clickable. We always render the row (no null-hiding) so
  // the user knows which fields exist and can fill them in.
  function RefField({ field, label }: { field: FieldName; label: string }) {
    const cfg = FIELD_CONFIG[field];
    if (!cfg || !details) return null;
    const value = (details as unknown as Record<string, unknown>)[field];
    const display = formatRefValue(field, value);
    const isEmpty = value === null || value === undefined || value === '';
    return (
      <div className="flex justify-between items-baseline py-1 border-b border-gray-100 last:border-b-0">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-sm">
          <EditableField
            kind={cfg.kind}
            value={value}
            display={display}
            onSave={(next) => handleFieldEdit(field, next)}
            options={fieldOptions(field)}
            emptyAsPlaceholder={isEmpty}
          />
        </span>
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
      <section
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bg-white rounded-lg border p-4 transition-colors ${
          isDragging ? 'border-teal-500 border-2 bg-teal-50' : 'border-gray-200'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">
            {t('documents.title')} <span className="text-gray-400 font-normal">({documents.length})</span>
          </h3>
          <label className={`text-xs font-medium px-3 py-1.5 rounded border cursor-pointer transition-colors ${
            uploading || documents.length >= 10
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
          }`}>
            {uploading ? t('documents.uploading') : t('documents.choose')}
            <input
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleUploadInput}
              disabled={uploading || documents.length >= 10}
              className="hidden"
            />
          </label>
        </div>

        {documents.length >= 10 && (
          <p className="text-xs text-amber-600 mb-2">{t('documents.maxReached')}</p>
        )}

        {docError && (
          <div className="bg-red-50 border border-red-200 rounded p-2 mb-2 text-xs text-red-700 whitespace-pre-line">{docError}</div>
        )}

        {documents.length === 0 ? (
          <div className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
            isDragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200'
          }`}>
            <p className="text-xs text-gray-500">{t('documents.dropHint')}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                <select
                  value={doc.label}
                  onChange={(e) => handleLabelChange(doc, e.target.value)}
                  className="text-[10px] font-mono uppercase tracking-widest text-gray-500 bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-1 py-0.5 w-32 truncate"
                >
                  {DOC_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
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
            {isDragging && (
              <div className="rounded-lg border-2 border-dashed border-teal-400 bg-teal-50 p-4 text-center mt-2">
                <p className="text-xs text-teal-700">{t('documents.dropHint')}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Due Diligence Check Engine (ADR-013) ──────────────────────── */}
      <DueDiligencePanel property={property} documents={documents} />

      {/* ─── Section 2: AI Extraction ─────────────────────────────────── */}
      <section className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('extraction.title')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('extraction.hint')}</p>
          </div>
          {isPro && (
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {extracting
                ? t('extraction.extracting')
                : details?.extractedAt
                  ? t('extraction.reExtract')
                  : t('extraction.extract')}
            </button>
          )}
        </div>

        {!isPro && (
          <div className="bg-slate-50 border border-slate-200 rounded p-3 mt-3">
            <p className="text-xs text-slate-600 mb-2">🔒 {t('extraction.proLockedHint')}</p>
            <p className="text-xs text-slate-500">{t('extraction.proLockedSub')}</p>
          </div>
        )}

        {isPro && details?.extractedAt && (
          <p className="text-xs text-gray-400 mt-2">
            {t('extraction.lastExtracted', { when: formatDate(details.extractedAt) })}
          </p>
        )}

        {extractError && (
          <div className="bg-red-50 border border-red-200 rounded p-2 mt-2 text-xs text-red-700">{extractError}</div>
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
                <RefField field="addressStreet" label={t('fields.addressStreet')} />
                <RefField field="addressZip"    label={t('fields.addressZip')} />
                <RefField field="addressCity"   label={t('fields.addressCity')} />
                {/* Property */}
                <RefField field="widmung"       label={t('fields.widmung')} />
                <RefField field="etage"         label={t('fields.etage')} />
                <RefField field="baujahr"       label={t('fields.baujahr')} />
                <RefField field="haustyp"       label={t('fields.haustyp')} />
                <RefField field="zustand"       label={t('fields.zustand')} />
                <RefField field="beziehbarAb"   label={t('fields.beziehbarAb')} />
                {/* Size */}
                <RefField field="grundflaeche"  label={t('fields.grundflaeche')} />
                <RefField field="bathrooms"     label={t('fields.bathrooms')} />
                <RefField field="separateWC"    label={t('fields.separateWC')} />
                {/* Features */}
                <RefField field="aufzug"        label={t('fields.aufzug')} />
                <RefField field="keller"        label={t('fields.keller')} />
                <RefField field="aussenflaeche" label={t('fields.aussenflaeche')} />
                <RefField field="parkplatz"     label={t('fields.parkplatz')} />
                {/* Technical */}
                <RefField field="heizung"       label={t('fields.heizung')} />
                <RefField field="boden"         label={t('fields.boden')} />
                <RefField field="fenster"       label={t('fields.fenster')} />
                {/* Energy */}
                <RefField field="hwbClass"      label={t('fields.hwbClass')} />
                <RefField field="hwbValue"      label={t('fields.hwbValue')} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
