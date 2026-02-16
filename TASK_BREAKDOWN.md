# EVE Intel Browser App - Task Breakdown (v0.3)

## 0) Scope and reference alignment
- Goal: browser-based intel tool inspired by EVE Squadron workflow and EVEOS Local Intel output density.
- Input model: zero-click paste (`Ctrl+V`) when app window/tab is focused.
- Output model: EVEOS-like pilot stat card, with predicted ships shown in a dedicated right-side column.

## 1) Confirmed product decisions
- Architecture: fully frontend-only (no backend/proxy).
- Supported paste formats (initial):
  - Pilot only: `A9tan`
  - Pilot + ship: `Ula (Charon)`
- Ship likelihood inputs: both recent kills and losses.
- Lookback window: configurable, default `14` days.
- Ship results count: configurable numeric input, default `Top 3`, capped at `10`.
- Weights controls: fixed in v1 (no user-facing weight controls yet).
- Explicit ship rule: if pasted, it is always rank #1.

## 2) Frontend-only implications (important)
- API reliability/rate-limit risk is higher without a backend cache/proxy.
- CORS and third-party API behavior can change and break fetches.
- Browser storage limits constrain cache size.
- Mitigation:
  - Local caching + stale-while-revalidate.
  - Request throttling + bounded lookback pulls.
  - IndexedDB fallback if localStorage is insufficient.

## 3) UI target details
- Pilot card should remain visually similar to EVEOS info block:
  - Avatar, pilot name (**zKill link**), corp/alliance row, threat indicator.
  - Kills, losses, K/D, solo, sec status, isk destroyed/lost, isk ratio, solo ratio, danger.
  - Footer actions (zKill link; optional share).
- New/right-side column:
  - Predicted ships sorted by likelihood.
  - Per row: ship name, confidence %, reason hints, cyno-risk badge.
  - Expand/click to show inferred likely fit(s).

## 4) Execution tasks

### 4.0 Delivery methodology (TDD-first)
- [x] Implement features in TDD cycles where practical (red -> green -> refactor).
- [x] Keep regression coverage for each completed feature slice before moving to next slice.

### 4.1 Foundation
- [x] Create frontend app shell (TypeScript + React + Vite).
- [x] Add environment-safe API client wrappers (ESI + zKill + shared HTTP helper).
- [x] Add global settings state (lookback days, top-N).

### 4.2 Paste-first workflow
- [x] Install global `paste` listener on window/document.
- [x] Parse clipboard text immediately and trigger intel pipeline with no submit control.
- [x] Add compatibility fallback hidden input for browser quirks.
- [x] Render recent paste metadata (timestamp and parsed line count).
- [x] Add optional auto-clipboard watch mode (`navigator.clipboard.readText()` polling with explicit user opt-in/permission), plus fallback note that true background monitoring requires desktop wrapper (Electron/Tauri).

### 4.3 Parsing
- [x] Parse pilot-only lines (`A9tan`).
- [x] Parse pilot+ship lines (`Ula (Charon)`).
- [x] Normalize, dedupe, and validate names.
- [x] Emit parse confidence and ship source (`explicit` or `inferred`).

### 4.4 Data ingestion
- [x] Implement name -> character ID resolution via ESI.
- [x] Implement zKill fetchers for recent kills/losses (lookback-window aware).
- [x] Wire ESI/zKill ingestion into UI pipeline and per-pilot state.
- [x] Fetch character/corp/alliance portraits/logos for card UI.
- [x] Cache raw responses with TTL.

### 4.5 Likelihood model
- [x] Build candidate ship set from explicit paste + kill/loss events.
- [x] Weighted factors:
  - [x] Recency
  - [x] Frequency
  - [x] Event type (kill/loss)
  - [x] Explicit pasted ship forced rank #1
- [x] Normalize into probabilities.
- [x] Return configurable top-N ships (default 3, cap 10).

### 4.6 Fit inference
- [x] Collect recent losses matching each predicted ship.
- [x] Cluster module sets for fit similarity.
- [x] Rank and display most likely fit + alternates.

### 4.7 Cyno/jump intelligence
- [x] Maintain static allow-lists:
  - [x] Ships/hulls that can fit cyno modules.
  - [x] Ship classes able to jump to cynos.
- [x] Verify and correct cyno-capable hull list against current EVE mechanics (example gap: `Viator` covert cyno capability).
- [x] Evaluate predicted ships and recent pilot history for cyno/jump risk.
- [x] Display risk badges and concise reason text.

### 4.8 Caching/performance
- [x] Cache layers started for name map + zKill raw payloads.
- [x] TTL behavior implemented for current caches.
- [x] Add cache key versioning for inference model evolution.
- [x] Add stale-while-revalidate behavior.
- [x] Add localStorage quota guard + IndexedDB fallback.
- [x] Add derived inference cache (ship probabilities + fits).

### 4.9 Robustness
- [x] Per-pilot fault tolerance on API errors in UI flow.
- [x] Request cancellation on rapid repaste.
- [x] Rate-limit backoff with user-visible status.

### 4.10 QA
- [x] Parser tests for confirmed formats and malformed lines.
- [x] Scoring tests (kill+loss factor behavior).
- [x] Cyno/jump rules tests.
- [x] Paste-flow integration tests.
- [x] Ingestion mapping tests (ESI/zKill -> view model).

### 4.11 EVEOS UI parity (new)
- [x] Review and extract reference layout tokens (spacing, font sizing, card dimensions, borders, shadows) from `eveos_intel_example/index.html` and `eveos_intel_example/index_files/*.css`.
- [x] Rebuild pilot info box to match EVEOS card visual structure/size as closely as practical.
- [x] Match player header composition:
  - [x] Avatar size/shape and alignment.
  - [x] Name + affiliation typography hierarchy.
  - [x] Threat indicator placement and styling.
- [x] Match player body stat grid density and row spacing to EVEOS-style compact layout.
- [x] Add right-side ship candidate column as sibling panel inside the same row/card composition.
- [x] Render per-candidate ship icon (`https://images.evetech.net/types/{typeId}/icon?size=64`) with fallback placeholder.
- [x] Add candidate row structure:
  - [x] Ship icon + ship name.
  - [x] Probability %.
  - [x] Cyno capability/chance label.
  - [x] Compact risk markers.
- [x] Render fit output in EFT-style text block for each candidate:
  - [x] Header format: `[Ship, Fit Name]`
  - [x] Grouped module sections (high/mid/low/rig/cargo where data allows).
  - [x] One-click copy for EFT block.
- [x] Keep responsive behavior:
  - [x] Desktop: pilot panel left, ship candidate panel right.
  - [x] Mobile: stacked panels with preserved readability.
- [x] Add snapshot-style visual regression checks for the card layout against chosen reference screenshot(s).

### 4.12 Cyno badge + probability calibration (new)
- [x] Restore/standardize per-ship cyno UI badge style to yellow rounded-pill marker (`Cyno Capable`) for quick scanability.
- [x] Ensure badge is displayed inline with each ship candidate row and visually separated from raw text.
- [x] Replace current heuristic-only cyno % with evidence-priority logic:
  - [x] If same hull has prior losses with cyno module fitted, set cyno chance to `100%`.
  - [x] If other hull losses have cyno module evidence but none on same hull, compute reduced non-100% chance.
  - [x] If hull is cyno-capable but no module evidence exists, show low baseline chance.
  - [x] If hull is not cyno-capable, force `0%` and hide cyno-capable badge.
- [x] Add deterministic rule ordering and comments so future tuning cannot override direct-evidence `100%` behavior.
- [x] Add/extend tests for cyno chance outcomes:
  - [x] Same-hull cyno-fit evidence => `100%`.
  - [x] Other-hull-only evidence => intermediate chance.
  - [x] Capability-only/no fit evidence => low chance.
  - [x] Non-capable hull => `0%`.

### 4.13 Static Dogma + Combat Estimates (new)
- [x] Build-time SDE sync (`scripts/sync-sde.mjs`) with manifest + local cache.
- [x] Build-time dogma pack compiler (`scripts/compile-dogma-pack.mjs`).
- [x] Runtime dogma loader/index (`src/lib/dogma/loader.ts`, `src/lib/dogma/index.ts`).
- [x] Combat calculator engine (`src/lib/dogma/calc.ts`) for DPS/alpha, damage split, range, EHP, resists.
- [x] UI render in fit column for combat estimates with confidence + assumption tooltip.
- [x] Confidence/assumption display and unavailable fallback.
- [x] Tests for loader/calc + intel fit normalization coverage.
- [ ] Backtest sanity pass against broader real-fit samples.

## 5) Milestones
- [x] M1: App shell + global paste + parser.
- [x] M2: ESI/zKill integration + base card rendering.
- [x] M3: Ship likelihood + right column + top-N config.
- [x] M4: Fit inference + cyno/jump alerts.
- [x] M5: Caching hardening + UI polish to EVEOS-like density.
- [x] M6 (final validation): tune probability weights by backtesting against zKill history and compare predicted ships vs observed recent usage (utility added: `src/lib/backtest.ts`, live script: `scripts/backtest-zkill.mjs`).
- [ ] M7: Dogma-based combat metrics shipped.

## 6) Next sprint (decision-complete)
1. Wire identity resolution into UI:
- Per-pilot loading/error/ready states.
- Render pilot name as zKill link once `characterId` resolves.

2. Wire zKill ingestion into UI:
- Fetch kills/losses per pilot using configurable lookback.
- Bounded concurrency for multi-pilot paste.

3. Compute/render pilot stats:
- Kills, losses, K/D, ISK stats, solo ratio, security status.
- Keep EVEOS-like left card structure.

4. Implement initial ship likelihood:
- Candidate pool from kill/loss data.
- Explicit pasted ship forced #1.
- Weighted rank for remaining ships; normalized probabilities.
- Show top-N (default 3, cap 10).

5. Add TDD coverage for this sprint:
- Ingestion mapping tests.
- Scoring rule tests including explicit ship #1 rule.
- One paste-flow integration test with mocked ESI/zKill responses.

## 7) Important interfaces/types for next sprint
- Add `PilotIntel` view model with:
  - `pilotName`, `characterId`, `corpId`, `allianceId`, `securityStatus`
  - `kills`, `losses`, `kdRatio`, `iskDestroyed`, `iskLost`, `iskRatio`, `solo`, `soloRatio`, `danger`
  - `predictedShips[]` with `shipName`, `probability`, `source`, `reason[]`
  - `fitCandidates[]` placeholder (for M4)
  - `cynoRisk` placeholder (for M4)
