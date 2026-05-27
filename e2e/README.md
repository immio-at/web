# M2b Playwright smoke net

Five smoke tests guarding the user-facing critical paths (ADR-025 M2b Phase 0).
They are a **floor, not a ceiling** — if we break Discover / Funnel / Dossier /
Analysis / Recently-Viewed we find out fast.

## Run

```bash
# 1. Target + test login (storage-state auth, saved once and reused)
export PLAYWRIGHT_BASE_URL=https://dev.immio.at      # or http://localhost:3000
export PLAYWRIGHT_USER_EMAIL=you@example.com
export PLAYWRIGHT_USER_PASSWORD=••••••••

# 2. First run only — download browsers
npx playwright install

# 3. Run
npm run e2e            # headless
npm run e2e:ui         # interactive UI mode
```

The `setup` project logs in once via the landing-page Sign In modal and writes
`e2e/.auth/user.json`; every test reuses it. That file holds a live session —
**git-ignored, never commit it.**

## Selectors — read before first run

These specs use best-effort role/text selectors against the documented DOM.
The most stable hook is `[data-testid="listing-card"]` on `PropertyCard` and
`[data-property-modal-open]` on `PropertyAnalysisModal`. If the card test-id
isn't present, the specs fall back to `main img`. The first time you run them,
expect to tweak 1–2 selectors per spec to match the live markup, then they
stay stable. (Adding `data-testid="listing-card"` to `PropertyCard` is the
recommended one-line hardening — preserve it through the M2b type refactor.)

## Brief contract

These must be **green on `main`** before the M2b refactor commits land
(baseline), and re-run after each large refactor chunk and once on the prod URL
after merge.
