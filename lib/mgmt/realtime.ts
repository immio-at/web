'use client';

// Supabase Realtime subscription for the four mgmt_* tables
// (MGMT-MODULE-SPEC §8.5). One channel, four postgres_changes listeners, event
// '*'. The browser uses the anon key purely for change notifications; all
// writes still go through the admin-gated NestJS API. Also re-fetches on window
// focus (bimmorang's window 'focus' → reloadAll).
//
// Realtime payloads carry the raw DB column names (snake_case, Decimals as
// strings). We normalise each row to the camelCase app shape so the page can
// merge realtime rows and API rows interchangeably.

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { BudgetItem, MgmtSettings, MgmtTaskRow, Spending } from './types';

export type MgmtTable =
  | 'mgmt_task'
  | 'mgmt_budget_item'
  | 'mgmt_settings'
  | 'mgmt_spending';

export type MgmtEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface MgmtChange {
  table: MgmtTable;
  eventType: MgmtEvent;
  // Normalised app-shaped row (null for DELETE). `id` is always present on
  // oldRow so the page can drop the row from state.
  row: MgmtTaskRow | BudgetItem | Spending | MgmtSettings | null;
  oldRow: { id?: string | number } | null;
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v == null ? 0 : Number(v));

function normTask(r: Raw): MgmtTaskRow {
  return {
    id: String(r.id),
    name: (r.name as string) ?? '',
    dur: num(r.dur),
    deps: Array.isArray(r.deps) ? (r.deps as string[]) : [],
    phase: !!r.phase,
    done: !!r.done,
    critical: !!r.critical,
    notes: (r.notes as string) ?? null,
    sortOrder: num(r.sort_order),
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
    updatedBy: (r.updated_by as string) ?? null,
  };
}

function normBudget(r: Raw): BudgetItem {
  return {
    id: String(r.id),
    category: (r.category as string) ?? '',
    name: (r.name as string) ?? '',
    planned: num(r.planned),
    actual: num(r.actual),
    vendor: (r.vendor as string) ?? null,
    status: ((r.status as string) ?? 'todo') as BudgetItem['status'],
    phase: (r.phase as string) ?? null,
    notes: (r.notes as string) ?? null,
    sortOrder: num(r.sort_order),
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
    updatedBy: (r.updated_by as string) ?? null,
  };
}

function normSpending(r: Raw): Spending {
  return {
    id: String(r.id),
    name: (r.name as string) ?? '',
    amount: num(r.amount),
    occurredAt: (r.occurred_at as string) ?? null,
    notes: (r.notes as string) ?? null,
    sortOrder: num(r.sort_order),
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
    updatedBy: (r.updated_by as string) ?? null,
  };
}

function normSettings(r: Raw): MgmtSettings {
  return {
    id: num(r.id),
    projectStart: (r.project_start as string) ?? null,
    finance: (r.finance as MgmtSettings['finance']) ?? null,
    createdAt: (r.created_at as string) ?? '',
    updatedAt: (r.updated_at as string) ?? '',
  };
}

function normalise(table: MgmtTable, r: Raw | null): MgmtChange['row'] {
  if (!r || Object.keys(r).length === 0) return null;
  switch (table) {
    case 'mgmt_task':
      return normTask(r);
    case 'mgmt_budget_item':
      return normBudget(r);
    case 'mgmt_spending':
      return normSpending(r);
    case 'mgmt_settings':
      return normSettings(r);
  }
}

const TABLES: MgmtTable[] = ['mgmt_task', 'mgmt_budget_item', 'mgmt_settings', 'mgmt_spending'];

export function useMgmtRealtime(handlers: {
  onChange: (change: MgmtChange) => void;
  onFocus?: () => void;
  enabled?: boolean;
}): void {
  const { onChange, onFocus, enabled = true } = handlers;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel('mgmt-realtime');
    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: { eventType: MgmtEvent; new: Raw; old: Raw }) => {
          onChange({
            table,
            eventType: payload.eventType,
            row: payload.eventType === 'DELETE' ? null : normalise(table, payload.new),
            oldRow: (payload.old as { id?: string | number }) ?? null,
          });
        },
      );
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // onChange identity is owned by the caller; we intentionally subscribe once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !onFocus) return;
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
