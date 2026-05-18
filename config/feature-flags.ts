/**
 * Compile-time feature flags. Constants, not env-driven — flip a value
 * here and redeploy. Use only for UI surfaces that need to be hidden
 * temporarily without ripping out the underlying state, form wiring,
 * or URL plumbing.
 */

/**
 * ADR-008 PT1 — keyword text input on Dashboard Discover tile and on
 * Discover (Entdecken) page. Hidden until the search is re-designed
 * with a proper definition of its purpose.
 *
 * Background: the literal-substring matcher trained testers to mistrust
 * the platform — searching `Neubau` (an Austrian property classification
 * meaning "new build") returned 7th-district Vienna listings (the 1070
 * Neubau district), not newly-built properties.
 *
 * When flipped back to `true`:
 *   - The keyword `<input>` JSX block on DiscoverTile and the keyword
 *     `<input>` block in FilterBar both render.
 *   - State hooks, `<form onSubmit>` Enter-runs-search wiring (Session
 *     47), URL param plumbing, and i18n keys are already in place — no
 *     other code change required.
 */
export const SEARCH_INPUT_ENABLED = false;

/**
 * ADR-023 — the pill bar becomes the single filter UI. While this flag is
 * `false` (migration step C2), the legacy `FilterBar` form stays the active
 * filter surface and the new pill-bar filter rows (range sliders, chips,
 * TOM, sort, postcode entry) are built but not rendered. Flipping to `true`
 * (step C3) removes `FilterBar` and renders the consolidated pill bar.
 *
 * When flipped to `true`:
 *   - Discover, Dashboard tile, Finder, Funnel render the pill bar's full
 *     R1–R10 inventory; `FilterBar` is no longer mounted.
 *   - The new components in `components/filters/` (RangeSlider, TomFilter,
 *     PropertyTypeChips, RentRegulationChips, PostcodeEntry, SortDropdown)
 *     become the active filter controls.
 */
export const PILL_BAR_ONLY_FILTERS = true;

/**
 * ADR-024 — Smart Search Field. The R3 pill-bar slot reserved by ADR-023
 * v1.1. When `true`, Discover renders the smart-search text field that
 * tokenises Austrian property vocabulary into chip / slider / postcode
 * suggestions; when `false` the R3 slot collapses (R2 → R4 directly).
 *
 * Flipped to `true` at ADR-024 step C5 — the public release — after the
 * C4 tester walkthrough. While `false`, all of C1–C3 (token vocabulary,
 * tokeniser, UI components, the rewired `keyword` backend param) is built
 * and shippable but produces zero user-visible change.
 */
export const SMART_SEARCH_ENABLED = false;
