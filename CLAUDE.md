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
app/
├── page.tsx                        ← Landing page (public) — Sign In + Register modals
├── impressum/page.tsx              ← Austrian ECG compliant (public)
├── datenschutz/page.tsx            ← GDPR compliant (public)
├── register/page.tsx               ← Reads ?email= query param, pre-fills email field
└── (authenticated)/                ← Route group — all protected pages
    ├── layout.tsx                  ← Wraps all authenticated pages with NavBar
    ├── dashboard/page.tsx          ← Tile + table view, search, filter, sort
    ├── funnel/page.tsx             ← Drag-and-drop kanban, 8 stages
    ├── finder/page.tsx             ← Tinder-style swipe UI
    ├── settings/page.tsx
    ├── search/page.tsx             ← Entdecken — browse scraped listings, filter + save to funnel
    ├── analytics/page.tsx          ← Coming Soon
    └── admin/page.tsx              ← User management, invite codes
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
- **Never** read auth state from `supabase.auth.getSession()` directly in components —
  always read from `AuthContext`

**useProperties hook — session guard**
- Location: `hooks/useProperties.ts`
- Waits for `authLoading === false && session !== null` before fetching
- Provides: `properties`, `loading`, `update()`, `optimisticUpdate()`
- 30-second TTL cache
- `update()` mirrors backend rule: clears `listingStatus` to `active` optimistically

**useInteractionTracker hook — localStorage-based view tracking**
- Location: `hooks/useInteractionTracker.ts`
- Tracks property interactions in `localStorage` key `immio_property_interactions`
- Stores per-property: `{ count, lastInteractedAt }`
- Tracked actions: clicking listing URL, opening analysis modal, changing funnel status
- NOT tracked: report unavailable, dismiss (not_relevant)
- Provides: `track(id)`, `getRecent(limit)`, `getMost(limit)`
- Used by Dashboard for "Zuletzt angesehen" and "Am häufigsten angesehen" carousels
- Tech debt: migrate to backend table for cross-device persistence
  when status moves to any non-terminal stage
- `optimisticUpdate()` patches arbitrary `Property` fields in cache instantly

**Route group layout**
- `app/(authenticated)/layout.tsx` wraps all protected pages with NavBar
- Public pages sit directly in `app/` — no middleware required
- Guard: redirect to `/?signin=true` if no session

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
└── supabaseClient.ts           ← Supabase client singleton

Scraped listings API (in lib/api.ts):
- `ScrapedListing` interface — id, platform, title, price, sizeSqm, rooms, location, zipCode, imageUrl, savedByUser
- `getScrapedListings(filter)` — GET /scraped-listings with optional platform/zipCode/minPrice/maxPrice/page
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
1. **First-login onboarding modal** — display immioEmail prominently with copy button
   + "Show me how" drawer with Gmail/Outlook/Apple Mail step-by-step setup guide
   + Re-accessible from NavBar/Settings at any time
2. **Seeded example property on first login** — prevent blank dashboard for new users
3. **Staging environment** — coordinate with backend Railway staging setup
4. **Finder + Funnel sort/filter bar** — sort by price/size/date, filter by district/range
5. **Document uploads (Exposés)** — PDFs per property via Supabase Storage
6. **Garbled characters fix** — some titles show `ß□` encoding edge case
7. **Kontakt page** — simple contact form
8. **Anna's landing page copy** — hero headline and problem section are placeholder

## Entdecken Page (`/search`)
Browse scraped listings from Raiffeisen, s REAL, and ÖRAG.
- Filter bar: platform, PLZ, min/max price
- Grid of listing cards with image, platform badge, price, location, size/rooms
- "Zu meinen Immobilien" save button — calls POST /scraped-listings/:id/save
- Saving a listing invalidates the `useProperties` cache so Dashboard/Funnel update immediately
- Pagination: 20 per page, Zurück/Weiter controls

## Tech Debt
- Cache invalidation via server push — 30s TTL polling in place, revisit post-MVP
- Impressum address — replace placeholder before public launch (needs GmbH registration)
- `TERMINAL_STAGES` duplicated in backend and frontend — update both if changed
