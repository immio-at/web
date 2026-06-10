'use client';

// Overview tab — Option A "Delivery cockpit" (MGMT-MODULE-SPEC §8.6). Three
// blocks derived only from the self-contained mgmt_* tables: schedule summary,
// budget summary (+ planned-vs-actual chart), and the editable SaaS finance
// block (mgmt_settings.finance) with runway + capital-remaining. Option B
// (founder metrics) is the deferred phase-2 bolt-on (§13).

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compute } from '@/lib/mgmt/cpm';
import { addWorkingDays, nextMonday } from '@/lib/mgmt/workdays';
import { fmtEUR, fmtPct } from '@/lib/mgmt/format';
import type { Finance } from '@/lib/mgmt/types';
import type { UseMgmt } from '../useMgmt';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-teal-600' : 'text-primary';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-light ${color}`}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-mono uppercase tracking-widest text-gray-400 mb-4">{title}</h2>
      {children}
    </div>
  );
}

export default function OverviewTab({ mgmt }: { mgmt: UseMgmt }) {
  const t = useTranslations('mgmt');
  const { tasks, budgetItems, spending, settings } = mgmt;

  const projStart = settings?.projectStart || nextMonday(new Date());
  const { real, projEnd } = useMemo(() => compute(tasks, projStart), [tasks, projStart]);

  // ── Schedule summary ─────────────────────────────────────────────────────
  const projEndISO = addWorkingDays(projStart, projEnd);
  const criticalCount = real.filter((r) => r._crit).length;
  const doneCount = real.filter((r) => r.done).length;
  const pctDone = real.length ? fmtPct(doneCount, real.length) : '—';

  // ── Budget summary ───────────────────────────────────────────────────────
  const totalPlanned = budgetItems.reduce((s, b) => s + Number(b.planned), 0);
  const totalActual = budgetItems.reduce((s, b) => s + Number(b.actual), 0);
  const variance = totalActual - totalPlanned;

  const chartData = useMemo(() => {
    const map = new Map<string, { name: string; planned: number; actual: number }>();
    for (const b of budgetItems) {
      const key = b.category || t('budget.uncategorised');
      const e = map.get(key) ?? { name: key, planned: 0, actual: 0 };
      e.planned += Number(b.planned);
      e.actual += Number(b.actual);
      map.set(key, e);
    }
    return [...map.values()];
  }, [budgetItems, t]);

  // ── Finance block ────────────────────────────────────────────────────────
  const finance: Finance = settings?.finance ?? {};
  const capitalAvailable = Number(finance.capitalAvailable ?? 0);
  const monthlyBurn = Number(finance.monthlyBurn ?? 0);
  const runwayMonths = monthlyBurn > 0 ? capitalAvailable / monthlyBurn : null;
  const capitalRemaining = capitalAvailable - totalActual;

  function setFinance(patch: Partial<Finance>) {
    mgmt.patchSettings({ finance: { ...finance, ...patch } as Record<string, unknown> });
  }

  const fieldCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary';

  return (
    <div className="space-y-6">
      {/* Schedule summary */}
      <Card title={t('overview.schedule')}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Stat label={t('overview.projectStart')} value={projStart} />
          <Stat label={t('overview.projectedEnd')} value={projEndISO} />
          <Stat label={t('overview.totalWorkingDays')} value={String(projEnd)} />
          <Stat label={t('overview.criticalTasks')} value={String(criticalCount)} />
          <Stat label={t('overview.pctDone')} value={pctDone} />
        </div>
        <label className="block mt-4 max-w-xs">
          <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
            {t('overview.editProjectStart')}
          </span>
          <input
            type="date"
            value={projStart}
            onChange={(e) => mgmt.patchSettings({ projectStart: e.target.value || null })}
            className={`${fieldCls} mt-1`}
          />
        </label>
      </Card>

      {/* Budget summary */}
      <Card title={t('overview.budget')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Stat label={t('budget.colPlanned')} value={fmtEUR(totalPlanned)} />
          <Stat label={t('budget.colActual')} value={fmtEUR(totalActual)} />
          <Stat
            label={t('budget.variance')}
            value={fmtEUR(variance)}
            tone={variance > 0 ? 'bad' : 'good'}
          />
          <Stat label={t('budget.percentSpent')} value={fmtPct(totalActual, totalPlanned)} />
        </div>
        {chartData.length > 0 && (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} fontSize={10} height={60} />
                <YAxis fontSize={10} />
                <Tooltip formatter={(v: unknown) => fmtEUR(v as number)} />
                <Legend />
                <Bar dataKey="planned" name={t('budget.colPlanned')} fill="#94a3b8" />
                <Bar dataKey="actual" name={t('budget.colActual')} fill="#0d9488" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* SaaS finance block */}
      <Card title={t('overview.finance')}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              {t('overview.capitalAvailable')}
            </span>
            <input
              type="number"
              min={0}
              value={capitalAvailable}
              onChange={(e) => setFinance({ capitalAvailable: Math.max(0, Number(e.target.value) || 0) })}
              className={`${fieldCls} mt-1 font-mono`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              {t('overview.monthlyBurn')}
            </span>
            <input
              type="number"
              min={0}
              value={monthlyBurn}
              onChange={(e) => setFinance({ monthlyBurn: Math.max(0, Number(e.target.value) || 0) })}
              className={`${fieldCls} mt-1 font-mono`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              {t('overview.targetLaunch')}
            </span>
            <input
              value={finance.targetLaunch ?? ''}
              onChange={(e) => setFinance({ targetLaunch: e.target.value })}
              placeholder="2026-Q4"
              className={`${fieldCls} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
              {t('overview.notes')}
            </span>
            <input
              value={finance.notes ?? ''}
              onChange={(e) => setFinance({ notes: e.target.value })}
              className={`${fieldCls} mt-1`}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <Stat
            label={t('overview.runwayMonths')}
            value={runwayMonths == null ? '—' : runwayMonths.toFixed(1)}
          />
          <Stat
            label={t('overview.capitalRemaining')}
            value={fmtEUR(capitalRemaining)}
            tone={capitalRemaining < 0 ? 'bad' : undefined}
          />
        </div>
      </Card>

      {/* Spending log (informational — does NOT feed budget math) */}
      <Card title={t('overview.spendingLog')}>
        <div className="space-y-2">
          {spending.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                value={s.name}
                placeholder={t('overview.spendingName')}
                onChange={(e) => mgmt.patchSpending(s.id, { name: e.target.value })}
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-primary"
              />
              <input
                type="number"
                min={0}
                value={s.amount}
                onChange={(e) => mgmt.patchSpending(s.id, { amount: Math.max(0, Number(e.target.value) || 0) })}
                className="w-28 border border-gray-200 rounded px-2 py-1 text-sm font-mono text-right outline-none focus:border-primary"
              />
              <input
                type="date"
                value={s.occurredAt ?? ''}
                onChange={(e) => mgmt.patchSpending(s.id, { occurredAt: e.target.value || null })}
                className="border border-gray-200 rounded px-2 py-1 text-sm outline-none focus:border-primary"
              />
              <button onClick={() => mgmt.removeSpending(s.id)} className="text-gray-300 hover:text-red-500">
                ✕
              </button>
            </div>
          ))}
          {spending.length === 0 && (
            <p className="text-sm text-gray-400">{t('overview.spendingEmpty')}</p>
          )}
        </div>
        <button
          onClick={() => mgmt.addSpending()}
          className="mt-3 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-gray-700 px-3 py-1.5 rounded-lg"
        >
          + {t('overview.addSpending')}
        </button>
      </Card>
    </div>
  );
}
