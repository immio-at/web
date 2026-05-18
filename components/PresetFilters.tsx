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
  getAllPostcodes,
  BUNDESLAND_ABBREVIATIONS,
} from '@/lib/austria-plz-bundesland';
import {
  EMPTY_FILTERS,
  type FilterValues,
  savedFilterToValues,
  valuesToSavedFilterDto,
} from '@/lib/filter-values';
import UserFilterPill from '@/components/filters/UserFilterPill';
import FilterModal from '@/components/filters/FilterModal';
import MoreFiltersPrompt from '@/components/filters/MoreFiltersPrompt';
import { PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';
import RangeSlider from '@/components/filters/RangeSlider';
import TomFilter from '@/components/filters/TomFilter';
import PropertyTypeChips from '@/components/filters/PropertyTypeChips';
import RentRegulationChips from '@/components/filters/RentRegulationChips';
import StateDropdown from '@/components/filters/StateDropdown';
import PostcodeDropdown from '@/components/filters/PostcodeDropdown';
import SortDropdown from '@/components/filters/SortDropdown';
import SmartSearchField from '@/components/filters/SmartSearchField';
import type { Suggestion } from '@/lib/smart-search/types';

// ADR-023 §2.2 — hard slider bounds (working values; a future job tunes
// them to the 95th-percentile distribution).
const SLIDER_BOUNDS = {
  price: { min: 0, max: 5_000_000, step: 1000 },
  size: { min: 0, max: 500, step: 1 },
  pricePerSqm: { min: 0, max: 15_000, step: 100 },
  rooms: { min: 0, max: 10, step: 0.5 },
} as const;

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
  /**
   * ADR-024 — render the smart-search field in the R3 slot. The Discover
   * page passes `SMART_SEARCH_ENABLED`; every other page leaves it false.
   * The field only renders when the pill bar itself is live (it routes
   * into the pill bar's chip/slider state).
   */
  showSmartSearch?: boolean;
  /**
   * Whether to render the sort dropdown inside the pill bar. Default true.
   * Discover passes `false` — it renders its own sort next to the results
   * count instead, outside the filter box.
   */
  showSort?: boolean;
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
  showSmartSearch = false,
  showSort = true,
}: Props) {
  const t = useTranslations('presetFilters');

  // ADR-023 — the consolidated pill bar (R4–R9) is live only when the flag
  // is on AND the parent supplied filter state. Otherwise the legacy
  // `FilterBar` remains the filter surface and the pill bar shows the
  // inert roadmap chip rows.
  const pillBarLive = PILL_BAR_ONLY_FILTERS && !!values && !!onValuesChange;

  // ADR-023 §7.2 — detach-on-edit. When exactly one saved filter is active
  // and the pill bar has since been edited away from its stored criteria,
  // the filter is "dirty": its pill renders deactivated and a save-changes
  // affordance appears.
  const dirtyFilterId = useMemo<string | null>(() => {
    if (!pillBarLive || !savedFilters || !activeSavedFilterIds || activeSavedFilterIds.size !== 1) {
      return null;
    }
    const id = [...activeSavedFilterIds][0];
    const sf = savedFilters.find((f) => f.id === id);
    if (!sf) return null;
    const stored = JSON.stringify(valuesToSavedFilterDto(savedFilterToValues(sf)));
    const current = JSON.stringify(valuesToSavedFilterDto(values!));
    return stored !== current ? id : null;
  }, [pillBarLive, savedFilters, activeSavedFilterIds, values]);

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
  // §10.5.7 — `groupSpacing` separates conceptual groups; `innerSpacing`
  // packs rows within a group tighter so proximity does the grouping.
  const groupSpacing = compact ? 'space-y-1.5 py-1' : 'space-y-2.5 py-2';
  const innerSpacing = compact ? 'space-y-1' : 'space-y-1.5';
  // §10.5.5 — the small-grey left-aligned row label, used across every
  // labelled row so source / type / classification read consistently.
  // Fixed width so the differing label texts all reserve the same column
  // and every row's pills/controls start at the same left point.
  const rowLabelClass = `${compact ? 'text-[10px] w-24' : 'text-xs w-28'} text-gray-400 font-medium shrink-0 whitespace-nowrap`;

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

  // R3 (ADR-023 §10.5.4) — Location row: the Bundesland and Postcode
  // multi-select dropdowns side by side, below the smart-search bar.
  // `stateSelected` combines saved-filter-implied states with the active
  // state presets; the State control is disabled when a saved filter
  // supplies the location. `allPostcodes` feeds the postcode typeahead.
  const allPostcodes = useMemo(() => getAllPostcodes(), []);
  const stateSelected = new Set<string>(impliedPresets);
  if (!locationOverride) {
    for (const f of stateFilters) if (active.has(f.key)) stateSelected.add(f.key);
  }
  const locationRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      <span className={rowLabelClass}>{t('locationLabel')}</span>
      <StateDropdown
        options={stateFilters.map((f) => ({ key: f.key, label: t(f.labelKey) }))}
        selected={stateSelected}
        onToggle={(k) => handleToggle(k as PresetFilterKey)}
        placeholder={t('stateDropdownPlaceholder')}
        moreLabel={(n) => t('moreCount', { count: n })}
        disabled={locationOverride}
        disabledTitle={t('locationFromFilter')}
        compact={compact}
      />
      {pillBarLive && (
        <PostcodeDropdown
          value={values!.location}
          onChange={(loc) => patchValues({ location: loc })}
          allPostcodes={allPostcodes}
          placeholder={t('postcodeDropdownPlaceholder')}
          searchPlaceholder={t('postcodeSearchPlaceholder')}
          searchHint={t('postcodeSearchHint')}
          moreLabel={(n) => t('moreCount', { count: n })}
          compact={compact}
        />
      )}
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

  // R2 (ADR-023 §10.5.1–§10.5.3 / §10.5.5) — the "Your filters" row:
  // saved-filter pills + dashed Create button + the "More filters?" link.
  const savedFiltersRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      <span className={rowLabelClass}>{t('yourFiltersLabel')}</span>

      {savedFilters && savedFilters.map(sf => {
        const isActive = !dashboardMode && (activeSavedFilterIds?.has(sf.id) ?? false);
        return (
          <UserFilterPill
            key={sf.id}
            id={sf.id}
            name={sf.name}
            isActive={isActive}
            dirty={dirtyFilterId === sf.id}
            compact={compact}
            onClick={() => handleFilterClick(sf)}
            onEdit={() => handleEdit(sf.id)}
            onDelete={() => handleDelete(sf.id)}
          />
        );
      })}

      {/* ADR-023 §7.2 — detach-on-edit save prompt, next to the pills. */}
      {dirtyFilterId && (
        <>
          <button
            onClick={() => handleEdit(dirtyFilterId)}
            className={`${pillSize} bg-teal-600 text-white border-teal-600 hover:bg-teal-700 transition-colors whitespace-nowrap`}
          >
            {t('saveChanges')}
          </button>
          <button
            onClick={() => {
              const sf = savedFilters?.find((f) => f.id === dirtyFilterId);
              if (sf && onValuesChange) onValuesChange(savedFilterToValues(sf));
            }}
            className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 hover:text-gray-600 underline-offset-2 hover:underline px-1 whitespace-nowrap`}
          >
            {t('discardChanges')}
          </button>
        </>
      )}

      <button
        onClick={handleCreate}
        className={`${createBtnSize} border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap`}
      >
        {t('createFilter')}
      </button>

      {/* §10.5.3 — "More filters? Tell us →" sits next to Create as a
          tertiary text link (moved here from the former standalone R10). */}
      <MoreFiltersPrompt compact={compact} />

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

  // Property source row — its own labelled row, positioned below the
  // smart-search bar and above the property-type chips.
  const sourceRow = (
    <div className={`flex flex-wrap items-center ${rowGap} ${justify}`}>
      <span className={rowLabelClass}>{t('sourceLabel')}</span>
      {sourceFilters.map(f => (
        <PresetPill key={f.key} filterKey={f.key} labelKey={f.labelKey} />
      ))}
    </div>
  );

  // ── ADR-023 R4–R9 — consolidated pill bar filter rows ────────────────────
  // Rendered only when `pillBarLive`. `values` / `onValuesChange` are
  // guaranteed non-null inside this branch.
  function patchValues(p: Partial<FilterValues>) {
    onValuesChange!({ ...values!, ...p });
  }

  // ── ADR-024 §6.2 — apply a smart-search suggestion ───────────────────────
  // Routes the suggestion's structured `target` into the pill bar's state:
  // chip targets union into the relevant array, Bundesland targets activate
  // the preset chip, location targets append postcodes, range targets set a
  // slider bound, the substring fallback sets `keyword`. Only reachable when
  // `pillBarLive` (the smart-search field renders only then).
  function applySuggestion(s: Suggestion) {
    const tgt = s.target;
    switch (tgt.field) {
      case 'propertyType': {
        if (!values!.propertyType.includes(tgt.value)) {
          patchValues({ propertyType: [...values!.propertyType, tgt.value] });
        }
        break;
      }
      case 'rentRegulationCategory': {
        if (!values!.rentRegulationCategory.includes(tgt.value)) {
          patchValues({ rentRegulationCategory: [...values!.rentRegulationCategory, tgt.value] });
        }
        break;
      }
      case 'bundesland': {
        const key = tgt.presetKey as PresetFilterKey;
        if (!active.has(key)) onChange(togglePreset(active, key));
        break;
      }
      case 'location': {
        const existing = values!.location.split(',').map((p) => p.trim()).filter(Boolean);
        const merged = [...new Set([...existing, ...tgt.postcodes])];
        patchValues({ location: merged.join(', ') });
        break;
      }
      case 'range': {
        patchValues({ [tgt.key]: tgt.value } as Partial<FilterValues>);
        break;
      }
      case 'keyword': {
        patchValues({ keyword: tgt.value });
        break;
      }
    }
  }

  const pillBarRows = pillBarLive ? (
    <>
      {/* Categorisation group — property type + rent regulation chips. */}
      <div className={innerSpacing}>
        <PropertyTypeChips
          value={values!.propertyType}
          onChange={(pt) => patchValues({ propertyType: pt })}
          compact={compact}
        />
        <RentRegulationChips
          value={values!.rentRegulationCategory}
          onChange={(rr) => patchValues({ rentRegulationCategory: rr })}
          compact={compact}
        />
      </div>
      {/* TOM / ranges / sort group — the TOM ("listed within") chip row
          sits above the slider section so the pill rows stay together. */}
      <div className={innerSpacing}>
        {/* Time on market ("listed within") */}
        <TomFilter
          value={values!.tomMaxDays}
          onChange={(d) => patchValues({ tomMaxDays: d })}
          compact={compact}
        />
        {/* Range sliders (§2.6): two per row — Price + €/m², then
            Size + Rooms. `px-2` insets the pair from the box edges and
            `gap-x-8` opens the gap between the two columns. */}
        <div className="flex flex-wrap items-start gap-x-12 gap-y-3 px-4 py-1">
          <div className="flex-1 min-w-[200px]">
            <RangeSlider
              label={t('rangePrice')}
              {...SLIDER_BOUNDS.price}
              minValue={values!.minPrice}
              maxValue={values!.maxPrice}
              onChange={(r) => patchValues({ minPrice: r.min, maxPrice: r.max })}
              compact={compact}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <RangeSlider
              label={t('rangePricePerSqm')}
              {...SLIDER_BOUNDS.pricePerSqm}
              minValue={values!.minPricePerSqm}
              maxValue={values!.maxPricePerSqm}
              onChange={(r) => patchValues({ minPricePerSqm: r.min, maxPricePerSqm: r.max })}
              compact={compact}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-x-12 gap-y-3 px-4 py-1">
          <div className="flex-1 min-w-[200px]">
            <RangeSlider
              label={t('rangeSize')}
              {...SLIDER_BOUNDS.size}
              minValue={values!.minSize}
              maxValue={values!.maxSize}
              onChange={(r) => patchValues({ minSize: r.min, maxSize: r.max })}
              compact={compact}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <RangeSlider
              label={t('rangeRooms')}
              {...SLIDER_BOUNDS.rooms}
              minValue={values!.minRooms}
              maxValue={values!.maxRooms}
              onChange={(r) => patchValues({ minRooms: r.min, maxRooms: r.max })}
              compact={compact}
            />
          </div>
        </div>
        {/* Sort — omitted when `showSort` is false (Discover renders its
            own sort next to the results count, outside the filter box). */}
        {showSort && (
          <SortDropdown
            sortBy={values!.sortBy}
            sortOrder={values!.sortOrder}
            onChange={(s) => patchValues({ sortBy: s.sortBy, sortOrder: s.sortOrder })}
            compact={compact}
          />
        )}
      </div>
    </>
  ) : null;

  // Row order: smart search → "Your filters" → Location → Property source
  //   → type → regulation → TOM → sliders → sort. "Your filters" sits
  //   directly below the search bar so all the pill rows cluster together,
  //   and the TOM ("listed within") chip row sits just above the slider
  //   section. Stage pills (the old pre-amendment row) render only on
  //   Funnel, never on Discover. `groupSpacing` separates the conceptual
  //   groups; rows inside a group are packed tighter via `innerSpacing`.
  //   (NOTE: ADR-023 §1.1 not yet updated for this order — pending.)
  const bar = (
    <div className={groupSpacing}>
        {/* ADR-024 smart-search field. Renders only when the pill bar is
            live and the Discover page passed `showSmartSearch`; the slot
            collapses with no gap otherwise. */}
        {pillBarLive && showSmartSearch && <SmartSearchField onApply={applySuggestion} />}
        {/* "Your filters" — directly below the search bar. */}
        {savedFiltersRow}
        {showStages && stagesRow}
        {/* Location: State + Postcode dropdowns. */}
        {locationRow}
        {/* Property source, above the criteria chips. */}
        {sourceRow}
        {/* The consolidated pill bar (categorisation + ranges groups). */}
        {pillBarRows}
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
  );

  return (
    <>
      {/* All filters sit in a card on the full-size surfaces (Discover,
          Funnel) to separate them from the listings. The compact tile and
          Finder are already inside their own chrome — no extra box there. */}
      {compact ? bar : (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2">{bar}</div>
      )}
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
