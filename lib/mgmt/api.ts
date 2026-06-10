// Typed fetch wrappers for the admin-only /mgmt API (MGMT-MODULE-SPEC §6.1).
// Mirrors lib/api.ts conventions but is self-contained: it reads a fresh
// Supabase access token per call rather than going through lib/api.ts's
// token-getter injection, so it has no coupling to that module.

import { supabase } from '@/lib/supabase';
import type {
  BudgetItem,
  MgmtSettings,
  MgmtState,
  MgmtTaskRow,
  Spending,
} from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-e03a.up.railway.app';

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session?.access_token ?? ''}`,
  };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      message = body.message?.message ?? body.message ?? message;
    } catch {
      /* response wasn't JSON */
    }
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }
  // DELETE handlers return a small JSON envelope; everything parses fine.
  return res.json() as Promise<T>;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/mgmt${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  return handle<T>(res);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

export function getState(): Promise<MgmtState> {
  return req<MgmtState>('/state');
}

// ── Tasks ──────────────────────────────────────────────────────────────────────

export type TaskWrite = Partial<
  Pick<MgmtTaskRow, 'id' | 'name' | 'dur' | 'deps' | 'phase' | 'done' | 'critical' | 'notes' | 'sortOrder'>
>;

export function createTask(dto: TaskWrite): Promise<MgmtTaskRow> {
  return req<MgmtTaskRow>('/tasks', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateTask(id: string, dto: TaskWrite): Promise<MgmtTaskRow> {
  return req<MgmtTaskRow>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function deleteTask(id: string): Promise<{ id: string; deleted: boolean }> {
  return req(`/tasks/${id}`, { method: 'DELETE' });
}

export function reorderTasks(items: { id: string; sortOrder: number }[]): Promise<MgmtTaskRow[]> {
  return req<MgmtTaskRow[]>('/tasks/reorder', { method: 'POST', body: JSON.stringify(items) });
}

// ── Budget ───────────────────────────────────────────────────────────────────

export type BudgetWrite = Partial<
  Pick<
    BudgetItem,
    'category' | 'name' | 'planned' | 'actual' | 'vendor' | 'status' | 'phase' | 'notes' | 'sortOrder'
  >
>;

export function createBudgetItem(dto: BudgetWrite): Promise<BudgetItem> {
  return req<BudgetItem>('/budget', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateBudgetItem(id: string, dto: BudgetWrite): Promise<BudgetItem> {
  return req<BudgetItem>(`/budget/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function deleteBudgetItem(id: string): Promise<{ id: string; deleted: boolean }> {
  return req(`/budget/${id}`, { method: 'DELETE' });
}

// ── Spending ─────────────────────────────────────────────────────────────────

export type SpendingWrite = Partial<
  Pick<Spending, 'name' | 'amount' | 'occurredAt' | 'notes' | 'sortOrder'>
>;

export function createSpending(dto: SpendingWrite): Promise<Spending> {
  return req<Spending>('/spending', { method: 'POST', body: JSON.stringify(dto) });
}

export function updateSpending(id: string, dto: SpendingWrite): Promise<Spending> {
  return req<Spending>(`/spending/${id}`, { method: 'PATCH', body: JSON.stringify(dto) });
}

export function deleteSpending(id: string): Promise<{ id: string; deleted: boolean }> {
  return req(`/spending/${id}`, { method: 'DELETE' });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function updateSettings(dto: {
  projectStart?: string | null;
  finance?: Record<string, unknown> | null;
}): Promise<MgmtSettings> {
  return req<MgmtSettings>('/settings', { method: 'PATCH', body: JSON.stringify(dto) });
}
