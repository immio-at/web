// Critical-Path-Method engine — ported VERBATIM from bimmorang
// (MGMT-MODULE-SPEC §7.2). Pure, framework-free, unit-tested in cpm.test.ts.
// Standard CPM: topo-sort (DFS over deps), forward pass (ES/EF), backward pass
// (LS/LF), slack, critical = slack<=0 OR manual flag. Do not "improve" it.

import { addWorkingDays } from './workdays';

export interface Task {
  id: string;
  name: string;
  dur: number;
  deps: string[];
  phase: boolean;
  done: boolean;
  critical: boolean;
  sortOrder: number;
}

export interface Computed extends Task {
  _es: number;
  _ef: number;
  _ls: number;
  _lf: number;
  _slack: number;
  _crit: boolean;
  _start: string;
  _end: string;
}

export function compute(
  tasks: Task[],
  projStart: string,
): { real: Computed[]; projEnd: number } {
  const real = tasks.filter((t) => !t.phase) as Computed[]; // phases are display-only headers
  const byId: Record<string, Computed> = {};
  real.forEach((t) => (byId[t.id] = t));

  // Topological order via DFS on dependencies.
  const order: Computed[] = [];
  const seen: Record<string, 1> = {};
  function visit(t: Computed) {
    if (seen[t.id]) return;
    seen[t.id] = 1;
    (t.deps || []).forEach((d) => byId[d] && visit(byId[d]));
    order.push(t);
  }
  real.forEach(visit);

  // Forward pass.
  order.forEach((t) => {
    let es = 0;
    (t.deps || []).forEach((d) => {
      if (byId[d]) es = Math.max(es, byId[d]._ef);
    });
    t._es = es;
    t._ef = es + t.dur; // done tasks keep their stored dur = actual elapsed time
  });

  const projEnd = Math.max(0, ...real.map((t) => t._ef));

  // Backward pass.
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    const successors = real.filter((s) => (s.deps || []).includes(t.id));
    const lf = successors.length ? Math.min(...successors.map((s) => s._ls)) : projEnd;
    t._lf = lf;
    t._ls = lf - t.dur;
    t._slack = t._ls - t._es;
    t._crit = t._slack <= 0 || !!t.critical;
  }

  // Working-day calendar dates.
  real.forEach((t) => {
    t._start = addWorkingDays(projStart, t._es);
    t._end = t.dur > 0 ? addWorkingDays(projStart, t._ef) : t._start;
  });

  return { real, projEnd };
}

// Presentation-only display labels (A. PHASE, A1 task, A2 task, B. PHASE …).
// Keyed off row order: a letter per phase row, a number incrementing per task
// row under it. The DB + CPM still key on `id` (§7.2 note). `rows` must be in
// sortOrder. Tasks appearing before any phase row get a bare numeric label.
export function computeLabels(rows: Task[]): Record<string, string> {
  const labels: Record<string, string> = {};
  let phaseIdx = -1; // -1 = no phase seen yet
  let taskNum = 0;
  for (const row of rows) {
    if (row.phase) {
      phaseIdx++;
      taskNum = 0;
      labels[row.id] = `${String.fromCharCode(65 + phaseIdx)}.`;
    } else {
      taskNum++;
      const letter = phaseIdx >= 0 ? String.fromCharCode(65 + phaseIdx) : '';
      labels[row.id] = `${letter}${taskNum}`;
    }
  }
  return labels;
}
