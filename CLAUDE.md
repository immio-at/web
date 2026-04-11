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
    ├── analytics/page.tsx           ← Coming Soon
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
- Provides: `properties`, `loading`, `update()`, `optimisticUpdate()`
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
- Stage key mapping: snake_case DB keys (`visit_booked`) → camelCase i18n keys (`visitBooked`) via `STAGE_I18N_KEY`
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
`new` → `investigating` → `interested` → `due_diligence_completed` → `visited` → `offer_made`
→ `won` | `parked` | `not_relevant` | `delisted`

`due_diligence_completed` was renamed from `visit_booked` 2026-04-10 (Session 31). The DB key is `due_diligence_completed` (snake_case), the i18n key is `dueDiligenceCompleted` (camelCase), the preset key is `stage_due_diligence_completed`. Stage labels: English funnel header "Due Diligence Completed", German "Due Diligence abgeschlossen", both pill labels "Due Diligence". Stage keys appear in many places (FUNNEL_STAGES in `lib/constants.ts`, STAGE_KEY_TO_STATUS in `lib/preset-filters.ts`, FUNNEL_STATUSES in `lib/recommendations.ts`, ASSIGNABLE_STAGES in `PropertyCard.tsx`, several STAGE_I18N_KEY copies in FunnelBoard / PropertyCard / analytics page / FunnelSummaryTile) — any future stage rename must touch ALL of these.

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
1. **Email forwarding setup assistant** (P1) — in-app guide for Gmail/Outlook forwarding config. Must recommend auto-forward filter for Bazar
2. **Kontakt page** (P1) — simple contact form. Deferred — needs company email setup
4. **Apple Sign In + LinkedIn OAuth** (P2) — prerequisites for native mobile app
5. **Native mobile app** (P2) — React Native / Expo, iOS + Android
6. **Anna's landing page copy** (P3) — hero headline and problem section are placeholder
7. **Onboarding wizard** (P3) — deferred until all functionality complete

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
- Stage presets: 9 funnel stages (New, Investigating, Interested, Due Diligence, Visited, Offer Made, Parked, Won, Not Relevant). OR within group. Scraped listings without status pass through.
- State presets: 9 Austrian states (OR within group, AND with other groups). Sent server-side on Discover and Finder (resolved to postcodes via `getPostcodesByBundesland`)
- Dashboard Discover tile pre-caches per-state scraped counts on mount (10 parallel calls) for instant toggle
- **`/settings/filters` (F6)** — bulk management page. Lists every filter oldest-first with Edit / Delete / "New filter" actions. Tier limit indicator (X / Y used) with upgrade prompt at the cap. `TIER_LIMITS` constant on the page mirrors the backend SavedFiltersService rules — keep in sync.
- i18n: `presetFilters.*` and `settingsFilters.*` namespaces in de.json + en.json

## Unified PropertyCard
- `components/PropertyCard.tsx` — shared card for Dashboard carousels (compact) and Discover grid (full)
- Exports: `CardProperty` interface, `CardActions` interface
- Source badge: green "Platform Suchagent" for email-parsed, grey "Platform" for scraped (checks `emailReceivedAt`)
- Actions: funnel stage dropdown (move/add), analyse (🔍), report dead link (⚠, own only), dismiss (✕)
- i18n: `propertyCard` namespace in de.json + en.json

## Entdecken Page (`/search`)
Browse scraped listings from all 4 sources (Raiffeisen, s REAL, ÖRAG, RE/MAX).
- Unified FilterBar: keyword + PLZ/Bundesland, price + €/m², size + rooms (saved filter dropdown removed)
- Preset + saved filter pills below FilterBar — state presets server-side, time/source client-side
- Unified PropertyCard with stage dropdown, analyse, report, dismiss
- Null-price listings hidden by default ("Ohne Preis anzeigen" toggle)
- Saving a listing invalidates the `useProperties` cache so Dashboard/Funnel update immediately
- Pagination: 20 per page (hidden when client-only presets active)
- Reads preset + saved filter selections from URL params (from Dashboard)

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
- **Top-level mode toggle (ADR-009 DO4)** — `[Analysen] [📎 Dossier]` pill row above the analysis tab bar. In Dossier mode the analysis tab bar hides and `<DossierTab />` renders instead.
- Tax section: Privat/GmbH toggle, AfA (accelerated post-2020), Grenzsteuersatz, KÖSt 23%, KESt 27.5%
- Rental results: pre-tax metrics + after-tax (private: marginal tax; GmbH: retained vs distributed)
- Flip results: private (ImmoESt 30% + Hauptwohnsitzbefreiung); GmbH (KÖSt + KESt side-by-side)
- Liebhaberei warning (25-year cumulative cashflow check)
- **MRG warning banner (ADR-009 DO6)** — `MrgWarningBanner.tsx` rendered in the rental analysis section header when the Dossier flagged `mrgRisk: true`. Fetched once on modal mount via `getPropertyDetails`. Stale-after-extract is acceptable in this slice — close + reopen the modal to refresh.
- Cost structure: BK umlagefähig (tenant-paid) + BK nicht umlagefähig (owner costs incl. HV reserve) per usage type. Flip includes all BK in holding costs.
- Backend: 6 tax fields on PropertyAnalysis model (legalStructure, purchaseDate, gebaeudeAnteilPct, grenzsteuersatzPct, gmbhAccountingCostsAnnual, distributeProfit)
- **Analysis-draft sync after Dossier → Apply** — when DossierTab fires `onPropertyApplied(field, value)`, the modal's `handleDossierApplied` patches every open analysis tab's draft (`exposePrice → listPrice`, `purchaseDate`, `bkUmlagefaehig`, `bkNichtUmlagefaehig`) and auto-saves saved tabs in the background. Unsaved new tabs (id === null) stay dirty so the user explicitly commits.

## Property Dossier (ADR-009)
- `components/property/DossierTab.tsx` — three-section Dossier view: Documents, AI Extraction, Structured Property Data. Mounts inside `PropertyAnalysisModal` when viewMode === 'dossier'.
- `components/property/EditableField.tsx` — generic inline-edit cell. Six input kinds: number, integer, text, date, boolean, enum. Click to edit, Enter or blur commits, Escape cancels (uses a `cancelledRef` so Escape wins the blur race). Purely presentational — parent provides `onSave`.
- `components/property/MrgWarningBanner.tsx` — amber banner reused by DossierTab Section 3 and the rental analysis tab header. Wording is deliberately hedged ("Mögliches MRG-Objekt", "Signale deuten auf", "Rechtliche Beratung wird empfohlen") — never a legal classification.
- `components/property/AddFromExposeButton.tsx` — Pro-only Exposé upload entry point. Mounted on the Funnel page header and the Dashboard top-right. Click → file picker → `createPropertyFromExpose` → `useProperties.refresh()` → modal opens on the new property. Non-Pro users see a `PRO` badge and an inline upgrade hint instead of the picker.
- **API client** (`lib/api.ts`):
  - `PropertyDetails` interface mirrors the backend Prisma model
  - `normalizePropertyDetails()` coerces all Decimal fields (`exposePrice`, `bk*`, `sizeSqmVerified`, `roomsVerified`, `hwbValue`) from string → number at the API boundary. Prisma serializes Decimals as strings to preserve precision; without this every numeric Dossier field would arrive as a string and break formatters.
  - `getPropertyDetails`, `updatePropertyDetails`, `extractPropertyDetails`, `applyPropertyDetailField`, `createPropertyFromExpose`
- **`→ Apply` flow (DO5)** — optimistic. The display flips to "Übernommen ✓" instantly, the `useProperties` cache is patched via `optimisticUpdate`, the parent modal's analysis drafts are synced via `onPropertyApplied`, the backend write fires in the background. Rollback only on error.
- **Manual edit flow (DO7)** — `handleFieldEdit(field, value)` patches local `details` state first, fires `updatePropertyDetails` PATCH in the background, rolls back on error. If no Dossier row exists yet, the first edit creates one (no Exposé required).
- **Field config** — `FIELD_CONFIG` map at the top of `DossierTab.tsx` lists every field with its `EditableField` kind + enum options. **Enum options must mirror the backend `ENUMS` constant in `extraction.service.ts`** — keep both in sync.
- **PurchaseDate special-case** — Apply is always available (even when null). When null, the row shows the default date (today + 2 months) in italic grey with `(Standard)`. Click → and the backend's same default is written. The frontend computes the same value optimistically for the cache patch so there's no flicker.
- i18n: `dossier.*` namespace in de.json + en.json — section headers, every field label, error states, the MRG warning copy, and the Pro upgrade hints.

## Performance Architecture
- `useProperties`: 2-minute TTL module-level cache, `prefetchProperties()` called during auth init
- `useSavedFilters`: 5-minute TTL module-level cache, `prefetchSavedFilters()` called during auth init
- Analytics summary: 5-minute module-level cache in AnalyticsSnapshotTile
- PropertyAnalysisModal + recharts: dynamic import (`next/dynamic`, ssr: false)
- Skeleton loading states on Dashboard, Funnel
- `connection_limit=5` on Supabase pgbouncer (Railway env var)
- Backend: 60s token validation cache, parallel scraped-listings queries

## Tech Debt
*Source of truth: `docs/IMMIO-Project-State.md`*
- **TD1** Cache invalidation via server push — 30s TTL polling in place, revisit after MVP testing
- **TD2** Impressum address — replace placeholder before public launch (needs GmbH registration)
- **TD10** Saved filter `sources` enum maintenance — new scraped sources need corresponding values added to TEXT[] enum
- **TD13** `platformListedAt` columns empty — schema added but no parser/scraper extracts listing dates yet
- **TD14** Prisma migration history out of sync — schema changes applied via SQL Editor
- **TD15** ImmoScout24 title not parsed — IS24 emails don't contain title, parser sets null
