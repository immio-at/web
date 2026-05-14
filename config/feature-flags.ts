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
