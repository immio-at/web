// Working-day (Mon–Fri) date math — ported VERBATIM from bimmorang
// (MGMT-MODULE-SPEC §7.1). Do not "improve" it; reproduce it. The CPM engine
// and the Gantt renderer both key off these functions.

// Local YYYY-MM-DD (never toISOString — that converts to UTC and rolls the date
// back a day for users east of UTC, e.g. Vienna).
export function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export function parse(s: string): Date {
  const [y, m, da] = s.split('-').map(Number);
  return new Date(y, m - 1, da);
}

// Next Monday on/after d (Sat/Sun roll forward).
export function nextMonday(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  const add = day === 0 ? 1 : day === 6 ? 2 : 0;
  x.setDate(x.getDate() + add);
  return iso(x);
}

// Add n working days (skip Sat/Sun).
export function addWorkingDays(startISO: string, n: number): string {
  const d = parse(startISO);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return iso(d);
}

// Inclusive working-day count start..end (both ends). Used when marking a task
// done to capture real elapsed duration.
export function workingDaysInclusive(startISO: string, endISO: string): number {
  const start = parse(startISO),
    end = parse(endISO);
  if (end < start) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export function calIdx(dISO: string, startISO: string): number {
  return Math.round((parse(dISO).getTime() - parse(startISO).getTime()) / 86400000);
}
