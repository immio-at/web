'use client';

// Budget tab (MGMT-MODULE-SPEC §8.4). Table grouped by category with
// subtotals, grand total, variance (actual − planned) and % spent. Columns:
// category, name, planned, actual, vendor, status, phase tag (current phase
// names + Unassigned), notes. Mobile card layout via responsive classes.
// Inline edit → debounced PATCH; + Add line and per-row delete.

import { Fragment, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { fmtEUR, fmtPct } from '@/lib/mgmt/format';
import type { BudgetItem, BudgetStatus } from '@/lib/mgmt/types';
import type { UseMgmt } from '../useMgmt';

const STATUSES: BudgetStatus[] = ['todo', 'quoted', 'ordered', 'paid'];
const UNASSIGNED = '__unassigned__';

export default function BudgetTab({ mgmt }: { mgmt: UseMgmt }) {
  const t = useTranslations('mgmt');
  const { budgetItems, tasks } = mgmt;

  const phaseNames = useMemo(
    () => tasks.filter((x) => x.phase && x.name.trim()).map((x) => x.name),
    [tasks],
  );

  // Group by category, preserving sortOrder within each group.
  const groups = useMemo(() => {
    const map = new Map<string, BudgetItem[]>();
    for (const item of budgetItems) {
      const key = item.category || t('budget.uncategorised');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [budgetItems, t]);

  const totalPlanned = budgetItems.reduce((s, b) => s + Number(b.planned), 0);
  const totalActual = budgetItems.reduce((s, b) => s + Number(b.actual), 0);
  const variance = totalActual - totalPlanned;

  const num = (v: string) => (v === '' ? 0 : Math.max(0, Number(v) || 0));

  // The phase select value: if the stored tag no longer matches a phase row,
  // it reads as Unassigned (the soft tag is preserved in the DB regardless).
  function phaseValue(item: BudgetItem): string {
    if (item.phase && phaseNames.includes(item.phase)) return item.phase;
    return UNASSIGNED;
  }

  function statusBadge(status: BudgetStatus) {
    const cls: Record<BudgetStatus, string> = {
      todo: 'bg-gray-100 text-gray-500',
      quoted: 'bg-amber-50 text-amber-700',
      ordered: 'bg-blue-50 text-blue-700',
      paid: 'bg-teal-50 text-teal-700',
    };
    return cls[status];
  }

  const inputCls =
    'w-full bg-transparent text-sm outline-none focus:bg-blue-50/40 rounded px-1 py-0.5';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => mgmt.addBudgetItem(t('budget.uncategorised'))}
          className="text-xs font-medium bg-primary hover:bg-primary-light text-white px-3 py-1.5 rounded-lg"
        >
          + {t('budget.addLine')}
        </button>
      </div>

      {/* ── Desktop table ── */}
      <div className="hidden md:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-100">
              {[
                'colName',
                'colPlanned',
                'colActual',
                'colVendor',
                'colStatus',
                'colPhase',
                'colNotes',
                'colActions',
              ].map((k) => (
                <th
                  key={k}
                  className="font-mono text-[10px] uppercase tracking-widest text-gray-400 px-3 py-2 font-normal"
                >
                  {t(`budget.${k}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(([category, items]) => {
              const subPlanned = items.reduce((s, b) => s + Number(b.planned), 0);
              const subActual = items.reduce((s, b) => s + Number(b.actual), 0);
              return (
                <Fragment key={category}>
                  <tr className="bg-slate-50">
                    <td colSpan={8} className="px-3 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {category}
                      <span className="ml-3 font-mono font-normal text-gray-400">
                        {fmtEUR(subActual)} / {fmtEUR(subPlanned)}
                      </span>
                    </td>
                  </tr>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="px-3 py-1.5">
                        <input
                          value={item.name}
                          placeholder={t('budget.namePlaceholder')}
                          onChange={(e) => mgmt.patchBudget(item.id, { name: e.target.value })}
                          className={inputCls}
                        />
                        <input
                          defaultValue={item.category}
                          placeholder={t('budget.categoryPlaceholder')}
                          onBlur={(e) => mgmt.patchBudget(item.id, { category: e.target.value })}
                          className="w-full bg-transparent text-[10px] text-gray-400 outline-none focus:bg-blue-50/40 rounded px-1"
                        />
                      </td>
                      <td className="px-3 py-1.5 w-28">
                        <input
                          type="number"
                          min={0}
                          value={item.planned}
                          onChange={(e) => mgmt.patchBudget(item.id, { planned: num(e.target.value) })}
                          className={`${inputCls} text-right font-mono`}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-28">
                        <input
                          type="number"
                          min={0}
                          value={item.actual}
                          onChange={(e) => mgmt.patchBudget(item.id, { actual: num(e.target.value) })}
                          className={`${inputCls} text-right font-mono`}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-32">
                        <input
                          value={item.vendor ?? ''}
                          onChange={(e) => mgmt.patchBudget(item.id, { vendor: e.target.value })}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-28">
                        <select
                          value={item.status}
                          onChange={(e) => mgmt.patchBudget(item.id, { status: e.target.value as BudgetStatus })}
                          className={`text-xs font-mono rounded-full px-2 py-0.5 ${statusBadge(item.status)} outline-none`}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`budget.status.${s}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 w-36">
                        <select
                          value={phaseValue(item)}
                          onChange={(e) =>
                            mgmt.patchBudget(item.id, {
                              phase: e.target.value === UNASSIGNED ? null : e.target.value,
                            })
                          }
                          className="text-xs bg-transparent outline-none focus:bg-blue-50/40 rounded px-1"
                        >
                          <option value={UNASSIGNED}>{t('budget.unassigned')}</option>
                          {phaseNames.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={item.notes ?? ''}
                          onChange={(e) => mgmt.patchBudget(item.id, { notes: e.target.value })}
                          className={inputCls}
                        />
                      </td>
                      <td className="px-3 py-1.5 w-10 text-right">
                        <button
                          onClick={() => mgmt.removeBudgetItem(item.id)}
                          className="text-gray-300 hover:text-red-500"
                          title={t('budget.delete')}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 font-medium">
              <td className="px-3 py-2 text-xs uppercase tracking-wide text-gray-600">{t('budget.grandTotal')}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtEUR(totalPlanned)}</td>
              <td className="px-3 py-2 text-right font-mono">{fmtEUR(totalActual)}</td>
              <td colSpan={5} className="px-3 py-2 text-xs text-gray-500">
                {t('budget.variance')}:{' '}
                <span className={variance > 0 ? 'text-red-600' : 'text-teal-600'}>{fmtEUR(variance)}</span>
                <span className="ml-4">
                  {t('budget.percentSpent')}: {fmtPct(totalActual, totalPlanned)}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Mobile cards ── */}
      <div className="md:hidden space-y-3">
        {groups.map(([category, items]) => (
          <div key={category}>
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1 px-1">{category}</p>
            {items.map((item) => (
              <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 mb-2 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <input
                    value={item.name}
                    placeholder={t('budget.namePlaceholder')}
                    onChange={(e) => mgmt.patchBudget(item.id, { name: e.target.value })}
                    className="font-medium text-sm bg-transparent outline-none flex-1"
                  />
                  <button onClick={() => mgmt.removeBudgetItem(item.id)} className="text-gray-300 hover:text-red-500 ml-2">
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="text-xs text-gray-400">
                    {t('budget.colPlanned')}
                    <input
                      type="number"
                      min={0}
                      value={item.planned}
                      onChange={(e) => mgmt.patchBudget(item.id, { planned: num(e.target.value) })}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-mono"
                    />
                  </label>
                  <label className="text-xs text-gray-400">
                    {t('budget.colActual')}
                    <input
                      type="number"
                      min={0}
                      value={item.actual}
                      onChange={(e) => mgmt.patchBudget(item.id, { actual: num(e.target.value) })}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-sm font-mono"
                    />
                  </label>
                  <select
                    value={item.status}
                    onChange={(e) => mgmt.patchBudget(item.id, { status: e.target.value as BudgetStatus })}
                    className={`text-xs font-mono rounded-full px-2 py-1 ${statusBadge(item.status)}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`budget.status.${s}`)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={phaseValue(item)}
                    onChange={(e) =>
                      mgmt.patchBudget(item.id, { phase: e.target.value === UNASSIGNED ? null : e.target.value })
                    }
                    className="text-xs border border-gray-200 rounded px-2 py-1"
                  >
                    <option value={UNASSIGNED}>{t('budget.unassigned')}</option>
                    {phaseNames.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('budget.grandTotal')}</span>
            <span className="font-mono">
              {fmtEUR(totalActual)} / {fmtEUR(totalPlanned)}
            </span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-gray-500">{t('budget.variance')}</span>
            <span className={`font-mono ${variance > 0 ? 'text-red-600' : 'text-teal-600'}`}>{fmtEUR(variance)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
