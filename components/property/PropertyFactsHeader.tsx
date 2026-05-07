'use client';

/**
 * PropertyFactsHeader (ADR-017) — chip section in the modal shell.
 *
 * Renders inline-wrapping chips for every populated property fact
 * (Baujahr, Bauart, HWB class/value, condition, floor, amenities,
 * address). A `+ hinzu` button opens a popover dropdown that lets the
 * user add or edit any schema field one at a time. Click any existing
 * chip to inline-edit. Manual edits flip `extractionSource = 'manual'`
 * server-side; the row is then protected from being overwritten by
 * future AI extraction (see ExtractionService manual-wins guard).
 *
 * Mounts inside the modal shell between the Makler block and the mode
 * toggle, visible in both Objektdaten and Analysen modes (ADR-017 §6).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PropertyDetails,
  updatePropertyDetails,
} from '@/lib/api';
import {
  PROPERTY_FACT_FIELDS,
  buildDropdownItems,
  type FactFieldDefinition,
  type FactFieldKey,
  type FactTranslator,
} from '@/lib/propertyFactsConfig';

interface Props {
  propertyId: string;
  details: PropertyDetails | null;
  /** Called after a successful PATCH so the parent can refresh its details state. */
  onDetailsChange: (next: PropertyDetails) => void;
}

type EditTarget =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; fieldKey: FactFieldKey };

export default function PropertyFactsHeader({
  propertyId,
  details,
  onDetailsChange,
}: Props) {
  const t = useTranslations('propertyFacts');
  const tx = t as unknown as FactTranslator;

  const [edit, setEdit] = useState<EditTarget>({ mode: 'closed' });
  const [error, setError] = useState<string | null>(null);

  // Build the chips: only fields whose formatChipValue returns non-null.
  const visible = PROPERTY_FACT_FIELDS
    .map((field) => {
      const display = details ? field.formatChipValue(details, tx) : null;
      return display ? { field, display } : null;
    })
    .filter((x): x is { field: FactFieldDefinition; display: string } => x !== null);

  async function save(field: FactFieldDefinition, value: unknown) {
    setError(null);
    try {
      const patch = buildPatchForField(field, value);
      const next = await updatePropertyDetails(propertyId, patch);
      onDetailsChange(next);
      setEdit({ mode: 'closed' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[PropertyFactsHeader] save failed:', e);
      setError(msg || t('errorSave'));
    }
  }

  async function clearField(field: FactFieldDefinition) {
    await save(field, null);
  }

  return (
    <div className="px-6 pt-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6b7a99]">
          {t('section.title')}
        </span>
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {visible.map(({ field, display }) => (
            <PropertyFactChip
              key={field.key}
              field={field}
              displayValue={display}
              details={details!}
              source={resolveSource(details)}
              t={tx}
              isEditing={edit.mode === 'edit' && edit.fieldKey === field.key}
              onClick={() => setEdit({ mode: 'edit', fieldKey: field.key })}
              onSave={(v) => save(field, v)}
              onClear={() => clearField(field)}
              onCancel={() => setEdit({ mode: 'closed' })}
            />
          ))}
          <PropertyFactAdd
            details={details}
            isOpen={edit.mode === 'add'}
            onOpen={() => setEdit({ mode: 'add' })}
            onClose={() => setEdit({ mode: 'closed' })}
            onSelectField={(field) => {
              // Switch from add → edit so the chip animates in immediately on save.
              setEdit({ mode: 'edit', fieldKey: field.key });
            }}
            onSave={save}
            t={tx}
          />
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}

// ── PropertyFactChip ─────────────────────────────────────────────────────────

interface ChipProps {
  field: FactFieldDefinition;
  displayValue: string;
  details: PropertyDetails;
  source: 'manual' | 'aiExpose' | 'aiListing';
  t: FactTranslator;
  isEditing: boolean;
  onClick: () => void;
  onSave: (value: unknown) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onCancel: () => void;
}

function PropertyFactChip({
  field,
  displayValue,
  details,
  source,
  t,
  isEditing,
  onClick,
  onSave,
  onClear,
  onCancel,
}: ChipProps) {
  if (isEditing) {
    return (
      <PropertyFactInlineEditor
        field={field}
        details={details}
        t={t}
        onSave={onSave}
        onCancel={onCancel}
        onClear={onClear}
        showClear={true}
      />
    );
  }
  const tooltip = `${t(`label.${field.key}`)} · ${t(`source.${source}`)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#f0f3f8] hover:bg-[#e2e6ed] border border-[#e2e6ed] text-xs text-[#0F1F3D] transition-colors whitespace-nowrap"
    >
      {displayValue}
    </button>
  );
}

// ── PropertyFactInlineEditor ────────────────────────────────────────────────

interface EditorProps {
  field: FactFieldDefinition;
  details: PropertyDetails | null;
  t: FactTranslator;
  onSave: (value: unknown) => void | Promise<void>;
  onCancel: () => void;
  onClear?: () => void | Promise<void>;
  showClear: boolean;
  autoFocus?: boolean;
}

function PropertyFactInlineEditor({
  field,
  details,
  t,
  onSave,
  onCancel,
  onClear,
  showClear,
  autoFocus = true,
}: EditorProps) {
  // Initial value extraction depends on field type. Compound fields
  // (address, hwbClassValue) read multiple columns; everything else
  // reads from its single column directly.
  const [value, setValue] = useState<EditorValue>(() => initialEditorValue(field, details));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  function commit() {
    onSave(value);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[#F5A623] shadow-sm">
      {renderEditorInput(field, value, setValue, inputRef, handleKey, t)}
      <button
        type="button"
        onClick={commit}
        title={t('save')}
        className="text-[#0F1F3D] hover:text-[#F5A623] text-xs font-bold px-1"
      >
        ✓
      </button>
      {showClear && onClear && (
        <button
          type="button"
          onClick={() => onClear()}
          title={t('delete')}
          className="text-[#6b7a99] hover:text-red-600 text-xs px-1"
        >
          ✕
        </button>
      )}
    </span>
  );
}

// ── PropertyFactAdd (the "+ hinzu" affordance + popover) ────────────────────

interface AddProps {
  details: PropertyDetails | null;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelectField: (field: FactFieldDefinition) => void;
  onSave: (field: FactFieldDefinition, value: unknown) => void | Promise<void>;
  t: FactTranslator;
}

function PropertyFactAdd({
  details,
  isOpen,
  onOpen,
  onClose,
  onSelectField,
  onSave,
  t,
}: AddProps) {
  const [pickedKey, setPickedKey] = useState<FactFieldKey | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Outside-click and Esc dismiss
  useEffect(() => {
    if (!isOpen) return;
    function onDoc(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
        setPickedKey(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        setPickedKey(null);
      }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  // Reset picked field when popover closes
  useEffect(() => {
    if (!isOpen) setPickedKey(null);
  }, [isOpen]);

  const items = buildDropdownItems(details, t);
  const pickedField = pickedKey ? items.find((i) => i.field.key === pickedKey)?.field ?? null : null;

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center px-2 py-0.5 rounded-full border border-dashed border-[#e2e6ed] hover:border-[#F5A623] text-xs text-[#6b7a99] hover:text-[#F5A623] transition-colors"
      >
        {t('add.button')}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex items-center px-2 py-0.5 rounded-full border border-[#F5A623] bg-[#FFF5E6] text-xs text-[#0F1F3D]"
      >
        {t('add.button')}
      </button>
      <div
        ref={popoverRef}
        className="absolute left-0 top-full mt-1 z-30 bg-white border border-[#e2e6ed] rounded-lg shadow-xl p-3 w-64 max-h-80 overflow-y-auto"
      >
        <p className="text-xs text-[#6b7a99] mb-1">{t('add.popover.title')}</p>
        <select
          value={pickedKey ?? ''}
          onChange={(e) => {
            const key = e.target.value as FactFieldKey;
            setPickedKey(key || null);
            const item = items.find((i) => i.field.key === key);
            if (item) onSelectField(item.field);
          }}
          className="w-full text-sm border border-[#e2e6ed] rounded px-2 py-1 mb-2"
        >
          <option value="">— {t('add.popover.title')} —</option>
          {items.map((item) => (
            <option key={item.field.key} value={item.field.key}>
              {item.label}
              {item.populated ? ` ${t('edit.suffix')}` : ''}
            </option>
          ))}
        </select>
        {pickedField && (
          <div className="mt-2">
            <PropertyFactInlineEditor
              field={pickedField}
              details={details}
              t={t}
              onSave={(v) => {
                onSave(pickedField, v);
                onClose();
              }}
              onCancel={onClose}
              showClear={false}
              autoFocus={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type EditorValue =
  | string
  | number
  | boolean
  | { street: string; zip: string; city: string }
  | { hwbClass: string; hwbValue: string }
  | null;

function initialEditorValue(
  field: FactFieldDefinition,
  details: PropertyDetails | null,
): EditorValue {
  if (!details) return defaultForType(field);
  if (field.key === 'addressCombined') {
    return {
      street: details.addressStreet ?? '',
      zip: details.addressZip ?? '',
      city: details.addressCity ?? '',
    };
  }
  if (field.key === 'hwbClassValue') {
    return {
      hwbClass: details.hwbClass ?? '',
      hwbValue: details.hwbValue != null ? String(details.hwbValue) : '',
    };
  }
  const col = field.columns[0];
  const v = details[col];
  if (v == null) return defaultForType(field);
  return v as EditorValue;
}

function defaultForType(field: FactFieldDefinition): EditorValue {
  if (field.type === 'boolean') return false;
  if (field.type === 'address') return { street: '', zip: '', city: '' };
  if (field.key === 'hwbClassValue') return { hwbClass: '', hwbValue: '' };
  return '';
}

function renderEditorInput(
  field: FactFieldDefinition,
  value: EditorValue,
  setValue: (v: EditorValue) => void,
  inputRef: React.MutableRefObject<HTMLInputElement | HTMLSelectElement | null>,
  onKey: (e: React.KeyboardEvent) => void,
  t: FactTranslator,
) {
  const baseInput = 'text-xs px-1.5 py-0.5 rounded border border-[#e2e6ed] focus:outline-none focus:border-[#F5A623]';

  if (field.type === 'enum' && field.enumValues) {
    return (
      <select
        ref={inputRef as React.MutableRefObject<HTMLSelectElement | null>}
        value={(value as string) ?? ''}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        className={baseInput + ' bg-white'}
      >
        <option value="">—</option>
        {field.enumValues.map((v) => (
          <option key={v} value={v}>
            {t(`enum.${field.key}.${v}`)}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'boolean') {
    return (
      <span className="inline-flex gap-1">
        <button
          type="button"
          onClick={() => setValue(true)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${value === true ? 'bg-[#F5A623] text-white' : 'bg-white border border-[#e2e6ed] text-[#0F1F3D]'}`}
        >
          {t('boolean.yes')}
        </button>
        <button
          type="button"
          onClick={() => setValue(false)}
          className={`text-[10px] px-1.5 py-0.5 rounded ${value === false ? 'bg-[#F5A623] text-white' : 'bg-white border border-[#e2e6ed] text-[#0F1F3D]'}`}
        >
          {t('boolean.no')}
        </button>
      </span>
    );
  }

  if (field.type === 'address') {
    const v = (value as { street: string; zip: string; city: string }) ?? { street: '', zip: '', city: '' };
    return (
      <span className="inline-flex flex-col gap-0.5">
        <input
          ref={inputRef as React.MutableRefObject<HTMLInputElement | null>}
          value={v.street}
          onChange={(e) => setValue({ ...v, street: e.target.value })}
          onKeyDown={onKey}
          placeholder="Straße"
          className={baseInput + ' w-44'}
        />
        <span className="inline-flex gap-1">
          <input
            value={v.zip}
            onChange={(e) => setValue({ ...v, zip: e.target.value })}
            onKeyDown={onKey}
            placeholder="PLZ"
            className={baseInput + ' w-16'}
          />
          <input
            value={v.city}
            onChange={(e) => setValue({ ...v, city: e.target.value })}
            onKeyDown={onKey}
            placeholder="Ort"
            className={baseInput + ' w-28'}
          />
        </span>
      </span>
    );
  }

  if (field.key === 'hwbClassValue') {
    const v = (value as { hwbClass: string; hwbValue: string }) ?? { hwbClass: '', hwbValue: '' };
    return (
      <span className="inline-flex gap-1">
        <select
          ref={inputRef as React.MutableRefObject<HTMLSelectElement | null>}
          value={v.hwbClass}
          onChange={(e) => setValue({ ...v, hwbClass: e.target.value })}
          onKeyDown={onKey}
          className={baseInput + ' bg-white'}
        >
          <option value="">—</option>
          {['A++', 'A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="number"
          step="0.1"
          value={v.hwbValue}
          onChange={(e) => setValue({ ...v, hwbValue: e.target.value })}
          onKeyDown={onKey}
          placeholder="kWh/m²a"
          className={baseInput + ' w-24'}
        />
      </span>
    );
  }

  if (field.type === 'date') {
    return (
      <input
        ref={inputRef as React.MutableRefObject<HTMLInputElement | null>}
        type="date"
        value={(value as string) ?? ''}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        className={baseInput}
      />
    );
  }

  if (field.type === 'year' || field.type === 'number' || field.type === 'decimal') {
    return (
      <input
        ref={inputRef as React.MutableRefObject<HTMLInputElement | null>}
        type="number"
        step={field.type === 'decimal' ? '0.1' : '1'}
        min={field.min}
        max={field.max}
        value={value == null ? '' : String(value)}
        onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))}
        onKeyDown={onKey}
        className={baseInput + ' w-20'}
      />
    );
  }

  // text
  return (
    <input
      ref={inputRef as React.MutableRefObject<HTMLInputElement | null>}
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      className={baseInput + ' w-32'}
    />
  );
}

function buildPatchForField(
  field: FactFieldDefinition,
  value: unknown,
): Partial<PropertyDetails> {
  if (field.key === 'addressCombined') {
    const v = value as { street: string; zip: string; city: string } | null;
    if (v == null) {
      return { addressStreet: null, addressZip: null, addressCity: null };
    }
    return {
      addressStreet: v.street.trim() || null,
      addressZip: v.zip.trim() || null,
      addressCity: v.city.trim() || null,
    };
  }
  if (field.key === 'hwbClassValue') {
    const v = value as { hwbClass: string; hwbValue: string } | null;
    if (v == null) {
      return { hwbClass: null, hwbValue: null };
    }
    return {
      hwbClass: v.hwbClass.trim() || null,
      hwbValue: v.hwbValue.trim() === '' ? null : Number(v.hwbValue),
    };
  }
  const col = field.columns[0];
  if (value === null || value === '' || value === undefined) {
    return { [col]: null } as Partial<PropertyDetails>;
  }
  if (field.type === 'number' || field.type === 'year' || field.type === 'decimal') {
    return { [col]: typeof value === 'number' ? value : Number(value) } as Partial<PropertyDetails>;
  }
  return { [col]: value } as Partial<PropertyDetails>;
}

function resolveSource(details: PropertyDetails | null): 'manual' | 'aiExpose' | 'aiListing' {
  if (!details?.extractionSource) return 'aiExpose';
  if (details.extractionSource === 'manual') return 'manual';
  if (details.extractionSource.includes('from_upload')) return 'aiExpose';
  // ai_extraction / ai_extraction_v2 — could be from listing or from PATCH
  // path that didn't go through createFromExpose. Treat as Exposé default
  // (the more common case) per ADR §4.4 which calls this best-effort.
  return 'aiExpose';
}
