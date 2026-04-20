'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import {
  Property,
  PropertyAnalysis,
  PropertyDocument,
  PropertyDetailsApplyableField,
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
  getPropertyDetails,
} from '@/lib/api';
import DossierTab from '@/components/property/DossierTab';
import MrgWarningBanner from '@/components/property/MrgWarningBanner';
import { useProperties } from '@/hooks/useProperties';
import { FUNNEL_STAGES_DISPLAY } from '@/lib/constants';
import {
  calcOwnerResults,
  calcRentalResults,
  calcFlipResults,
  calcFlipPrivate,
  calcFlipGmbH,
  calcRentalTaxPrivate,
  calcRentalTaxGmbH,
  calcAfA,
  calcLiebhabereiWarning,
  calcYearlyRentalProjection,
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
  /** Initial viewMode — defaults to 'analyses'. ADR-010 I6: the
   *  unified Add Property modal opens new properties in 'dossier' mode
   *  so the user immediately sees the data they just provided. */
  initialViewMode?: 'analyses' | 'dossier';
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
  // Round display value to avoid floating point artifacts (e.g. 4.499999 → 4.5).
  // Guard against Prisma Decimal strings sneaking in at runtime.
  const numValue = value != null ? (typeof value === 'number' ? value : parseFloat(String(value))) : null;
  const displayValue = numValue != null && !isNaN(numValue) ? parseFloat(numValue.toFixed(4)) : '';
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide">{label}</label>
      <div className="flex items-center border border-[#e2e6ed] rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[#F5A623] focus-within:border-transparent transition-all">
        {prefix && <span className="px-3 py-2 bg-[#f8f9fb] text-[#6b7a99] text-sm border-r border-[#e2e6ed]">{prefix}</span>}
        <input
          type="number"
          step="any"
          readOnly={readOnly}
          value={displayValue}
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
    legalStructure: 'private',
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
    purchaseDate: null,
    gebaeudeAnteilPct: 0.60,
    grenzsteuersatzPct: null,
    gmbhAccountingCostsAnnual: null,
    distributeProfit: false,
    flipDurationMonths: null,
    flipResalePrice: null,
  };
}

// ─── Convert backend analysis to draft format ───────────────────────────────

type Draft = Omit<PropertyAnalysis, 'id' | 'propertyId' | 'dealId' | 'createdAt' | 'updatedAt'>;

function analysisToDraft(a: PropertyAnalysis): Draft {
  return {
    name: a.name,
    usageType: a.usageType as 'owner' | 'rental' | 'flip',
    legalStructure: (a.legalStructure as 'private' | 'gmbh') ?? 'private',
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
    purchaseDate: a.purchaseDate ?? null,
    gebaeudeAnteilPct: a.gebaeudeAnteilPct ? parseFloat(String(a.gebaeudeAnteilPct)) : 0.60,
    grenzsteuersatzPct: a.grenzsteuersatzPct ? parseFloat(String(a.grenzsteuersatzPct)) : null,
    gmbhAccountingCostsAnnual: a.gmbhAccountingCostsAnnual ? parseFloat(String(a.gmbhAccountingCostsAnnual)) : null,
    distributeProfit: a.distributeProfit ?? false,
    flipDurationMonths: a.flipDurationMonths,
    flipResalePrice: a.flipResalePrice ? parseFloat(String(a.flipResalePrice)) : null,
  };
}

// ─── Tab state ───────────────────────────────────────────────────────────────

interface Tab {
  id: string | null;    // null = unsaved new analysis
  dealId: string | null;
  draft: Draft;
  dirty: boolean;       // has unsaved changes
}

function tabLabel(tab: Tab): string {
  if (tab.draft.name) return tab.draft.name;
  const type = tab.draft.usageType;
  return type === 'rental' ? 'Vermietung' : type === 'owner' ? 'Eigennutzung' : 'Flip';
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

const STAGE_I18N_KEY: Record<string, string> = {
  new: 'new', investigating: 'investigating', interested: 'interested',
  due_diligence: 'dueDiligence', offer_made: 'offerMade',
  parked: 'parked', won: 'won',
};

export default function PropertyAnalysisModal({ property, onClose, initialViewMode = 'analyses' }: Props) {
  const t = useTranslations('analysis');
  const tStages = useTranslations('funnel.stages');
  const { update: updateProperty } = useProperties();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [currentStage, setCurrentStage] = useState(property.status);
  // ADR-009 DO4: top-level toggle between the analyses workspace and the
  // Property Dossier (documents + AI extraction + structured property data).
  const [viewMode, setViewMode] = useState<'analyses' | 'dossier'>(initialViewMode);

  // ADR-009 DO6: MRG risk flag, fetched once when the modal opens. Used
  // to render the MrgWarningBanner above the rental analysis section.
  // Stale-after-extract is acceptable in this slice — the user can close
  // and reopen the modal to see the updated state.
  const [mrgRisk, setMrgRisk] = useState<boolean | null>(null);

  // Documents
  const [documents, setDocuments] = useState<PropertyDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docLabel, setDocLabel] = useState(t('documents.types.0'));
  const [docError, setDocError] = useState<string | null>(null);

  const sizeSqm = property.sizeSqm != null ? parseFloat(String(property.sizeSqm)) : null;

  // Active tab's draft
  const draft = tabs[activeTab]?.draft ?? blankAnalysis(property);

  // ── Load all analyses on mount ────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const analyses = await getAnalyses(property.id);
        if (analyses.length > 0) {
          setTabs(analyses.map(a => ({
            id: a.id,
            dealId: a.dealId,
            draft: analysisToDraft(a),
            dirty: false,
          })));
        } else {
          // No analyses yet — start with a blank tab
          setTabs([{ id: null, dealId: null, draft: blankAnalysis(property), dirty: false }]);
        }
        const docs = await getDocuments(property.id);
        setDocuments(docs);
      } catch {
        setError(t('errorLoading'));
        setTabs([{ id: null, dealId: null, draft: blankAnalysis(property), dirty: false }]);
      } finally {
        setLoading(false);
      }
    }
    load();
    // ADR-009 DO6: fetch the Dossier mrgRisk flag in parallel — independent
    // of the main load so a 4xx (no Dossier yet) doesn't block the analyses.
    getPropertyDetails(property.id)
      .then(resp => setMrgRisk(resp.details?.mrgRisk ?? null))
      .catch(() => setMrgRisk(null));
  }, [property.id, t, property]);

  // ── Sync + auto-save open analysis drafts when → Apply is clicked ──────
  // Analyses keep per-row copies of price / BK / purchaseDate that don't
  // otherwise refresh until the modal is reloaded. We:
  //   1. Patch every open tab's draft with the new value
  //   2. For tabs that already exist on the backend (id != null),
  //      auto-save in the background — the user shouldn't have to click
  //      Save just to confirm a one-click Dossier apply.
  //   3. For unsaved new tabs (id == null), mark dirty so the user can
  //      decide whether to commit. Auto-creating from a Dossier apply
  //      would be too aggressive.
  //   4. If a background save fails, mark that tab dirty + surface error.
  const handleDossierApplied = useCallback(
    (field: PropertyDetailsApplyableField, value: unknown) => {
      const draftField: keyof Draft | null =
        field === 'exposePrice' ? 'listPrice' :
        field === 'purchaseDate' ? 'purchaseDate' :
        field === 'bkUmlagefaehig' ? 'bkUmlagefaehig' :
        field === 'bkNichtUmlagefaehig' ? 'bkNichtUmlagefaehig' :
        null;
      if (!draftField) return; // sizeSqmVerified / roomsVerified are read from property prop

      const patched = tabs.map(tab => ({
        ...tab,
        draft: { ...tab.draft, [draftField]: value as never },
        // Saved tabs are auto-saved below — show as clean. Unsaved
        // tabs stay dirty so the user knows there's pending state.
        dirty: tab.id === null,
      }));
      setTabs(patched);

      // Fire background saves for every tab that already exists.
      patched.forEach((tab, i) => {
        if (!tab.id) return;
        const draftToSave = { ...tab.draft };
        if (!draftToSave.name) draftToSave.name = autoName(draftToSave, patched, i);
        const dto: UpdateAnalysisDto = { ...draftToSave };
        updateAnalysis(property.id, tab.id, dto).catch((e) => {
          console.error('Auto-save failed for tab', tab.id, e);
          setTabs(p => p.map(t => t.id === tab.id ? { ...t, dirty: true } : t));
          setError(t('errorSaving'));
        });
      });
    },
    [tabs, property.id, t],
  );

  // ── Field updater (updates active tab's draft) ────────────────────────────
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setTabs(prev => prev.map((tab, i) =>
      i === activeTab ? { ...tab, draft: { ...tab.draft, [key]: value }, dirty: true } : tab
    ));
  }

  // ── Tab management ────────────────────────────────────────────────────────
  function addTab() {
    const newTab: Tab = { id: null, dealId: null, draft: blankAnalysis(property), dirty: false };
    setTabs(prev => [...prev, newTab]);
    setActiveTab(tabs.length);
  }

  async function deleteTab(index: number) {
    const tab = tabs[index];
    if (tab.id) {
      try {
        await deleteAnalysis(property.id, tab.id);
      } catch { /* ignore */ }
    }
    setTabs(prev => prev.filter((_, i) => i !== index));
    if (activeTab >= index && activeTab > 0) setActiveTab(activeTab - 1);
    setDeleteConfirm(null);
    // If no tabs left, add a blank one
    if (tabs.length <= 1) {
      setTabs([{ id: null, dealId: null, draft: blankAnalysis(property), dirty: false }]);
      setActiveTab(0);
    }
  }

  // ── Auto-name on save ─────────────────────────────────────────────────────
  function autoName(d: Draft, allTabs: Tab[], currentIndex: number): string {
    const typeLabel = d.usageType === 'rental' ? 'Rental' : d.usageType === 'owner' ? 'Eigennutzung' : 'Flip';
    const sameTypeCount = allTabs.filter((t, i) => i !== currentIndex && t.draft.usageType === d.usageType).length;
    return `${typeLabel} ${sameTypeCount + 1}`;
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

  // ── Save active tab ──────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const tab = tabs[activeTab];
      const draftToSave = { ...tab.draft };
      // Auto-name if no name set
      if (!draftToSave.name) {
        draftToSave.name = autoName(draftToSave, tabs, activeTab);
      }

      const dto: UpdateAnalysisDto = { ...draftToSave };

      if (tab.id) {
        // Update existing
        await updateAnalysis(property.id, tab.id, dto);
        setTabs(prev => prev.map((t, i) =>
          i === activeTab ? { ...t, draft: draftToSave, dirty: false } : t
        ));
      } else {
        // Create new
        const created = await createAnalysis(property.id, {
          usageType: draftToSave.usageType,
          legalStructure: draftToSave.legalStructure,
          name: draftToSave.name ?? undefined,
        });
        await updateAnalysis(property.id, created.id, dto);
        setTabs(prev => prev.map((t, i) =>
          i === activeTab ? { ...t, id: created.id, dealId: created.dealId, draft: draftToSave, dirty: false } : t
        ));
      }
    } catch {
      setError(t('errorSaving'));
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
      setDocError(err instanceof Error ? err.message : t('documents.errorUpload'));
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
      setDocError(t('documents.errorDownload'));
    }
  }

  async function handleDocDelete(doc: PropertyDocument) {
    try {
      await deleteDocument(property.id, doc.id);
      setDocuments(prev => prev.filter(d => d.id !== doc.id));
    } catch {
      setDocError(t('documents.errorDelete'));
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ── Build a full PropertyAnalysis shape for calculators ───────────────────
  const currentTab = tabs[activeTab];
  const calc: PropertyAnalysis = {
    id: currentTab?.id ?? '',
    propertyId: property.id,
    dealId: currentTab?.dealId ?? '',
    createdAt: '',
    updatedAt: '',
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
  const flipResults = draft.usageType === 'flip'
    ? (draft.legalStructure === 'gmbh' ? null : calcFlipPrivate(calc))
    : null;
  const flipGmbHResults = draft.usageType === 'flip' && draft.legalStructure === 'gmbh'
    ? calcFlipGmbH(calc) : null;

  // Tax results
  const rentalTaxPrivate = rentalResults && draft.legalStructure === 'private'
    ? calcRentalTaxPrivate(calc, rentalResults) : null;
  const rentalTaxGmbH = rentalResults && draft.legalStructure === 'gmbh'
    ? calcRentalTaxGmbH(calc, rentalResults) : null;
  const liebhabereiWarning = rentalResults ? calcLiebhabereiWarning(rentalResults.yearlyData) : false;
  const yearlyTaxProjection = rentalResults
    ? calcYearlyRentalProjection(calc, rentalResults) : null;

  // Document type options from translations
  const docTypes = Array.from({ length: 10 }, (_, i) => t(`documents.types.${i}`));

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4 px-2">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl my-auto">

        {/* ── Header ── */}
        <div className="flex items-start justify-between p-6 pb-3 border-b border-[#e2e6ed]">
          <div>
            <p className="text-xs text-[#6b7a99] uppercase tracking-widest mb-1">{t('header')}</p>
            <h2 className="text-lg font-semibold text-[#0F1F3D] leading-tight">{property.title ?? t('defaultPropertyTitle')}</h2>
            {currentTab?.dealId && (
              <span className="inline-block mt-1 text-xs font-mono bg-[#f8f9fb] border border-[#e2e6ed] px-2 py-0.5 rounded text-[#6b7a99]">
                {currentTab.dealId}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[#6b7a99] hover:text-[#0F1F3D] transition-colors text-2xl leading-none">✕</button>
        </div>

        {/* ── Mode toggle: Analyses ↔ Dossier (ADR-009 DO4) ── */}
        <div className="px-6 pt-3 flex items-center gap-1.5">
          <button
            onClick={() => setViewMode('analyses')}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              viewMode === 'analyses'
                ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]'
                : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:bg-[#f8f9fb]'
            }`}
          >
            {t('viewMode.analyses')}
          </button>
          <button
            onClick={() => setViewMode('dossier')}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 ${
              viewMode === 'dossier'
                ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]'
                : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:bg-[#f8f9fb]'
            }`}
          >
            <span>📎</span>
            <span>{t('viewMode.dossier')}</span>
          </button>
        </div>

        {/* ── Tab Bar (analyses only) ── */}
        {viewMode === 'analyses' && !loading && tabs.length > 0 && (
          <div className="flex items-center gap-1 px-6 pt-3 pb-0 overflow-x-auto border-b border-[#e2e6ed]">
            {tabs.map((tab, i) => (
              <div
                key={tab.id ?? `new-${i}`}
                className={`group flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg cursor-pointer transition-colors ${
                  i === activeTab
                    ? 'bg-white border border-[#e2e6ed] border-b-white -mb-px text-[#0F1F3D]'
                    : 'text-[#6b7a99] hover:text-[#0F1F3D] hover:bg-[#f8f9fb]'
                }`}
                onClick={() => setActiveTab(i)}
              >
                <span className="truncate max-w-[120px]">
                  {tabLabel(tab)}
                  {tab.dirty && <span className="text-amber-500 ml-0.5">*</span>}
                </span>
                {tabs.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm(i); }}
                    className="opacity-0 group-hover:opacity-100 text-[#6b7a99] hover:text-rose-500 text-xs transition-opacity"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTab}
              className="px-2.5 py-2 text-[#6b7a99] hover:text-[#0F1F3D] hover:bg-[#f8f9fb] rounded-t-lg text-sm font-bold transition-colors"
              title={t('tabs.addNew')}
            >
              +
            </button>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteConfirm !== null && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-6 max-w-sm w-full mx-4">
              <p className="text-sm text-gray-900 mb-4">{t('tabs.deleteConfirm')}</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">{t('tabs.cancel')}</button>
                <button onClick={() => deleteTab(deleteConfirm)} className="px-4 py-2 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">{t('tabs.delete')}</button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-[#6b7a99]">{t('loading')}</div>
        ) : viewMode === 'dossier' ? (
          <div className="p-6">
            <DossierTab property={property} onPropertyApplied={handleDossierApplied} />
          </div>
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
                      {'\u20AC'} {Math.round(parseFloat(String(property.price))).toLocaleString('de-AT')}
                    </span>
                  )}
                  {sizeSqm && <span>{sizeSqm} m²</span>}
                  {property.rooms && <span>{String(property.rooms)} {t('rooms')}</span>}
                  {property.location && <span>{property.location}</span>}
                  {property.zipCode && <span>{property.zipCode}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <select
                  value={currentStage}
                  onChange={(e) => {
                    const newStage = e.target.value;
                    setCurrentStage(newStage);
                    updateProperty(property.id, {
                      status: newStage,
                      movedToStageAt: new Date().toISOString(),
                    });
                  }}
                  className="text-xs border border-[#e2e6ed] rounded-lg px-2 py-1.5 bg-white text-[#0F1F3D] focus:outline-none focus:ring-1 focus:ring-[#F5A623]"
                >
                  {FUNNEL_STAGES_DISPLAY.map(s => (
                    <option key={s.key} value={s.key}>
                      {tStages(STAGE_I18N_KEY[s.key] ?? s.key)}
                    </option>
                  ))}
                </select>
                <a
                  href={property.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#F5A623] hover:underline font-medium"
                >
                  {t('openListing')}
                </a>
              </div>
            </div>

            {/* ── Section 1: Nutzung ── */}
            <div>
              <SectionTitle>{t('usage.title')}</SectionTitle>
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
                    {type === 'rental' ? t('usage.rental') : type === 'owner' ? t('usage.owner') : t('usage.flip')}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Section 2: Kaufdetails ── */}
            <div>
              <SectionTitle>{t('purchase.title')}</SectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <NumInput label={t('purchase.listPrice')} value={draft.listPrice} prefix={'\u20AC'} readOnly />
                <NumInput label={t('purchase.desiredPrice')} value={draft.desiredPrice} onChange={v => set('desiredPrice', v)} prefix={'\u20AC'} />
                <NumInput
                  label={t('purchase.pricePerSqm')}
                  value={pricePerSqm ? Math.round(pricePerSqm) : null}
                  prefix={'\u20AC'}
                  readOnly
                />
                <NumInput label={t('purchase.size')} value={sizeSqm} prefix="m²" readOnly />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <NumInput label={t('purchase.makler')} value={parseFloat((draft.maklerPct * 100).toFixed(1))} onChange={v => set('maklerPct', (v ?? 0) / 100)} suffix="%" />
                <NumInput label={t('purchase.notar')} value={parseFloat((draft.notarPct * 100).toFixed(1))} onChange={v => set('notarPct', (v ?? 0) / 100)} suffix="%" />
                <NumInput label={t('purchase.grundbuch')} value={parseFloat((draft.grundbuchPct * 100).toFixed(1))} onChange={v => set('grundbuchPct', (v ?? 0) / 100)} suffix="%" />
                <NumInput label={t('purchase.grest')} value={parseFloat((draft.grunderwerbsteuerPct * 100).toFixed(1))} onChange={v => set('grunderwerbsteuerPct', (v ?? 0) / 100)} suffix="%" />
              </div>

              <div className="mb-4">
                <NumInput label={t('purchase.otherCosts')} value={draft.otherPurchaseCosts} onChange={v => set('otherPurchaseCosts', v ?? 0)} prefix={'\u20AC'} />
              </div>

              {/* Renovierungskosten */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide">{t('purchase.rehabCosts')}</span>
                  <button onClick={addRehab} className="text-xs text-[#F5A623] hover:underline font-medium">{t('purchase.addItem')}</button>
                </div>
                {draft.rehabCosts.length > 0 && (
                  <div className="space-y-2">
                    <div className={`grid gap-2 text-xs text-[#6b7a99] uppercase tracking-wide px-1 ${draft.usageType === 'flip' ? 'grid-cols-[1fr_120px_120px_24px]' : 'grid-cols-[1fr_120px_24px]'}`}>
                      <span>{t('purchase.itemLabel')}</span>
                      <span>{t('purchase.itemTotal')}</span>
                      {draft.usageType === 'flip' && <span>{t('purchase.itemDeductible')}</span>}
                      <span />
                    </div>
                    {draft.rehabCosts.map((item, i) => (
                      <div key={i} className={`grid gap-2 items-center ${draft.usageType === 'flip' ? 'grid-cols-[1fr_120px_120px_24px]' : 'grid-cols-[1fr_120px_24px]'}`}>
                        <input
                          type="text"
                          value={item.label}
                          onChange={e => updateRehab(i, { label: e.target.value })}
                          placeholder={t('purchase.itemPlaceholder')}
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

              {/* Totals */}
              <div className="flex gap-6 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl px-4 py-3 text-sm">
                <div>
                  <span className="text-[#6b7a99]">{t('purchase.summaryKaufnebenkosten')}: </span>
                  <span className="font-semibold text-[#0F1F3D]">{formatEuro(kaufnebenkosten)}</span>
                </div>
                <div>
                  <span className="text-[#6b7a99]">{t('purchase.summaryRenovierung')}: </span>
                  <span className="font-semibold text-[#0F1F3D]">{formatEuro(totalRehab)}</span>
                </div>
                <div>
                  <span className="text-[#6b7a99]">{t('purchase.summaryGesamtinvestition')}: </span>
                  <span className="font-bold text-[#0F1F3D]">{formatEuro(totalInvestment)}</span>
                </div>
              </div>
            </div>



            {/* ── Section 3: Finanzierung ── */}
            <div>
              <SectionTitle>{t('financing.title')}</SectionTitle>

              <div className="flex gap-3 mb-4">
                <button
                  onClick={() => set('financing', false)}
                  className={`py-2 px-4 rounded-xl text-sm font-medium border transition-all ${!draft.financing ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]' : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'}`}
                >
                  {t('financing.noFinancing')}
                </button>
                <button
                  onClick={() => set('financing', true)}
                  className={`py-2 px-4 rounded-xl text-sm font-medium border transition-all ${draft.financing ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]' : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'}`}
                >
                  {t('financing.financed')}
                </button>
              </div>

              {draft.financing && (
                <div className="space-y-4">
                  {/* Loan 1 */}
                  <div>
                    <p className="text-xs font-medium text-[#6b7a99] mb-2">{t('financing.loan1')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <NumInput
                        label={t('financing.amount')}
                        value={draft.loan1Amount ?? Math.round(resolvedL1)}
                        onChange={v => set('loan1Amount', v)}
                        prefix={'\u20AC'}
                        hint={draft.loan1Amount === null ? t('financing.amountHintAuto', { pct: (draft.loan1AmountPct * 100).toFixed(0) }) : t('financing.amountHintManual')}
                      />
                      <NumInput label={t('financing.rate')} value={draft.loan1Rate !== null ? (draft.loan1Rate ?? 0) * 100 : null} onChange={v => set('loan1Rate', v !== null ? v / 100 : null)} suffix="%" />
                      <NumInput label={t('financing.term')} value={draft.loan1TermYears} onChange={v => set('loan1TermYears', v ? Math.round(v) : null)} suffix="J" />
                      <NumInput label={t('financing.monthlyPayment')} value={Math.round(loan1Monthly)} prefix={'\u20AC'} readOnly />
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
                    <span className="text-sm text-[#6b7a99]">{t('financing.enableLoan2')}</span>
                  </label>

                  {draft.loan2Enabled && (
                    <div>
                      <p className="text-xs font-medium text-[#6b7a99] mb-2">{t('financing.loan2')}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <NumInput label={t('financing.amount')} value={draft.loan2Amount} onChange={v => set('loan2Amount', v)} prefix={'\u20AC'} />
                        <NumInput label={t('financing.rate')} value={draft.loan2Rate !== null ? (draft.loan2Rate ?? 0) * 100 : null} onChange={v => set('loan2Rate', v !== null ? v / 100 : null)} suffix="%" />
                        <NumInput label={t('financing.term')} value={draft.loan2TermYears} onChange={v => set('loan2TermYears', v ? Math.round(v) : null)} suffix="J" />
                        <NumInput label={t('financing.monthlyPayment')} value={Math.round(loan2Monthly)} prefix={'\u20AC'} readOnly />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-6 bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl px-4 py-3 text-sm">
                    <div>
                      <span className="text-[#6b7a99]">{t('financing.totalMonthly')}: </span>
                      <span className="font-bold text-[#0F1F3D]">{formatEuro(totalMonthlyLoan)}{t('financing.perMonth')}</span>
                    </div>
                    <div>
                      <span className="text-[#6b7a99]">{t('financing.equity')}: </span>
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
                <SectionTitle>{t('owner.title')}</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <NumInput label={t('owner.betriebskosten')} value={draft.ooBetriebskostenMonthly} onChange={v => set('ooBetriebskostenMonthly', v)} prefix={'\u20AC'} hint={t('owner.betriebskostenHint')} />
                  <NumInput label={t('owner.maintenance')} value={draft.ooRepairsPct * 100} onChange={v => set('ooRepairsPct', (v ?? 0) / 100)} suffix="% p.a." hint={t('owner.maintenanceHint')} />
                  <NumInput label={t('owner.appreciation')} value={draft.ooAppreciationPct * 100} onChange={v => set('ooAppreciationPct', (v ?? 0) / 100)} suffix="%" />
                </div>
              </div>
            )}

            {/* Vermietung */}
            {draft.usageType === 'rental' && (
              <div>
                <SectionTitle>{t('rental.title')}</SectionTitle>
                {/* ADR-009 DO6: MRG risk warning — only on rental analyses */}
                {mrgRisk && (
                  <div className="mb-4">
                    <MrgWarningBanner />
                  </div>
                )}
                <div className="space-y-4">
                  {/* Rent type toggle */}
                  <div className="flex items-end gap-4">
                    <div className="flex gap-2">
                      {(['warm', 'kalt'] as const).map(rentType => (
                        <button
                          key={rentType}
                          onClick={() => set('rentType', rentType)}
                          className={`py-1.5 px-4 rounded-lg text-sm font-medium border transition-all ${
                            draft.rentType === rentType
                              ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]'
                              : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'
                          }`}
                        >
                          {rentType === 'warm' ? t('rental.warmRent') : t('rental.coldRent')}
                        </button>
                      ))}
                    </div>
                    <NumInput
                      label={draft.rentType === 'warm' ? t('rental.warmRent') : t('rental.coldRent')}
                      value={draft.rentMonthly}
                      onChange={v => set('rentMonthly', v)}
                      prefix={'\u20AC'}
                    />
                    {draft.rentType === 'warm' && (
                      <NumInput
                        label={t('rental.coldRentAuto')}
                        value={rentalResults ? Math.round(rentalResults.kaltmieteMonthly) : null}
                        prefix={'\u20AC'}
                        readOnly
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <NumInput label={t('rental.bkUmlagefaehig')} value={draft.bkUmlagefaehig} onChange={v => set('bkUmlagefaehig', v)} prefix={'\u20AC'} hint={t('rental.bkUmlagefaehigHint')} />
                    <NumInput label={t('rental.bkNichtUmlagefaehig')} value={draft.bkNichtUmlagefaehig} onChange={v => set('bkNichtUmlagefaehig', v)} prefix={'\u20AC'} hint={t('rental.bkNichtUmlagefaehigHint')} />
                    <NumInput label={t('rental.vacancy')} value={draft.vacancyPct * 100} onChange={v => set('vacancyPct', (v ?? 0) / 100)} suffix="%" />
                    <NumInput label={t('rental.repairReserve')} value={draft.repairsPct * 100} onChange={v => set('repairsPct', (v ?? 0) / 100)} suffix="% p.a." hint={t('rental.repairReserveHint')} />
                    <NumInput label={t('rental.rentGrowth')} value={draft.rentGrowthPct * 100} onChange={v => set('rentGrowthPct', (v ?? 0) / 100)} suffix="%" />
                    <NumInput label={t('rental.valueGrowth')} value={draft.valueGrowthPct * 100} onChange={v => set('valueGrowthPct', (v ?? 0) / 100)} suffix="%" />
                  </div>
                </div>
              </div>
            )}

            {/* Flip */}
            {draft.usageType === 'flip' && (
              <div>
                <SectionTitle>{t('flip.title')}</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <NumInput label={t('flip.duration')} value={draft.flipDurationMonths} onChange={v => set('flipDurationMonths', v ? Math.round(v) : null)} suffix={t('flip.durationSuffix')} />
                  <NumInput label={t('flip.resalePrice')} value={draft.flipResalePrice} onChange={v => set('flipResalePrice', v)} prefix={'\u20AC'} />
                  <NumInput label={t('flip.bkUmlagefaehig')} value={draft.bkUmlagefaehig} onChange={v => set('bkUmlagefaehig', v)} prefix={'\u20AC'} hint={t('flip.bkHint')} />
                  <NumInput label={t('flip.bkNichtUmlagefaehig')} value={draft.bkNichtUmlagefaehig} onChange={v => set('bkNichtUmlagefaehig', v)} prefix={'\u20AC'} hint={t('flip.bkHint')} />
                </div>
              </div>
            )}

            {/* ── Section 5: Steuer ── */}
            <div>
              <SectionTitle>{t('tax.title')}</SectionTitle>

              {/* Legal structure toggle */}
              <div className="flex gap-3 mb-4">
                {(['private', 'gmbh'] as const).map(ls => (
                  <button
                    key={ls}
                    onClick={() => set('legalStructure', ls)}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all ${
                      draft.legalStructure === ls
                        ? 'bg-[#0F1F3D] text-white border-[#0F1F3D]'
                        : 'bg-white text-[#6b7a99] border-[#e2e6ed] hover:border-[#0F1F3D]'
                    }`}
                  >
                    {ls === 'private' ? t('tax.private') : t('tax.gmbh')}
                  </button>
                ))}
              </div>

              {/* GmbH-specific inputs */}
              {draft.legalStructure === 'gmbh' && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <NumInput
                    label={t('tax.gmbhAccountingCosts')}
                    value={draft.gmbhAccountingCostsAnnual}
                    onChange={v => set('gmbhAccountingCostsAnnual', v)}
                    prefix={'\u20AC'}
                    hint={t('tax.gmbhAccountingHint')}
                  />
                  <div className="flex items-center gap-3 pt-5">
                    <input
                      type="checkbox"
                      checked={draft.distributeProfit}
                      onChange={e => set('distributeProfit', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <label className="text-sm text-[#0F1F3D]">{t('tax.distributeProfit')}</label>
                  </div>
                </div>
              )}

              {/* Rental + Flip tax inputs */}
              {(draft.usageType === 'rental' || draft.usageType === 'flip') && (
                <div className="space-y-4">
                  {/* Purchase date + Gebäudeanteil (rental) */}
                  {draft.usageType === 'rental' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide">{t('tax.purchaseDate')}</label>
                        <input
                          type="date"
                          value={draft.purchaseDate ?? ''}
                          onChange={e => set('purchaseDate', e.target.value || null)}
                          className="border border-[#e2e6ed] rounded-lg px-3 py-2 text-sm text-[#0F1F3D] bg-white focus:outline-none focus:ring-2 focus:ring-[#F5A623]"
                        />
                      </div>
                      <NumInput
                        label={t('tax.gebaeudeAnteil')}
                        value={draft.gebaeudeAnteilPct * 100}
                        onChange={v => set('gebaeudeAnteilPct', (v ?? 60) / 100)}
                        suffix="%"
                        hint={t('tax.gebaeudeAnteilHint')}
                      />
                      {draft.legalStructure === 'private' && (
                        <NumInput
                          label={t('tax.grenzsteuersatz')}
                          value={draft.grenzsteuersatzPct !== null ? draft.grenzsteuersatzPct * 100 : null}
                          onChange={v => set('grenzsteuersatzPct', v !== null ? v / 100 : null)}
                          suffix="%"
                          hint={t('tax.grenzsteuersatzHint')}
                        />
                      )}
                    </div>
                  )}

                  {/* Flip-specific: Hauptwohnsitz + commercial warning */}
                  {draft.usageType === 'flip' && draft.legalStructure === 'private' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="hauptwohnsitz"
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <label htmlFor="hauptwohnsitz" className="text-sm text-[#0F1F3D]">{t('tax.hauptwohnsitz')}</label>
                      </div>
                      <p className="text-xs text-[#6b7a99] italic">{t('tax.flipCommercialNote')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Owner: simplified note */}
              {draft.usageType === 'owner' && (
                <p className="text-xs text-[#6b7a99] italic flex items-center gap-1">
                  <span>ℹ</span>
                  <span>{t('tax.ownerSimplified')}</span>
                </p>
              )}

              {/* General disclaimer */}
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  ℹ {t('tax.disclaimer')}
                </p>
              </div>
            </div>

            {/* ── Section 6: Results ── */}

            {/* Owner results */}
            {draft.usageType === 'owner' && ownerResults && (
              <div>
                <SectionTitle>{t('owner.resultsTitle')}</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <MetricCard label={t('owner.monthlyOutgoings')} value={formatEuro(ownerResults.monthlyOutgoings)} />
                  <MetricCard label={t('owner.monthlyLoan')} value={formatEuro(ownerResults.monthlyLoan)} />
                  <MetricCard label={t('owner.monthlyBetriebskosten')} value={formatEuro(ownerResults.monthlyBetriebskosten)} />
                  <MetricCard label={t('owner.monthlyRepairs')} value={formatEuro(ownerResults.monthlyRepairs)} />
                </div>
                {ownerResults.yearlyData.length > 0 && (
                  <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide mb-3">{t('owner.wealthChart')}</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={ownerResults.yearlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={v => t('owner.chartYearShort', { year: v })} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v) => formatEuro(Number(v ?? 0))} labelFormatter={l => t('owner.chartYear', { year: l })} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="equity" name={t('owner.chartEquity')} stackId="a" fill="#16a34a" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="loanRemaining" name={t('owner.chartLoanRemaining')} stackId="a" fill="#e2e6ed" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Rental results */}
            {draft.usageType === 'rental' && rentalResults && (
              <div>
                <SectionTitle>{t('rental.resultsTitle')}</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MetricCard label={t('rental.coldRentMonthly')} value={formatEuro(rentalResults.kaltmieteMonthly)} />
                  <MetricCard label={t('rental.coldRentYearly')} value={formatEuro(rentalResults.kaltmieteYearly)} />
                  <MetricCard label={t('rental.cashflowMonthly')} value={formatEuro(rentalResults.cashflowMonthly)} sub={t('rental.preTax')} />
                  <MetricCard label={t('rental.faktor')} value={formatFaktor(rentalResults.faktor)} sub={t('rental.faktorSub')} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MetricCard label={t('rental.bruttomietrendite')} value={formatPct(rentalResults.bruttomietrendite)} />
                  <MetricCard label={t('rental.nettomietrendite')} value={formatPct(rentalResults.nettomietrendite)} />
                  <MetricCard label={t('rental.eigenkapitalrenditeCashflow')} value={formatPct(rentalResults.eigenkapitalrendite_cashflow)} sub={t('rental.cashOnCash')} />
                  <MetricCard label={t('rental.eigenkapitalrenditeTotal')} value={formatPct(rentalResults.eigenkapitalrendite_total)} sub={t('rental.preTax')} />
                </div>

                {/* After-tax results — Private */}
                {rentalTaxPrivate && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-medium text-violet-700 uppercase tracking-wide mb-3">{t('rental.afterTaxTitle')} ({t('tax.private')})</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <MetricCard label={t('rental.cashflowAfterTax')} value={formatEuro(rentalTaxPrivate.cashflowAfterTaxMonthly)} sub={t('rental.perMonth')} />
                      <MetricCard label={t('rental.taxAnnual')} value={formatEuro(rentalTaxPrivate.taxAnnual)} sub={rentalTaxPrivate.taxAnnual < 0 ? t('rental.taxRefund') : ''} />
                      <MetricCard label={t('rental.eigenkapitalrenditeTotal')} value={formatPct(rentalTaxPrivate.eigenkapitalrendite_total_aftertax)} sub={t('rental.afterTax')} />
                    </div>
                    {liebhabereiWarning && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
                        ⚠ {t('rental.liebhabereiWarning')}
                      </p>
                    )}
                  </div>
                )}

                {/* After-tax results — GmbH */}
                {rentalTaxGmbH && (
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-medium text-violet-700 uppercase tracking-wide mb-3">{t('rental.afterTaxTitle')} ({t('tax.gmbh')})</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-semibold text-[#6b7a99] uppercase mb-2">{t('rental.gmbhRetained')}</p>
                        <MetricCard label={t('rental.koest')} value={formatEuro(rentalTaxGmbH.koest)} sub="23%" />
                        <div className="mt-2">
                          <MetricCard label={t('rental.cashflowAfterTax')} value={formatEuro(rentalTaxGmbH.cashflowRetainedMonthly)} sub={t('rental.perMonth')} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-[#6b7a99] uppercase mb-2">{t('rental.gmbhDistributed')}</p>
                        <MetricCard label={t('rental.koest')} value={formatEuro(rentalTaxGmbH.koest)} sub="23%" />
                        <div className="mt-1"><MetricCard label={t('rental.kest')} value={formatEuro(rentalTaxGmbH.kest)} sub="27.5%" /></div>
                        <div className="mt-2">
                          <MetricCard label={t('rental.cashflowAfterTax')} value={formatEuro(rentalTaxGmbH.cashflowDistributedMonthly)} sub={t('rental.perMonth')} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {rentalResults.yearlyData.length > 0 && (
                  <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl p-4">
                    <p className="text-xs font-medium text-[#6b7a99] uppercase tracking-wide mb-3">{t('rental.projectionTitle', { years: rentalResults.yearlyData.length })}</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={rentalResults.yearlyData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="year" tick={{ fontSize: 11 }} tickFormatter={v => t('rental.chartYearShort', { year: v })} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v) => formatEuro(Number(v ?? 0))} labelFormatter={l => t('rental.chartYear', { year: l })} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line dataKey="propertyValue" name={t('rental.chartPropertyValue')} stroke="#0F1F3D" strokeWidth={2} dot={false} />
                        <Line dataKey="loanRemaining" name={t('rental.chartLoanRemaining')} stroke="#6b7a99" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        <Line dataKey="yearlyRentIncome" name={t('rental.chartYearlyRent')} stroke="#16a34a" strokeWidth={2} dot={false} />
                        <Line dataKey="yearlyOutgoings" name={t('rental.chartYearlyOutgoings')} stroke="#dc2626" strokeWidth={2} dot={false} />
                        <Line dataKey="cashflow" name={t('rental.chartCashflow')} stroke="#F5A623" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Flip results — Private */}
            {draft.usageType === 'flip' && flipResults && draft.legalStructure === 'private' && (
              <div>
                <SectionTitle>{t('flip.resultsTitle')} ({t('tax.private')})</SectionTitle>
                <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl divide-y divide-[#e2e6ed] px-4">
                  <ResultRow label={t('flip.purchasePrice')} value={formatEuro(draft.desiredPrice ?? 0)} />
                  <ResultRow label={t('flip.purchaseCosts')} value={formatEuro(flipResults.kaufnebenkosten)} indent />
                  <ResultRow label={t('flip.rehabCosts')} value={formatEuro(flipResults.totalRehab)} indent />
                  <ResultRow label={t('flip.holdingCosts')} value={formatEuro(flipResults.holdingCosts)} indent />
                  <ResultRow label={t('flip.totalCost')} value={formatEuro(flipResults.totalCost)} highlight />
                  <ResultRow label={t('flip.resalePriceResult')} value={formatEuro(draft.flipResalePrice ?? 0)} />
                  <ResultRow label={t('flip.grossProfit')} value={formatEuro(flipResults.grossProfit)} highlight />
                  <ResultRow label={t('flip.taxableProfit')} value={formatEuro(flipResults.taxableGain)} />
                  <ResultRow label={t('flip.immoest')} value={formatEuro(flipResults.immoest)} indent />
                  <ResultRow label={t('flip.netProfit')} value={formatEuro(flipResults.netProfit)} highlight />
                </div>
                {flipResults.hauptwohnsitzApplied && (
                  <p className="text-xs text-emerald-700 mt-2">✓ {t('flip.hauptwohnsitzApplied')}</p>
                )}
              </div>
            )}

            {/* Flip results — GmbH */}
            {draft.usageType === 'flip' && flipGmbHResults && draft.legalStructure === 'gmbh' && (
              <div>
                <SectionTitle>{t('flip.resultsTitle')} ({t('tax.gmbh')})</SectionTitle>
                <div className="bg-[#f8f9fb] border border-[#e2e6ed] rounded-xl divide-y divide-[#e2e6ed] px-4">
                  <ResultRow label={t('flip.totalCost')} value={formatEuro(flipGmbHResults.totalCost)} highlight />
                  <ResultRow label={t('flip.grossProfit')} value={formatEuro(flipGmbHResults.grossProfit)} highlight />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <p className="text-[10px] font-semibold text-violet-700 uppercase mb-2">{t('rental.gmbhRetained')}</p>
                    <ResultRow label={t('flip.koest')} value={formatEuro(flipGmbHResults.koest)} />
                    <ResultRow label={t('flip.netProfit')} value={formatEuro(flipGmbHResults.netProfitRetained)} highlight />
                  </div>
                  <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <p className="text-[10px] font-semibold text-violet-700 uppercase mb-2">{t('rental.gmbhDistributed')}</p>
                    <ResultRow label={t('flip.koest')} value={formatEuro(flipGmbHResults.koest)} />
                    <ResultRow label={t('flip.kest')} value={formatEuro(flipGmbHResults.kest)} />
                    <ResultRow label={t('flip.netProfit')} value={formatEuro(flipGmbHResults.netProfitDistributed)} highlight />
                  </div>
                </div>
              </div>
            )}

            {/* Documents moved to the Dossier tab (ADR-009 DO4) */}

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
                {t('footer.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="py-2.5 px-8 rounded-xl text-sm font-semibold bg-[#F5A623] text-white hover:bg-[#d4891a] disabled:opacity-50 transition-colors"
              >
                {saving ? t('footer.saving') : t('footer.save')}
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
