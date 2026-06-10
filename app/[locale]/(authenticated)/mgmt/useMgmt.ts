'use client';

// Central state, debounced autosave and realtime-merge for /mgmt
// (MGMT-MODULE-SPEC §8.1 / §8.5). Owns tasks / budget / spending / settings,
// exposes optimistic mutators, flushes dirty patches ~600ms after the last
// edit, and merges realtime change events while ignoring locally-dirty rows.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '@/lib/mgmt/api';
import { useMgmtRealtime, type MgmtChange } from '@/lib/mgmt/realtime';
import { nextMonday } from '@/lib/mgmt/workdays';
import type {
  BudgetItem,
  MgmtSettings,
  MgmtState,
  MgmtTaskRow,
  Spending,
} from '@/lib/mgmt/types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Kind = 'task' | 'budget' | 'spending' | 'settings';
interface PendingOp {
  kind: Kind;
  id: string;
  patch: Record<string, unknown>;
}

// How long after a local edit a realtime event for the same row is ignored
// (avoids clobbering an in-flight edit before/around the debounced flush).
const TOUCH_TTL_MS = 4000;
const FLUSH_MS = 600;

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `t-${Math.random().toString(36).slice(2)}`;
}

function blankTask(id: string, phase: boolean, sortOrder: number): MgmtTaskRow {
  return {
    id,
    name: '',
    dur: 0,
    deps: [],
    phase,
    done: false,
    critical: false,
    notes: null,
    sortOrder,
    createdAt: '',
    updatedAt: '',
    updatedBy: null,
  };
}

export function useMgmt(enabled: boolean) {
  const [tasks, setTasks] = useState<MgmtTaskRow[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [spending, setSpending] = useState<Spending[]>([]);
  const [settings, setSettings] = useState<MgmtSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Refs mirror latest state for async handlers (drag/reorder, seeding).
  const tasksRef = useRef(tasks);
  useEffect(() => void (tasksRef.current = tasks), [tasks]);
  const budgetItemsRef = useRef(budgetItems);
  useEffect(() => void (budgetItemsRef.current = budgetItems), [budgetItems]);
  const spendingRef = useRef(spending);
  useEffect(() => void (spendingRef.current = spending), [spending]);

  // Debounce + dirty-guard machinery.
  const pending = useRef<Map<string, PendingOp>>(new Map());
  const touch = useRef<Map<string, number>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markTouched = (key: string) => touch.current.set(key, Date.now());

  const dispatchOp = useCallback(async (op: PendingOp) => {
    if (op.kind === 'task') return api.updateTask(op.id, op.patch);
    if (op.kind === 'budget') return api.updateBudgetItem(op.id, op.patch);
    if (op.kind === 'spending') return api.updateSpending(op.id, op.patch);
    return api.updateSettings(op.patch);
  }, []);

  const flush = useCallback(async () => {
    const ops = [...pending.current.values()];
    pending.current.clear();
    if (!ops.length) return;
    setSaveState('saving');
    try {
      await Promise.all(ops.map((op) => dispatchOp(op)));
      // Refresh the touch window so the echo of our own write doesn't clobber.
      ops.forEach((op) => markTouched(`${op.kind}:${op.id}`));
      setSaveState('saved');
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      console.error('[mgmt] autosave flush failed', e);
      setSaveState('error');
    }
  }, [dispatchOp]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, FLUSH_MS);
  }, [flush]);

  // Queue a partial patch under a stable key, merging successive edits.
  const queue = useCallback(
    (kind: Kind, id: string, patch: Record<string, unknown>) => {
      const key = `${kind}:${id}`;
      markTouched(key);
      const existing = pending.current.get(key);
      pending.current.set(key, { kind, id, patch: { ...existing?.patch, ...patch } });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  // ── Initial load + seed ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state: MgmtState = await api.getState();
      let nextSettings = state.settings;

      // The mgmt_* tables are seeded server-side by the migration (§9), so there
      // is no client-side seeding here. Bootstrap projectStart to next Monday if
      // it's still unset (§8.1).
      if (nextSettings && !nextSettings.projectStart) {
        const ps = nextMonday(new Date());
        nextSettings = await api.updateSettings({ projectStart: ps });
      }

      setTasks([...state.tasks].sort((a, b) => a.sortOrder - b.sortOrder));
      setBudgetItems([...state.budgetItems].sort((a, b) => a.sortOrder - b.sortOrder));
      setSpending([...state.spending].sort((a, b) => a.sortOrder - b.sortOrder));
      setSettings(nextSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  // ── Realtime merge (ignores locally-dirty / recently-touched rows) ──────────
  const onRealtime = useCallback((c: MgmtChange) => {
    const idStr = String((c.row as { id?: unknown })?.id ?? c.oldRow?.id ?? '');
    const kind: Kind =
      c.table === 'mgmt_task'
        ? 'task'
        : c.table === 'mgmt_budget_item'
          ? 'budget'
          : c.table === 'mgmt_spending'
            ? 'spending'
            : 'settings';
    const key = `${kind}:${idStr}`;
    if (pending.current.has(key)) return;
    const t = touch.current.get(key);
    if (t && Date.now() - t < TOUCH_TTL_MS) return;

    const upsert = <T extends { id: string; sortOrder: number }>(arr: T[], row: T): T[] => {
      const i = arr.findIndex((x) => x.id === row.id);
      const next = i >= 0 ? arr.map((x) => (x.id === row.id ? row : x)) : [...arr, row];
      return next.sort((a, b) => a.sortOrder - b.sortOrder);
    };

    if (c.table === 'mgmt_settings') {
      if (c.row) setSettings(c.row as MgmtSettings);
      return;
    }
    if (c.eventType === 'DELETE') {
      if (kind === 'task') setTasks((p) => p.filter((x) => x.id !== idStr));
      if (kind === 'budget') setBudgetItems((p) => p.filter((x) => x.id !== idStr));
      if (kind === 'spending') setSpending((p) => p.filter((x) => x.id !== idStr));
      return;
    }
    if (!c.row) return;
    if (kind === 'task') setTasks((p) => upsert(p, c.row as MgmtTaskRow));
    if (kind === 'budget') setBudgetItems((p) => upsert(p, c.row as BudgetItem));
    if (kind === 'spending') setSpending((p) => upsert(p, c.row as Spending));
  }, []);

  useMgmtRealtime({ onChange: onRealtime, onFocus: () => void load(), enabled });

  // ── Task mutators ───────────────────────────────────────────────────────────

  const patchTask = useCallback(
    (id: string, patch: Partial<MgmtTaskRow>) => {
      setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      queue('task', id, patch as Record<string, unknown>);
    },
    [queue],
  );

  const persistOrder = useCallback(async (ordered: MgmtTaskRow[]) => {
    ordered.forEach((t) => markTouched(`task:${t.id}`));
    try {
      setSaveState('saving');
      await api.reorderTasks(ordered.map((t, i) => ({ id: t.id, sortOrder: i })));
      setSaveState('saved');
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      console.error('[mgmt] reorder failed', e);
      setSaveState('error');
    }
  }, []);

  const reorderTasks = useCallback(
    (ordered: MgmtTaskRow[]) => {
      const withOrder = ordered.map((t, i) => ({ ...t, sortOrder: i }));
      setTasks(withOrder);
      void persistOrder(withOrder);
    },
    [persistOrder],
  );

  // Insert a new task/phase row immediately after `afterId` (or at the end).
  const insertRow = useCallback(
    async (afterId: string | null, phase: boolean) => {
      const id = genId();
      const arr = [...tasksRef.current];
      const idx = afterId ? arr.findIndex((t) => t.id === afterId) : arr.length - 1;
      const row = blankTask(id, phase, 0);
      arr.splice(idx + 1, 0, row);
      const withOrder = arr.map((t, i) => ({ ...t, sortOrder: i }));
      setTasks(withOrder);
      markTouched(`task:${id}`);
      try {
        setSaveState('saving');
        await api.createTask({ id, name: '', dur: 0, deps: [], phase, sortOrder: withOrder.findIndex((t) => t.id === id) });
        await api.reorderTasks(withOrder.map((t, i) => ({ id: t.id, sortOrder: i })));
        setSaveState('saved');
        savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
      } catch (e) {
        console.error('[mgmt] insertRow failed', e);
        setSaveState('error');
      }
      return id;
    },
    [],
  );

  const addTask = useCallback((afterId?: string) => insertRow(afterId ?? null, false), [insertRow]);
  const addPhase = useCallback(() => insertRow(null, true), [insertRow]);

  const removeTask = useCallback((id: string) => {
    // Optimistic: drop the row and strip it from every other task's deps.
    setTasks((p) =>
      p
        .filter((t) => t.id !== id)
        .map((t) => (t.deps.includes(id) ? { ...t, deps: t.deps.filter((d) => d !== id) } : t)),
    );
    markTouched(`task:${id}`);
    void api.deleteTask(id).catch((e) => console.error('[mgmt] deleteTask failed', e));
  }, []);

  // ── Budget mutators ─────────────────────────────────────────────────────────

  const patchBudget = useCallback(
    (id: string, patch: Partial<BudgetItem>) => {
      setBudgetItems((p) => p.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      queue('budget', id, patch as Record<string, unknown>);
    },
    [queue],
  );

  const addBudgetItem = useCallback(async (category: string) => {
    markTouched('budget:new');
    try {
      setSaveState('saving');
      const sortOrder = budgetItemsRef.current.length;
      const created = await api.createBudgetItem({ category, name: '', planned: 0, actual: 0, status: 'todo', sortOrder });
      markTouched(`budget:${created.id}`);
      setBudgetItems((p) => [...p, created]);
      setSaveState('saved');
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      console.error('[mgmt] addBudgetItem failed', e);
      setSaveState('error');
    }
  }, []);

  const removeBudgetItem = useCallback((id: string) => {
    setBudgetItems((p) => p.filter((b) => b.id !== id));
    markTouched(`budget:${id}`);
    void api.deleteBudgetItem(id).catch((e) => console.error('[mgmt] deleteBudgetItem failed', e));
  }, []);

  // ── Spending mutators ───────────────────────────────────────────────────────

  const patchSpending = useCallback(
    (id: string, patch: Partial<Spending>) => {
      setSpending((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      queue('spending', id, patch as Record<string, unknown>);
    },
    [queue],
  );

  const addSpending = useCallback(async () => {
    try {
      setSaveState('saving');
      const sortOrder = spendingRef.current.length;
      const created = await api.createSpending({ name: '', amount: 0, sortOrder });
      markTouched(`spending:${created.id}`);
      setSpending((p) => [...p, created]);
      setSaveState('saved');
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1500);
    } catch (e) {
      console.error('[mgmt] addSpending failed', e);
      setSaveState('error');
    }
  }, []);

  const removeSpending = useCallback((id: string) => {
    setSpending((p) => p.filter((s) => s.id !== id));
    markTouched(`spending:${id}`);
    void api.deleteSpending(id).catch((e) => console.error('[mgmt] deleteSpending failed', e));
  }, []);

  // ── Settings mutators ───────────────────────────────────────────────────────

  const patchSettings = useCallback(
    (patch: { projectStart?: string | null; finance?: Record<string, unknown> | null }) => {
      setSettings((s) => (s ? { ...s, ...patch } as MgmtSettings : s));
      queue('settings', '1', patch as Record<string, unknown>);
    },
    [queue],
  );

  return {
    tasks,
    budgetItems,
    spending,
    settings,
    loading,
    error,
    saveState,
    reload: load,
    // tasks
    patchTask,
    addTask,
    addPhase,
    removeTask,
    reorderTasks,
    // budget
    patchBudget,
    addBudgetItem,
    removeBudgetItem,
    // spending
    patchSpending,
    addSpending,
    removeSpending,
    // settings
    patchSettings,
  };
}

export type UseMgmt = ReturnType<typeof useMgmt>;
