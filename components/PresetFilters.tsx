'use client';

/**
 * PresetFilters — pill bar shell per ADR-008.
 *
 * Layout:
 *   Row 1 — Bundesland (9 Austrian states, multi-select)
 *   Row 2 — Search Agents / No Search Agents (radio) · | · user filter pills
 *           (with kebab) · `+`
 *   Row 3 — Funnel stages (only when `showStages` — Discover only)
 *
 * Bundesland override (F5):
 *   When any active saved filter contains a location criterion, the
 *   Bundesland pills are cleared and rendered visually inactive. The
 *   row remains visible so the user understands why pills are
 *   non-interactive.
 *
 * Dashboard mode:
 *   When `dashboardMode` is true, clicking a user filter pill calls
 *   `onApplyToFields(filter)` instead of toggling `activeSavedFilterIds`.
 *   This allows the Dashboard Discover tile to populate its search
 *   fields from a saved filter without applying it as a hard filter.
 *
 * Stubs in this slice:
 *   `+` and kebab Edit alert "coming next slice" until ADR-008 F3
 *   (Filter Modal) lands. Kebab Delete is fully wired through
 *   `onDeleteFilter` (parents pass `useSavedFilters().remove`).
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SavedFilter } from '@/lib/api';
import {
  PRESET_FILTERS,
  type PresetFilterKey,
  togglePreset,
  savedFilterHasLocation,
} from '@/lib/preset-filters';
import UserFilterPill from '@/components/filters/UserFilterPill';
import FilterModal from '@/components/filters/FilterModal';

const STATE_KEYS = new Set<PresetFilterKey>(['W', 'NÖ', 'OÖ', 'ST', 'K', 'S', 'T', 'V', 'B']);

interface Props {
  active: Set<PresetFilterKey>;
  onChange: (next: Set<PresetFilterKey>) => void;
  savedFilters?: SavedFilter[];
  activeSavedFilterIds?: Set<string>;
  onToggleSavedFilter?: (id: string) => void;
  onDeleteFilter?: (id: string) => void | Promise<void>;
  /** Populate parent's field state instead of toggling. Dashboard tile only. */
  dashboardMode?: boolean;
  onApplyToFields?: (filter: SavedFilter) => void;
  align?: 'left' | 'center';
  /** Render the funnel stages row. Only Discover sets this true. */
  showStages?: boolean;
  /** Smaller pills + tighter spacing — used on the Dashboard Discover tile. */
  compact?: boolean;
}

export default function PresetFilters({
  active,
  onChange,
  savedFilters,
  activeSavedFilterIds,
  onToggleSavedFilter,
  onDeleteFilter,
  dashboardMode = false,
  onApplyToFields,
  align = 'left',
  showStages = false,
  compact = false,
}: Props) {
  const t = useTranslations('presetFilters');

  // Modal state — owned internally so each parent doesn't need to plumb it.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);

  const stageFilters = PRESET_FILTERS.filter(f => f.group === 'stage');
  const stateFilters = PRESET_FILTERS.filter(f => f.group === 'state');
  const sourceFilters = PRESET_FILTERS.filter(f => f.group === 'source');

  // ── Bundesland override (ADR-008 F5) ──────────────────────────────────────
  const locationOverride = useMemo(() => {
    if (!savedFilters || !activeSavedFilterIds || activeSavedFilterIds.size === 0) return false;
    return Array.from(activeSavedFilterIds).some(sid => {
      const sf = savedFilters.find(f => f.id === sid);
      return sf ? savedFilterHasLocation(sf) : false;
    });
  }, [savedFilters, activeSavedFilterIds]);

  // When override fires, strip any active state keys.
  useEffect(() => {
    if (!locationOverride) return;
    const hasState = Array.from(active).some(k => STATE_KEYS.has(k));
    if (!hasState) return;
    const next = new Set(active);
    for (const k of STATE_KEYS) next.delete(k);
    onChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationOverride]);

  function handleToggle(key: PresetFilterKey) {
    onChange(togglePreset(active, key));
  }

  // ── Source pill — radio behaviour ─────────────────────────────────────────
  // Source filters (searchAgents, excludeSearchAgents) are mutually exclusive.
  // togglePreset() already enforces this on the model side.

  // Size-dependent classes — `compact` shrinks pills for Dashboard tile use.
  const pillSize = compact
    ? 'rounded-full px-2 py-0.5 text-[10px] font-medium border'
    : 'rounded-full px-3 py-1 text-xs font-medium border';
  const plusSize = compact
    ? 'rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium border border-dashed'
    : 'rounded-full w-7 h-7 flex items-center justify-center text-sm font-medium border border-dashed';
  const dividerHeight = compact ? 'h-4' : 'h-5';
  const rowGap = compact ? 'gap-1' : 'gap-1.5';
  const rowSpacing = compact ? 'space-y-1 py-1' : 'space-y-1.5 py-2';

  function StatePill({ filterKey, labelKey }: { filterKey: PresetFilterKey; labelKey: string }) {
    const isActive = !locationOverride && active.has(filterKey);
    const disabled = locationOverride;
    return (
      <button
        onClick={() => !disabled && handleToggle(filterKey)}
        disabled={disabled}
        title={disabled ? t('locationFromFilter') : undefined}
        className={`${pillSize} transition-colors whitespace-nowrap ${
          disabled
            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
            : isActive
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {t(labelKey)}
      </button>
    );
  }

  function PresetPill({ filterKey, labelKey }: { filterKey: PresetFilterKey; labelKey: string }) {
    const isActive = active.has(filterKey);
    return (
      <button
        onClick={() => handleToggle(filterKey)}
        className={`${pillSize} transition-colors whitespace-nowrap ${
          isActive
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {t(labelKey)}
      </button>
    );
  }

  // ── Filter pill click handler — depends on dashboardMode ─────────────────
  function handleFilterClick(sf: SavedFilter) {
    if (dashboardMode && onApplyToFields) {
      onApplyToFields(sf);
      return;
    }
    onToggleSavedFilter?.(sf.id);
  }

  function handleCreate() {
    setModalMode('create');
    setEditingFilterId(null);
    setModalOpen(true);
  }

  function handleEdit(id: string) {
    setModalMode('edit');
    setEditingFilterId(id);
    setModalOpen(true);
  }

  async function handleDelete(id: string) {
    if (!onDeleteFilter) return;
    await onDeleteFilter(id);
  }

  // Called by the modal after a successful create or update.
  // Default mode: activate the filter ID. Dashboard mode: populate fields.
  function handleApplyFromModal(filter: SavedFilter, isNew: boolean) {
    if (dashboardMode) {
      onApplyToFields?.(filter);
      return;
    }
    if (!onToggleSavedFilter) return;
    if (isNew) {
      // For Save as New: deactivate any other active filters first if we're
      // editing — keeps the new filter as the sole active selection.
      if (modalMode === 'edit' && editingFilterId && activeSavedFilterIds?.has(editingFilterId)) {
        onToggleSavedFilter(editingFilterId);
      }
      if (!activeSavedFilterIds?.has(filter.id)) {
        onToggleSavedFilter(filter.id);
      }
    } else {
      // Update path — already active, no toggle needed.
      if (!activeSavedFilterIds?.has(filter.id)) {
        onToggleSavedFilter(filter.id);
      }
    }
  }

  const editingFilter = editingFilterId
    ? savedFilters?.find(f => f.id === editingFilterId) ?? null
    : null;

  const justify = align === 'center' ? 'justify-center' : 'justify-start';

  // Active selection state for the optional clear-all link
  const hasAnySavedActive = !dashboardMode
    && activeSavedFilterIds
    && activeSavedFilterIds.size > 0;
  const hasAnyActive = active.size > 0 || hasAnySavedActive;

  // Bundesland row
  const bundeslandRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      {stateFilters.map(f => (
        <StatePill key={f.key} filterKey={f.key} labelKey={f.labelKey} />
      ))}
    </div>
  );

  // Funnel stages row (Discover only)
  const stagesRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      {stageFilters.map(f => (
        <PresetPill key={f.key} filterKey={f.key} labelKey={f.labelKey} />
      ))}
    </div>
  );

  // Source toggle · | · user filter pills · `+` row
  const sourceRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      {sourceFilters.map(f => (
        <PresetPill key={f.key} filterKey={f.key} labelKey={f.labelKey} />
      ))}

      <span className={`w-px ${dividerHeight} bg-gray-200 mx-1`} />

      {savedFilters && savedFilters.map(sf => {
        const isActive = !dashboardMode && (activeSavedFilterIds?.has(sf.id) ?? false);
        return (
          <UserFilterPill
            key={sf.id}
            id={sf.id}
            name={sf.name}
            isActive={isActive}
            compact={compact}
            onClick={() => handleFilterClick(sf)}
            onEdit={() => handleEdit(sf.id)}
            onDelete={() => handleDelete(sf.id)}
          />
        );
      })}

      <button
        onClick={handleCreate}
        aria-label={t('createFilter')}
        title={t('createFilter')}
        className={`${plusSize} border-gray-300 text-gray-400 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors`}
      >
        +
      </button>

      {hasAnyActive && (
        <>
          <span className={`w-px ${dividerHeight} bg-gray-200 mx-1`} />
          <button
            onClick={() => {
              onChange(new Set());
              if (!dashboardMode && activeSavedFilterIds && onToggleSavedFilter) {
                for (const id of activeSavedFilterIds) onToggleSavedFilter(id);
              }
            }}
            className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 hover:text-gray-600 px-1`}
          >
            {t('clearAll')}
          </button>
        </>
      )}
    </div>
  );

  // Row order:
  //   - Discover (showStages): Bundesland → Stages → Source
  //   - everywhere else:        Bundesland → Source
  return (
    <>
      <div className={rowSpacing}>
        {bundeslandRow}
        {showStages && stagesRow}
        {sourceRow}
      </div>
      <FilterModal
        open={modalOpen}
        mode={modalMode}
        editingFilter={editingFilter}
        onClose={() => setModalOpen(false)}
        onApply={handleApplyFromModal}
      />
    </>
  );
}
