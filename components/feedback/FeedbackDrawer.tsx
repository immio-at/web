'use client';

/**
 * FeedbackDrawer (ADR-018 §2) — right-side drawer holding the New Report
 * form (Tab 1) and My Reports list (Tab 2). Tab state persists across
 * close/reopen within a session via a module-level variable. Discard
 * confirm fires when closing with unsaved form content (mirrors the
 * property modal's unsaved-state guard from ADR-003 §11).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import FeedbackNewReport from './FeedbackNewReport';
import FeedbackMyReports from './FeedbackMyReports';
import type { FeedbackType } from '@/lib/api';

type Tab = 'new' | 'mine';

// Per ADR §2.2 — preserved across drawer close/reopen within a session.
// Cleared on logout via the AuthContext clearAllUserCaches hook below.
let lastActiveTab: Tab = 'new';

export function clearFeedbackDrawerState(): void {
  lastActiveTab = 'new';
}

interface Props {
  onClose: () => void;
  /** ADR-008 PT3 — prefill the New Report form's type radio. */
  initialType?: FeedbackType;
  /** ADR-008 PT3 — prefill the New Report form's description textarea. */
  initialDescription?: string;
}

export default function FeedbackDrawer({ onClose, initialType, initialDescription }: Props) {
  const t = useTranslations('feedback');
  // Prefill forces the "Neuer Bericht" tab open regardless of last
  // active. The prompt's intent is "fill out a feature request right
  // now"; landing on "Meine Berichte" would be wrong.
  const initialTab: Tab = (initialType || initialDescription) ? 'new' : lastActiveTab;
  const [tab, setTab] = useState<Tab>(initialTab);
  const [hasUnsavedContent, setHasUnsavedContent] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    lastActiveTab = tab;
  }, [tab]);

  function requestClose() {
    if (hasUnsavedContent && tab === 'new') {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmDiscard) {
          setConfirmDiscard(false);
        } else {
          requestClose();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // intentionally not including requestClose in deps — closure capture
    // of the latest hasUnsavedContent is sufficient via React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDiscard, hasUnsavedContent, tab]);

  function handleSubmitSuccess() {
    setHasUnsavedContent(false);
    // Auto-transition to "Meine Berichte" 3s after success per ADR §3.7.
    // The form itself shows the success view and triggers the transition
    // via the onTransitionToMine callback.
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — click to close (with discard confirm if dirty) */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={requestClose}
      />
      <aside
        className="absolute top-0 right-0 h-full w-[420px] max-w-full bg-white shadow-2xl flex flex-col"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {t('drawer.title')}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label={t('drawer.close')}
            className="text-slate-500 hover:text-slate-900 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex border-b border-slate-200">
          {(['new', 'mine'] as const).map((t_) => {
            const active = t_ === tab;
            return (
              <button
                key={t_}
                type="button"
                onClick={() => setTab(t_)}
                className={`flex-1 px-3 py-2 text-sm font-medium ${
                  active
                    ? 'text-slate-900 border-b-2 border-slate-900 -mb-px'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t(`drawer.tab.${t_}`)}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto">
          {tab === 'new' ? (
            <FeedbackNewReport
              onDirtyChange={setHasUnsavedContent}
              onSubmitSuccess={handleSubmitSuccess}
              onTransitionToMine={() => setTab('mine')}
              initialType={initialType}
              initialDescription={initialDescription}
            />
          ) : (
            <FeedbackMyReports />
          )}
        </div>

        {confirmDiscard && (
          <div className="absolute inset-x-5 bottom-5 z-10 bg-white border border-amber-300 rounded-lg shadow-lg p-3">
            <p className="text-sm text-slate-900 mb-3">
              {t('drawer.discardConfirm.title')}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
              >
                {t('drawer.discardConfirm.keep')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDiscard(false);
                  setHasUnsavedContent(false);
                  onClose();
                }}
                className="text-xs px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white"
              >
                {t('drawer.discardConfirm.discard')}
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
