'use client';

// Gantt tab (MGMT-MODULE-SPEC §8.2). Renders rows in sortOrder — phase rows as
// section headers, task rows as bars. Editable duration (drag-resize), mark-
// done, drag-reorder, dependency arrows, add task/phase, and the task editor
// modal. The plain CSS/SVG bar+arrow renderer is intentional (recharts can't
// express it).

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { compute, computeLabels } from '@/lib/mgmt/cpm';
import { addWorkingDays, calIdx, iso, nextMonday, workingDaysInclusive } from '@/lib/mgmt/workdays';
import type { MgmtTaskRow } from '@/lib/mgmt/types';
import type { UseMgmt } from '../useMgmt';
import GanttBar from './GanttBar';
import DependencyArrows, { type BarPos } from './DependencyArrows';
import TaskEditorModal from './TaskEditorModal';

const DAYPX = 26; // px per calendar day
const LEAD_DAYS = 7; // left pad
const ROW_H = 44;
const LABEL_W = 300;
const TAIL_DAYS = 3;

export default function GanttTab({ mgmt }: { mgmt: UseMgmt }) {
  const t = useTranslations('mgmt');
  const { tasks } = mgmt;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const projStart = mgmt.settings?.projectStart || nextMonday(new Date());

  const { byId, projEnd } = useMemo(() => {
    const { real, projEnd } = compute(tasks, projStart);
    const byId: Record<string, (typeof real)[number]> = {};
    real.forEach((r) => (byId[r.id] = r));
    return { byId, projEnd };
  }, [tasks, projStart]);

  const labels = useMemo(() => computeLabels(tasks), [tasks]);

  const projEndISO = addWorkingDays(projStart, projEnd);
  const totalCalDays = LEAD_DAYS + calIdx(projEndISO, projStart) + TAIL_DAYS;
  const timelineW = Math.max(totalCalDays, LEAD_DAYS + 14) * DAYPX;
  const timelineH = Math.max(tasks.length * ROW_H, ROW_H);

  // Bar geometry + arrow anchor positions.
  const positions: Record<string, BarPos> = {};
  tasks.forEach((row, i) => {
    if (row.phase) return;
    const c = byId[row.id];
    if (!c) return;
    const x0 = (LEAD_DAYS + calIdx(c._start, projStart)) * DAYPX;
    const span = c.dur > 0 ? (calIdx(c._end, projStart) - calIdx(c._start, projStart)) * DAYPX : DAYPX;
    positions[row.id] = { x0, x1: x0 + Math.max(span, 10), y: i * ROW_H + ROW_H / 2, crit: c._crit };
  });

  // Week gridlines (every 7 calendar days from the lead edge).
  const gridlines: { x: number; date: string }[] = [];
  for (let d = 0; d <= totalCalDays; d += 7) {
    const dt = new Date(mgmt.settings?.projectStart || projStart);
    dt.setDate(dt.getDate() + (d - LEAD_DAYS));
    gridlines.push({ x: d * DAYPX, date: iso(dt).slice(5) }); // MM-DD
  }

  // ── Drag-reorder (§8.2) ──────────────────────────────────────────────────────
  // A task drags freely to any position (including into another phase — its phase
  // membership is positional). A phase drags its WHOLE block (header + tasks up
  // to the next header) and snaps to a section boundary so it never splits
  // another phase. Labels (A1/B2…) recompute from row order in render; CPM is
  // unaffected (it keys on deps, not order). On drop we renumber sortOrder across
  // all rows via reorderTasks → POST /mgmt/tasks/reorder.
  function onDrop(targetId: string) {
    const src = dragId;
    setDragId(null);
    if (!src || src === targetId) return;

    const arr = [...tasks];
    const di = arr.findIndex((x) => x.id === src);
    if (di < 0) return;
    const dragRow = arr[di];

    // Build the moving block.
    let blockLen = 1;
    if (dragRow.phase) {
      let end = di + 1;
      while (end < arr.length && !arr[end].phase) end++;
      blockLen = end - di;
    }
    const block = arr.slice(di, di + blockLen);
    const blockIds = new Set(block.map((b) => b.id));
    if (blockIds.has(targetId)) return; // dropping within the moving block — no-op

    const remainder = arr.filter((r) => !blockIds.has(r.id));
    let ti = remainder.findIndex((r) => r.id === targetId);
    if (ti < 0) return;

    // Phase blocks snap to the governing section header so a section is never
    // split by inserting another phase mid-run.
    if (dragRow.phase) {
      while (ti > 0 && !remainder[ti].phase) ti--;
    }
    remainder.splice(ti, 0, ...block);
    mgmt.reorderTasks(remainder);
  }

  function toggleDone(row: MgmtTaskRow) {
    const c = byId[row.id];
    if (!row.done && c) {
      // Capture actual elapsed working days when marking done (§8.2).
      const elapsed = workingDaysInclusive(c._start, iso(new Date()));
      mgmt.patchTask(row.id, { done: true, dur: elapsed > 0 ? elapsed : row.dur });
    } else {
      mgmt.patchTask(row.id, { done: false });
    }
  }

  const editingTask = tasks.find((x) => x.id === editingId) || null;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => mgmt.addPhase()}
          className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          + {t('gantt.addPhase')}
        </button>
        <button
          onClick={() => mgmt.addTask()}
          className="text-xs font-medium bg-primary hover:bg-primary-light text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          + {t('gantt.addTask')}
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex">
          {/* Left label column */}
          <div className="flex-shrink-0 border-r border-gray-200" style={{ width: LABEL_W }}>
            <div className="h-8 border-b border-gray-100 flex items-center px-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
                {t('gantt.taskColumn')}
              </span>
            </div>
            {tasks.map((row) => {
              const c = byId[row.id];
              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(row.id)}
                  className={`flex items-center gap-2 px-2 border-b border-gray-50 ${
                    row.phase ? 'bg-slate-50' : ''
                  }`}
                  style={{ height: ROW_H }}
                >
                  <span className="cursor-grab text-gray-300 select-none" title="Drag to reorder">
                    ⠿
                  </span>
                  <span
                    className={`text-[10px] font-mono w-7 flex-shrink-0 ${
                      c?._crit ? 'text-rose-600' : 'text-gray-400'
                    }`}
                  >
                    {labels[row.id]}
                  </span>
                  {row.phase ? (
                    <input
                      value={row.name}
                      onChange={(e) => mgmt.patchTask(row.id, { name: e.target.value })}
                      placeholder={t('gantt.phaseNamePlaceholder')}
                      className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wide text-gray-700 bg-transparent outline-none"
                    />
                  ) : (
                    <>
                      <input
                        type="checkbox"
                        checked={row.done}
                        onChange={() => toggleDone(row)}
                        title={t('gantt.markDone')}
                        className="flex-shrink-0"
                      />
                      <input
                        value={row.name}
                        onChange={(e) => mgmt.patchTask(row.id, { name: e.target.value })}
                        placeholder={t('gantt.taskNamePlaceholder')}
                        title={row.notes ?? undefined}
                        className={`flex-1 min-w-0 text-xs bg-transparent outline-none ${
                          row.done ? 'line-through text-gray-400' : 'text-gray-700'
                        }`}
                      />
                    </>
                  )}
                  {row.phase ? (
                    <button
                      onClick={() => mgmt.addTask(row.id)}
                      className="text-gray-400 hover:text-primary text-xs px-1"
                      title={t('gantt.addTaskHere')}
                    >
                      ＋
                    </button>
                  ) : (
                    <button
                      onClick={() => setEditingId(row.id)}
                      className="text-gray-400 hover:text-primary text-xs px-1"
                      title={t('gantt.edit')}
                    >
                      ✎
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right timeline */}
          <div className="overflow-x-auto flex-1">
            {/* Axis */}
            <div className="h-8 border-b border-gray-100 relative" style={{ width: timelineW }}>
              {gridlines.map((g, i) => (
                <span
                  key={i}
                  className="absolute top-1.5 text-[9px] font-mono text-gray-400"
                  style={{ left: g.x + 2 }}
                >
                  {g.date}
                </span>
              ))}
            </div>
            {/* Rows + bars + arrows */}
            <div className="relative" style={{ width: timelineW, height: timelineH }}>
              {/* gridlines */}
              {gridlines.map((g, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-gray-50"
                  style={{ left: g.x }}
                />
              ))}
              {/* row separators */}
              {tasks.map((row, i) => (
                <div
                  key={row.id}
                  className={`absolute left-0 border-b border-gray-50 ${row.phase ? 'bg-slate-50/40' : ''}`}
                  style={{ top: i * ROW_H, height: ROW_H, width: timelineW }}
                />
              ))}
              <DependencyArrows
                tasks={tasks}
                positions={positions}
                width={timelineW}
                height={timelineH}
              />
              {tasks.map((row, i) => {
                if (row.phase) return null;
                const c = byId[row.id];
                const pos = positions[row.id];
                if (!c || !pos) return null;
                return (
                  <div
                    key={row.id}
                    className="absolute left-0"
                    style={{ top: i * ROW_H, height: ROW_H, width: timelineW }}
                  >
                    <GanttBar
                      task={c}
                      label={labels[row.id]}
                      left={pos.x0}
                      width={pos.x1 - pos.x0}
                      daypx={DAYPX}
                      onResize={(dur) => mgmt.patchTask(row.id, { dur })}
                      onOpen={() => setEditingId(row.id)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-gray-400">
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-rose-500 align-middle mr-1" />
        {t('gantt.legendCritical')}
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-400 align-middle ml-4 mr-1" />
        {t('gantt.legendSlack')}
      </p>

      {editingTask && (
        <TaskEditorModal
          task={editingTask}
          allTasks={tasks}
          slack={byId[editingTask.id]?._slack ?? 0}
          onPatch={(patch) => mgmt.patchTask(editingTask.id, patch)}
          onDelete={() => {
            mgmt.removeTask(editingTask.id);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
