'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import {
  Property,
  PropertyAnalysis,
  PropertyDocument,
  RehabCostItem,
  UpdateAnalysisDto,
  getAnalyses,
  createAnalysis,
  updateAnalysis,
  deleteAnalysis,
  getDocuments,
  uploadDocument,
  getDocumentDownloadUrl,
  deleteDocument,
} from '@/lib/api';
import {
  calcOwnerResults,
  calcRentalResults,
  calcFlipResults,
  calcTotalInvestment,
  calcEigenkapital,
  calcKaufnebenkosten,
  calcTotalRehab,
  calcLoan1Monthly,
  calcLoan2Monthly,
  calcTotalMonthlyLoan,
  resolveL1Amount,
  formatEuro,
  formatPct,
  formatFaktor,
} from '@/lib/calculators';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  property: Property;
  onClose: () => void;
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function NumInput({
  label, value, onChange, suffix, prefix, readOnly, hint,
}: {
  label: string;
  value: number | null | undefined;
  onChange?: (v: number | null) => void;
  suffix?: string;
  prefix?: string;
  readOnly?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide">{label}</label>
      <div className="flex items-center border border-[#e2e6ed] rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[#F5A623] focus-within:border-transparent transition-all">
        {prefix && <span className="px-3 py-2 bg-[#f8f9fb] text-[#6b7a99] text-sm border-r border-[#e2e6ed]">{prefix}</span>}
        <input
          type="number"
          readOnly={readOnly}
          value={value ?? ''}
          onChange={e => onChange?.(e.target.value === '' ? null : parseFloat(e.target.value))}
          className={`flex-1 px-3 py-2 text-sm text-[#0F1F3D] outline-none ${readOnly ? 'bg-[#f8f9fb] text-[#6b7a99]' : 'bg-white'}`}
        />
        {suffix && <span className="px-3 py-2 bg-[#f8f9fb] text-[#6b7a99] text-sm border-l border-[#e2e6ed]">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-[#6b7a99]">{hint}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h3 className="text-sm font-semibold text-[#0F1F3D] uppercase tracking-widest">{children}</h3>
      <div className="flex-1 h-px bg-[#e2e6ed]" />
    </div>
  );
}

function ResultRow({ label, value, highlight, indent }: { label: string; value: string; highlight?: boolean; indent?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-2 ${highlight ? 'border-t border-[#e2e6ed] mt-1 pt-3' : ''}`}>
      <span className={`text-sm ${indent ? 'pl-4 text-[#6b7a99]' : highlight ? 'font-semibold text-[#0F1F3D]' : 'text-[#6b7a99]'}`}>{label}</span>
      <span className={`text-sm font-mono ${highlight ? 'font-bold text-[#0F1F3D] text-base' : 'text-[#0F1F3D]'}`}>{value}</span>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-[#6b7a99] uppercase tracking-wide font-medium">{label}</span>
      <span className="text-xl font-bold text-[#0F1F3D] font-mono">{value}</span>
      {sub && <span className="text-xs text-[#6b7a99]">{sub}</span>}
    </div>
  );
}

// ─── Default blank analysis (client-side shell before backend response) ────────

function blankAnalysis(property: Property): Omit<PropertyAnalysis, 'id' | 'propertyId' | 'dealId' | 'createdAt' | 'updatedAt'> {
  return {
    name: null,
    usageType: 'rental',
    listPrice: property.price ? parseFloat(String(property.price)) : null,
    desiredPrice: property.price ? parseFloat(String(property.price)) : null,
    maklerPct: 0.036,
    notarPct: 0.012,
    grundbuchPct: 0.011,
    grunderwerbsteuerPct: 0.035,
    otherPurchaseCosts: 0,
    rehabCosts: [{ label: '', amount: 0, abzugsfaehig: 0 }],
    financing: true,
    loan1AmountPct: 0.80,
    loan1Amount: null,
    loan1Rate: null,
    loan1TermYears: null,
    loan2Enabled: false,
    loan2Amount: null,
    loan2Rate: null,
    loan2TermYears: null,
    ooBetriebskostenMonthly: null,
    ooRepairsPct: 0.01,
    ooAppreciationPct: 0.02,
    rentType: 'warm',
    rentMonthly: null,
    bkUmlagefaehig: null,
    bkNichtUmlagefaehig: null,
    reparaturruecklageMon: null,
    vacancyPct: 0.02,
    repairsPct: 0.02,
    rentGrowthPct: 0.02,
    valueGrowthPct: 0.02,
    flipDurationMonths: null,
    flipResalePrice: null,
  };
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function PropertyAnalysisModal({ property, onClose }: Props) {
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(null);
  const [draft, setDraft] = useState<Omit<PropertyAnalysis, 'id' | 'propertyId' | 'dealId' | 'createdAt' | 'updatedAt'>>(blankAnalysis(property));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Documents
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docLabel, setDocLabel] = useState('Exposé');
  const [docError, setDocError] = useState<string | null>(null);

  // Attach sizeSqm from property for price-per-sqm calculation
  const sizeSqm = property.sizeSqm;

  // ── Load or create analysis on mount ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const analyses = await getAnalyses(property.id);
        if (analyses.length > 0) {
          const a = analyses[0];
          setAnalysis(a);
          setDraft({
            name: a.name,
            usageType: a.usageType as 'owner' | 'rental' | 'flip',
            listPrice: a.listPrice ? parseFloat(String(a.listPrice)) : null,
            desiredPrice: a.desiredPrice ? parseFloat(String(a.desiredPrice)) : null,
            maklerPct: parseFloat(String(a.maklerPct)),
            notarPct: parseFloat(String(a.notarPct)),
            grundbuchPct: parseFloat(String(a.grundbuchPct)),
            grunderwerbsteuerPct: parseFloat(String(a.grunderwerbsteuerPct)),
            otherPurchaseCosts: parseFloat(String(a.otherPurchaseCosts)),
            rehabCosts: Array.isArray(a.rehabCosts) ? a.rehabCosts : [],
            financing: a.financing,
            loan1AmountPct: parseFloat(String(a.loan1AmountPct)),
            loan1Amount: a.loan1Amount ? parseFloat(String(a.loan1Amount)) : null,
            loan1Rate: a.loan1Rate ? parseFloat(String(a.loan1Rate)) : null,
            loan1TermYears: a.loan1TermYears,
            loan2Enabled: a.loan2Enabled,
            loan2Amount: a.loan2Amount ? parseFloat(String(a.loan2Amount)) : null,
            loan2Rate: a.loan2Rate ? parseFloat(String(a.loan2Rate)) : null,
            loan2TermYears: a.loan2TermYears,
            ooBetriebskostenMonthly: a.ooBetriebskostenMonthly ? parseFloat(String(a.ooBetriebskostenMonthly)) : null,
            ooRepairsPct: parseFloat(String(a.ooRepairsPct)),
            ooAppreciationPct: parseFloat(String(a.ooAppreciationPct)),
            rentType: (a.rentType as 'warm' | 'kalt') ?? 'warm',
            rentMonthly: a.rentMonthly ? parseFloat(String(a.rentMonthly)) : null,
            bkUmlagefaehig: a.bkUmlagefaehig ? parseFloat(String(a.bkUmlagefaehig)) : null,
            bkNichtUmlagefaehig: a.bkNichtUmlagefaehig ? parseFloat(String(a.bkNichtUmlagefaehig)) : null,
            reparaturruecklageMon: a.reparaturruecklageMon ? parseFloat(String(a.reparaturruecklageMon)) : null,
            vacancyPct: parseFloat(String(a.vacancyPct)),
            repairsPct: parseFloat(String(a.repairsPct)),
            rentGrowthPct: parseFloat(String(a.rentGrowthPct)),
            valueGrowthPct: parseFloat(String(a.valueGrowthPct)),
            flipDurationMonths: a.flipDurationMonths,
            flipResalePrice: a.flipResalePrice ? parseFloat(String(a.flipResalePrice)) : null,
          });
        }
        // Load documents in parallel
        const docs = await getDocuments(property.id);
        setDocuments(docs);
      } catch (e) {
        setError('Fehler beim Laden der Analyse.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [property.id]);

  // ── Field updater ─────────────────────────────────────────────────────────
  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  // ── Rehab line items ──────────────────────────────────────────────────────
  function addRehab() {
    set('rehabCosts', [...draft.rehabCosts, { label: '', amount: 0, abzugsfaehig: 0 }]);
  }
  function updateRehab(i: number, patch: Partial<RehabCostItem>) {
    const updated = draft.rehabCosts.map((item, idx) => idx === i ? { ...item, ...patch } : item);
    set('rehabCosts', updated);
  }
  function removeRehab(i: number) {
    set('rehabCosts', draft.rehabCosts.filter((_, idx) => idx !== i));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const dto: UpdateAnalysisDto = { ...draft };
      if (analysis) {
        await updateAnalysis(property.id, analysis.id, dto);
      } else {
        const created = await createAnalysis(property.id, { usageType: draft.usageType, name: draft.name ?? undefined });
        await updateAnalysis(property.id, created.id, dto);
        setAnalysis(created);
      }
      onClose();
    } catch (e) {
      setError('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  }

  // ── Document handlers ────────────────────────────────────────────────────
  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setDocError(null);
    try {
      const doc = await uploadDocument(property.id, file, docLabel);
      setDocuments(prev => [doc, ...prev]);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      e.target.value = ''; // reset file input
    }
  }

  async function handleDocDownload(doc: PropertyDocument) {
    try {
      const url = await getDocumentDownloadUrl(property.id, doc.id);
      window.open(url, '_blank');
    } catch {
      setDocError('Download fehlgeschlagen');
    }
  }

  async function handleDocDelete(doc: PropertyDocument) {
    try {
      await deleteDocument(property.id, doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch {
      setDocError('Löschen fehlgeschlagen');
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── Build a full PropertyAnalysis shape for calculators ───────────────────
  const calc: PropertyAnalysis = {
    id: analysis?.id ?? '',
    propertyId: property.id,
    dealId: analysis?.dealId ?? '',
    createdAt: analysis?.createdAt ?? '',
    updatedAt: analysis?.updatedAt ?? '',
    ...draft,
  };

  // ── Derived display values ────────────────────────────────────────────────
  const kaufnebenkosten = calcKaufnebenkosten(calc);
  const totalRehab = calcTotalRehab(calc.rehabCosts);
  const totalInvestment = calcTotalInvestment(calc);
  const eigenkapital = calcEigenkapital(calc);
  const loan1Monthly = calcLoan1Monthly(calc);
  const loan2Monthly = calcLoan2Monthly(calc);
  const totalMonthlyLoan = calcTotalMonthlyLoan(calc);
  const resolvedL1 = resolveL1Amount(calc);
  const pricePerSqm = calc.desiredPrice && sizeSqm ? calc.desiredPrice / sizeSqm : null;

  const ownerResults = draft.usageType === 'owner' ? calcOwnerResults(calc) : null;
  const rentalResults = draft.usageType === 'rental' ? calcRentalResults(calc) : null;
  const flipResults = draft.usageType === 'flip' ? calcFlipResults(calc) : null;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4 px-2">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl my-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between p-6 border-b border-[#e2e6ed]">
          <div>
            <p className="text-xs text-[#6b7a99] uppercase tracking-widest mb-1">Analyse</p>
            <h2 className="text-lg font-semibold text-[#0F1F3D] leading-tight">{property.title ?? 'Immobilie'}</h2>
            {analysis?.dealId && (
              <span className="inline-block mt-1 text-xs font-mono bg-[#f8f9fb] border border-[#e2e6ed] px-2 py-0.5 rounded text-[#6b7a99]">
                {analysis.dealId}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[#6b7a99] hover:text-[#0F1F3D] transition-colors text-2xl leading-none">✕</button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#6b7a99]">Lade Analyse…</div>
        ) : (
          <div className="p-6 space-y-8">

            {/* ── Section 0: Property Info Strip ── */}
            <div className="flex items-center gap-4 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl p-4">
              {property.imageUrl && (
                <img src={property.imageUrl} alt="" className="w-20 h-16 object-cover rounded-lg flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#6b7a99]">
                  {property.price && (
                    <span className="font-semibold text-[#0F1F3D]">
                      € {Math.round(parseFloat(String(property.price))).toLocaleString('de-AT')}
                    </span>
                  )}
                  {sizeSqm && <span>{sizeSqm} m²</span>}
                  {property.rooms && <span>{String(property.rooms)} Zimmer</span>}
                  {property.location && <span>{property.location}</span>}
                  {property.zipCode && <span>{property.zipCode}</span>}
                </div>
              </div>
              <a
                href={property.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#F5A623] hover:underline flex-shrink-0 font-medium"
              >
                Öffnen ↗
              </a>
            </div>

            {/* ── Section 1: Nutzung ── */}
            <div>
              <SectionTitle>Nutzung</SectionTitle>
              <div className="flex gap-3">
                {(['rental', 'owner', 'flip'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => set('usageType', type)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all ${
                      draft.usageType === type
                        ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]'
                        : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'
                    }`}
                  >
                    {type === 'rental' ? 'Vermietung' : type === 'owner' ? 'Eigennutzung' : 'Flip'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Section 2: Kaufdetails ── */}
            <div>
              <SectionTitle>Kaufdetails</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <NumInput label="Listpreis" value={draft.listPrice} prefix="€" readOnly />
                <NumInput label="Kaufpreis" value={draft.desiredPrice} onChange={v => set('desiredPrice', v)} prefix="€" />
                <NumInput
                  label="Preis/m²"
                  value={pricePerSqm ? Math.round(pricePerSqm) : null}
                  prefix="€"
                  readOnly
                />
                <NumInput label="Größe" value={sizeSqm} prefix="m²" readOnly />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <NumInput label="Makler" value={parseFloat((draft.maklerPct * 100).toFixed(1))} onChange={v => set('maklerPct', (v ?? 0) / 100)} suffix="%" />
                <NumInput label="Notar" value={parseFloat((draft.notarPct * 100).toFixed(1))} onChange={v => set('notarPct', (v ?? 0) / 100)} suffix="%" />
                <NumInput label="Grundbuch" value={parseFloat((draft.grundbuchPct * 100).toFixed(1))} onChange={v => set('grundbuchPct', (v ?? 0) / 100)} suffix="%" />
                <NumInput label="GrESt" value={parseFloat((draft.grunderwerbsteuerPct * 100).toFixed(1))} onChange={v => set('grunderwerbsteuerPct', (v ?? 0) / 100)} suffix="%" />
              </div>

              <div className="mb-4">
                <NumInput label="Sonstige Nebenkosten" value={draft.otherPurchaseCosts} onChange={v => set('otherPurchaseCosts', v ?? 0)} prefix="€" />
              </div>

              {/* Renovierungskosten */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide">Renovierungskosten</span>
                  <button onClick={addRehab} className="text-xs text-[#F5A623] hover:underline font-medium">+ Posten hinzufügen</button>
                </div>
                {draft.rehabCosts.length > 0 && (
                  <div className="space-y-2">
                    <div className={`grid gap-2 text-xs text-[#6b7a99] uppercase tracking-wide px-1 ${draft.usageType === 'flip' ? 'grid-cols-[1fr_120px_120px_24px]' : 'grid-cols-[1fr_120px_24px]'}`}>
                      <span>Bezeichnung</span>
                      <span>Gesamt €</span>
                      {draft.usageType === 'flip' && <span>Abzugsfähig €</span>}
                      <span />
                    </div>
                    {draft.rehabCosts.map((item, i) => (
                      <div key={i} className={`grid gap-2 items-center ${draft.usageType === 'flip' ? 'grid-cols-[1fr_120px_120px_24px]' : 'grid-cols-[1fr_120px_24px]'}`}>
                        <input
                          type="text"
                          value={item.label}
                          onChange={e => updateRehab(i, { label: e.target.value })}
                          placeholder="z.B. Küche"
                          className="border border-[#e2e6ed] rounded-lg px-3 py-2 text-sm text-[#0F1F3D] outline-none focus:ring-2 focus:ring-[#F5A623]"
                        />
                        <input
                          type="number"
                          value={item.amount || ''}
                          onChange={e => updateRehab(i, { amount: parseFloat(e.target.value) || 0 })}
                          className="border border-[#e2e6ed] rounded-lg px-3 py-2 text-sm text-[#0F1F3D] outline-none focus:ring-2 focus:ring-[#F5A623]"
                        />
                        {draft.usageType === 'flip' && (
                          <input
                            type="number"
                            value={item.abzugsfaehig || ''}
                            onChange={e => updateRehab(i, { abzugsfaehig: parseFloat(e.target.value) || 0 })}
                            className="border border-[#e2e6ed] rounded-lg px-3 py-2 text-sm text-[#0F1F3D] outline-none focus:ring-2 focus:ring-[#F5A623]"
                          />
                        )}
                        <button onClick={() => removeRehab(i)} className="text-[#6b7a99] hover:text-[#dc2626] text-lg leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Laufende Kosten */}
              <div className="mb-4">
                <span className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide block mb-2">Laufende Kosten (monatlich)</span>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <NumInput label="Betriebskosten" value={draft.ooBetriebskostenMonthly} onChange={v => set('ooBetriebskostenMonthly', v)} prefix="€" hint="Monatlich" />
                  <NumInput label="Reparaturrücklage" value={draft.reparaturruecklageMon} onChange={v => set('reparaturruecklageMon', v)} prefix="€" hint="Monatliche HV-Umlage" />
                </div>
              </div>

              {/* Totals */}
              <div className="flex gap-6 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl px-4 py-3 text-sm">
                <div>
                  <span className="text-[#6b7a99]">Kaufnebenkosten: </span>
                  <span className="font-semibold text-[#0F1F3D]">{formatEuro(kaufnebenkosten)}</span>
                </div>
                <div>
                  <span className="text-[#6b7a99]">Renovierung: </span>
                  <span className="font-semibold text-[#0F1F3D]">{formatEuro(totalRehab)}</span>
                </div>
                <div>
                  <span className="text-[#6b7a99]">Gesamtinvestition: </span>
                  <span className="font-bold text-[#0F1F3D]">{formatEuro(totalInvestment)}</span>
                </div>
              </div>
            </div>



            {/* ── Section 3: Finanzierung ── */}
            <div>
              <SectionTitle>Finanzierung</SectionTitle>

              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => set('financing', false)}
                  className={`py-2 px-4 rounded-xl text-sm font-medium border transition-all ${!draft.financing ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]' : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'}`}
                >
                  Keine Finanzierung
                </button>
                <button
                  onClick={() => set('financing', true)}
                  className={`py-2 px-4 rounded-xl text-sm font-medium border transition-all ${draft.financing ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]' : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'}`}
                >
                  Finanziert
                </button>
              </div>

              {draft.financing && (
                <div className="space-y-4">
                  {/* Loan 1 */}
                  <div>
                    <p className="text-xs font-medium text-[#6b7a99] mb-2">Darlehen 1</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <NumInput
                        label="Betrag"
                        value={draft.loan1Amount ?? Math.round(resolvedL1)}
                        onChange={v => set('loan1Amount', v)}
                        prefix="€"
                        hint={draft.loan1Amount === null ? `${(draft.loan1AmountPct * 100).toFixed(0)}% des Kaufpreises` : 'Manuell'}
                      />
                      <NumInput label="Zinssatz" value={draft.loan1Rate !== null ? (draft.loan1Rate ?? 0) * 100 : null} onChange={v => set('loan1Rate', v !== null ? v / 100 : null)} suffix="%" />
                      <NumInput label="Laufzeit" value={draft.loan1TermYears} onChange={v => set('loan1TermYears', v ? Math.round(v) : null)} suffix="J" />
                      <NumInput label="Rate/Monat" value={Math.round(loan1Monthly)} prefix="€" readOnly />
                    </div>
                  </div>

                  {/* Loan 2 toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.loan2Enabled}
                      onChange={e => set('loan2Enabled', e.target.checked)}
                      className="w-4 h-4 accent-[#F5A623]"
                    />
                    <span className="text-sm text-[#6b7a99]">Zweites Darlehen</span>
                  </label>

                  {draft.loan2Enabled && (
                    <div>
                      <p className="text-xs font-medium text-[#6b7a99] mb-2">Darlehen 2</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <NumInput label="Betrag" value={draft.loan2Amount} onChange={v => set('loan2Amount', v)} prefix="€" />
                        <NumInput label="Zinssatz" value={draft.loan2Rate !== null ? (draft.loan2Rate ?? 0) * 100 : null} onChange={v => set('loan2Rate', v !== null ? v / 100 : null)} suffix="%" />
                        <NumInput label="Laufzeit" value={draft.loan2TermYears} onChange={v => set('loan2TermYears', v ? Math.round(v) : null)} suffix="J" />
                        <NumInput label="Rate/Monat" value={Math.round(loan2Monthly)} prefix="€" readOnly />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-6 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl px-4 py-3 text-sm">
                    <div>
                      <span className="text-[#6b7a99]">Gesamte Rate: </span>
                      <span className="font-bold text-[#0F1F3D]">{formatEuro(totalMonthlyLoan)}/Mo</span>
                    </div>
                    <div>
                      <span className="text-[#6b7a99]">Eigenkapital: </span>
                      <span className="font-bold text-[#0F1F3D]">{formatEuro(eigenkapital)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Section 4: Usage-specific inputs ── */}

            {/* Eigennutzung */}
            {draft.usageType === 'owner' && (
              <div>
                <SectionTitle>Eigennutzung</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <NumInput label="Instandhaltung" value={draft.ooRepairsPct * 100} onChange={v => set('ooRepairsPct', (v ?? 0) / 100)} suffix="% p.a." hint="% des Kaufpreises" />
                  <NumInput label="Wertsteigerung p.a." value={draft.ooAppreciationPct * 100} onChange={v => set('ooAppreciationPct', (v ?? 0) / 100)} suffix="%" />
                </div>
              </div>
            )}

            {/* Vermietung */}
            {draft.usageType === 'rental' && (
              <div>
                <SectionTitle>Vermietung</SectionTitle>
                <div className="space-y-4">
                  {/* Rent type toggle */}
                  <div className="flex items-end gap-4">
                    <div className="flex gap-2">
                      {(['warm', 'kalt'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => set('rentType', t)}
                          className={`py-1.5 px-4 rounded-lg text-sm font-medium border transition-all ${
                            draft.rentType === t
                              ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]'
                              : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'
                          }`}
                        >
                          {t === 'warm' ? 'Warmmiete' : 'Kaltmiete'}
                        </button>
                      ))}
                    </div>
                    <NumInput
                      label={draft.rentType === 'warm' ? 'Warmmiete' : 'Kaltmiete'}
                      value={draft.rentMonthly}
                      onChange={v => set('rentMonthly', v)}
                      prefix="€"
                    />
                    {draft.rentType === 'warm' && (
                      <NumInput
                        label="Kaltmiete (auto)"
                        value={rentalResults ? Math.round(rentalResults.kaltmieteMonthly) : null}
                        prefix="€"
                        readOnly
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <NumInput label="BK umlagefähig (Mieter)" value={draft.bkUmlagefaehig} onChange={v => set('bkUmlagefaehig', v)} prefix="€" />
                    <NumInput label="BK nicht umlagefähig (Eigentümer)" value={draft.bkNichtUmlagefaehig} onChange={v => set('bkNichtUmlagefaehig', v)} prefix="€" />
                    <NumInput label="Leerstand" value={draft.vacancyPct * 100} onChange={v => set('vacancyPct', (v ?? 0) / 100)} suffix="%" />
                    <NumInput label="Reparaturreserve" value={draft.repairsPct * 100} onChange={v => set('repairsPct', (v ?? 0) / 100)} suffix="% p.a." hint="Persönliche Reserve (% des Kaufpreises)" />
                    <NumInput label="Mietsteigerung p.a." value={draft.rentGrowthPct * 100} onChange={v => set('rentGrowthPct', (v ?? 0) / 100)} suffix="%" />
                    <NumInput label="Wertsteigerung p.a." value={draft.valueGrowthPct * 100} onChange={v => set('valueGrowthPct', (v ?? 0) / 100)} suffix="%" />
                  </div>
                </div>
              </div>
            )}

            {/* Flip */}
            {draft.usageType === 'flip' && (
              <div>
                <SectionTitle>Flip</SectionTitle>
                <div className="grid grid-cols-2 gap-4">
                  <NumInput label="Flip-Dauer" value={draft.flipDurationMonths} onChange={v => set('flipDurationMonths', v ? Math.round(v) : null)} suffix="Monate" />
                  <NumInput label="Erwarteter Verkaufspreis" value={draft.flipResalePrice} onChange={v => set('flipResalePrice', v)} prefix="€" />
                </div>
              </div>
            )}

            {/* ── Section 5: Results ── */}

            {/* Owner results */}
            {draft.usageType === 'owner' && ownerResults && (
              <div>
                <SectionTitle>Ergebnisse — Eigennutzung</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <MetricCard label="Monatliche Ausgaben" value={formatEuro(ownerResults.monthlyOutgoings)} />
                  <MetricCard label="davon Kredit" value={formatEuro(ownerResults.monthlyLoan)} />
                  <MetricCard label="davon Betriebskosten" value={formatEuro(ownerResults.monthlyBetriebskosten)} />
                  <MetricCard label="davon Reparaturen" value={formatEuro(ownerResults.monthlyRepairs)} />
                </div>
                {ownerResults.yearlyData.length > 0 && (
                  <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide mb-3">Vermögensentwicklung</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ownerResults.yearlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={v => `J${v}`} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v) => formatEuro(Number(v ?? 0))} labelFormatter={l => `Jahr ${l}`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="equity" name="Eigenkapital" stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="loanRemaining" name="Restschuld" stackId="a" fill="#e2e6ed" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Rental results */}
            {draft.usageType === 'rental' && rentalResults && (
              <div>
                <SectionTitle>Ergebnisse — Vermietung</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MetricCard label="Kaltmiete/Monat" value={formatEuro(rentalResults.kaltmieteMonthly)} />
                  <MetricCard label="Kaltmiete/Jahr" value={formatEuro(rentalResults.kaltmieteYearly)} />
                  <MetricCard label="Cashflow/Monat" value={formatEuro(rentalResults.cashflowMonthly)} sub={rentalResults.cashflowMonthly >= 0 ? 'positiv' : 'negativ'} />
                  <MetricCard label="Faktor" value={formatFaktor(rentalResults.faktor)} sub="Kaufpreisfaktor" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <MetricCard label="Bruttomietrendite" value={formatPct(rentalResults.bruttomietrendite)} />
                  <MetricCard label="Nettomietrendite" value={formatPct(rentalResults.nettomietrendite)} />
                  <MetricCard label="Cashflow-Rendite EK" value={formatPct(rentalResults.eigenkapitalrendite_cashflow)} sub="Cash-on-cash" />
                  <MetricCard label="Gesamtrendite EK" value={formatPct(rentalResults.eigenkapitalrendite_total)} sub="inkl. Tilgung + Wertsteigerung" />
                </div>
                {rentalResults.yearlyData.length > 0 && (
                  <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide mb-3">Projektion über {rentalResults.yearlyData.length} Jahre</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={rentalResults.yearlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={v => `J${v}`} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v) => formatEuro(Number(v ?? 0))} labelFormatter={l => `Jahr ${l}`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line dataKey="propertyValue" name="Immobilienwert" stroke="#0F1F3D" strokeWidth={2} dot={false} />
                        <Line dataKey="loanRemaining" name="Restschuld" stroke="#6b7a99" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        <Line dataKey="yearlyRentIncome" name="Mieteinnahmen/J" stroke="#16a34a" strokeWidth={2} dot={false} />
                        <Line dataKey="yearlyOutgoings" name="Ausgaben/J" stroke="#dc2626" strokeWidth={2} dot={false} />
                        <Line dataKey="cashflow" name="Cashflow/J" stroke="#F5A623" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Flip results */}
            {draft.usageType === 'flip' && flipResults && (
              <div>
                <SectionTitle>Ergebnisse — Flip</SectionTitle>
                <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl divide-y divide-[#e2e6ed] px-4">
                  <ResultRow label="Kaufpreis" value={formatEuro(draft.desiredPrice ?? 0)} />
                  <ResultRow label="+ Kaufnebenkosten" value={formatEuro(flipResults.kaufnebenkosten)} indent />
                  <ResultRow label="+ Sanierungskosten" value={formatEuro(flipResults.totalRehab)} indent />
                  <ResultRow label="+ Haltekosten" value={formatEuro(flipResults.holdingCosts)} indent />
                  <ResultRow label="= Gesamtkosten" value={formatEuro(flipResults.totalCost)} highlight />
                  <ResultRow label="Verkaufspreis" value={formatEuro(draft.flipResalePrice ?? 0)} />
                  <ResultRow label="- Gesamtkosten" value={formatEuro(flipResults.totalCost)} indent />
                  <ResultRow label="= Bruttogewinn" value={formatEuro(flipResults.grossProfit)} highlight />
                  <ResultRow label="- Abzugsfähige Kosten" value={formatEuro(flipResults.totalAbzugsfaehig)} indent />
                  <ResultRow label="= Zu versteuernder Gewinn" value={formatEuro(flipResults.taxableProfit)} />
                  <ResultRow label="- Steuer (30%)" value={formatEuro(flipResults.tax)} indent />
                  <ResultRow label="= Nettogewinn" value={formatEuro(flipResults.netProfit)} highlight />
                </div>
                <p className="text-xs text-[#6b7a99] mt-3 flex items-center gap-1">
                  <span>⚠</span>
                  <span>Diese Berechnung ist eine Schätzung und kein Steuerberatung.</span>
                </p>
              </div>
            )}

            {/* ── Documents ── */}
            <div className="pt-6 border-t border-[#e2e6ed]">
              <h3 className="text-sm font-semibold text-[#0F1F3D] uppercase tracking-wide mb-3">Dokumente</h3>

              {/* Upload row */}
              <div className="flex flex-wrap gap-2 items-end mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-[#6b7a99] font-medium">Typ</label>
                  <select
                    value={docLabel}
                    onChange={e => setDocLabel(e.target.value)}
                    className="border border-[#e2e6ed] rounded-lg px-3 py-2 text-sm text-[#0F1F3D] bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                  >
                    {['Exposé', 'Energieausweis', 'Grundriss', 'Provisionsvereinbarung', 'Widerrufsformular', 'Protokoll', 'Kaufanbot', 'Kaufvertrag', 'Gutachten', 'Sonstiges'].map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                <label className={`px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                  uploading || documents.length >= 10
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-[#F5A623] text-white hover:bg-[#d4891a]'
                }`}>
                  {uploading ? 'Hochladen...' : '+ PDF hochladen'}
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleDocUpload}
                    disabled={uploading || documents.length >= 10}
                    className="hidden"
                  />
                </label>
                {documents.length >= 10 && (
                  <span className="text-xs text-[#6b7a99]">Max. 10 Dokumente erreicht</span>
                )}
              </div>

              {docError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-3">{docError}</div>
              )}

              {/* Document list */}
              {documents.length > 0 ? (
                <div className="space-y-1.5">
                  {documents.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between bg-[#f8f9fb] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-[#F5A623] bg-[#FEF3E2] px-2 py-0.5 rounded flex-shrink-0">{doc.label}</span>
                        <button
                          onClick={() => handleDocDownload(doc)}
                          className="text-sm text-[#0F1F3D] hover:text-[#F5A623] truncate transition-colors"
                          title={doc.fileName}
                        >
                          {doc.fileName}
                        </button>
                        <span className="text-xs text-[#6b7a99] flex-shrink-0">{formatFileSize(doc.fileSize)}</span>
                      </div>
                      <button
                        onClick={() => handleDocDelete(doc)}
                        className="text-[#6b7a99] hover:text-red-500 text-xs ml-2 flex-shrink-0"
                        title="Löschen"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#6b7a99]">Noch keine Dokumente. Lade PDFs hoch (Exposé, Energieausweis, etc.).</p>
              )}
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            {/* ── Footer ── */}
            <div className="flex justify-between items-center pt-4 border-t border-[#e2e6ed]">
              <button
                onClick={onClose}
                className="py-2.5 px-6 rounded-xl text-sm font-medium text-[#6b7a99] hover:text-[#0F1F3D] transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="py-2.5 px-8 rounded-xl text-sm font-semibold bg-[#F5A623] text-white hover:bg-[#d4891a] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
