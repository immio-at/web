'use client';

/**
 * Reports page (ADR-018 §5) — `/reports`.
 *
 * Admin-only feedback reports view. Split out from `/admin/reports`
 * to give it its own top-level utility-area nav entry alongside the
 * existing Admin link. Self-gates on `isAdmin` (server-side enforcement
 * lives on the API endpoints — frontend gate is defence-in-depth +
 * helpful empty state for non-admins who reach the route by accident).
 *
 * Filter state is captured in URL query params so views are
 * deep-linkable: `/reports?unacknowledged=true`, `/reports?status=open`,
 * etc. The AdminUnacknowledgedToast (mounted globally in the
 * authenticated layout) links here with the `unacknowledged=true`
 * shortcut.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import {
  getAdminFeedbackReports,
  updateAdminFeedback,
  acknowledgeAdminFeedback,
  type FeedbackReport,
  type FeedbackStatus,
  type FeedbackType,
} from '@/lib/api';

const STATUS_VALUES: FeedbackStatus[] = ['open', 'in_progress', 'resolved', 'wont_fix', 'duplicate'];
const TYPE_VALUES: FeedbackType[] = ['bug', 'feature', 'improvement'];

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

export default function ReportsPage() {
  const t = useTranslations('admin.feedback');
  const tFb = useTranslations('feedback');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();

  const filterStatus = searchParams.get('status') as FeedbackStatus | null;
  const filterType = searchParams.get('type') as FeedbackType | null;
  const filterUnack = searchParams.get('unacknowledged') === 'true';

  const [reports, setReports] = useState<FeedbackReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setReports(null);
    setError(null);
    getAdminFeedbackReports({
      status: filterStatus ?? undefined,
      type: filterType ?? undefined,
      unacknowledged: filterUnack,
    })
      .then((rows) => {
        if (!cancelled) setReports(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, filterStatus, filterType, filterUnack, refreshTick]);

  function setQuery(next: Record<string, string | null>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname);
  }

  function patchLocalReport(id: string, patch: Partial<FeedbackReport>) {
    setReports((prev) => prev?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);
  }

  async function handleStatusChange(report: FeedbackReport, status: FeedbackStatus) {
    patchLocalReport(report.id, { status });
    try {
      const updated = await updateAdminFeedback(report.id, { status });
      patchLocalReport(report.id, updated);
    } catch (e) {
      patchLocalReport(report.id, { status: report.status });
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleAcknowledge(report: FeedbackReport) {
    try {
      const updated = await acknowledgeAdminFeedback(report.id);
      patchLocalReport(report.id, updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const unacknowledgedCount = useMemo(
    () => reports?.filter((r) => r.acknowledgedAt == null).length ?? 0,
    [reports],
  );

  if (!isAdmin) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-slate-700">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {unacknowledgedCount > 0
              ? t('unacknowledgedToast', { count: unacknowledgedCount })
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshTick((n) => n + 1)}
          className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <select
          value={filterStatus ?? ''}
          onChange={(e) => setQuery({ status: e.target.value || null })}
          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
        >
          <option value="">{t('filters.all')} — {t('filters.status')}</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>{tFb(`mine.status.${s}`)}</option>
          ))}
        </select>
        <select
          value={filterType ?? ''}
          onChange={(e) => setQuery({ type: e.target.value || null })}
          className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
        >
          <option value="">{t('filters.all')} — {t('filters.type')}</option>
          {TYPE_VALUES.map((tp) => (
            <option key={tp} value={tp}>{tFb(`new.type.${tp}`)}</option>
          ))}
        </select>
        <label className="text-xs flex items-center gap-1.5 text-slate-700">
          <input
            type="checkbox"
            checked={filterUnack}
            onChange={(e) => setQuery({ unacknowledged: e.target.checked ? 'true' : null })}
          />
          {t('filters.unacknowledgedOnly')}
        </label>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mb-4">
          {error}
        </div>
      )}

      {reports == null ? (
        <p className="text-sm text-slate-500">{tFb('mine.loading')}</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-slate-500">{t('empty')}</p>
      ) : (
        <div className="space-y-4">
          {reports.map((r) => (
            <AdminFeedbackRow
              key={r.id}
              report={r}
              onStatusChange={(s) => handleStatusChange(r, s)}
              onAcknowledge={() => handleAcknowledge(r)}
              onTeamNoteSave={async (note) => {
                try {
                  const updated = await updateAdminFeedback(r.id, { teamNote: note });
                  patchLocalReport(r.id, updated);
                } catch (e) {
                  alert(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  report: FeedbackReport;
  onStatusChange: (status: FeedbackStatus) => void;
  onAcknowledge: () => void;
  onTeamNoteSave: (note: string | null) => Promise<void>;
}

function AdminFeedbackRow({ report, onStatusChange, onAcknowledge, onTeamNoteSave }: RowProps) {
  const t = useTranslations('admin.feedback');
  const tFb = useTranslations('feedback');
  // `note` is seeded from props once on mount via useState's initializer,
  // then becomes the sole source of truth for the textarea until the row
  // unmounts. **No useEffect resyncs from props** — the previous resync
  // raced against in-flight typing during the autosave round-trip and
  // caused the "characters appear, disappear, reappear" symptom. Each
  // row's React key is `report.id`, so when the user switches filters /
  // refreshes, rows unmount and remount with fresh state. Out-of-band
  // updates (another admin editing the same row) won't propagate to a
  // currently-mounted row — acceptable for the tester window.
  const [note, setNote] = useState(report.teamNote ?? '');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  function handleNoteChange(next: string) {
    setNote(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void onTeamNoteSave(next.trim() === '' ? null : next).then(() => {
        setSavedAt(Date.now());
        setTimeout(() => {
          setSavedAt((prev) => (prev && Date.now() - prev >= 2000 ? null : prev));
        }, 2100);
      });
    }, 500);
  }

  const isUnack = report.acknowledgedAt == null;

  return (
    <div className="border border-slate-200 rounded-lg bg-white p-4 relative">
      {isUnack && (
        <span className="absolute top-3 left-3 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
          ⚠ NEU
        </span>
      )}
      <div className={`flex items-center gap-2 mb-2 ${isUnack ? 'pl-12' : ''}`}>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[report.type]}`}>
          {tFb(`new.type.${report.type}`)}
        </span>
        <span className="text-xs text-slate-700">
          {report.user?.email ?? report.userId}
        </span>
        <span className="text-[10px] text-slate-400" title={new Date(report.createdAt).toLocaleString()}>
          {new Date(report.createdAt).toLocaleString()}
        </span>
        <select
          value={report.status}
          onChange={(e) => onStatusChange(e.target.value as FeedbackStatus)}
          className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_COLORS[report.status]}`}
        >
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>{tFb(`mine.status.${s}`)}</option>
          ))}
        </select>
      </div>

      <h4 className="text-sm font-medium text-slate-900 mb-1 break-words">
        {report.title}
      </h4>
      <p className="text-xs text-slate-700 whitespace-pre-wrap break-words mb-2">
        {report.description}
      </p>

      <div className="text-[10px] text-slate-500 mb-2">
        <span className="font-semibold uppercase tracking-wide">{t('row.context')}: </span>
        <span>{report.contextUrl ?? '—'}</span>
        {report.propertyTitle && (
          <span className="ml-2">· {report.propertyTitle}</span>
        )}
        {report.viewportWidth != null && report.viewportHeight != null && (
          <span className="ml-2">· {report.viewportWidth}×{report.viewportHeight}</span>
        )}
      </div>

      {report.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {report.attachments.map((a) => (
            <a
              key={a.id}
              href={a.signedUrl ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-600 hover:text-slate-900 px-2 py-0.5 border border-slate-200 rounded"
            >
              📎 {a.fileName}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 mt-2">
        <textarea
          value={note}
          onChange={(e) => handleNoteChange(e.target.value)}
          placeholder={t('row.teamNotePlaceholder')}
          rows={2}
          maxLength={1000}
          className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 focus:outline-none focus:border-teal-500"
        />
        <div className="flex flex-col gap-1 shrink-0">
          {savedAt && (
            <span className="text-[10px] text-green-700">
              {t('row.teamNoteSaved')}
            </span>
          )}
          {isUnack && (
            <button
              type="button"
              onClick={onAcknowledge}
              className="text-[10px] px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white"
            >
              {t('row.acknowledge')}
            </button>
          )}
          {!isUnack && (
            <span className="text-[10px] text-slate-500" title={report.acknowledgedAt!}>
              {t('row.acknowledged')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
