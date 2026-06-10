import { describe, it, expect } from 'vitest';
import { compute, computeLabels, Task } from './cpm';
import { addWorkingDays, nextMonday, parse, workingDaysInclusive } from './workdays';

// Regression guards for the verbatim bimmorang port (MGMT-MODULE-SPEC §7.3).
// If any of these break, the schedule math has drifted from production.

function task(id: string, dur: number, deps: string[] = [], extra: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    dur,
    deps,
    phase: false,
    done: false,
    critical: false,
    sortOrder: 0,
    ...extra,
  };
}

// A guaranteed Monday to anchor the calendar-date assertions without hardcoding
// which arbitrary date happens to be a Monday.
const MON = nextMonday(new Date(2026, 5, 1)); // June 2026

describe('cpm.compute — linear chain', () => {
  it('ES/EF accumulate down the chain', () => {
    const { real, projEnd } = compute(
      [task('A', 3), task('B', 2, ['A']), task('C', 4, ['B'])],
      MON,
    );
    const byId = Object.fromEntries(real.map((t) => [t.id, t]));
    expect([byId.A._es, byId.A._ef]).toEqual([0, 3]);
    expect([byId.B._es, byId.B._ef]).toEqual([3, 5]);
    expect([byId.C._es, byId.C._ef]).toEqual([5, 9]);
    expect(projEnd).toBe(9);
    // A single chain is entirely critical (zero slack throughout).
    expect(real.every((t) => t._crit)).toBe(true);
  });
});

describe('cpm.compute — diamond', () => {
  // A→B→D and A→C→D. The longer path (via B) is critical; the shorter (via C)
  // carries positive slack.
  const tasks = [
    task('A', 2),
    task('B', 5, ['A']),
    task('C', 2, ['A']),
    task('D', 3, ['B', 'C']),
  ];

  it('the longer path is critical, the shorter has positive slack', () => {
    const { real, projEnd } = compute(tasks, MON);
    const byId = Object.fromEntries(real.map((t) => [t.id, t]));
    expect(projEnd).toBe(10);
    expect(byId.A._crit).toBe(true);
    expect(byId.B._crit).toBe(true);
    expect(byId.D._crit).toBe(true);
    expect(byId.C._crit).toBe(false);
    expect(byId.C._slack).toBe(3);
  });

  it('the manual critical flag forces _crit on an otherwise-slack task', () => {
    const forced = tasks.map((t) => (t.id === 'C' ? { ...t, critical: true } : t));
    const { real } = compute(forced, MON);
    const c = real.find((t) => t.id === 'C')!;
    expect(c._slack).toBe(3); // still has slack…
    expect(c._crit).toBe(true); // …but is force-marked critical
  });
});

describe('cpm.compute — phases are display-only', () => {
  it('phase rows are excluded from the CPM graph', () => {
    const { real } = compute(
      [task('P', 0, [], { phase: true }), task('A', 3), task('B', 2, ['A'])],
      MON,
    );
    expect(real.map((t) => t.id)).toEqual(['A', 'B']);
  });
});

describe('cpm.compute — calendar dates land on weekdays', () => {
  it('a task at ES 0 starts on projStart; ES 5 lands the next Monday', () => {
    const { real } = compute([task('A', 5), task('B', 3, ['A'])], MON);
    const byId = Object.fromEntries(real.map((t) => [t.id, t]));
    // A starts on the Monday projStart.
    expect(byId.A._start).toBe(MON);
    // B starts 5 working days later → exactly one week on, i.e. a Monday again.
    expect(byId.B._start).toBe(addWorkingDays(MON, 5));
    expect(parse(byId.B._start).getDay()).toBe(1); // Monday
    // No computed date falls on a weekend.
    for (const t of real) {
      expect(parse(t._start).getDay()).not.toBe(0);
      expect(parse(t._start).getDay()).not.toBe(6);
    }
  });
});

describe('workdays.addWorkingDays — skips weekends', () => {
  it('one working day after a Friday is the following Monday', () => {
    const friday = addWorkingDays(MON, 4); // Mon +4 = Fri
    expect(parse(friday).getDay()).toBe(5);
    const next = addWorkingDays(friday, 1);
    expect(parse(next).getDay()).toBe(1); // Monday, not Saturday
  });
});

describe('workdays.workingDaysInclusive', () => {
  it('counts Mon..Fri inclusive as 5 and ignores the weekend', () => {
    const fri = addWorkingDays(MON, 4);
    expect(workingDaysInclusive(MON, fri)).toBe(5);
    // Through the following Monday spans a weekend but adds only one workday.
    const nextMon = addWorkingDays(fri, 1);
    expect(workingDaysInclusive(MON, nextMon)).toBe(6);
  });

  it('returns 0 when end is before start', () => {
    const fri = addWorkingDays(MON, 4);
    expect(workingDaysInclusive(fri, MON)).toBe(0);
  });
});

describe('computeLabels', () => {
  it('assigns a letter per phase and an incrementing number per task', () => {
    const rows = [
      task('P1', 0, [], { phase: true }),
      task('a', 1),
      task('b', 1),
      task('P2', 0, [], { phase: true }),
      task('c', 1),
    ];
    expect(computeLabels(rows)).toEqual({
      P1: 'A.',
      a: 'A1',
      b: 'A2',
      P2: 'B.',
      c: 'B1',
    });
  });
});
