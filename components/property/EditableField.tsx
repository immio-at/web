'use client';

/**
 * EditableField — generic inline-edit cell for the Property Dossier
 * (ADR-009 DO7).
 *
 * Supports six kinds: number, integer, text, date, boolean, enum.
 * - Click the value to enter edit mode
 * - Enter or blur → commit (calls onSave with the typed new value)
 * - Escape → cancel
 *
 * The component is purely presentational — it does not know about the
 * Dossier API. The parent provides onSave and is responsible for the
 * actual PATCH call + optimistic local update.
 *
 * Empty draft strings always commit as null (clears the field).
 */

import { useEffect, useRef, useState } from 'react';

export type FieldKind = 'number' | 'integer' | 'text' | 'date' | 'boolean' | 'enum';

interface Props {
  kind: FieldKind;
  value: unknown;
  /** Pre-formatted display string shown in non-edit mode (e.g. "€ 250.000"). */
  display: string;
  /** Called with the typed new value when the user commits an edit. */
  onSave: (next: unknown) => void | Promise<void>;
  /** Required for kind === 'enum'. Plain string options — labels are looked up in i18n by the parent if needed. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Render the value as italic grey when null/empty (for "—" placeholders). */
  emptyAsPlaceholder?: boolean;
}

export default function EditableField({
  kind,
  value,
  display,
  onSave,
  options = [],
  placeholder,
  emptyAsPlaceholder = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  // Track whether the user pressed Escape so the blur handler can skip the
  // commit. Without this, Escape → blur fires first and Escape never wins.
  const cancelledRef = useRef(false);

  function startEditing() {
    if (saving) return;
    cancelledRef.current = false;
    if (value === null || value === undefined || value === '') {
      setDraft('');
    } else if (kind === 'date') {
      const d = new Date(value as string);
      setDraft(isNaN(d.getTime()) ? '' : d.toISOString().substring(0, 10));
    } else if (kind === 'boolean') {
      setDraft(value ? 'true' : 'false');
    } else {
      setDraft(String(value));
    }
    setEditing(true);
  }

  // Focus + select-all on enter edit mode
  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if ('select' in el && typeof (el as HTMLInputElement).select === 'function') {
      (el as HTMLInputElement).select();
    }
  }, [editing]);

  function coerceDraft(): unknown {
    if (draft === '') return null;
    if (kind === 'number') {
      const n = parseFloat(draft.replace(',', '.'));
      return isNaN(n) ? null : n;
    }
    if (kind === 'integer') {
      const n = parseInt(draft, 10);
      return isNaN(n) ? null : n;
    }
    if (kind === 'boolean') {
      return draft === 'true' ? true : draft === 'false' ? false : null;
    }
    // text, date, enum — pass through as string
    return draft;
  }

  async function commit() {
    if (cancelledRef.current || saving) return;
    const next = coerceDraft();
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Parent surfaces the error — leave the input open so the user can retry
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    cancelledRef.current = true;
    setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  if (!editing) {
    const isEmpty = value === null || value === undefined || value === '';
    const cls = `text-left rounded -mx-1 px-1 py-0 transition-colors hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 ${
      emptyAsPlaceholder && isEmpty ? 'text-gray-300 italic' : 'text-gray-900'
    }`;
    // onFocus opens the input so Tab-traversing the modal flips each
    // EditableField into edit mode automatically — the user types,
    // Tabs to the next, types, Tabs again, without having to click
    // each field. Click + onFocus both call startEditing; the function
    // is idempotent so the doubled call on mouse-click is a no-op.
    return (
      <button
        onClick={startEditing}
        onFocus={startEditing}
        title="Click to edit"
        className={cls}
      >
        {display}
      </button>
    );
  }

  // ── Edit-mode renderers ────────────────────────────────────────────────
  const baseInputClass = 'border border-blue-400 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50';

  if (kind === 'enum') {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        disabled={saving}
        className={`${baseInputClass} min-w-[100px]`}
      >
        <option value="">—</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (kind === 'boolean') {
    return (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        disabled={saving}
        className={`${baseInputClass} min-w-[60px]`}
      >
        <option value="">—</option>
        <option value="true">Ja</option>
        <option value="false">Nein</option>
      </select>
    );
  }

  const inputType =
    kind === 'date' ? 'date' :
    kind === 'number' || kind === 'integer' ? 'number' :
    'text';

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={inputType}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      disabled={saving}
      placeholder={placeholder}
      step={kind === 'number' ? 'any' : kind === 'integer' ? '1' : undefined}
      className={`${baseInputClass} ${kind === 'number' || kind === 'integer' ? 'w-24 text-right' : 'w-40'}`}
    />
  );
}
