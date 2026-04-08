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
`new` → `investigating` → `interested` → `visit_booked` → `visited` → `offer_made`
→ `won` | `parked` | `not_relevant` | `delisted`

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
2. **Recommended for You carousel** (P1) — Dashboard carousel based on funnel behaviour. Locked until ≥5 properties in `investigating`+
3. **Kontakt page** (P1) — simple contact form
4. **Apple Sign In + LinkedIn OAuth** (P2) — prerequisites for native mobile app
5. **Native mobile app** (P2) — React Native / Expo, iOS + Android
6. **Anna's landing page copy** (P3) — hero headline and problem section are placeholder
7. **Onboarding wizard** (P3) — deferred until all functionality complete

## Preset Filters
- `lib/preset-filters.ts` — types, definitions, `passesPresetFilters()`, `passesSavedFilters()`, `togglePreset()`
- `components/PresetFilters.tsx` — shared pill toggle component. Accepts optional `savedFilters` + `activeSavedFilterIds` + `onToggleSavedFilter` for amber saved filter pills alongside presets
- Source presets: "Search Agents" / "Exclude Search Agents" (mutually exclusive, check `emailReceivedAt`)
- Time presets: Last 24h / Last Week (mutually exclusive, use `emailReceivedAt` for email, `firstSeenAt` for scraped — both = arrival time to platform)
- State presets: 9 Austrian states (OR within group, AND with other groups). Sent server-side on Discover and Finder (resolved to postcodes via `getPostcodesByBundesland`)
- Dashboard Discover tile pre-caches per-state scraped counts on mount (10 parallel calls) for instant toggle
- i18n: `presetFilters` namespace in de.json + en.json

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
