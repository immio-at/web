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
import {
  type BundeslandAbbreviation,
  getPostcodesByBundesland,
  BUNDESLAND_ABBREVIATIONS,
} from '@/lib/austria-plz-bundesland';
import { EMPTY_FILTERS, type FilterValues } from '@/lib/filter-values';
import UserFilterPill from '@/components/filters/UserFilterPill';
import FilterModal from '@/components/filters/FilterModal';
import ComingSoonRow from '@/components/filters/ComingSoonRow';
import MoreFiltersPrompt from '@/components/filters/MoreFiltersPrompt';
import { PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';
import RangeSlider from '@/components/filters/RangeSlider';
import TomFilter from '@/components/filters/TomFilter';
import PropertyTypeChips from '@/components/filters/PropertyTypeChips';
import RentRegulationChips from '@/components/filters/RentRegulationChips';
import PostcodeEntry from '@/components/filters/PostcodeEntry';
import SortDropdown from '@/components/filters/SortDropdown';

// ADR-023 §2.2 — hard slider bounds (working values; a future job tunes
// them to the 95th-percentile distribution).
const SLIDER_BOUNDS = {
  price: { min: 0, max: 5_000_000, step: 1000 },
  size: { min: 0, max: 500, step: 1 },
  pricePerSqm: { min: 0, max: 15_000, step: 100 },
  rooms: { min: 0, max: 10, step: 0.5 },
} as const;

// ADR-008 PT2 — two coming-soon chip rows. Static config so the chip
// list is greppable and easy to expand when wiring goes live.
const PROPERTY_TYPE_CHIPS = [
  { key: 'haus', labelKey: 'propertyType.haus' },
  { key: 'wohnung', labelKey: 'propertyType.wohnung' },
  { key: 'zinshaus', labelKey: 'propertyType.zinshaus' },
  { key: 'garage', labelKey: 'propertyType.garage' },
  { key: 'gewerbe', labelKey: 'propertyType.gewerbe' },
  { key: 'grundstueck', labelKey: 'propertyType.grundstueck' },
];

const CLASSIFICATION_CHIPS = [
  { key: 'altbau', labelKey: 'classification.altbau' },
  { key: 'neubau', labelKey: 'classification.neubau' },
  { key: 'wiederaufbau', labelKey: 'classification.wiederaufbau' },
];

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
  /**
   * ADR-023 — live filter state for the consolidated pill bar (R4–R9).
   * Only consumed when `PILL_BAR_ONLY_FILTERS` is on; while the flag is
   * off the legacy `FilterBar` owns these criteria and the pill bar shows
   * the inert `ComingSoonRow`s instead.
   */
  values?: FilterValues;
  onValuesChange?: (next: FilterValues) => void;
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
  values,
  onValuesChange,
}: Props) {
  const t = useTranslations('presetFilters');

  // ADR-023 — the consolidated pill bar (R4–R9) is live only when the flag
  // is on AND the parent supplied filter state. Otherwise the legacy
  // `FilterBar` remains the filter surface and the pill bar shows the
  // inert roadmap chip rows.
  const pillBarLive = PILL_BAR_ONLY_FILTERS && !!values && !!onValuesChange;

  // Modal state — owned internally so each parent doesn't need to plumb it.
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);
  const [modalInitialValues, setModalInitialValues] = useState<FilterValues | null>(null);

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

  // ── Implied preset keys from active saved filters (ADR-013 FU1) ──────────
  // When a saved filter is active, the preset pills it implies (e.g. its
  // Bundesland selections) also render as active so the user sees the full
  // picture of what's being filtered. Non-interactive — changes go through
  // the filter itself.
  //
  // Detection: direct `bundeslaender` field first, then fall back to
  // postcode-subset detection (a state is implied if all its postcodes
  // appear in the filter's `postcodes` list — which is how filters created
  // from the FilterBar / save-search flow currently store state selections).
  const impliedPresets = useMemo<Set<PresetFilterKey>>(() => {
    const implied = new Set<PresetFilterKey>();
    if (dashboardMode || !savedFilters || !activeSavedFilterIds || activeSavedFilterIds.size === 0) {
      return implied;
    }
    for (const sid of activeSavedFilterIds) {
      const sf = savedFilters.find(f => f.id === sid);
      if (!sf) continue;
      for (const bl of sf.bundeslaender ?? []) {
        implied.add(bl as BundeslandAbbreviation);
      }
      if (sf.postcodes?.length) {
        const pcSet = new Set(sf.postcodes);
        for (const abbr of BUNDESLAND_ABBREVIATIONS) {
          if (implied.has(abbr)) continue;
          const statePcs = getPostcodesByBundesland(abbr);
          if (statePcs && statePcs.length > 0 && statePcs.every(pc => pcSet.has(pc))) {
            implied.add(abbr);
          }
        }
      }
    }
    return implied;
  }, [savedFilters, activeSavedFilterIds, dashboardMode]);

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
  const createBtnSize = compact
    ? 'rounded-full px-2 py-0.5 text-[10px] font-medium border border-dashed'
    : 'rounded-full px-3 py-1 text-xs font-medium border border-dashed';
  const dividerHeight = compact ? 'h-4' : 'h-5';
  const rowGap = compact ? 'gap-1' : 'gap-1.5';
  const rowSpacing = compact ? 'space-y-1 py-1' : 'space-y-1.5 py-2';

  function StatePill({ filterKey, labelKey }: { filterKey: PresetFilterKey; labelKey: string }) {
    const implied = impliedPresets.has(filterKey);
    const isActive = implied || (!locationOverride && active.has(filterKey));
    const disabled = locationOverride;
    return (
      <button
        onClick={() => !disabled && handleToggle(filterKey)}
        disabled={disabled}
        title={disabled ? t('locationFromFilter') : undefined}
        className={`${pillSize} transition-colors whitespace-nowrap ${
          isActive
            ? `bg-blue-600 text-white border-blue-600${disabled ? ' cursor-not-allowed' : ''}`
            : disabled
              ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {t(labelKey)}
      </button>
    );
  }

  function PresetPill({ filterKey, labelKey, tone = 'blue' }: {
    filterKey: PresetFilterKey;
    labelKey: string;
    tone?: 'blue' | 'teal';
  }) {
    const isActive = active.has(filterKey);
    const activeClass = tone === 'teal'
      ? 'bg-teal-600 text-white border-teal-600'
      : 'bg-blue-600 text-white border-blue-600';
    return (
      <button
        onClick={() => handleToggle(filterKey)}
        className={`${pillSize} transition-colors whitespace-nowrap ${
          isActive
            ? activeClass
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
    setModalInitialValues(null);
    setModalOpen(true);
  }

  // FU4 — open the modal in create mode with the current preset state
  // pre-filled. Active Bundesland pills become the location field (comma-
  // joined abbreviations — resolvePostcodes handles them on save).
  function handleSaveSearch() {
    const activeStates: string[] = [];
    for (const key of active) {
      if (STATE_KEYS.has(key)) activeStates.push(key);
    }
    const prefill: FilterValues = {
      ...EMPTY_FILTERS,
      location: activeStates.join(', '),
    };
    setModalMode('create');
    setEditingFilterId(null);
    setModalInitialValues(prefill);
    setModalOpen(true);
  }

  function handleEdit(id: string) {
    setModalMode('edit');
    setEditingFilterId(id);
    setModalInitialValues(null);
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

  // FU4 — "Suche als Filter speichern" visibility: at least one Bundesland
  // or source preset is active, no saved filter is active, and we're not
  // inside the Dashboard compact tile.
  const activeArr = Array.from(active);
  const hasStatePresetActive = activeArr.some(k => STATE_KEYS.has(k));
  const hasSourcePresetActive = activeArr.some(k => k === 'searchAgents' || k === 'excludeSearchAgents');
  const canSaveSearch = !compact
    && !dashboardMode
    && !hasAnySavedActive
    && (hasStatePresetActive || hasSourcePresetActive);

  // Bundesland row
  const bundeslandRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      {stateFilters.map(f => (
        <StatePill key={f.key} filterKey={f.key} labelKey={f.labelKey} />
      ))}
    </div>
  );

  // Funnel stages row (Discover only). Stage pills use teal — the
  // site's funnel accent — so they visually tie back to the Funnel
  // stage column headers and the in-funnel heart state.
  const stagesRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      {stageFilters.map(f => (
        <PresetPill key={f.key} filterKey={f.key} labelKey={f.labelKey} tone="teal" />
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
        className={`${createBtnSize} border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap`}
      >
        {t('createFilter')}
      </button>

      {hasAnyActive && (
        <button
          onClick={() => {
            onChange(new Set());
            if (!dashboardMode && activeSavedFilterIds && onToggleSavedFilter) {
              for (const id of activeSavedFilterIds) onToggleSavedFilter(id);
            }
          }}
          className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline ml-auto px-1 whitespace-nowrap`}
        >
          {t('clearAll')}
        </button>
      )}
    </div>
  );

  // ── ADR-023 R4–R9 — consolidated pill bar filter rows ────────────────────
  // Rendered only when `pillBarLive`. `values` / `onValuesChange` are
  // guaranteed non-null inside this branch.
  function patchValues(p: Partial<FilterValues>) {
    onValuesChange!({ ...values!, ...p });
  }

  const pillBarRows = pillBarLive ? (
    <>
      {/* R4 — property type chips */}
      <PropertyTypeChips
        value={values!.propertyType}
        onChange={(pt) => patchValues({ propertyType: pt })}
        compact={compact}
      />
      {/* R5 — rent regulation chips */}
      <RentRegulationChips
        value={values!.rentRegulationCategory}
        onChange={(rr) => patchValues({ rentRegulationCategory: rr })}
        compact={compact}
      />
      {/* R6 — range sliders: Price, Size, €/m², Rooms */}
      <RangeSlider
        label={t('rangePrice')}
        unit="€"
        {...SLIDER_BOUNDS.price}
        minValue={values!.minPrice}
        maxValue={values!.maxPrice}
        onChange={(r) => patchValues({ minPrice: r.min, maxPrice: r.max })}
        compact={compact}
      />
      <RangeSlider
        label={t('rangeSize')}
        {...SLIDER_BOUNDS.size}
        minValue={values!.minSize}
        maxValue={values!.maxSize}
        onChange={(r) => patchValues({ minSize: r.min, maxSize: r.max })}
        compact={compact}
      />
      <RangeSlider
        label={t('rangePricePerSqm')}
        unit="€"
        {...SLIDER_BOUNDS.pricePerSqm}
        minValue={values!.minPricePerSqm}
        maxValue={values!.maxPricePerSqm}
        onChange={(r) => patchValues({ minPricePerSqm: r.min, maxPricePerSqm: r.max })}
        compact={compact}
      />
      <RangeSlider
        label={t('rangeRooms')}
        {...SLIDER_BOUNDS.rooms}
        minValue={values!.minRooms}
        maxValue={values!.maxRooms}
        onChange={(r) => patchValues({ minRooms: r.min, maxRooms: r.max })}
        compact={compact}
      />
      {/* R7 — time on market */}
      <TomFilter
        value={values!.tomMaxDays}
        onChange={(d) => patchValues({ tomMaxDays: d })}
        compact={compact}
      />
      {/* R8 — sort */}
      <SortDropdown
        sortBy={values!.sortBy}
        sortOrder={values!.sortOrder}
        onChange={(s) => patchValues({ sortBy: s.sortBy, sortOrder: s.sortOrder })}
        compact={compact}
      />
      {/* R9 — postcode entry */}
      <PostcodeEntry
        value={values!.location}
        onChange={(loc) => patchValues({ location: loc })}
        compact={compact}
      />
    </>
  ) : (
    <>
      {/* ADR-008 PT2 — inert roadmap chip rows. Shown while the pill bar
          is not yet the canonical filter UI (PILL_BAR_ONLY_FILTERS off). */}
      <ComingSoonRow labelKey="propertyType.label" chips={PROPERTY_TYPE_CHIPS} compact={compact} />
      <ComingSoonRow labelKey="classification.label" chips={CLASSIFICATION_CHIPS} compact={compact} />
    </>
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
        {/* R4–R9 — the consolidated pill bar when PILL_BAR_ONLY_FILTERS is
            on; the inert ADR-008 roadmap chip rows otherwise. */}
        {pillBarRows}
        {/* R10 / ADR-008 PT3 — invite tester feedback on the next filter
            axes. Opens the FeedbackButton drawer with the feature_request
            type and a prefilled body via window CustomEvent. */}
        <MoreFiltersPrompt compact={compact} />
        {canSaveSearch && (
          <div className={`flex ${justify}`}>
            <button
              onClick={handleSaveSearch}
              className="text-xs text-teal-600 hover:text-teal-700 underline-offset-2 hover:underline px-1 whitespace-nowrap"
            >
              {t('saveSearch')}
            </button>
          </div>
        )}
      </div>
      <FilterModal
        open={modalOpen}
        mode={modalMode}
        editingFilter={editingFilter}
        initialValues={modalInitialValues}
        onClose={() => setModalOpen(false)}
        onApply={handleApplyFromModal}
      />
    </>
  );
}
