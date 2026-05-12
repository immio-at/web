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

**OAuth sign-in (Google + Apple)**
- "Sign in with Google" + "Sign in with Apple" buttons on SignInModal, RegisterModal, and the standalone `/register` page
- Flow: `supabase.auth.signInWithOAuth({ provider: 'google' \| 'apple' })` → provider auth screen → Supabase callback → `/auth/callback`
- Callback page (`app/[locale]/auth/callback/page.tsx`) is **provider-agnostic** — gets the session Supabase has set up, calls `POST /auth/oauth-callback` to provision/retrieve Prisma user, sets AuthContext, redirects to dashboard. Adding new providers requires no callback changes.
- First-time OAuth users auto-provisioned (approved: true, immioEmail generated)
- Google consent screen shows Supabase domain (normal — custom domains is paid feature)
- **Google config**: Google Cloud Console OAuth credentials + Supabase Authentication → Providers → Google
- **Apple config** (one-time admin step): Apple Developer Console → Identifiers → register a **Service ID** (e.g. `at.immio.web`), enable "Sign In with Apple" capability, configure return URL `https://<supabase-project>.supabase.co/auth/v1/callback`. Keys → create a key with "Sign In with Apple" enabled, download the `.p8` file (only shown once), note Key ID + Team ID. Then Supabase Dashboard → Authentication → Providers → Apple → paste Service ID + Team ID + Key ID + `.p8` contents. **Until that's done the Apple button is visible but lands on Apple's "Invalid client" screen** — no code redeploy needed once configured. LinkedIn (A2 in Track 5) deferred indefinitely.
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

## `data-tour-id` convention (ADR-021)

The onboarding tour (`react-joyride`, mounted via `OnboardingTour.tsx`) anchors
its steps to DOM elements via the `data-tour-id` attribute. **Do not anchor on
class names or structural selectors** — those silently break when components
are refactored.

Currently-targeted IDs (keep this list authoritative — `OnboardingTour.tsx`
reads the same selectors):
- `nav-funnel`, `nav-finder`, `nav-discover`, `nav-help` on the desktop nav
  links (and `*-mobile` siblings on the mobile nav row).
- `dashboard-sources-tile` on `SourcesSetupTile`.
- `dashboard-first-card` on the **first rendered card** across the Dashboard
  carousels (Recommended → Recently Viewed → New Arrivals). Each carousel
  passes the id to its first card; `document.querySelector` resolves the
  first match in document order without coordination between siblings.

If you refactor a targeted component, **preserve the attribute**. If you
intentionally remove a tour anchor, also remove the corresponding step in
`OnboardingTour.tsx` so the tour doesn't fall back to its skip-step warning
on every fresh sign-in.

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

Recently completed (Session 49 continuation 2, 2026-05-07):
- **ADR-019 ZIP Document Bundle Ingestion — frontend shipped.** Drop zone + file picker accept `.zip`, `application/zip`, `application/x-zip-compressed` alongside the existing PDF MIMEs. `dropHint` updated to "PDF or ZIP", `errorPdfOnly` → `errorPdfOrZipOnly`. `handleFiles` in `DossierTab` splits incoming files into pdfs + zips and routes them: PDFs through the existing per-file path (preserves slot-counting with the new `DOCUMENT_CAP = 12` constant — kept in sync with backend `DOCUMENTS_PER_PROPERTY_CAP` by hand); ZIPs through the new `uploadDocumentZip` API helper that returns the `{imported, skipped, failed}` envelope. New `ZipUploadToast` component renders the per-file outcome inline above the doc list: ✓ "{imported} of {total} documents imported" success tone OR ⚠ "All files skipped" warning tone, collapsible per-file detail (skipped/failed) revealed via ▾ chevron, 8s auto-dismiss (longer than the standard 4s — tester needs time to read the skipped list). After a ZIP import succeeds, the document list refetches via `getDocuments` to surface every new row with full metadata. Full DE + EN i18n under `dossier.documents.upload.*` — toast strings, four skip reasons (`duplicate` / `non_pdf` / `cap_reached` / `too_large`), three fail reasons (`pdf_parse_failed` / `storage_failed` / `unknown`), and the five typed ZIP-level error codes (`zipTooLarge` / `zipCorrupt` / `zipEncrypted` / `zipBomb` / `zipTooManyEntries`) staged for later use when whole-ZIP errors get mapped from the backend's `BadRequestException` codes. The existing `documents.upload` string label was removed (unused; replaced by the new object-shaped sub-namespace).

Recently completed (Session 49 continuation, 2026-05-07):
- **ADR-017 Property Facts Header — shipped end-to-end.** New chip section in the modal shell, mounted between the Makler block and the mode toggle, visible in both Objektdaten and Analysen modes. `lib/propertyFactsConfig.ts` lists 18 schema fields plus `EXCLUDED_FIELDS` with reasons (calculator-relevant fields stay in the Dossier with → Apply; Makler fields have their own block; mrgRisk surfaces as a banner not a chip). `PropertyFactsHeader` orchestrates display, click-to-edit (chip → inline editor), and the `+ hinzu` popover (alphabetical dropdown with already-populated fields suffixed `(bearbeiten)`). Inline editor handles 8 input types (text, number, year, decimal, enum, boolean, date, address). HWB is a compound chip combining `hwbClass` + `hwbValue` with a custom dual-input editor. Boolean suppression — `Aufzug = Nein` doesn't render — and enum-default suppression — `widmung = wohnung`, `parkplatz = none`, `aussenflaeche = none` — both via `formatChipValue`. Source provenance on hover (Manuell / KI aus Exposé / Aus Inserat). Pairs with the backend manual-wins guard — saving any chip flips the row's `extractionSource` to `'manual'`, which protects the row from future AI overwrite. Full DE + EN i18n in `propertyFacts.*` namespace.
- **ADR-018 Tester Feedback Reporting — shipped end-to-end.** Bottom-right floating action button mounted at the authenticated layout level (`FeedbackButton`, hidden under 600px viewport). Right-side `FeedbackDrawer` with two tabs: "Neuer Bericht" / "Meine Berichte". Last-active tab persists across drawer close/reopen via a module-level variable cleared on logout. Esc / backdrop / ✕ dismiss with discard-confirm when dirty. **New report form** captures type radios + title (max 120) + description (max 4000) + up to 3 screenshots via drag/click/paste (PNG/JPG/GIF, 5MB cap), auto-context (URL, user agent, viewport, current property modal id/title via `data-property-id` / `data-property-title` / `data-property-modal-open` attrs scraped from `PropertyAnalysisModal`'s outer element). Success view → 3s auto-transition to "Meine Berichte". **Meine Berichte** list shows type pills + status pills (5 colours) + relative timestamps + line-clamp-3 description with click-to-expand + attachment thumbnails with lightbox + inline team-note. **Admin route at `/admin/reports`** with filters in URL params, per-row instant status dropdown, debounced 500ms team-note autosave with "Gespeichert" pulse, click-to-acknowledge with `⚠ NEU` ribbon. **AdminUnacknowledgedToast** at new `app/[locale]/(authenticated)/admin/layout.tsx` — 30s polling, click → `/admin/reports?unacknowledged=true`, not dismissible by design. **Settings → Feedback section** as mobile fallback. Full DE + EN i18n. `clearFeedbackDrawerState` wired into `clearAllUserCaches`. `PropertyAnalysisModal` outer element exposes `data-property-modal-open` / `data-property-id` / `data-property-title` attrs so the feedback context capture finds the current property without a context provider.

Recently completed (Session 49, 2026-05-06):
- **ADR-015 frontend API client (data plumbing only).** `Property` interface gains `suspectedDuplicateOf`, `suspectedDuplicateAt`, `relistBadgeDismissedAt`, `lastSeenAt` (all optional). New API helpers in `lib/api.ts`: `getListingHistory(propertyId)` (returns the 90-day relist log for the popover), `applyDuplicateDecision(propertyId, 'keep_both' | 'hide_this')`, `dismissRelistBadge(propertyId)`. `IngestAction` type union exported. `createPropertyFromUrl(url, status?)` now returns the full ingest envelope `{ property, action, suspectedDuplicateOf }` instead of just `Property` — older `result.property` access still works since it's now a property of the response. `importFromUrl` (the more recent helper at line 273) gets the same response shape. **Frontend UI badges (DD10 possible-duplicate badge + dialog, DD11 relisted badge + popover) deferred** to Session 50 — data plumbing is in place but the badge components + dialog UX haven't been built yet.
- **`AddPropertyModal.onCreated` signature widened.** Now `(property, action?: 'created' | 'updated_existing' | 'inserted_with_soft_suspicion') => void`. Defaults to `'created'` for the Exposé and Manual paths which still go through their own create-property API helpers. The URL path forwards the action straight through. Existing `AddPropertyButton` caller works unchanged because the new arg is optional.
- **Watch when wiring the badges (Session 50):** `useProperties` already returns the new dedup fields via the GET /properties response, so badges can read directly from `Property`. `getListingHistory` should fire lazily (on popover open) to avoid an N+1 fetch on the funnel — the relist badge visibility check is `lastSeenAt - createdAt > 90 days` proxy-only without fetching history. `applyDuplicateDecision('hide_this')` flips status to `delisted` server-side; the optimistic update in the dialog should mirror that or just refresh().

Recently completed (Session 48, 2026-05-06):
- **ADR-003 v2.3 _Flip Output Granularity_ shipped (FX1–FX6).** `bk_umlagefaehig` removed from the Flip section in `PropertyAnalysisModal` (no tenant during a flip, so the umlagefähig/nicht-umlagefähig split doesn't apply). Remaining BK input relabelled `Betriebskosten/Monat (Haltedauer)` / `Operating costs/month (during hold)`; storage column unchanged. `calcFlipPrivate` / `calcFlipGmbH` extended with `taxSavingFromRehab` / `taxSavingFromRehabRetained` / `taxSavingFromRehabDistributed`, `deductibleRehabRatio`, plus four ROI metrics (`roiTotalInvestment`, `roiEquity`, `roiAnnualisedSimple`, `roiAnnualisedCompound`) — Private + per-side GmbH. Holding monthly now uses `bk_nicht_umlagefaehig` alone. Zero-guards: `holding_months===0` returns null for both annualised metrics; `eigenkapital<=0` collapses `roi_equity` to `roi_total_investment`. Flip output rebuilt as three blocks per §5.6 (cost waterfall → tax block with `Bruttogewinn → −Abzugsfähige Sanierung (€X von €Y) → −Abzugsfähige Kaufnebenkosten → Steuerpflichtiger Gewinn → ImmoESt 30% → Steuerersparnis durch Sanierung (info) → Nettogewinn` → Rendite block); GmbH renders the per-side KÖSt/KESt + tax-saving + Nettogewinn in a 2-column grid and a per-side Rendite split below; Annualised rows show `—` when `holding_months` is 0. AfA-not-on-flips footnote rendered under the tax block. 17 new i18n keys in `analysis.flip.*` (DE + EN). Schema unchanged — `bk_umlagefaehig` stays on `property_analyses`; existing rows that have a value retain it on disk but the calculator no longer reads it on flips. Rental and Owner Occupied code paths untouched.
- **Funnel hop-back fix — counter-based mutation guard.** The timestamp-only `lastLocalMutationAt` guard in `useProperties` had two real failure modes against live data: (1) Slow PATCH (>2s on a busy Railway dyno) — guard expires before PATCH commits, an SSE-triggered refetch lands with stale data and clobbers the optimistic patch with `cache = data`. (2) "optimisticUpdate + side-API" callers (`FunnelBoard.handleReportUnavailable` / `handleDelist`, `onReportDead` branches in `DashboardClient` / `FinderClient` / `search/page.tsx`, `DossierTab.applyPropertyDetailField`) only marked the optimistic moment, not the duration of their async API call. Replaced with `inFlightMutations` counter + `lastMutationCompletedAt` 5s cooldown. `update()` brackets the PATCH with `markMutationStart` / `markMutationEnd`; the helpers are exported so the side-API callers can bracket their `.catch(() => {}).finally(() => markMutationEnd())` chains. `refreshPropertiesFromServer` re-checks the guard AFTER the GET resolves — a mutation that started while we were waiting on the network can't have its optimistic patch wiped on the way back.
- **PropertyCard heart-init regression (ADR-012 v1.2 follow-up).** Every Discover tile rendered the heart filled green because `scrapedSaved` initialized from `!!item.savedByUser` for all sources, and `propertyToUnified` sets `savedByUser: true` on every own property — `heartFilled = (isOwn && !isOwnAtNew) || scrapedSaved` reduced to `false || true` on own@new. Gated the `useState` initializer + sync `useEffect` to `item.source === 'scraped'`. The variable name already implied scraped-only; the state now matches.
- **Discover state persistence across navigation.** Module-level `discoverStateCache` in `app/[locale]/(authenticated)/search/page.tsx` snapshots `filterValues`, `applied`, `activeFilterId`, `page`, `activePresets`, `activeSavedFilterIds`, `view`, `dismissedIds`, `locallyPromotedIds`, `scrollY`. Lazy `useState` initializers read cache first, fall back to URL params, then defaults — URL params still drive first-time sessions and the dashboard-tile deep-link. A single save-on-change `useEffect` writes the cache; scrollY captured in an unmount-cleanup effect (one `window.scrollY` read on the way out, no throttled listeners), restored once after the first non-loading render via `requestAnimationFrame`. `clearDiscoverStateCache` exported from the page module and wired into `clearAllUserCaches` in `AuthContext` mirroring the existing properties / saved-filters / analytics / recommended / analyses pattern. Mid-session navigations now keep the user exactly where they were; sign-out + sign-in same-tab still wipes everything.

Recently completed (Session 47, 2026-05-04 to 2026-05-05):
- **ADR-012 v1.2 — house icon = funnel state, not source.** The v1.0 rule "own = filled, scraped = outline" baked the source distinction into the icon, so any user with many email-parsed listings saw every Discover tile as "already done with" — disabled, no save action, even though those rows were status `new` and untouched. v1.2 rebinds: filled = `status >= investigating` OR scraped just saved; outline = own at `new` OR unsaved scraped, both rendered identically. Click on outline promotes own@new → `investigating` or saves scraped at `investigating`. Re-click on filled (Discover only) toggles back: own → `new`; scraped → soft-delete to `not_relevant` (DB record preserved so analyses / dossier survive; re-clicking the now-outline heart re-promotes the existing `not_relevant` Property to `investigating` instead of POSTing a duplicate save). Funnel kanban heart unchanged — `onMoveStage` still takes precedence and opens the stage picker. New i18n: `propertyCard.moveToInvestigating`, `propertyCard.undoSave`. ADR-012 amended.
- **Discover composition rework.** Own properties filtered to `status === 'new'` (matching "all new properties shown by default"). Promoted-during-session ids tracked in a `locallyPromotedIds` Set so cards stay visible until the next mount of `/search` — heart fills green in place, no immediate disappear. Dedup of scraped against own restricted to ACTIVE own (terminal-stage own no longer suppresses its scraped twin), otherwise undoing a save would permanently hide the listing. Scraped `savedByUser` derived client-side from the active-own match in cache instead of the fetch-time backend flag, so the heart reacts immediately to optimistic status changes.
- **Source-agnostic ordering platform-wide.** Finder deck mixes own + scraped via the `SortControl` criterion (was source-grouped). RecommendedCarousel keeps recommendation scores around for both sources, ranks them together, dedupes by sourceUrl with own winning ties. Source pill on the Discover table view de-coloured (uniform grey). Decimal-string coercion of `price` / `sizeSqm` / `rooms` added to every `propertyToCard` callsite — Prisma serializes Decimals as strings even though the TS type says number, and one missing coercion was breaking the comparator and forcing Timsort into source-grouped fallback order.
- **Token-rotation refetch loop killed.** Supabase fires `onAuthStateChange` on every silent token rotation (~50min, plus on tab focus after extended idle) with a NEW session reference, even though `session.user.id` is unchanged. Every `useEffect` with `session` in deps refetched. Switched 10 callsites to `session?.user?.id` (stable across rotation): search/page.tsx, FinderClient, DashboardClient, RecommendedCarousel, DiscoverTile, AnalyticsSnapshotTile, analytics page, dashboard page, useProperties, useSavedFilters. `useSSEInvalidation` now reads a fresh access token from `supabase.auth.getSession()` at connect/reconnect time so the EventSource survives token rotation instead of recycling. `fetchScraped` deps shrunk to drop `t` (defensive — `useTranslations` should be stable but exposure to a future regression isn't worth the i18n on the rare error fallback).
- **Scraped-listing interaction tracking + mixed Recently Viewed.** Backend migration adds `scrapedListingId` to `property_interactions` (nullable, FK with cascade); web side gets `trackScrapedInteraction(scrapedId, type)` + `useInteractionTracker.trackScraped` wired on Discover, Finder and Dashboard for image-tap (`view`) and external-link clicks (`url_click`). `getRecentlyViewed` returns a discriminated union `{ kind: 'own' | 'scraped' }`; DashboardClient routes both kinds through a single `PropertyCarousel` after refactoring it to take `CardProperty[]` instead of `Property[]`.
- **New Arrivals search-agent default with scraped fallback.** DashboardClient filters own to `emailReceivedAt != null` so users see the listings their portal subscriptions delivered. When that list is empty (user has no search-agent emails yet), a one-shot `getScrapedListings({ sortBy: 'listedDate', sortOrder: 'desc' })` populates the carousel so the slot is never blank with a "set up your search agents" prompt dominating the dashboard.
- **WEG-Protokoll document label.** New label distinct from generic `Protokoll`. `LABEL_KEYWORDS` gains `weg-protokoll` / `weg_protokoll` / `weg protokoll` / `eigentümerversammlung` / `eigentuemerversammlung` / `etv-protokoll` / `etv_protokoll`, all placed BEFORE the generic `protokoll` match so a `WEG_Protokoll_2024.pdf` lands on the dedicated label and routes to MRG / Vorkaufsrecht / BK / Reparatur DD checks instead of falling through to generic `Protokoll` (which the MRG check ignored). 13 labels total.
- **Analysis save success message.** `PropertyAnalysisModal.handleSave` sets `savedAt: epoch-ms` on success; an inline green `✓ Analyse gespeichert` pill renders next to the Save button for 3 seconds before auto-clearing via `useEffect`. New i18n key `analysis.footer.saved`.

Recently completed (Session 46, 2026-04-28):
- **Track 15 (ADR-003 v2.2) — analysis draft persistence + modal dismiss** shipped end-to-end on `dev` (C134–C141). Frontend-only; no backend or Datenschutz dependency.
- **`hooks/useAnalysisDraft.ts`** new hook (DR1). `useAnalysisDraft(propertyId, tabKey, dbValues) → { values, setValues, clear, isDirty }`. Lazy `useState` init reads localStorage `immio.analysisDraft.{propertyId}.{tabKey}`. setValues writes synchronously, queues a debounced 400ms localStorage write. `clear()` cancels the pending write, removes the entry, resets to `dbValues`. `isDirty` via `JSON.stringify` deep compare. Re-init on (propertyId, tabKey) change via the derived-state-from-props ref pattern. All localStorage in try/catch. Three helpers exported alongside: `isAnalysisDraftDirty` (synchronous reader for non-active tabs the active hook can't see), `clearAnalysisDraft` (imperative single-entry drop), `pruneOrphanedAnalysisDrafts` (boot-time orphan sweeper).
- **`PropertyAnalysisModal.tsx` refactor (DR3)** — `Tab` interface gains a stable `tabKey: string` field. Saved tab → `tabKey === id` (UUID); unsaved tab → `tabKey === 'new-' + crypto.randomUUID()` via `makeNewTabKey()`. The form's `set(field, value)` rewires from setTabs-mutation to `setActiveValues({ ...draft, [field]: value })` so every form change goes through the hook. Render uses `values ?? blankAnalysis(property)` instead of `tabs[activeTab].draft`. The old `tab.dirty` field is removed — replaced by computed dirty (active = `activeIsDirty` from the hook, non-active = `isAnalysisDraftDirty(...)`).
- **Save / close clearing (DR4 / DR5)** — `handleSave` calls `clearAnalysisDraft` on success; the new-{UUID} → analysis-UUID transition clears the old `new-*` key explicitly before tabKey changes. `deleteTab` calls `clearAnalysisDraft` before removing the tab from state.
- **Orphan cleanup (DR6)** — `pruneOrphanedAnalysisDrafts` runs once per app boot from `useProperties.fetchFromServer`, gated by `analysisDraftsPruned` flag. `clearPropertiesCache` re-arms the flag on sign-out same as the modal-mode prune (PC8). Boot-time pass uses an empty `validTabKeysByProperty` so only property-absent keys are reaped (avoids a per-property `getAnalyses` fan-out at sign-in). UUID drafts for analyses deleted on another device survive boot-time; tester-phase tradeoff.
- **Backdrop click + Esc (DR7 / DR8)** — `onPointerDown` + `onPointerUp` on the modal backdrop. Dismiss only fires when both events landed on the backdrop with movement < 6px squared (same threshold as PC5 image-tap). Guards against text-selection drag-release and Funnel-drag pointerup over backdrop. Mount-scoped `keydown` listener: Esc walks back through dialog state — closes delete-confirm first, then close-confirm, then routes to `handleCloseRequested`.
- **Close guard (DR9)** — built fresh; the v1 modal didn't actually have one despite ADR-003 v2.0's claim. `anyTabIsDirty()` reads `activeIsDirty` for the active tab and `isAnalysisDraftDirty` for non-active tabs. `handleCloseRequested` shows the close-confirm dialog if dirty, else `onClose()`. `handleConfirmClose` clears every tab's draft (Discard semantics — open question resolved to (a)) and closes. Routes uniformly: ✕ button, footer Cancel, backdrop click, Esc. New i18n keys `analysis.closeConfirm.{title, message, cancel, discard}` shipped DE + EN.
- **`handleDossierApplied` updated** — also calls `setActiveValues` so the active tab's editing state reflects the applied value, AND writes patched dbValues to non-active unsaved tabs' localStorage so the apply isn't lost on tab switch. Auto-save success path clears the localStorage entry so the next open reads fresh DB state.

Recently completed (Session 45, 2026-04-28):
- **PropertyCard image-button HTML-nesting fix (C127).** PC5's `<button>` wrapper was breaking `group-hover` on the action stack — HTML forbids nested buttons (the heart icon inside is itself a `<button>`) and the browser auto-closed the outer button mid-DOM, splitting the `group` container. Switched the image to `<div role="button" tabIndex={0}>` with Enter/Space `onKeyDown` handlers + `focus-visible:ring-2`. Same commit dropped the v1.0 hover-reveal pattern on the action stack — Tailwind v4 scopes `hover:` variants to `(hover: hover)` by default and the reveal wasn't firing on touch laptops. Action stack (external-link / ⚠ / ✕) is now always visible on every viewport. ADR-012 v1.1 _As Implemented_ note added.
- **Modal load near-instant (C128).** Three fetches → one for the common dossier-mode open. Dropped a dead `getDocuments` fetch (and dead state / handlers / `docTypes` / imports) — the Documents UI moved to DossierTab in Session 32 but the dead code stayed. Lazy `getAnalyses` — fired only on first entry to Analysen mode, gated by `analysesFetchedRef`. Deduped `getPropertyDetails` — DossierTab gained an `initialDetails` prop so the modal's already-fetched details flow down without a second roundtrip. Render-side: dossier mode no longer waits on any analyses fetch; analyses content has its own loading spinner inside its area.
- **Backend analyses perf (C129).** `GET /properties/:id/analyses` cut from 3 Prisma queries to 1. `analyses.controller.resolveUser` dropped a redundant `findUserByEmail` (validateToken already returns the cached Prisma user UUID). `analyses.service.findAll` dropped the redundant property-existence check (the `findMany` WHERE clause IS the ownership check).
- **Frontend analyses cache (C130).** Per-property `Map<propertyId, {data, at}>` in `lib/api.ts`, 60s TTL. `getAnalyses` short-circuits on cache hits. `createAnalysis` / `updateAnalysis` / `deleteAnalysis` invalidate. `clearAnalysesCache(propertyId?)` exported and wired into `clearAllUserCaches` in `AuthContext`. Pairs with C129: first opens faster, repeat opens within 60s instant.
- **Dockerfile auto-migrate (C131).** Backend `Dockerfile` `CMD` now wraps the start with `npx prisma migrate deploy && node dist/src/main`. Root cause of the Track 13 Makler save 500s — the migration was committed in Session 43 but the team's historical workflow was manual SQL via Supabase Editor, so the columns never existed. Operational change: migrations now self-apply on deploy.
- **MaklerBlock merged into PropertyInfoStrip card (C132).** Outer chrome dropped — populated state renders inline inside the parent card separated by a `border-t`; empty state is a small dashed-border ghost button in the same card. One unified summary box. Save errors now surface the actual backend message in the toast + `console.error` for devtools.
- **EditableField auto-open on focus (C133).** Display-mode button gained `onFocus={startEditing}`. Tab walks through Name → Organisation → Phone → Email (and through every other inline-editable Dossier row) without a click per field.

Recently completed (Session 44, 2026-04-27):
- **Track 14 (ADR-012 v1.1) — card-to-modal behaviour** shipped end-to-end on `dev`. Frontend-only; no backend changes; no Datenschutz dependency.
- **PropertyCard image tap opens modal** (was: source listing). Image is now a `<button>` calling `actions.onAnalyse?.(item)`; 6px movement-threshold guard + `stopPropagation()` so Finder swipes (parent pointer-events handler) and Funnel drags (HTML5 `draggable`) don't fire accidental taps. Title `<a>` link in card body retains source-URL behaviour by design.
- **External-link action button** replaces the `🔍` View slot in the right-side action stack. Inlined `ExternalLinkIcon` SVG (lucide-style, kept inline — no `lucide-react` dep added for a single icon). Renders as `<a href={sourceUrl} target="_blank" rel="noopener noreferrer">` when present; disabled grey button with `propertyCard.openExternalUnavailable` tooltip when null (manual properties). `url_click` interaction tracking moved to this button.
- **`hooks/useModalMode.ts`** — new per-property modal-mode memory. `useModalMode(propertyId, initialViewMode)` returns `[mode, setMode]`. Lazy-init: stored localStorage value → `initialViewMode` prop → `'dossier'` fallback. Stored value is the discriminant (`'analyses' | 'dossier'`), never the localised label. All localStorage access wrapped in try/catch (Safari private mode). `setMode` writes synchronously. `pruneOrphanedModalModes(activePropertyIds)` exported and called once per app boot from `useProperties.fetchFromServer` after first successful fetch. `clearPropertiesCache` re-arms the prune-once flag so a sign-out + sign-in re-runs cleanup.
- **`PropertyAnalysisModal.tsx`** swapped its `useState<...>(initialViewMode)` for `useModalMode(property.id, initialViewMode)`. ADR-010's `initialViewMode='dossier'` from `AddPropertyButton` is now a first-time-default override only.
- i18n: `propertyCard.openExternal` ("Originalanzeige öffnen" / "Open original listing") + `propertyCard.openExternalUnavailable` ("Keine Originalanzeige verfügbar" / "No source listing available") shipped DE + EN.

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
- Layout: image on top with three overlays — source badge top-left (green "… Suchagent" for email-parsed, grey for scraped), heart top-right, vertical action stack right-middle: **external-link / ⚠ / ✕** (post-ADR-012 v1.1; the v1.0 `🔍` view button was replaced by the external-link icon). Action stack is **always visible** (Session 45) — the v1.0 hover-reveal pattern wasn't firing reliably under Tailwind v4's `(hover: hover)`-scoped `hover:` variants. Expired badge bottom-left.
- **Image-tap (ADR-012 v1.1 PC5)** — image is a `<div role="button" tabIndex={0}>` (NOT a real `<button>`) that opens `PropertyAnalysisModal` via `actions.onAnalyse?.(item)`. The `<button>` form was rejected because the heart icon nested inside is itself a `<button>` and HTML auto-closes the outer button before the inner one starts, splitting the `group` container mid-DOM and breaking `group-hover` (Session 45 fix). `onKeyDown` handlers for Enter / Space + `focus-visible:ring-2` preserve keyboard a11y. 6px movement-threshold guard plus `stopPropagation()` so Finder swipes (parent pointer-events) and Funnel drags (HTML5 `draggable`) don't fire accidental taps. The card-title `<a>` link in the body retains its source-URL behaviour.
- **External-link button (ADR-012 v1.1 PC6)** — replaces `🔍`. Inlined `ExternalLinkIcon` SVG (no `lucide-react` dep). Renders as `<a href={sourceUrl} target="_blank" rel="noopener noreferrer">` when present; disabled grey button with `propertyCard.openExternalUnavailable` tooltip when null (manual properties without a source). `actions.onUrlClick(item)` fires `url_click` PropertyInteraction.
- Heart behaviour:
  - Scraped: outline, click → `onSaveToFunnel` (save to Investigating, optimistic fill). Scraped state resets on `item.id` change so reused card instances don't leak filled state between swipes.
  - Own: filled teal. Default click is a no-op (tooltip shows current stage). On Funnel, `onMoveStage(item, rect)` is provided — click fires it with the heart's bounding rect so the parent can anchor a stage-picker dropdown.
- Props: `compact`, `fullWidth` (compact defaults to `w-48`; set true to use `w-full`), `draggable: { onDragStart, onDragEnd }` (used by the kanban for HTML5 drag).
- Column-header colour palette on the Funnel is defined in `lib/constants.ts` under `FUNNEL_STAGES[].header`. Pair-checks `isLight` in FunnelBoard to choose dark vs white label text.
- i18n: `propertyCard` namespace in de.json + en.json — `saveToFunnel`, `alreadyInFunnel`, `alreadyInFunnelWithStage`, `changeStage`, `changeStageFrom`, `analyse`, `openExternal`, `openExternalUnavailable`, `reportDead`, `dismiss`, `expired`.

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
- **Modal shell layout (ADR-003 §10, v2.1, Session 43; v2.1.1 inline-Makler tweak Session 45)** — top-to-bottom: header (title + Deal ID rendered as a small grey pill `bg-slate-100 text-slate-500` inline-right of the title — no longer a stand-alone badge below the title) → **unified PropertyInfoStrip card** containing image + price/size/location summary, a `border-t` divider, and the inline MaklerBlock (one box, was: two stacked) → mode toggle → tab bar (Analysen mode only) → content. The previous paperclip-icon `📎` entry-point on the dossier toggle is **removed** — mode is selected via the explicit two-button toggle.
- **Mode toggle (ADR-009 DO4 + ADR-012 v1.1 PC7)** — `[Analysen] [Objektdaten]` (DE) / `[Analyses] [Dossier]` (EN) pill row. In Objektdaten/Dossier mode the analysis tab bar hides and `<DossierTab />` renders instead. Internal value is still `'dossier'` — only the rendered i18n label changes per locale. State is owned by `useModalMode(property.id, initialViewMode)` (`hooks/useModalMode.ts`) which restores the user's last-used mode for that property from `localStorage` on every open and writes synchronously on every toggle click. `initialViewMode='dossier'` from `AddPropertyButton` (ADR-010 I6) is honoured only as a **first-time default** when no localStorage entry exists; on subsequent opens of the same property the stored choice wins.
- **Mount-time fetches (Session 45):** `getPropertyDetails` once on mount (feeds MRG banner + MaklerBlock + DossierTab via `initialDetails` prop). `getAnalyses` is **lazy** — gated by `analysesFetchedRef` so it fires only when the user is on (or switches to) Analysen mode for the first time. The dead `getDocuments` fetch + handlers were removed. Common-case dossier-mode open = one HTTP request total.
- **Render gating (Session 45):** `viewMode === 'dossier'` content renders the moment the modal mounts — does NOT wait on the analyses fetch. `viewMode === 'analyses'` content shows a small loading spinner inside its own area while analyses load. Stale-after-extract is acceptable for `details` — close + reopen to refresh.
- **Tab state + draft persistence (ADR-003 v2.2 / Track 15, Session 46)** — every `Tab` carries a stable `tabKey: string` (`'new-' + crypto.randomUUID()` for unsaved, `analysis.id` for saved). The active tab's editing values come from `useAnalysisDraft(property.id, currentTab.tabKey, currentTab.draft)` (`hooks/useAnalysisDraft.ts`); `tab.draft` is now the dbValues snapshot, not the live form state. Every form change goes through `setActiveValues` which writes synchronously to React state and queues a debounced 400ms localStorage write. Drafts survive mode-switch and accidental modal close; cleared on save (DB authoritative) and on tab close. Old `tab.dirty` field removed — replaced by computed `activeIsDirty` (active) + `isAnalysisDraftDirty(...)` (non-active).
- **Close guard (Session 46)** — `handleCloseRequested` consults `anyTabIsDirty()` across all tabs. If dirty, shows the close-confirm dialog (i18n `analysis.closeConfirm.*`); else closes. Confirm clears every tab's draft (Discard semantics) and calls `onClose`. Routes uniformly: ✕ button, footer Cancel, backdrop click, Esc keydown. Backdrop dismiss requires `pointerdown` + `pointerup` both on backdrop with movement < 6px squared (guards against text-selection drag-release and Funnel-drag pointerup over backdrop). Mount-scoped Esc listener walks back through dialog state — closes delete-confirm first, then close-confirm, then routes to the guard.
- Tax section: Privat/GmbH toggle, AfA (accelerated post-2020), Grenzsteuersatz, KÖSt 23%, KESt 27.5%
- Rental results: pre-tax metrics + after-tax (private: marginal tax; GmbH: retained vs distributed)
- Flip results: private (ImmoESt 30% + Hauptwohnsitzbefreiung); GmbH (KÖSt + KESt side-by-side)
- Liebhaberei warning (25-year cumulative cashflow check)
- **MRG warning banner (ADR-009 DO6)** — `MrgWarningBanner.tsx` rendered in the rental analysis section header when the Dossier flagged `mrgRisk: true`. Reads from the same `details` state as the Makler block (single fetch shared across the modal shell).
- Cost structure: BK umlagefähig (tenant-paid) + BK nicht umlagefähig (owner costs incl. HV reserve) per usage type. Flip includes all BK in holding costs.
- Backend: 6 tax fields on PropertyAnalysis model (legalStructure, purchaseDate, gebaeudeAnteilPct, grenzsteuersatzPct, gmbhAccountingCostsAnnual, distributeProfit)
- **Analysis-draft sync after Dossier → Apply** — when DossierTab fires `onPropertyApplied(field, value)`, the modal's `handleDossierApplied` patches every open analysis tab's `draft` snapshot (`exposePrice → listPrice`, `purchaseDate`, `bkUmlagefaehig`, `bkNichtUmlagefaehig`), updates the active tab's hook values via `setActiveValues`, writes the patched values to non-active unsaved tabs' localStorage so the apply isn't lost on tab switch, and auto-saves saved tabs in the background. Auto-save success path calls `clearAnalysisDraft` so the next open reads fresh DB state.

## Property Dossier (ADR-009)
- `components/property/DossierTab.tsx` — four sections as of Session 42: Documents → AI Extraction → Due Diligence → Structured Property Data. Mounts inside `PropertyAnalysisModal` when viewMode === 'dossier'.
- `components/property/EditableField.tsx` — generic inline-edit cell. Six input kinds: number, integer, text, date, boolean, enum. Click to edit, Enter or blur commits, Escape cancels (uses a `cancelledRef` so Escape wins the blur race). Purely presentational — parent provides `onSave`. **Tab navigation (Session 45):** the display-mode button calls `startEditing` on `onFocus` as well as `onClick`, so Tab from one inline-editable row commits the current field (existing `onBlur → commit`) and lands focus on the next row's button, which auto-flips into edit mode. Walks through Makler / Dossier rows without a click per field. `startEditing` is idempotent so the doubled `onFocus` + `onClick` on a mouse-click is a no-op.
- `components/property/MrgWarningBanner.tsx` — amber banner reused by DossierTab Section 3 and the rental analysis tab header. Wording is deliberately hedged ("Mögliches MRG-Objekt", "Signale deuten auf", "Rechtliche Beratung wird empfohlen") — never a legal classification.
- `components/property/MaklerBlock.tsx` (ADR-009 v1.1, Session 43; inline placement Session 45 / ADR-009 v1.1.1) — listing-agent contact card. **Renders INSIDE the PropertyInfoStrip card** (separated by a `border-t` divider) — one unified summary box, not two stacked cards. Empty state: dashed-border ghost button "+ Makler hinzufügen" / "Add agent" (`propertyModal.makler.add`). Populated state: name + organisation row, tappable phone / email row, with an inline `EditableEditAffordance` (✎ button) so the common-case tap-to-call path stays one click. PATCHes via `updatePropertyDetails`. Email uses `mailto:{email}?subject={prefilled}` with subject `Anfrage zu "{title}" ({dealId})` (DE) / `Inquiry about "{title}" ({dealId})` (EN), falling back to `Anfrage zur Immobilie ({dealId})` when title is null. Phone uses raw `tel:{phone}` with no normalisation. Both `mailto:`/`tel:` clicks fire `trackInteraction(propertyId, 'makler_contact')` fire-and-forget BEFORE the OS handoff so the signal still lands when the user completes the action outside the browser. **Save errors (Session 45):** `console.error` plus the actual server message inlined in the error toast text; re-thrown so `EditableField` stays in edit mode for retry. i18n: `propertyModal.makler.*` namespace in DE + EN.
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
- **Analyses cache (Session 45):** per-property `Map<propertyId, {data, at}>` in `lib/api.ts` with 60s TTL. `getAnalyses` reads cache → if fresh, skips network entirely. `createAnalysis` / `updateAnalysis` / `deleteAnalysis` invalidate the entry. `clearAnalysesCache(propertyId?)` exported and wired into `clearAllUserCaches` in `AuthContext`. Hot path: modal close + reopen of same property within 60s = zero network.
- **PropertyAnalysisModal load (Session 45):** dossier mode renders the moment the modal mounts. The shell does ONE fetch on open (`getPropertyDetails`, feeds the MRG banner + the MaklerBlock + the DossierTab via `initialDetails`). `getAnalyses` is **lazy** — fired only when the user lands on or switches to Analysen mode for the first time, gated by `analysesFetchedRef` so the toggle doesn't refire. Common-case dossier-mode open = one HTTP request total (used to be three sequential).
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
