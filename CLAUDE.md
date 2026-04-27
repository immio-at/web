# CLAUDE.md — IMMIO Web (Frontend)

## Project Overview
IMMIO is an Austrian property investment SaaS. This is the Next.js frontend hosted on
Vercel at `immio.at`. It connects to the NestJS backend at Railway via REST API.
Users manage property listings through a dashboard, kanban funnel, Tinder-style Finder,
and a full-screen ROI calculator modal (Property Analysis).

## Stack
- **Framework:** Next.js (App Router) + React + TypeScript
- **Styling:** Tailwind CSS v4
- **Auth:** Supabase Auth client (`@supabase/supabase-js`) — session managed client-side
- **Hosting:** Vercel — auto-deploys on push to `main`
- **API:** REST calls to Railway backend

## Key URLs
- Production frontend: `https://immio.at`
- Backend API: `https://backend-production-e03a.up.railway.app`

## Repository
`immio-at/web` (GitHub org: immio-at)

---

## Commands

```bash
# Install dependencies
npm install

# Development server
npm run dev                    # Runs on localhost:3000

# Build
npm run build

# Deploy
git push origin main           # Vercel auto-deploys on push to main
```

## Development Workflow
- **No local test environment in use** — changes are tested live after pushing to Vercel
- Vercel preview deployments are generated for every push — check preview URL before
  merging to main if a staging environment is not yet configured
- **Staging environment on Railway (backend) is a pending task** — coordinate frontend
  and backend staging together when this is set up

---

## Architecture

### Route Structure
```
app/[locale]/                        ← All routes under locale segment (de default, en)
├── page.tsx                         ← Landing page (public) — Sign In + Register modals
├── layout.tsx                       ← Locale layout with NextIntlClientProvider
├── impressum/page.tsx               ← Austrian ECG compliant (public)
├── datenschutz/page.tsx             ← GDPR compliant (public)
├── register/page.tsx                ← Reads ?email= query param, pre-fills email field
├── pending/page.tsx                 ← Pending approval page
└── (authenticated)/                 ← Route group — all protected pages
    ├── layout.tsx                   ← Wraps all authenticated pages with NavBar
    ├── dashboard/page.tsx           ← Tile + table view, search, filter, sort
    ├── funnel/page.tsx              ← Drag-and-drop kanban, 8 stages
    ├── finder/page.tsx              ← Tinder-style swipe UI
    ├── settings/page.tsx
    ├── search/page.tsx              ← Entdecken — browse scraped listings, filter + save to funnel
    ├── analytics/page.tsx           ← Live data dashboard (stat cards, funnel chart, heatmap, milestones)
    └── admin/page.tsx               ← User management, invite codes
```

### Critical Architectural Rules

**No `/login` route exists**
Auth is modal-only. Sign In and Register are modals on the landing page.
Do not create a `/login` route. Session expiry redirects to `/?signin=true`.

**AuthContext is the single source of truth for session**
- Location: `contexts/AuthContext.tsx`
- Provides: `session`, `authLoading`, `immioEmail`, `userEmail`, `isAdmin`, `approved`
- Uses Supabase client for automatic token refresh
- Backend login response is synced via `supabase.auth.setSession()` so the Supabase
  client holds the live session and auto-refreshes tokens
- App-specific fields (`immioEmail`, `isAdmin`, `approved`) are stored in context
  AND persisted to localStorage as cache
- Fallback: if `immioEmail` missing from localStorage on session restore, fetches from
  `GET /auth/me` and caches the result. Fixes returning users after browser cache clear.
- **Never** read auth state from `supabase.auth.getSession()` directly in components —
  always read from `AuthContext`
- **Cross-user cache clearing (CRITICAL)** — sign-out + sign-in on the same tab was leaking the previous user's data via module-level caches. AuthContext now calls `clearAllUserCaches()` from BOTH `signOut()` AND a `useEffect` that watches `session?.user?.id` (defense in depth — covers session expiry + re-login, OAuth callback for a different user, etc.). The helper calls `clearPropertiesCache()`, `clearSavedFiltersCache()`, and `clearAnalyticsCache()`. **Any new module-level cache that holds user-scoped data MUST export a clear function and add it to `clearAllUserCaches()`** — otherwise it leaks.

**useProperties hook — session guard**
- Location: `hooks/useProperties.ts`
- Waits for `authLoading === false && session !== null` before fetching
- Provides: `properties`, `loading`, `update()`, `optimisticUpdate()`, `optimisticInsert()`
- `optimisticInsert(property)` — prepends a new property to the module-level cache instantly, notifies all listeners. Used by AddPropertyModal for zero-delay display on Funnel/Dashboard. De-dupes against the follow-up background refresh.
- 30-second TTL cache
- `update()` mirrors backend rule: clears `listingStatus` to `active` optimistically

**useInteractionTracker hook — backend-powered interaction tracking**
- Location: `hooks/useInteractionTracker.ts`
- Tracks property interactions via `POST /properties/:id/interactions` (fire-and-forget)
- 2-second debounce per property+type to avoid flooding the API
- Provides: `track(id, type)`, `getRecentlyViewed(limit)` (async, fetches from backend)
- Interaction types: `view`, `analysis`, `url_click`, `status_change`
- Used by Dashboard for "Recently Viewed" carousel
- localStorage implementation removed — old key `immio_property_interactions` is harmless
- `optimisticUpdate()` patches arbitrary `Property` fields in cache instantly

**Route group layout**
- `app/[locale]/(authenticated)/layout.tsx` wraps all protected pages with NavBar
- Public pages sit in `app/[locale]/` — locale detection via middleware
- Guard: redirect to `/?signin=true` if no session

**i18n (next-intl)**
- Two locales: `de` (default, no URL prefix), `en` (`/en/` prefix)
- Config: `i18n/routing.ts`, `i18n/request.ts`, `i18n/navigation.ts`
- Middleware: `middleware.ts` — locale detection and prefix management
- Translation files: `messages/de.json`, `messages/en.json` — 14 namespaces, 850+ strings
- All components use `useTranslations('namespace')` for client components
- Legal pages use `getTranslations('namespace')` for server components
- Navigation uses `Link`, `useRouter`, `usePathname` from `@/i18n/navigation` (not `next/navigation`)
- NavBar has DE/EN toggle button — uses `router.replace(pathname, { locale })` to switch
- Locale preference persisted to `localStorage` key `immio_locale`
- Funnel stage names use `funnel.stages.*` namespace — shared between FunnelBoard and DashboardClient
- Stage key mapping: snake_case DB keys (`due_diligence`) → camelCase i18n keys (`dueDiligence`) via `STAGE_I18N_KEY`
- **When adding new strings**: add to BOTH `messages/de.json` and `messages/en.json`

**Google OAuth sign-in**
- "Sign in with Google" button in SignInModal
- Flow: `supabase.auth.signInWithOAuth({ provider: 'google' })` → Google → Supabase callback → `/auth/callback`
- Callback page (`app/[locale]/auth/callback/page.tsx`): gets session, calls `POST /auth/oauth-callback` to provision/retrieve Prisma user, sets AuthContext, redirects to dashboard
- First-time OAuth users auto-provisioned (approved: true, immioEmail generated)
- Google consent screen shows Supabase domain (normal — custom domains is paid feature)
- Config: Google Cloud Console OAuth credentials + Supabase Authentication → Providers → Google
- Supabase URL Configuration: Site URL = `https://immio.at`, Redirect URLs include `https://immio.at/auth/callback`

---

## Key Components

```
components/
├── SignInModal.tsx              ← Modal auth — never a separate page
├── RegisterModal.tsx           ← Optional invite code field
├── NavBar.tsx                  ← Reads isAdmin from AuthContext for admin link
├── DashboardClient.tsx         ← Dashboard logic: tiles/table views, carousels, filters
├── FilterBar.tsx               ← Shared filter component (Search, Dashboard, Finder)
├── PropertyAnalysisModal.tsx   ← Full-screen ROI calculator + document uploads
├── PropertyCard.tsx            ← ADR-012 unified card. Props: `compact`, `fullWidth`, `draggable: { onDragStart, onDragEnd }`. Actions include `onMoveStage(item, DOMRect)` — when set on own items, heart click fires it so the parent can open a stage-picker dropdown anchored to the button. Funnel kanban uses `compact + fullWidth + draggable`; stage-zoom uses full-size (no compact); Dashboard carousels use compact (w-48 fixed width); Discover uses full-size.
├── SortControl.tsx             ← Standalone sort dropdown + asc/desc toggle. Used prominently on Discover (above results grid) + Finder (under pill bar). Auto-refreshes on change.
├── UndoToastStack.tsx          ← Bottom-left stack of 5-second undo toasts. Used on Discover for ✕ dismissals. Stacks upward via `flex-col-reverse`. Per-entry timer keyed to `createdAt`.
├── ingestion/                  ← ADR-010: AddPropertyButton (accepts `size: 'default' | 'lg'`), AddPropertyModal, UrlTab, ExposeTab, ManualTab, StageSelectorInput, SupportedPortalLogos
├── (inline in search/page.tsx) ← ListingCard — scraped listing card with save button
└── analysis/
    ├── PropertyInfoStrip.tsx
    ├── UsageSelector.tsx
    ├── PurchaseSection.tsx
    ├── FinancingSection.tsx
    ├── OwnerInputs.tsx / RentalInputs.tsx / FlipInputs.tsx
    ├── OwnerResults.tsx / RentalResults.tsx / FlipResults.tsx
    └── calculators.ts          ← Pure calculation functions — NO side effects
                                   All ROI formulas live here, client-side only

lib/
├── api.ts                      ← All backend API call functions + TypeScript interfaces
├── austria-plz-bundesland.ts   ← Austrian postcode ↔ Bundesland mapping (2221 PLZ, 9 states)
├── austria-plz-bundesland.json ← Raw dataset (77KB, imported at build time)
├── constants.ts                ← Funnel stage definitions (FUNNEL_STAGES, FUNNEL_STAGES_DISPLAY)
└── supabaseClient.ts           ← Supabase client singleton

i18n/
├── routing.ts                  ← Locale config (de default, en, localePrefix: 'as-needed')
├── request.ts                  ← Server-side message loading
└── navigation.ts               ← Locale-aware Link, useRouter, usePathname

messages/
├── de.json                     ← German translations (14 namespaces, ~32KB)
└── en.json                     ← English translations (14 namespaces, ~31KB)

Scraped listings API (in lib/api.ts):
- `ScrapedListing` interface — id, platform, title, price, sizeSqm, rooms, location, zipCode, imageUrl, savedByUser
- `getScrapedListings(filter)` — GET /scraped-listings with keyword/postcodes/price/size/rooms/hideNullPrice/sort
- `saveScrapedListing(id)` — POST /scraped-listings/:id/save → creates Property in user's funnel
```

---

## Property Analysis (ROI Calculator)

**All calculations run client-side** — backend stores inputs only, never calculates.
Formula logic lives exclusively in `components/analysis/calculators.ts`.
These are pure TypeScript functions with no side effects — keep them that way.

### Modal Entry Points
- Dashboard tile view — "Analyse" button on each card
- Dashboard table view — "Analyse" button on each row
- Funnel board — "🔍 Analyse" button on each card
- Finder — downswipe action opens the Analyse modal

### Usage Types
`owner` (Eigennutzung) | `rental` (Vermietung) | `flip`

---

## Property & Funnel State

### Funnel Stages — canonical list
`new` → `investigating` → `interested` → `due_diligence` → `offer_made`
→ `won` | `parked` | `not_relevant` | `delisted`

**Stage semantics** (Session 38, 2026-04-16):
- **investigating** — landing spot for anything slightly interesting.
- **interested** — passed the first check; user is working through a brief analysis (quick calculation or gathering more detail).
- **due_diligence** — in-depth analysis, property visit, scouring documents, talking with lawyer / coach / accountant about the impact of purchase. Merged from the previous `due_diligence_completed` + `visited` stages (Session 38) — a property visit is part of the due-diligence work.
- **offer_made** — due diligence passed and an offer was submitted.
- **parked** — due diligence didn't pass but the user isn't ready to discard completely (side branch, not forward motion).
- **won** — purchase closed.

`due_diligence` history: renamed from `visit_booked` → `due_diligence_completed` (Session 31, 2026-04-10), then `due_diligence_completed` merged with `visited` → `due_diligence` (Session 38, 2026-04-16). The DB key is `due_diligence` (snake_case), the i18n key is `dueDiligence` (camelCase), the preset key is `stage_due_diligence`. Stage keys appear in many places (FUNNEL_STAGES in `lib/constants.ts`, STAGE_KEY_TO_STATUS in `lib/preset-filters.ts`, FUNNEL_STATUSES in `lib/recommendations.ts`, several STAGE_I18N_KEY copies in FunnelBoard / PropertyCard / analytics page / FunnelSummaryTile, the `STAGES` list in `StageSelectorInput.tsx`) — any future stage rename must touch ALL of these.

Terminal stages: `won`, `parked`, `not_relevant`, `delisted`
- `delisted` — hidden from all views (user dismissed an expired listing)
- `TERMINAL_STAGES` constant is defined here AND in backend `properties.service.ts`
  — update BOTH if adding a new terminal stage

### Expired Listings UI Rules
- `delisted` properties filtered from Dashboard and Funnel views
- Expired (but not delisted) properties show amber "Nicht mehr verfügbar" badge
- Expired property images are greyscale with muted border
- Funnel dropdown: active cards show "⚠ Report Unavailable", expired show "✕ Remove from View"
- All actions are optimistic — update cache immediately, fire API in background

---

## Styling Conventions
- Tailwind CSS v4 — use core utility classes only
- No separate CSS files — styles inline with Tailwind classes
- German-language UI throughout — match existing component language
- `Remove-Item -Recurse -Force .next` to clear Next.js build cache if needed (Windows)

---

## API Layer (`lib/api.ts`)
All backend calls go through functions defined here.
TypeScript interfaces for all entities are defined here.
The `Property` interface includes:
- `listingStatus: 'active' | 'expired'`
- `listingExpiredAt: string | null`
- `previousListingId: string | null`

API functions include:
- `getProperties()`, `updateProperty()`, `reportUnavailable()`, `delistProperty()`
- `createAnalysis()`, `getAnalyses()`, `updateAnalysis()`, `deleteAnalysis()`
- `oauthCallback(accessToken)` — provisions/retrieves OAuth user after Google sign-in

---

## Bazar.at Onboarding Note
Bazar.at email parser requires **auto-forward filter** (Gmail rule), NOT manual forwarding.
Gmail manual forwards strip the HTML — Bazar listings will not parse correctly.
Any onboarding guide or tooltip must explicitly recommend auto-forward filter setup,
not manual forwarding.

---

## Environment Variables (Vercel)
Set in Vercel dashboard — never commit to git.
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` — points to Railway backend

---

## TODO — Active Work Queue (Priority Order)
*Source of truth: `docs/IMMIO-Project-State.md`*
1. **Track 4 P3 — Impressum address (TD2)** — replace placeholder with GmbH address. **Launch blocker.**
2. **Track 4 P1 — Email forwarding setup assistant** — in-app guide for Gmail / Apple Mail / Outlook. Auto-forward filter for Bazar.
3. **Track 4 P4 — Dark mode** — OS `prefers-color-scheme` default + Light/Dark/Auto override in Settings.
4. **Track 5 — Apple + LinkedIn Sign-In** — prerequisites for native mobile app.
5. **Track 6 PL2 — Native mobile app** — React Native / Expo, iOS + Android.
6. **Track 8 — Onboarding wizard, map view** — deferred until tester feedback.

Recently completed (Session 43, 2026-04-27):
- **Track 13 (ADR-003 v2.1 + ADR-009 v1.1) — modal shell + Makler block** shipped end-to-end on `dev`. Modal restructured: title + Deal ID inline grey pill → `PropertyInfoStrip` (always visible) → `MaklerBlock` (always visible, hidden when empty) → mode toggle → tab bar (Analysen mode only) → content. Paperclip 📎 icon dropped from the dossier toggle. State-side: `mrgRisk` replaced by full `PropertyDetails` so MRG banner and Makler block share one fetch.
- **DE rename** `Dossier` → `Objektdaten` in `legal.datenschutz.viewMode.dossier`. Internal value `'dossier'` and component file name `DossierTab.tsx` unchanged. EN unchanged.
- **`MaklerBlock.tsx`** new component. Empty state: dashed-border ghost button "+ Makler hinzufügen". Populated state: name/organisation row + tappable phone/email row with `EditableEditAffordance` (small ✎) so the common-case one-click call/email path stays intact. Pre-filled `mailto:` subject combines property title + Deal ID, with a sensible fallback when title is null. Both link types fire `trackInteraction(id, 'makler_contact')` fire-and-forget BEFORE the OS handoff.
- **API client deltas (`lib/api.ts`):** `PropertyDetails` interface gains `maklerName/Phone/Email/Organisation`; `InteractionType` union and `useInteractionTracker.ts` mirror gain `'makler_contact'`. `propertyModal.makler.*` i18n namespace added in DE + EN.
- **TD15 resolved (backend)** — IS24 email-import title backfill via fire-and-forget `parseImmoScout24Url`. Frontend picks up via SSE.
- **Landing-page EN→DE language toggle fix** (`app/[locale]/page.tsx`) — switched to `@/i18n/navigation` wrappers and `router.replace(pathname, { locale })`. The previous manual path manipulation didn't update the `NEXT_LOCALE` cookie, so middleware kept serving English.
- **TD20 — Datenschutzerklärung Makler clause** published as the binding tester-phase boilerplate at `/datenschutz` §7 (DE + EN). Existing §7–9 (Beschwerderecht, Cookies, Änderungen) bumped to §8–10. New `MaklerClause` + `ClauseBlock` sub-components in `app/[locale]/datenschutz/page.tsx`. Footer bumped to "Version 1.1 (Tester-Boilerplate)" / "April 2026". Lawyer review running in parallel — final wording will be a pure i18n swap of `legal.datenschutz.section7.*`.

Recently completed (Session 42, 2026-04-22):
- **ADR-013 Due Diligence Check Engine — frontend** shipped end-to-end. Single `components/due-diligence/DueDiligencePanel.tsx` with idle → precheck → running → results state machine (not the three separate components originally scoped). Mounted inside `DossierTab` **below** the AI Extraction section (Extraction sits higher per demo feedback). `runDueDiligence()` + `getDueDiligenceResults()` API client. `DueDiligenceCheckResult` + `DueDiligenceRun` types. `dueDiligence.*` i18n namespace DE + EN. Running-screen hint says "up to 2 minutes" (429-retry can stretch out the run).
- **Dossier Documents redesigned:** drag-and-drop zone on the whole Documents card (`onDragOver`/`onDragLeave`/`onDrop` with `isDragging` state for teal highlight). Multi-file `<input multiple>` with `Promise.allSettled` parallel uploads. **Label dropdown removed from upload UI** — label is auto-inferred from filename keywords via `inferLabelFromFilename()` (grundbuch → Grundbuchauszug, eaw/hwb/energie → Energieausweis, wohnungseigentum/wev → Wohnungseigentumsvertrag, abrechnung/bk → Protokoll, etc.). Unknown filenames fall back to Sonstiges. Each row's label becomes an inline `<select>` so users can correct mistakes (optimistic PATCH with rollback via `updateDocumentLabel()`).
- **Two new document labels** added to `DOC_LABELS` (mirroring backend): `Grundbuchauszug` and `Wohnungseigentumsvertrag` (WEG/WEV). Now 12 labels total.
- **Extract section layout:** matched to DD panel (title + subtitle on left, right-aligned Pro-only button). Hint copy updated to "Extract structured property data into an analysis from your uploaded Exposé" / "Strukturierte Immobiliendaten aus dem hochgeladenen Exposé in eine Analyse übernehmen".
- **Dossier section order:** Documents → **AI Extraction** → Due Diligence → Structured Data. AI Extraction sits above Due Diligence.
- i18n: new `documents.choose`, `documents.dropHint`, `documents.errorPdfOnly`; `dueDiligence.*` namespace; `dueDiligence.results.documentsUsed`.

Recently completed (Session 40, 2026-04-20):
- ADR-014 Browser Extension — `/auth/extension-callback` (hash-based token handoff to extension), `/extension-welcome` (first-run page).
- Funnel `?analyse=PROPERTY_ID` deep-link auto-opens PropertyAnalysisModal. Used by the extension's "Already in IMMIO" button.
- PropertyCard: house icon replaces heart (inline SVG, filled/stroked states).
- Analysis modal: funnel stage `<select>` dropdown in the info strip next to "Öffnen". Stage changes fire `useProperties().update` optimistically.
- Analysis modal crash fix: `property.sizeSqm` is a Prisma Decimal string → `NumInput.toFixed()` crashed. `parseFloat(String(...))` at assignment + runtime guard in `NumInput`.
- Discover: `onReportDead` zero-lag via shared `hideCard()` + `dismissedIds`. Action stack moved outside `<a>` with `z-10` for reliable click targets.

Recently completed (Session 39, 2026-04-16):
- Session 37 + 38 promoted to prod (immio.at + IMMIO-backend). Includes TD14 catch-up migration, stage merge (`visited`+`due_diligence_completed`→`due_diligence`), ADR-012/013, SortControl, etc.
- Parked ↔ Won column swap; Offer Made recoloured `blue-400`.
- Full-width funnel kanban via `grid-template-columns: repeat(N, minmax(0, 1fr))` — removed the old `overflow-x-auto` + `w-60` fixed sizing.
- PropertyCard image +10% taller (compact `h-[7.7rem]`, full `h-[13.2rem]`).
- Discover dismiss — zero-lag via local `dismissedIds` Set; new `UndoToastStack` (5s per-entry, bottom-left, stacks upward).

Recently completed (Session 38, 2026-04-16):
- Unified PropertyCard on Funnel kanban + stage zoom (heart opens stage picker for own via `onMoveStage`).
- AddPropertyButton repositioning across Dashboard (DiscoverTile header), Funnel (right-aligned `headerAction` slot), Discover (inline with filter fields at input height via `size='lg'`).
- Three-phase column-header palette.
- Stage merge: `visited` + `due_diligence_completed` → `due_diligence`.

Recently completed (Session 37, 2026-04-15):
- ADR-012 + ADR-013 shipped (Tracks 10 + 11). Scraped save → Investigating + SSE emit + optimisticInsert. TD14 resolved (retroactive ADR-009 DO1 migration). SSE refresh-in-place pattern replaces clearXxxCache flash-empty. SortControl + hideNullPrice hardcoded.

Recently completed (Session 36):
- Register error mapping — `lib/registerErrors.ts` translates backend error codes (weak_password, user_already_exists, invalid_email) to localised DE + EN strings. Used by RegisterModal + `/register` page. Fallback to backend message for unknown codes.

Previously completed (Session 35):
- Track 4 P2 — `/kontakt` page mirroring impressum layout. Honeypot form, DE + EN i18n, footer link swapped from mailto.
- Request Access flow — back button + Google OAuth on both RegisterModal and `/register` page. OAuth users auto-approved server-side.
- OAuth admin bug fix — AuthContext session-restore fallback now triggers on missing `isAdmin`/`approved` and persists both via `GET /auth/me`.

Previously completed (Session 34):
- ADR-010 URL parsers — ImmoScout24, s REAL, Raiffeisen added to SupportedPortalLogos (4 portals live)
- TD1 resolved — SSE cache invalidation: useSSEInvalidation hook + SSEProvider in authenticated layout
- RecommendedCarousel cross-user leak fixed (clearRecommendedCache exported + registered)

Previously completed (Sessions 32–33):
- ADR-010 Property Ingestion UI core modal (I1–I7, I13)
- ADR-008 Filter Management UI (F1–F6)
- ADR-009 Property Dossier (DO1–DO8)
- Cross-user cache leakage security fix

## Filter Management UI (ADR-008)
- `lib/preset-filters.ts` — types, definitions, `passesPresetFilters()`, `passesSavedFilters()`, `passesFilterValues()`, `savedFilterHasLocation()`, `togglePreset()`
- `components/PresetFilters.tsx` — pill bar shell. Owns its own FilterModal state internally so each parent doesn't have to plumb open/close/mode. Props:
  - `active`, `onChange` — preset key set
  - `savedFilters`, `activeSavedFilterIds`, `onToggleSavedFilter` — user filter pills + multi-select state
  - `onDeleteFilter` — passed from parent (typically `useSavedFilters().remove`)
  - `align?: 'left' | 'center'` — default left, Finder centres
  - `showStages?: boolean` — default false. Discover sets true to render the third stages row
  - `compact?: boolean` — smaller pills + tighter spacing for the Dashboard tile
  - `dashboardMode?: boolean`, `onApplyToFields?: (filter) => void` — dashboardMode disables hard-filter activation; clicking a saved filter pill instead populates the parent's field state via the callback
- **Layout** (Session 32): 2 rows by default — Row 1 = Bundesland (9 states, multi-select), Row 2 = Search Agents · No Search Agents (radio) · `|` divider · user filter pills with kebab Edit/Delete · `+` pill · clear-all link. Discover gets a third stages row inserted between Row 1 and Row 2.
- **Bundesland override (F5)** — when any active saved filter has `postcodes / bezirke / bundeslaender` non-empty, the Bundesland pills are cleared and rendered greyed/disabled with a "Standort vom gespeicherten Filter gesetzt" tooltip. Implemented via a `useEffect` that watches the active saved-filter set and strips state keys from `active`.
- `components/filters/UserFilterPill.tsx` — single user-defined filter pill with kebab dropdown. Edit (opens FilterModal pre-filled), Delete (confirm dialog → `onDeleteFilter`).
- `components/filters/FilterModal.tsx` + `FilterModalForm.tsx` — full-form create/edit modal. Live property count combines own properties (instant from cache) + scraped listings (debounced 400ms `getScrapedListings`). Two save buttons: Update + Apply (edit only, PATCHes in place) and Save as New + Apply (POST). Closes on Escape and outside click.
- Source presets: "Search Agents" / "Exclude Search Agents" (mutually exclusive, check `emailReceivedAt`)
- Stage presets: 8 funnel stages (New, Investigating, Interested, Due Diligence, Offer Made, Parked, Won, Not Relevant). OR within group. Scraped listings without status pass through. (Visited was merged into Due Diligence in Session 38.)
- State presets: 9 Austrian states (OR within group, AND with other groups). Sent server-side on Discover and Finder (resolved to postcodes via `getPostcodesByBundesland`)
- Dashboard Discover tile pre-caches per-state scraped counts on mount (10 parallel calls) for instant toggle
- **`/settings/filters` (F6)** — bulk management page. Lists every filter oldest-first with Edit / Delete / "New filter" actions. Tier limit indicator (X / Y used) with upgrade prompt at the cap. `TIER_LIMITS` constant on the page mirrors the backend SavedFiltersService rules — keep in sync.
- i18n: `presetFilters.*` and `settingsFilters.*` namespaces in de.json + en.json

## Unified PropertyCard (ADR-012)
- `components/PropertyCard.tsx` — shared card across Dashboard carousels (compact), Discover grid (full), Funnel kanban (compact + fullWidth + draggable), and Funnel stage-zoom (full).
- Exports: `CardProperty` interface, `CardActions` interface.
- Layout: image on top with three overlays — source badge top-left (green "… Suchagent" for email-parsed, grey for scraped), heart top-right, `🔍 / ⚠ / ✕` vertical action stack right-middle (hover-visible on desktop, always-visible on mobile). Expired badge bottom-left.
- Heart behaviour:
  - Scraped: outline, click → `onSaveToFunnel` (save to Investigating, optimistic fill). Scraped state resets on `item.id` change so reused card instances don't leak filled state between swipes.
  - Own: filled teal. Default click is a no-op (tooltip shows current stage). On Funnel, `onMoveStage(item, rect)` is provided — click fires it with the heart's bounding rect so the parent can anchor a stage-picker dropdown.
- Props: `compact`, `fullWidth` (compact defaults to `w-48`; set true to use `w-full`), `draggable: { onDragStart, onDragEnd }` (used by the kanban for HTML5 drag).
- Column-header colour palette on the Funnel is defined in `lib/constants.ts` under `FUNNEL_STAGES[].header`. Pair-checks `isLight` in FunnelBoard to choose dark vs white label text.
- i18n: `propertyCard` namespace in de.json + en.json — `saveToFunnel`, `alreadyInFunnel`, `alreadyInFunnelWithStage`, `changeStage`, `changeStageFrom`, `analyse`, `reportDead`, `dismiss`, `expired`.

## Entdecken Page (`/search`)
Browse scraped listings from all active sources (Raiffeisen, s REAL, ÖRAG, RE/MAX, Kurier, Der Standard).
- Unified FilterBar: keyword + PLZ/Bundesland, price + €/m², size + rooms. Add Property + Search buttons inline on the Size + Rooms row, right-aligned via `ml-auto`; no horizontal line.
- Preset + saved filter pills below FilterBar — state presets server-side, time/source client-side.
- `SortControl` rendered prominently above the results grid, next to the listing count + view toggle. Auto-refreshes on change (updates both `filterValues` and `applied`).
- Unified PropertyCard. `✕` dismiss is zero-lag: the search page maintains a local `dismissedIds: Set<string>` applied as the last filter in the listings memo, so cards disappear synchronously regardless of filter-active refetch latency. Pairs with a stacking `<UndoToastStack>` (bottom-left, 5-second per-entry timer). Undo restores own-property status or unhides the scraped row; expire drops the toast and keeps the card hidden.
- Null-price listings always hidden — the `showHidden` checkbox was removed, `hideNullPrice: true` hardcoded everywhere.
- Saving a listing optimistically inserts into the `useProperties` cache so the Funnel's Investigating column populates instantly.
- Pagination: 20 per page (hidden when client-only presets active).
- Reads preset + saved filter selections from URL params (from Dashboard).

## Recommendation Engine
- `lib/recommendations.ts` — derives criteria from funnel properties, scores candidates
- Weights: location=10 (exact postcode full, same state half), price=8, price/m²=5, size=4
- 20% buffer around ranges for partial matches (half weight)
- Locked until ≥5 funnel properties (any stage except not_relevant)
- Dashboard carousel: own `new` properties scored from cache + scraped fetched async, session-cached
- Carousel order: Recommended (top), Recently Viewed, New Arrivals (bottom)

## Property Analysis Modal (ADR-003)
- `components/PropertyAnalysisModal.tsx` — full-screen modal, multi-tab architecture
- `lib/calculators.ts` — all pure calculation functions (purchase, loan, AfA, rental tax, flip tax)
- Multi-analysis tabs: Chrome-style [+]/[✕], auto-naming ("Rental 1", "Flip 2"), dirty indicator
- **Modal shell layout (ADR-003 §10, v2.1, Session 43)** — top-to-bottom: header (title + Deal ID rendered as a small grey pill `bg-slate-100 text-slate-500` inline-right of the title — no longer a stand-alone badge below the title) → `PropertyInfoStrip` (always visible regardless of mode) → `MaklerBlock` (always visible, hidden when empty — see "Property Dossier" section) → mode toggle → tab bar (Analysen mode only) → content. The previous paperclip-icon `📎` entry-point on the dossier toggle is **removed** — mode is selected via the explicit two-button toggle.
- **Mode toggle (ADR-009 DO4)** — `[Analysen] [Objektdaten]` (DE) / `[Analyses] [Dossier]` (EN) pill row. In Objektdaten/Dossier mode the analysis tab bar hides and `<DossierTab />` renders instead. Internal value is still `'dossier'` — only the rendered i18n label changes per locale. Accepts `initialViewMode` prop (`'analyses'` | `'dossier'`, default `'analyses'`) — AddPropertyButton passes `'dossier'` so post-create opens Dossier tab (ADR-010 I6).
- **PropertyDetails fetch consolidation** — modal mounts → `getPropertyDetails(property.id)` once → `details` state (full `PropertyDetails | null`) feeds both the `MrgWarningBanner` (via `details?.mrgRisk`) and the `MaklerBlock`. Stale-after-extract is acceptable — close + reopen to refresh.
- Tax section: Privat/GmbH toggle, AfA (accelerated post-2020), Grenzsteuersatz, KÖSt 23%, KESt 27.5%
- Rental results: pre-tax metrics + after-tax (private: marginal tax; GmbH: retained vs distributed)
- Flip results: private (ImmoESt 30% + Hauptwohnsitzbefreiung); GmbH (KÖSt + KESt side-by-side)
- Liebhaberei warning (25-year cumulative cashflow check)
- **MRG warning banner (ADR-009 DO6)** — `MrgWarningBanner.tsx` rendered in the rental analysis section header when the Dossier flagged `mrgRisk: true`. Reads from the same `details` state as the Makler block (single fetch shared across the modal shell).
- Cost structure: BK umlagefähig (tenant-paid) + BK nicht umlagefähig (owner costs incl. HV reserve) per usage type. Flip includes all BK in holding costs.
- Backend: 6 tax fields on PropertyAnalysis model (legalStructure, purchaseDate, gebaeudeAnteilPct, grenzsteuersatzPct, gmbhAccountingCostsAnnual, distributeProfit)
- **Analysis-draft sync after Dossier → Apply** — when DossierTab fires `onPropertyApplied(field, value)`, the modal's `handleDossierApplied` patches every open analysis tab's draft (`exposePrice → listPrice`, `purchaseDate`, `bkUmlagefaehig`, `bkNichtUmlagefaehig`) and auto-saves saved tabs in the background. Unsaved new tabs (id === null) stay dirty so the user explicitly commits.

## Property Dossier (ADR-009)
- `components/property/DossierTab.tsx` — four sections as of Session 42: Documents → AI Extraction → Due Diligence → Structured Property Data. Mounts inside `PropertyAnalysisModal` when viewMode === 'dossier'.
- `components/property/EditableField.tsx` — generic inline-edit cell. Six input kinds: number, integer, text, date, boolean, enum. Click to edit, Enter or blur commits, Escape cancels (uses a `cancelledRef` so Escape wins the blur race). Purely presentational — parent provides `onSave`.
- `components/property/MrgWarningBanner.tsx` — amber banner reused by DossierTab Section 3 and the rental analysis tab header. Wording is deliberately hedged ("Mögliches MRG-Objekt", "Signale deuten auf", "Rechtliche Beratung wird empfohlen") — never a legal classification.
- `components/property/MaklerBlock.tsx` (ADR-009 v1.1, Session 43) — listing-agent contact card. **Lives in the modal shell, NOT inside DossierTab** (always visible regardless of mode). Empty state: dashed-border ghost button "+ Makler hinzufügen" / "Add agent" (`propertyModal.makler.add`). Populated state: name + organisation row, tappable phone / email row, with an inline `EditableEditAffordance` (✎ button) so the common-case tap-to-call path stays one click. PATCHes via `updatePropertyDetails`. Email uses `mailto:{email}?subject={prefilled}` with subject `Anfrage zu "{title}" ({dealId})` (DE) / `Inquiry about "{title}" ({dealId})` (EN), falling back to `Anfrage zur Immobilie ({dealId})` when title is null. Phone uses raw `tel:{phone}` with no normalisation. Both `mailto:`/`tel:` clicks fire `trackInteraction(propertyId, 'makler_contact')` fire-and-forget BEFORE the OS handoff so the signal still lands when the user completes the action outside the browser. i18n: `propertyModal.makler.*` namespace in DE + EN.
- **Documents section (Session 42):** whole card is a drop zone (`onDragOver`/`onDragLeave`/`onDrop`). Multi-file `<input multiple>`, `Promise.allSettled` parallel uploads, 10-doc cap with overflow notice. **No label picker at upload** — `inferLabelFromFilename()` matches keywords against the lower-cased filename stem (first match wins; unknown → Sonstiges). 12 labels including `Grundbuchauszug` and `Wohnungseigentumsvertrag`. Each row's label is an inline `<select>` wired to `updateDocumentLabel()` with optimistic-patch + rollback.

## Due Diligence Check Engine (ADR-013 — shipped Session 42)
- `components/due-diligence/DueDiligencePanel.tsx` — single component holds the entire DD flow as a state machine: `idle` (entry button, Pro gate, doc-count gate) → `precheck` (document selection checkboxes + completeness matrix + global legal disclaimer + start button) → `running` (spinner, "up to 2 minutes" hint) → `results` (scored list of 6 check rows with confidence badge, expandable rows showing detail / statute refs / flags / `documentsUsed`, plus three funnel-action buttons: Keine Aktion / Due Diligence abgeschlossen / Immobilie verwerfen).
- On mount, fetches the latest run via `getDueDiligenceResults()` and jumps straight to `results` if one exists. "New check" button returns to `idle`.
- API functions in `lib/api.ts`: `runDueDiligence(propertyId, documentKeys)` → `DueDiligenceRun`; `getDueDiligenceResults(propertyId)` → `DueDiligenceRun[]`. Types: `DueDiligenceCheckResult` (includes optional `documentsUsed[{label, fileName, textAvailable?}]`), `DueDiligenceRun` (6 nullable per-check result fields).
- Funnel actions call `useProperties().update` optimistically — user stays on the results screen after action (no dismiss).
- i18n: `dueDiligence.*` namespace. The backend is the runtime bottleneck (pdf-parse on first-run backfill + 6 sequential Haiku calls) — budget 30-90s per run on first use of a property, faster on subsequent runs since extracted text is cached.
## Add Property Modal (ADR-010 — shipped Session 33)
- `components/ingestion/AddPropertyButton.tsx` — "＋ Immobilie hinzufügen" button used on Funnel header + Dashboard top-right. Opens AddPropertyModal. On successful creation opens PropertyAnalysisModal on the new property (Dossier view via `initialViewMode='dossier'`).
- `components/ingestion/AddPropertyModal.tsx` — modal shell with tab bar (Webseite / Exposé / Manuell), shared funnel-stage selector (`StageSelectorInput`), submit button. Owns active tab + stage + submit state. Maps structured backend errors (UNSUPPORTED_URL, PRO_REQUIRED, DAILY_LIMIT, duplicate) to i18n strings. Closes on Escape and outside click.
- `components/ingestion/UrlTab.tsx` — URL input, `SupportedPortalLogos` row (shows only live parsers), inline error display for UNSUPPORTED_URL ("try Exposé upload or manual entry").
- `components/ingestion/ExposeTab.tsx` — Pro-gated PDF drop zone. Free/Light tiers see locked state with upgrade prompt. Passes selected stage to `createPropertyFromExpose`.
- `components/ingestion/ManualTab.tsx` — 7-field form (title, price, sizeSqm, rooms, location, zipCode, notes). No required fields. Calls `createManualProperty`.
- `components/ingestion/StageSelectorInput.tsx` — funnel-stage dropdown listing all non-terminal stages. Default: `investigating`.
- `components/ingestion/SupportedPortalLogos.tsx` — visual row of currently supported portal logos. Today: Willhaben only. Extended as parsers ship (I8–I12).
- **Replaces** the former `AddFromExposeButton.tsx` (deleted in I7).
- i18n: `addProperty.*` namespace in de.json + en.json — button label, tab labels, field labels + placeholders, drop zone copy, Pro lock messages, 10 error messages.
- **API client** (`lib/api.ts`):
  - `PropertyDetails` interface mirrors the backend Prisma model
  - `normalizePropertyDetails()` coerces all Decimal fields (`exposePrice`, `bk*`, `sizeSqmVerified`, `roomsVerified`, `hwbValue`) from string → number at the API boundary. Prisma serializes Decimals as strings to preserve precision; without this every numeric Dossier field would arrive as a string and break formatters.
  - `getPropertyDetails`, `updatePropertyDetails`, `extractPropertyDetails`, `applyPropertyDetailField`, `createPropertyFromExpose`
  - `createManualProperty(dto)` — POST /properties (ADR-010 I5)
  - `createPropertyFromUrl(url, status)` — POST /properties/from-url (ADR-010 I3)
- **`→ Apply` flow (DO5)** — optimistic. The display flips to "Übernommen ✓" instantly, the `useProperties` cache is patched via `optimisticUpdate`, the parent modal's analysis drafts are synced via `onPropertyApplied`, the backend write fires in the background. Rollback only on error.
- **Manual edit flow (DO7)** — `handleFieldEdit(field, value)` patches local `details` state first, fires `updatePropertyDetails` PATCH in the background, rolls back on error. If no Dossier row exists yet, the first edit creates one (no Exposé required).
- **Field config** — `FIELD_CONFIG` map at the top of `DossierTab.tsx` lists every field with its `EditableField` kind + enum options. **Enum options must mirror the backend `ENUMS` constant in `extraction.service.ts`** — keep both in sync.
- **PurchaseDate special-case** — Apply is always available (even when null). When null, the row shows the default date (today + 2 months) in italic grey with `(Standard)`. Click → and the backend's same default is written. The frontend computes the same value optimistically for the cache patch so there's no flicker.
- i18n: `dossier.*` namespace in de.json + en.json — section headers, every field label, error states, the MRG warning copy, and the Pro upgrade hints.

## Performance Architecture
- `useProperties`: 2-minute TTL module-level cache, `prefetchProperties()` called during auth init
- `useSavedFilters`: 5-minute TTL module-level cache, `prefetchSavedFilters()` called during auth init
- Analytics summary: 5-minute module-level cache in AnalyticsSnapshotTile
- **SSE cache invalidation (TD1):** `useSSEInvalidation` hook (mounted via `SSEProvider` in authenticated layout) connects to `GET /cache-invalidation/subscribe?token=...`. Server emits `properties`, `saved-filters`, or `analytics` events after mutations → client calls `clearXxxCache()`. Reconnects with exponential backoff (3s → 30s). TTLs remain as fallback when SSE is disconnected. **Any new module-level cache must export a clear function, register it in `clearAllUserCaches()`, AND add a case to `useSSEInvalidation`'s message handler.**
- PropertyAnalysisModal + recharts: dynamic import (`next/dynamic`, ssr: false)
- Skeleton loading states on Dashboard, Funnel
- `connection_limit=5` on Supabase pgbouncer (Railway env var)
- Backend: 60s token validation cache, parallel scraped-listings queries

## Tech Debt
*Source of truth: `docs/IMMIO-Project-State.md`*
- ~~**TD1**~~ ~~Cache invalidation via server push~~ — **Resolved.** SSE via `useSSEInvalidation` hook + `SSEProvider` in authenticated layout. TTLs remain as fallback.
- **TD2** Impressum address — replace placeholder before public launch (needs GmbH registration)
- **TD10** Saved filter `sources` enum maintenance — new scraped sources need corresponding values added to TEXT[] enum
- **TD13** `platformListedAt` columns empty — schema added but no parser/scraper extracts listing dates yet
- **TD14** Prisma migration history out of sync — schema changes applied via SQL Editor
- ~~**TD15**~~ ~~ImmoScout24 title not parsed~~ — **Resolved.** Backend `EmailsService.backfillImmoScout24Title()` patches the title via the IS24 URL parser after email import. Frontend picks up the change via SSE within ~3s.
- **TD20** Datenschutzerklärung — Makler clause (Track 13). **Tester-scope resolved** (Session 43): boilerplate from `docs/legal/Datenschutz-Makler-Clause.md` published as §7 of `/datenschutz` (DE + EN). Lawyer review running in parallel; pre-public-launch the lawyer-approved final version replaces the boilerplate via i18n-only swap. Anna's task.
