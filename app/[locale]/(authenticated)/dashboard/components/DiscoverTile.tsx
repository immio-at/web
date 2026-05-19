'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Property, SavedFilter, getScrapedListings } from '@/lib/api';
import { SEARCH_INPUT_ENABLED, PILL_BAR_ONLY_FILTERS } from '@/config/feature-flags';
import { FilterValues, EMPTY_FILTERS, savedFilterToValues, resolvePostcodes } from '@/lib/filter-values';
import { type PresetFilterKey, passesPresetFilters, passesFilterValues } from '@/lib/preset-filters';
import { type BundeslandAbbreviation, getPostcodesByBundesland } from '@/lib/austria-plz-bundesland';
import { useAuth } from '@/context/AuthContext';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import PresetFilters from '@/components/PresetFilters';
import AddPropertyButton from '@/components/ingestion/AddPropertyButton';

export default function DiscoverTile({
  savedFilters,
  properties,
}: {
  savedFilters: SavedFilter[];
  properties: Property[];
}) {
  const t = useTranslations('dashboard.discoverTile');
  const router = useRouter();

  const { session, loading: authLoading } = useAuth();
  const { remove: removeFilter } = useSavedFilters();
  const [filterValues, setFilterValues] = useState<FilterValues>(EMPTY_FILTERS);
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(new Set());

  // Pre-fetch scraped counts: global + per state. All cached on mount.
  // Austrian postcodes map to exactly one state → summing is exact.
  const STATE_KEYS: BundeslandAbbreviation[] = ['W', 'NÖ', 'OÖ', 'ST', 'K', 'S', 'T', 'V', 'B'];
  const [scrapedGlobal, setScrapedGlobal] = useState<number | null>(null);
  const [scrapedByState, setScrapedByState] = useState<Record<string, number>>({});

  useEffect(() => {
    if (authLoading || !session) return;

    // This fan-out is 10 queries against the (large) scraped_listings table
    // — purely a nicety so the state-pill toggle can show an instant count.
    // It must NOT race the dashboard's critical fetches (/properties + the
    // carousels): with only 5 pgbouncer connections, firing it on mount
    // queues /properties behind 10 full scans. Defer it until the browser
    // is idle (3s hard cap) so the carousels paint first.
    const run = () => {
      // Global total
      getScrapedListings({ page: 1, hideNullPrice: true } as any)
        .then(data => setScrapedGlobal(data.total))
        .catch(() => {});
      // Per-state counts in parallel
      for (const abbr of STATE_KEYS) {
        const postcodes = getPostcodesByBundesland(abbr) ?? [];
        if (postcodes.length === 0) continue;
        getScrapedListings({ page: 1, hideNullPrice: true, postcodes } as any)
          .then(data => setScrapedByState(prev => ({ ...prev, [abbr]: data.total })))
          .catch(() => {});
      }
    };

    const ric = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    });
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    if (ric.requestIdleCallback) {
      idleId = ric.requestIdleCallback(run, { timeout: 3000 });
    } else {
      timerId = setTimeout(run, 1500);
    }
    return () => {
      if (idleId !== undefined) ric.cancelIdleCallback?.(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
    };
    // session?.user?.id stable across token refresh.
  }, [authLoading, session?.user?.id]);

  // Compute scraped total from cache — instant on toggle
  const scrapedTotal = useMemo(() => {
    const activeStates = STATE_KEYS.filter(k => activePresets.has(k));
    if (activeStates.length === 0) return scrapedGlobal;
    // Sum individual state counts (exact since postcodes are state-unique)
    const allCached = activeStates.every(k => k in scrapedByState);
    if (!allCached) return null; // still loading
    return activeStates.reduce((sum, k) => sum + (scrapedByState[k] ?? 0), 0);
  }, [activePresets, scrapedGlobal, scrapedByState]);

  const set = (field: keyof FilterValues) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setFilterValues(prev => ({ ...prev, [field]: e.target.value }));
  };

  // ADR-008 dashboardMode: clicking a saved filter pill populates the
  // tile's search fields rather than applying as a hard filter. Lets
  // the user start from a saved filter and tweak before navigating.
  const applyFilterToFields = useCallback((sf: SavedFilter) => {
    setFilterValues(savedFilterToValues(sf));
  }, []);

  // ── Live count: how many of user's properties match current filters ──
  // In dashboardMode (ADR-008) saved filters are baked into filterValues
  // when the user clicks a filter pill, so there's no separate saved-filter
  // OR pass to do here.
  const matchCount = useMemo(() => {
    return properties.filter(p => {
      // Exclude terminal
      if (p.status === 'not_relevant' || p.status === 'delisted') return false;

      // Preset filters
      if (activePresets.size > 0 && !passesPresetFilters(p, activePresets)) return false;

      // Form field filters (which may have been populated from a saved filter)
      if (!passesFilterValues(p, filterValues)) return false;

      return true;
    }).length;
  }, [properties, activePresets, filterValues]);

  // Build query params for navigation
  function buildQueryString(): string {
    const params = new URLSearchParams();
    const v = filterValues;
    if (v.keyword) params.set('keyword', v.keyword);
    const postcodes = resolvePostcodes(v.location);
    if (postcodes.length) params.set('postcodes', postcodes.join(','));
    if (v.minPrice) params.set('minPrice', v.minPrice);
    if (v.maxPrice) params.set('maxPrice', v.maxPrice);
    if (v.minPricePerSqm) params.set('minPricePerSqm', v.minPricePerSqm);
    if (v.maxPricePerSqm) params.set('maxPricePerSqm', v.maxPricePerSqm);
    if (v.minSize) params.set('minSize', v.minSize);
    if (v.maxSize) params.set('maxSize', v.maxSize);
    if (v.minRooms) params.set('minRooms', v.minRooms);
    if (v.maxRooms) params.set('maxRooms', v.maxRooms);
    // ADR-022 chip criteria — carried to /search so the pill bar restores them.
    if (v.propertyType.length) params.set('propertyType', v.propertyType.join(','));
    if (v.rentRegulationCategory.length) {
      params.set('rentRegulationCategory', v.rentRegulationCategory.join(','));
    }
    if (v.tomMaxDays) params.set('tomMaxDays', v.tomMaxDays);
    if (v.sortBy && v.sortBy !== 'listedDate') params.set('sortBy', v.sortBy);
    if (v.sortOrder && v.sortOrder !== 'desc') params.set('sortOrder', v.sortOrder);
    // Pass active preset selections
    if (activePresets.size > 0) params.set('presets', Array.from(activePresets).join(','));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }

  const hasAnyFilter = activePresets.size > 0 ||
    !!filterValues.keyword || !!filterValues.location ||
    !!filterValues.minPrice || !!filterValues.maxPrice ||
    !!filterValues.minSize || !!filterValues.maxSize ||
    !!filterValues.minRooms || !!filterValues.maxRooms;

  const inputClass = 'border border-gray-200 rounded px-2.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';
  const labelClass = 'text-xs text-gray-400 font-medium';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-1">{t('title')}</h3>
          <p className="text-sm text-gray-400 mb-3">{t('subtitle')}</p>
        </div>
        <AddPropertyButton />
      </div>

      {/* ADR-008 pill bar — Bundesland row + source/filter row.
          dashboardMode: clicking a saved filter pill populates the
          search fields below rather than applying as a hard filter. */}
      <PresetFilters
        active={activePresets}
        onChange={setActivePresets}
        savedFilters={savedFilters}
        onDeleteFilter={removeFilter}
        dashboardMode
        onApplyToFields={applyFilterToFields}
        compact
        values={filterValues}
        onValuesChange={setFilterValues}
      />

      {/* Filter fields — wrapped in a <form> so pressing Enter in any
          input fires the search (matches the Search button below). Without
          the form, Enter would either do nothing (correct browser default)
          or, in some implicit-submission scenarios, trigger the first
          ambient <button>; this guarantees Enter always means "search". */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/search${buildQueryString()}`);
        }}
        className="space-y-2 mb-3"
      >
        {/* ADR-023 §5.4 — the embedded field form is replaced by the
            compact pill bar above when PILL_BAR_ONLY_FILTERS is on. */}
        {!PILL_BAR_ONLY_FILTERS && <>
        {/* ADR-008 PT1 — keyword input hidden behind SEARCH_INPUT_ENABLED.
            When the flag is false the row collapses to a single
            full-width Location input; state hooks, URL plumbing, and
            the parent <form>'s Enter-runs-search wiring stay live for
            re-enable. */}
        {SEARCH_INPUT_ENABLED ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>{t('keyword')}</label>
              <input type="text" value={filterValues.keyword} onChange={set('keyword')} placeholder={t('keywordPlaceholder')} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('location')}</label>
              <input type="text" value={filterValues.location} onChange={set('location')} placeholder={t('locationPlaceholder')} className={inputClass} />
            </div>
          </div>
        ) : (
          <div>
            <label className={labelClass}>{t('location')}</label>
            <input type="text" value={filterValues.location} onChange={set('location')} placeholder={t('locationPlaceholder')} className={inputClass} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('priceFrom')}</label>
            <input type="number" step="1000" value={filterValues.minPrice} onChange={set('minPrice')} placeholder="€ min" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>{t('priceTo')}</label>
            <input type="number" step="1000" value={filterValues.maxPrice} onChange={set('maxPrice')} placeholder="€ max" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('size')}</label>
            <div className="flex gap-1">
              <input type="number" value={filterValues.minSize} onChange={set('minSize')} placeholder="min m²" className={inputClass} />
              <input type="number" value={filterValues.maxSize} onChange={set('maxSize')} placeholder="max m²" className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>{t('rooms')}</label>
            <div className="flex gap-1">
              <input type="number" value={filterValues.minRooms} onChange={set('minRooms')} placeholder="min" step="0.5" className={inputClass} />
              <input type="number" value={filterValues.maxRooms} onChange={set('maxRooms')} placeholder="max" step="0.5" className={inputClass} />
            </div>
          </div>
        </div>
        </>}
        {/* Hidden submit so Enter triggers the form's onSubmit even when
            no visible submit button is inside the form (the visible Search
            link is intentionally outside the form so Cmd-click still
            opens it in a new tab). */}
        <button type="submit" hidden tabIndex={-1} aria-hidden />
      </form>

      {/* Action buttons at bottom */}
      <div className="mt-auto space-y-2 pt-3 border-t border-gray-100">
        {(() => {
          // searchAgents = email-only, no scraped. excludeSearchAgents = scraped + non-email own.
          // matchCount already reflects preset filters on user's own properties.
          const includeScraped = !activePresets.has('searchAgents');
          const scrapedCount = includeScraped ? (scrapedTotal ?? 0) : 0;
          const totalCount = matchCount + scrapedCount;
          const countText = scrapedTotal !== null || !includeScraped
            ? totalCount.toLocaleString('de-AT')
            : `${matchCount}+`;
          return (
            <>
              <Link
                href={`/search${buildQueryString()}`}
                className="flex items-center justify-between w-full px-3 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>🔍 {t('searchButton')}</span>
                  <span className="text-xs font-normal opacity-70">{t('searchDesc')}</span>
                </span>
                <span className="text-xs font-semibold bg-white/20 px-2 py-0.5 rounded-full">
                  {countText} {t('matchCount')}
                </span>
              </Link>
              <Link
                href={`/finder${buildQueryString()}`}
                className="flex items-center justify-between w-full px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span>🃏 {t('finderButton')}</span>
                  <span className="text-xs font-normal text-gray-400">{t('finderDesc')}</span>
                </span>
                <span className="text-xs font-semibold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                  {countText} {t('matchCount')}
                </span>
              </Link>
            </>
          );
        })()}
      </div>
    </div>
  );
}
