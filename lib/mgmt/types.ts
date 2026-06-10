// Shared types for the /mgmt module (MGMT-MODULE-SPEC §3). The Task type for
// the CPM engine lives in cpm.ts; these mirror the backend Prisma models and
// the GET /mgmt/state envelope.

import type { Task } from './cpm';

export type { Task } from './cpm';

export type BudgetStatus = 'todo' | 'quoted' | 'ordered' | 'paid';

export interface BudgetItem {
  id: string;
  category: string;
  name: string;
  planned: number;
  actual: number;
  vendor: string | null;
  status: BudgetStatus;
  phase: string | null; // soft text tag = a phase row's name (NOT a FK)
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface Spending {
  id: string;
  name: string;
  amount: number;
  occurredAt: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Free-form SaaS finance block persisted in mgmt_settings.finance (§8.6).
// All fields optional + extensible — Reece can add MRR/CAC/funding later
// without a migration.
export interface Finance {
  capitalAvailable?: number; // total cash/runway committed to the project
  monthlyBurn?: number; // average monthly spend
  targetLaunch?: string; // milestone label, e.g. "2026-Q4"
  notes?: string;
  [key: string]: unknown;
}

export interface MgmtSettings {
  id: number;
  projectStart: string | null;
  finance: Finance | null;
  createdAt: string;
  updatedAt: string;
}

// Full bootstrap payload from GET /mgmt/state. Tasks carry the persisted DB
// shape (a superset of the CPM Task — extra audit fields are ignored by the
// engine).
export interface MgmtTaskRow extends Task {
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

export interface MgmtState {
  tasks: MgmtTaskRow[];
  budgetItems: BudgetItem[];
  spending: Spending[];
  settings: MgmtSettings | null;
}
