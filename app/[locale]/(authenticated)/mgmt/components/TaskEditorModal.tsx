'use client';

// Task editor (MGMT-MODULE-SPEC §8.3 — port openEditTask/configureModalFields/
// relations). Edit name, duration, dependencies (multi-select of other tasks,
// cycle-prevented), manual-critical flag, delete. Shows computed slack
// read-only. Edits flow through onPatch → the parent's debounced autosave.

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MgmtTaskRow } from '@/lib/mgmt/types';
import type { TaskWrite } from '@/lib/mgmt/api';

// Would adding `candidateDep` as a dependency of `taskId` create a cycle? It
// would iff taskId is reachable from candidateDep following deps edges.
function wouldCycle(taskId: string, candidateDep: string, tasks: MgmtTaskRow[]): boolean {
  if (taskId === candidateDep) return true;
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const stack = [candidateDep];
  const seen = new Set<string>();
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of byId[cur]?.deps || []) stack.push(d);
  }
  return false;
}

export default function TaskEditorModal({
  task,
  allTasks,
  slack,
  onPatch,
  onDelete,
  onClose,
}: {
  task: MgmtTaskRow;
  allTasks: MgmtTaskRow[];
  slack: number;
  onPatch: (patch: TaskWrite) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('mgmt');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Eligible dependencies: every other non-phase task that wouldn't form a cycle.
  const candidates = allTasks.filter(
    (x) => x.id !== task.id && !x.phase && (task.deps.includes(x.id) || !wouldCycle(task.id, x.id, allTasks)),
  );

  function toggleDep(depId: string) {
    const deps = task.deps.includes(depId)
      ? task.deps.filter((d) => d !== depId)
      : [...task.deps, depId];
    onPatch({ deps });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-medium text-primary">
            {task.phase ? t('editor.titlePhase') : t('editor.titleTask')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
              {t('editor.name')}
            </span>
            <input
              value={task.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {/* Notes / source tag (e.g. "P3 / TD2") */}
          <label className="block">
            <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
              {t('editor.notes')}
            </span>
            <input
              value={task.notes ?? ''}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder={t('editor.notesPlaceholder')}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {!task.phase && (
            <>
              {/* Duration */}
              <label className="block">
                <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
                  {t('editor.duration')}
                </span>
                <input
                  type="number"
                  min={0}
                  value={task.dur}
                  onChange={(e) => onPatch({ dur: Math.max(0, Number(e.target.value) || 0) })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>

              {/* Computed slack (read-only) */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
                  {t('editor.slack')}
                </span>
                <span className={`font-mono ${slack <= 0 ? 'text-rose-600' : 'text-gray-600'}`}>
                  {slack} {t('editor.days')}
                </span>
              </div>

              {/* Manual critical flag */}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={task.critical}
                  onChange={(e) => onPatch({ critical: e.target.checked })}
                />
                {t('editor.forceCritical')}
              </label>

              {/* Dependencies */}
              <div>
                <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
                  {t('editor.dependencies')}
                </span>
                <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                  {candidates.length === 0 && (
                    <p className="text-xs text-gray-400 px-3 py-2">{t('editor.noDependencies')}</p>
                  )}
                  {candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={task.deps.includes(c.id)}
                        onChange={() => toggleDep(c.id)}
                      />
                      <span className="truncate">{c.name || c.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('editor.confirmDelete')}</span>
              <button onClick={onDelete} className="text-xs font-medium text-red-600 hover:text-red-800">
                {t('editor.delete')}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400 hover:text-gray-600">
                {t('editor.cancel')}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs font-medium text-red-500 hover:text-red-700"
            >
              {t('editor.delete')}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-sm font-medium bg-primary hover:bg-primary-light text-white px-4 py-1.5 rounded-lg"
          >
            {t('editor.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
