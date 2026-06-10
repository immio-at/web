// PLACEHOLDER scaffold (MGMT-MODULE-SPEC §9). bimmorang's fix-and-flip seed is
// deleted; this is a THIN SaaS delivery skeleton so the tool isn't empty on
// first load. Durations, dependencies and budget categories are ILLUSTRATIVE —
// Reece owns the real content (§12.2). Do NOT present these as a real plan.
//
// The page seeds this once, only when GET /mgmt/state returns zero tasks AND
// zero budget items. After that the tool is user-driven.

import type { BudgetWrite, TaskWrite } from './api';

// PLACEHOLDER — replace with real plan.
export const SEED_TASKS: Required<Pick<TaskWrite, 'id' | 'name' | 'dur' | 'deps' | 'phase'>>[] = [
  { id: 'DISC', name: 'DISCOVERY & SCOPE', dur: 0, deps: [], phase: true },
  { id: 'scope', name: 'Lock launch scope / cut-list', dur: 5, deps: [], phase: false },
  { id: 'BUILD', name: 'BUILD', dur: 0, deps: [], phase: true },
  { id: 'core', name: 'Core feature hardening', dur: 15, deps: ['scope'], phase: false },
  { id: 'billing', name: 'Billing / subscription tier work', dur: 10, deps: ['scope'], phase: false },
  { id: 'STAB', name: 'STABILISE', dur: 0, deps: [], phase: true },
  { id: 'qa', name: 'QA / e2e pass', dur: 8, deps: ['core', 'billing'], phase: false },
  { id: 'beta', name: 'Closed beta + fixes', dur: 10, deps: ['qa'], phase: false },
  { id: 'LAUNCH', name: 'LAUNCH', dur: 0, deps: [], phase: true },
  { id: 'legal', name: 'Legal / Impressum / Datenschutz sign-off', dur: 4, deps: ['beta'], phase: false },
  { id: 'golive', name: 'Public launch', dur: 2, deps: ['beta', 'legal'], phase: false },
];

// PLACEHOLDER — amounts 0, Reece fills in (§9).
export const SEED_BUDGET_CATEGORIES: string[] = [
  'Infrastructure / Hosting (Railway, Supabase)',
  'Third-party APIs (scrapers, email, AI)',
  'Domain / SSL',
  'Legal / Compliance',
  'Design / Branding',
  'Marketing / Launch',
  'Contingency',
];

export function buildSeedTasks(): TaskWrite[] {
  return SEED_TASKS.map((t, i) => ({ ...t, sortOrder: i }));
}

export function buildSeedBudgetItems(): BudgetWrite[] {
  return SEED_BUDGET_CATEGORIES.map((category, i) => ({
    category,
    name: '',
    planned: 0,
    actual: 0,
    status: 'todo',
    sortOrder: i,
  }));
}
