# Device-preview check

A real, automated mobile preview. It boots the **actual** Next app against a
local mock of the public Supabase reads, then drives it with Playwright under
several phone profiles — capturing full-page screenshots **and** asserting the
mobile-UX invariants.

```bash
npm run preview:devices
```

## What it does

For every `device × theme × page` (iPhone SE · iPhone 13 · Pixel 7 ×
dark · light × feed · thoughts · article = 18 captures):

1. **Screenshot** → `scripts/device-preview/shots/<device>__<theme>__<page>.png` (git-ignored)
2. **Assert** (hard-fails the run, non-zero exit):
   - **no horizontal overflow** — `scrollWidth ≤ viewport`
   - **no iOS focus-zoom** — every visible text field is `≥ 16px`
   - **tap targets** — measured controls are `≥ 30px` (warns under 40px)

A `report.json` with the raw measurements is written alongside the shots.

## How it works

- `mock-supabase.mjs` — a ~80-line HTTP server that answers the PostgREST-style
  reads in `lib/queries/*` with deterministic fixtures (no secrets, no network).
  Note: `.maybeSingle()` fetches an array and unwraps one row client-side, so the
  article-by-slug read (`slug=eq.`) must return exactly one row.
- `run.mjs` — starts the mock + `next dev`, waits for readiness, then runs the
  Playwright matrix. Contexts use `reducedMotion: "reduce"` to skip the intro
  overlay and force scroll-reveal content visible for stable captures. The theme
  is pinned per-context via `localStorage.theme` (dark/light) + `colorScheme`.

## Requirements

Playwright's Chromium. If `PLAYWRIGHT_BROWSERS_PATH` already points at a build
(as in CI), it's used as-is; otherwise:

```bash
npx playwright install chromium
```
