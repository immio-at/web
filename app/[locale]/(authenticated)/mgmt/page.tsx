'use client';

// Admin-only /mgmt module shell (MGMT-MODULE-SPEC §8.1). Client admin guard
// mirrors /admin; three tabs (Gantt / Budget / Overview); debounced autosave +
// realtime live in useMgmt. The save-state pill reflects the autosave flush.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { useMgmt } from './useMgmt';
import GanttTab from './components/GanttTab';
import BudgetTab from './components/BudgetTab';
import OverviewTab from './components/OverviewTab';

type Tab = 'gantt' | 'budget' | 'overview';

function SavePill({ state }: { state: ReturnType<typeof useMgmt>['saveState'] }) {
  const t = useTranslations('mgmt');
  if (state === 'idle') return null;
  const map = {
    saving: { label: t('save.saving'), cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    saved: { label: t('save.saved'), cls: 'bg-teal-50 text-teal-700 border-teal-200' },
    error: { label: t('save.error'), cls: 'bg-red-50 text-red-700 border-red-200' },
  }[state];
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${map.cls}`}>{map.label}</span>
  );
}

export default function MgmtPage() {
  const t = useTranslations('mgmt');
  const router = useRouter();
  const { isAdmin, loading: authLoading, session } = useAuth();
  const [tab, setTab] = useState<Tab>('gantt');

  // ── Guard: redirect non-admins (Section 4) ───────────────────────────────
  useEffect(() => {
    if (authLoading) return; // wait for context to seed from localStorage
    if (!session || !isAdmin) router.replace('/dashboard');
  }, [authLoading, session, isAdmin, router]);

  const enabled = !authLoading && !!session && isAdmin;
  const mgmt = useMgmt(enabled);

  if (authLoading || !enabled) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400 font-mono">{t('loading')}</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'gantt', label: t('tabs.gantt') },
    { key: 'budget', label: t('tabs.budget') },
    { key: 'overview', label: t('tabs.overview') },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-widest text-amber-600 mb-1">
              {t('label')}
            </p>
            <h1 className="text-3xl font-light text-primary tracking-tight">{t('title')}</h1>
          </div>
          <SavePill state={mgmt.saveState} />
        </div>

        {/* Tabs */}
        <nav className="flex gap-1 mb-6 border-b border-gray-200">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                tab === tb.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </nav>

        {mgmt.error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-red-700 text-sm">{mgmt.error}</p>
          </div>
        )}

        {mgmt.loading ? (
          <p className="text-sm text-gray-400 font-mono py-12 text-center">{t('loading')}</p>
        ) : (
          <>
            {tab === 'gantt' && <GanttTab mgmt={mgmt} />}
            {tab === 'budget' && <BudgetTab mgmt={mgmt} />}
            {tab === 'overview' && <OverviewTab mgmt={mgmt} />}
          </>
        )}
      </div>
    </div>
  );
}
