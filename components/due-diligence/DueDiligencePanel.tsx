'use client';

/**
 * DueDiligencePanel — full DD check flow inside the Dossier tab.
 *
 * States: idle → pre-check → running → results.
 * Handles the entry button, document selection, check execution,
 * and results display in one component so the Dossier integration
 * is a single import.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  UserListing,
  PropertyDocument,
  DueDiligenceRun,
  DueDiligenceCheckResult,
  runDueDiligence,
  getDueDiligenceResults,
} from '@/lib/api';
import { useUserListings } from '@/hooks/useUserListings';
import { useAuth } from '@/context/AuthContext';

interface Props {
  property: UserListing;
  documents: PropertyDocument[];
}

const CHECK_ORDER: { field: keyof DueDiligenceRun; label: string }[] = [
  { field: 'mrgStatus', label: 'MRG-Status' },
  { field: 'grundbuchEncumbrances', label: 'Grundbuch Lasten' },
  { field: 'vorkaufsrecht', label: 'Vorkaufsrecht' },
  { field: 'energieausweis', label: 'Energieausweis' },
  { field: 'betriebskosten', label: 'Betriebskosten' },
  { field: 'reparaturruecklage', label: 'Reparaturrücklage' },
];

const RELEVANT_DOCS: Record<string, string[]> = {
  'Grundbuchauszug': ['MRG-Status', 'Grundbuch Lasten', 'Vorkaufsrecht'],
  'Exposé': ['MRG-Status', 'Energieausweis', 'Betriebskosten'],
  'Energieausweis': ['Energieausweis'],
  'WEG-Protokoll': ['Betriebskosten', 'Reparaturrücklage'],
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-green-600',
  medium: 'text-amber-600',
  low: 'text-red-600',
};

const CONFIDENCE_BG: Record<string, string> = {
  high: 'bg-green-50 border-green-200',
  medium: 'bg-amber-50 border-amber-200',
  low: 'bg-red-50 border-red-200',
};

export default function DueDiligencePanel({ property, documents }: Props) {
  const t = useTranslations('dueDiligence');
  const { tier } = useAuth();
  const { update } = useUserListings();

  const [phase, setPhase] = useState<'idle' | 'precheck' | 'running' | 'results'>('idle');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [latestRun, setLatestRun] = useState<DueDiligenceRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  // Load previous results on mount
  useEffect(() => {
    getDueDiligenceResults(property.id)
      .then(runs => {
        if (runs.length > 0) {
          setLatestRun(runs[0]);
          setPhase('results');
        }
      })
      .catch(() => {});
  }, [property.id]);

  function handleStartPreCheck() {
    if (tier !== 'pro') return;
    // Pre-select all documents by default
    setSelectedDocs(new Set(documents.map(d => d.storageKey)));
    setPhase('precheck');
  }

  async function handleRun() {
    setPhase('running');
    setError(null);
    try {
      const result = await runDueDiligence(property.id, Array.from(selectedDocs));
      setLatestRun(result);
      setPhase('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check failed');
      setPhase('precheck');
    }
  }

  function handleFunnelAction(action: 'none' | 'due_diligence' | 'parked') {
    if (action === 'due_diligence') {
      update(property.id, { status: 'due_diligence', movedToStageAt: new Date().toISOString() });
    } else if (action === 'parked') {
      update(property.id, { status: 'parked', movedToStageAt: new Date().toISOString() });
    }
    // Stay on results — don't dismiss
  }

  // ── Idle: show entry button ─────────────────────────────────────────────
  if (phase === 'idle') {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{t('title')}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t('subtitle')}</p>
          </div>
          <button
            onClick={handleStartPreCheck}
            disabled={tier !== 'pro' || documents.length === 0}
            className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔍 {t('startButton')}
          </button>
        </div>
        {tier !== 'pro' && (
          <p className="text-xs text-amber-600 mt-2">{t('proRequired')}</p>
        )}
        {documents.length === 0 && tier === 'pro' && (
          <p className="text-xs text-gray-400 mt-2">{t('noDocuments')}</p>
        )}
      </div>
    );
  }

  // ── Pre-check: document selection + completeness matrix ─────────────────
  if (phase === 'precheck') {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('precheck.title')}</h3>

        {/* Document selection */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500">{t('precheck.selectDocs')}</p>
          {documents.map(doc => (
            <label key={doc.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedDocs.has(doc.storageKey)}
                onChange={() => setSelectedDocs(prev => {
                  const next = new Set(prev);
                  next.has(doc.storageKey) ? next.delete(doc.storageKey) : next.add(doc.storageKey);
                  return next;
                })}
                className="rounded border-gray-300 text-teal-600"
              />
              <span className="text-gray-700">{doc.label}</span>
              <span className="text-xs text-gray-400">{doc.fileName}</span>
            </label>
          ))}
        </div>

        {/* Completeness matrix */}
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs font-medium text-gray-600 mb-2">{t('precheck.completeness')}</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(RELEVANT_DOCS).map(([docType, checks]) => {
              const present = documents.some(d => d.label === docType);
              return (
                <div key={docType} className="flex items-center gap-1.5">
                  <span className={present ? 'text-green-600' : 'text-amber-500'}>
                    {present ? '✓' : '⚠'}
                  </span>
                  <span className={present ? 'text-gray-700' : 'text-amber-700'}>
                    {docType}
                  </span>
                  <span className="text-gray-400">→ {checks.join(', ')}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
          {t('disclaimer')}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setPhase('idle')}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('precheck.cancel')}
          </button>
          <button
            onClick={handleRun}
            className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
          >
            {t('precheck.run')}
          </button>
        </div>
      </div>
    );
  }

  // ── Running: spinner ────────────────────────────────────────────────────
  if (phase === 'running') {
    return (
      <div className="border border-gray-200 rounded-lg p-8 bg-white text-center">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-teal-600 rounded-full mx-auto mb-4" />
        <p className="text-sm text-gray-600">{t('running.title')}</p>
        <p className="text-xs text-gray-400 mt-1">{t('running.subtitle')}</p>
      </div>
    );
  }

  // ── Results ─────────────────────────────────────────────────────────────
  if (!latestRun) return null;

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t('results.title')}</h3>
          <p className="text-xs text-gray-500">
            {new Date(latestRun.runAt).toLocaleDateString('de-AT', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
            {latestRun.overallScore != null && (
              <span className="ml-2 font-medium">
                {t('results.overallScore')}: {latestRun.overallScore}%
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setPhase('idle'); }}
          className="text-xs text-teal-600 hover:underline"
        >
          {t('results.newRun')}
        </button>
      </div>

      {/* Check rows */}
      <div className="divide-y divide-gray-100">
        {CHECK_ORDER.map(({ field, label }) => {
          const check = latestRun[field] as DueDiligenceCheckResult | null;
          if (!check) return null;
          const isExpanded = expandedCheck === field;

          return (
            <div key={field} className="px-4 py-3">
              <button
                onClick={() => setExpandedCheck(isExpanded ? null : field)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{label}</span>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${CONFIDENCE_BG[check.confidence]}`}>
                      {check.confidence === 'high' ? '🟢' : check.confidence === 'medium' ? '🟠' : '🔴'}
                      {' '}{check.confidence}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{check.summary}</p>
                </div>
                <span className="text-gray-400 text-xs ml-2 flex-shrink-0">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="mt-3 space-y-3 text-xs">
                  {/* Detail */}
                  <div className="prose prose-xs max-w-none text-gray-700 whitespace-pre-wrap">
                    {check.detail}
                  </div>

                  {/* Statute refs */}
                  {check.statuteRefs.length > 0 && (
                    <div>
                      <span className="font-medium text-gray-500">{t('results.statuteRefs')}:</span>{' '}
                      <span className="text-gray-600">{check.statuteRefs.join(', ')}</span>
                    </div>
                  )}

                  {/* Documents used */}
                  {check.documentsUsed && check.documentsUsed.length > 0 && (
                    <div>
                      <span className="font-medium text-gray-500">{t('results.documentsUsed')}:</span>{' '}
                      <span className="text-gray-600">
                        {check.documentsUsed.map(d => `${d.label} (${d.fileName})`).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Flags */}
                  {check.flags.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2">
                      {check.flags.map((flag, i) => (
                        <p key={i} className="text-amber-800">⚠ {flag}</p>
                      ))}
                    </div>
                  )}

                  {/* Missing fields */}
                  {check.missingFields.length > 0 && (
                    <div className="text-gray-500">
                      {t('results.missingFields')}: {check.missingFields.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
        {t('disclaimer')}
      </div>

      {/* Funnel actions */}
      <div className="px-4 py-3 border-t border-gray-200 flex gap-2">
        <button
          onClick={() => handleFunnelAction('none')}
          className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          {t('actions.noAction')}
        </button>
        <button
          onClick={() => handleFunnelAction('due_diligence')}
          className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
        >
          {t('actions.moveToDueDiligence')}
        </button>
        <button
          onClick={() => handleFunnelAction('parked')}
          className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
        >
          {t('actions.park')}
        </button>
      </div>
    </div>
  );
}
