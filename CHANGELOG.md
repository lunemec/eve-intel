# Changelog

All notable changes to this project are documented in this file.

## v0.2.9 - 2026-02-18
- Updated zKill list caching to support conditional revalidation metadata (`ETag`/`Last-Modified`) and optional forced network refresh for page-1 checks.
- Added background pilot refresh improvements: 30s revalidation cadence, explicit-ship mismatch detection against inferred top ship, and redraw only when page-1 kill/loss heads change.
- Fixed explicit-ship paste updates to rerun pipeline immediately even when zKill page-1 is unchanged (`304`), so explicit ships (for example `Freya Rage (Viator)`) reliably become `100%` predictions.
- Expanded cache/pipeline coverage with regression tests for forced network fetch and explicit-mismatch-triggered refresh behavior.
- Added debug observability for all page-1 zKill refresh checks (request/response validator metadata, status, and 304 signal), and a debug-panel copy control for quick clipboard export of current logs.
- Fixed background refresh flicker by keeping existing pilot card content visible during background reruns until terminal `ready`/`error` updates arrive.

Boundary source:
- Version marker commit `55f7c4c` (`Cache`) used as release boundary.
- Summarized from history in range `96a7691..55f7c4c`.

## v0.2.8 - 2026-02-18
- Added a major combat-capability parity workflow: fit corpus data, reference sync scripts, pyfa adapter tooling, and parity reporting artifacts.
- Expanded Dogma and pipeline architecture with staged processing modules, caching/snapshot behavior, and broader test coverage across API, UI, and pipeline layers.
- Refactored UI composition into focused components and hook-based logic, including app preferences, debug controls, and desktop bridge integration.
- Improved zKill/ESI handling and added rate-limit/cache-policy test coverage.
- Added CI workflow and supporting reliability-focused test suites.

Boundary source:
- Version marker commit `96a7691` (`v0.2.8`) used as release boundary because no `v0.2.8` tag exists.
- Summarized from history in range `b38004c..96a7691`.

## v0.2.7 - 2026-02-16
- Updated ship probability behavior to account for kills and losses.
- Extended intel and zKill logic/tests for probability-related behavior.

Boundary source:
- Version marker commit `b38004c` (`Version 0.2.7...`) used as release boundary.
- `v0.2.7` tag currently points to `bf1a3d4` (same as `v0.2.6`), so commit message boundary was used.
- Summarized from history in range `bf1a3d4..b38004c`.

## v0.2.6 - 2026-02-16
- Added ISK send capability and related desktop integration updates.
- Updated release/publish scripting and UI styling around the new behavior.

Boundary source:
- Tagged commit `bf1a3d4` (`v0.2.6`).
- Summarized from history in range `a404ce8..bf1a3d4`.

## v0.2.5 - 2026-02-15
- Added auto-update and desktop preload/main bridge updates.
- Applied visual/UI refresh updates across the app.

Boundary source:
- Tagged commit `a404ce8` (`v0.2.5`).
- Summarized from history in range `ead5744..a404ce8`.

## v0.2.4 - 2026-02-15
- Updated Electron main process behavior and corresponding UI layout/snapshot output.
- Applied incremental app styling updates.

Boundary source:
- Tagged commit `ead5744` (`v0.2.4`).
- Summarized from history in range `5b0381f..ead5744`.

## v0.2.3 - 2026-02-15
- Improved parsing and intel processing behavior with test updates.
- Updated app UI and styling refinements.
- Updated release automation script and package metadata.

Boundary source:
- Version marker commit `5b0381f` (`Version 0.2.3`) used as release boundary.
- `v0.2.3` tag currently points to `b216dbf` (same as `v0.2.2`), so commit message boundary was used.
- Summarized from history in range `b216dbf..5b0381f`.

## v0.2.2 - 2026-02-15
- Initial project release.
- Added Electron + Vite app shell, UI, parser/intel/backtest/cyno/roles modules, and API integrations (ESI/zKill).
- Added test suite baseline across app layout/integration and core libraries.
- Added desktop wrapper docs, release script, and project build configuration.

Boundary source:
- Tagged commit `b216dbf` (`v0.2.2`).
