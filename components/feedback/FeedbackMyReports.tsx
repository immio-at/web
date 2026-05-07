'use client';

/**
 * FeedbackMyReports (ADR-018 §4) — the My Reports tab.
 *
 * Lists the current user's feedback reports newest-first. Each card
 * shows type pill, relative time, status pill, title, description
 * (clamped to 3 lines, click to expand), attachment indicator, and
 * inline team note when present. Click attachment indicator → opens
 * a lightbox modal over the drawer.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getMyFeedbackReports,
  type FeedbackReport,
  type FeedbackStatus,
  type FeedbackType,
} from '@/lib/api';

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  open: 'bg-yellow-100 text-yellow-900 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-900 border-blue-200',
  resolved: 'bg-green-100 text-green-900 border-green-200',
  wont_fix: 'bg-slate-100 text-slate-700 border-slate-200',
  duplicate: 'bg-slate-100 text-slate-700 border-slate-200',
};

const TYPE_COLORS: Record<FeedbackType, string> = {
  bug: 'bg-red-100 text-red-900',
  feature: 'bg-blue-100 text-blue-900',
  improvement: 'bg-slate-100 text-slate-800',
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function FeedbackMyReports() {
  const t = useTranslations('feedback');
  const [reports, setReports] = useState<FeedbackReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getMyFeedbackReports()
      .then((rows) => {
        if (cancelled) return;
        setReports(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (reports === null && !error) {
    return <div className="p-5 text-xs text-slate-500">{t('mine.loading')}</div>;
  }
  if (error) {
    return <div className="p-5 text-xs text-red-700">{error}</div>;
  }
  if (reports && reports.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-700 font-medium mb-1">
          {t('mine.empty.title')}
        </p>
        <p className="text-xs text-slate-500">{t('mine.empty.body')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-3 space-y-3">
        {reports!.map((r) => {
          const isExpanded = expanded.has(r.id);
          return (
            <div
              key={r.id}
              className="border border-slate-200 rounded-lg p-3 bg-white"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[r.type]}`}>
                  {t(`new.type.${r.type}`)}
                </span>
                <span className="text-[10px] text-slate-400" title={new Date(r.createdAt).toLocaleString()}>
                  {relativeTime(r.createdAt)}
                </span>
                <span
                  className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[r.status]}`}
                >
                  {t(`mine.status.${r.status}`)}
                </span>
              </div>
              <h4 className="text-sm font-medium text-slate-900 mb-1 break-words">
                {r.title}
              </h4>
              <p
                className={`text-xs text-slate-600 break-words whitespace-pre-wrap cursor-pointer ${isExpanded ? '' : 'line-clamp-3'}`}
                onClick={() => toggleExpand(r.id)}
              >
                {r.description}
              </p>
              {r.attachments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => a.signedUrl && setLightbox(a.signedUrl)}
                      className="inline-flex items-center gap-1 text-[10px] text-slate-600 hover:text-slate-900 px-2 py-0.5 border border-slate-200 rounded"
                    >
                      📎 {a.fileName}
                    </button>
                  ))}
                </div>
              )}
              {r.teamNote && (
                <div className="mt-3 rounded bg-teal-50 border border-teal-200 p-2.5">
                  <p className="text-[10px] font-semibold text-teal-900 mb-1 uppercase tracking-wide">
                    💬 {t('mine.teamNote.heading')}
                  </p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                    {r.teamNote}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain" />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white text-2xl"
            aria-label="close"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
