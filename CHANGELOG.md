# Changelog

All notable changes to this project are documented in this file.

## v0.3.0 - 2026-02-18
- Expanded shared HTTP retry classification to treat zKill-style `420` responses as rate-limit/retryable (alongside `429`/`5xx`) in `src/lib/api/http.ts`, and added regression coverage in `src/lib/api/http.test.ts` to verify successful retry/backoff behavior after an initial `420`.
- Reduced per-pilot zKill page fan-out backpressure in `src/lib/pipeline/breadthPipeline.ts` by serializing kills/losses page fetches (kills first, then losses) instead of issuing both concurrently, and added regression coverage in `src/lib/pipeline/breadthPipeline.test.ts` to ensure losses page fetches do not start before kills page fetches settle.
- Fixed fleet-summary engagement-pill interaction semantics so non-linked `Fleet`/`Solo` combat capability pills no longer trigger row anchor-scroll behavior; `src/components/FleetSummary.tsx` now marks those pills as row-click excluded, `src/styles.css` sets a non-click cursor affordance for them, and `src/components/FleetSummary.test.tsx` adds a regression test that verifies clicking `Fleet`/`Solo` pills does not invoke row smooth-scroll.
- Added foundational `pill-evidence-links` scaffolding by introducing `src/lib/pillEvidence.ts` (strict candidate validation plus deterministic most-recent evidence selection with killmail-ID tie-break), extending `ShipPrediction` with optional `pillEvidence` metadata in `src/lib/intel.ts`, and adding focused regression coverage in `src/lib/pillEvidence.test.ts`.
- Enforced strict evidence-backed role-pill gating in `src/lib/roles.ts`: removed hull-only role display paths, selected per-role evidence via most-recent valid candidate resolution, and emitted normalized role evidence records (`pillName`, `causingModule`, `fitId`, `killmailId`, `zkillUrl`, `timestamp`) into pipeline debug output; added/updated regression coverage in `src/lib/roles.test.ts`.
- Added strict evidence-backed `Cyno`/`Bait` gating by implementing selected cyno/bait evidence extraction in `src/lib/cyno.ts` (module-derived loss evidence with deterministic most-recent selection), requiring `ship.pillEvidence` for `Cyno`/`Bait` rendering in `src/lib/presentation.ts`, and updating regression coverage in `src/lib/cyno.test.ts`, `src/lib/presentation.test.ts`, `src/lib/ui.test.tsx`, plus the app layout snapshot.
- Wired derived inference pill-evidence persistence in `src/lib/pipeline/executors.ts` by merging role and cyno/bait selected evidence into each predicted ship’s `pillEvidence` map, and now emitting one structured debug payload per displayed evidence-backed non-`Fleet`/`Solo` pill (including `pillName`, `causingModule`, `fitId`, `eventType`, `killmailId`, `zkillUrl`, `timestamp`); added regression coverage in `src/lib/pipeline/executors.recompute.test.ts`.
- Added fleet-summary click-through for evidence-backed non-`Fleet`/`Solo` alerts by introducing `icon-link` rendering in `src/lib/ui.tsx` (wrapping selected pill/module icons with their causative zKill URL) and wiring `src/components/FleetSummary.tsx` to use it; added regression coverage in `src/lib/ui.test.tsx` and `src/components/FleetSummary.test.tsx`.
- Extended evidence-link click-through to pilot-card pill surfaces by allowing `pill` mode evidence wrapping in `src/lib/ui.tsx`, so evidence-backed pills in both `Ship Summary` and `Likely Ships` now open their causative zKill kill/loss URL; added regression coverage in `src/lib/ui.test.tsx` and `src/components/PilotCardView.test.tsx`, updated layout snapshot output in `src/__snapshots__/App.layout.snapshot.test.tsx.snap`, and added link styling hooks in `src/styles.css`.
- Removed the standalone `Cyno Capable` pill from likely-ship rows in `src/components/PilotCardView.tsx`, widened the DPS capability tile by shifting `src/styles.css` ship-metrics grid columns to `1.1fr/0.9fr`, and prevented DPS damage-split percentages from wrapping by making `.damage-inline` single-line; added regression coverage in `src/components/PilotCardView.test.tsx` and updated `src/__snapshots__/App.layout.snapshot.test.tsx.snap`.
- Applied strict evidence-only rendering for non-`Fleet`/`Solo` pills across pilot-card surfaces by requiring selected evidence URLs before rendering role/cyno/bait pills in `src/lib/ui.tsx` (pill/icon/icon-link modes), and added regression coverage in `src/lib/ui.test.tsx` and `src/components/PilotCardView.test.tsx`.
- Finalized pill-evidence cache/schema invalidation safety by bumping derived inference cache keys to `derived.inference.v8` in `src/lib/pipeline/pure.ts` and snapshot compatibility namespaces to `v2` in `src/lib/pipeline/snapshotCache.ts` (`version: 2`, `eve-intel.cache.pipeline.snapshot.v2`, `snapshot-src-v2`); added regression coverage in `src/lib/pipeline/snapshotCache.test.ts` and updated versioned cache assertions in `src/lib/pipeline/pure.test.ts` and `src/lib/pipeline/breadthPipeline.test.ts`.
- Stabilized CI test behavior by hardening `src/App.paste.integration.test.tsx`: added explicit `cleanup()` after each test and changed the pilot-card assertion to wait for the rendered `Likely Ships` heading instead of matching `A9tan` text that can appear earlier in the clipboard payload textarea.
- Hardened `scripts/tests/dogma-parity-followup-cruiser-coverage.test.mjs` for clean-checkout CI runs by returning early when build-generated Dogma artifacts (`public/data/dogma-manifest.json` or referenced pack file) are absent during `npm test`.
- Fixed zKill character danger normalization for low direct-percentage values by treating `dangerRatio`/`gangRatio` values as percent when already in `0..100` range (for example, `6` now remains `6%` instead of becoming `60%`), while retaining legacy `dangerous` `0..10` compatibility; added regression coverage in `src/lib/api/zkill.test.ts`.
- Bumped the cache namespace version from `v3` to `v4` in `src/lib/cache/types.ts`, forcing cache-key invalidation for all users so stale cached zKill danger values and related cached envelopes do not persist across the scoring fix; updated cache tests in `src/lib/cache.test.ts` to assert versioned keys via `versionedKey(...)`.
- Hardened debug-log lifecycle safety in `src/lib/useDebugLog.ts` by guarding queued flushes after unmount/environment teardown, switching timer calls to `globalThis`, and clearing pending buffers/timers in cleanup; added regression coverage in `src/lib/useDebugLog.test.tsx`.
- Fixed zKill in-flight dedupe cancellation coupling in `src/lib/api/zkill.ts` by keying foreground refreshes per abort-signal identity (instead of a single shared `fg` bucket), preventing one caller’s abort from cancelling unrelated foreground callers; added regression coverage in `src/lib/api/zkill.test.ts`.
- Added explicit background-refresh failure telemetry in `src/lib/usePilotIntelPipelineEffect.ts` so page-1 revalidation errors are logged with pilot/force-network context rather than silently swallowed; added regression coverage in `src/lib/usePilotIntelPipelineEffect.test.tsx`.
- Removed dead `processPilot` plumbing from active pipeline wiring by trimming unused `runPilotPipeline` parameters and hook dependency surface in `src/lib/pipeline/runPipeline.ts` and `src/lib/usePilotIntelPipelineEffect.ts`, with corresponding test updates in `src/lib/pipeline/runPipeline.test.ts` and `src/lib/usePilotIntelPipelineEffect.test.tsx`.
- Refactored ship-specific dogma parity overrides into centralized data tables in `src/lib/dogma/calc.ts` (weapon profile overrides, defense HP overrides, resonance overrides, and reactive-armor parity overrides) to reduce scattered hardcoded conditionals; added characterization coverage in `src/lib/dogma/calc.test.ts`.
- Improved dogma hot-path lookup efficiency in `src/lib/dogma/calc.ts` by caching normalized attribute maps/effect sets and normalized-name tokens, reducing repeated normalization work in `getAttrLoose(...)` and `hasAnyEffect(...)` call sites.

Boundary source:
- Previous boundary tag `v0.2.9` (`5c24b89`) and version marker commit `ecfb03e` (`v0.3.0`) were used because no `v0.3.0` tag exists.
- Additional post-marker workspace changes are documented directly in this entry.

## v0.2.9 - 2026-02-18
- Streamlined inference evidence summarization scans by adding a shared one-pass summary path in `src/lib/intel/summaries.ts` and switching `recomputeDerivedInference` in `src/lib/pipeline/executors.ts` to derive coverage and top-evidence rows from the same pass; added regression coverage in `src/lib/pipeline/executors.recompute.test.ts`.
- Improved fit-metric resolver hot-path performance by memoizing per-fit/per-character metric-key construction in `src/lib/useFitMetrics.ts`, avoiding repeated module-sort key rebuilds on cache hits while preserving existing result semantics; added regression coverage in `src/lib/useFitMetrics.test.ts`.
- Completed Step-8 refactor hardening by rerunning required validations (`npm test`, `npm run build` last) and finalizing v0.2.9 release-note boundary coverage through `refactor(backtest): canonicalize zkill backtest tuning path`.
- Canonicalized zKill backtest tuning by adding a Step-6 canonicalization gate (`scripts/tests/backtest-zkill-canonicalization.test.mjs`), introducing shared scoring helpers in `src/lib/backtestCore.ts`, routing `src/lib/backtest.ts` through the shared core, and delegating `scripts/backtest-zkill.mjs` to shared candidate scoring + recency predictor logic.
- Canonicalized zKill rate-limit probe implementation by adding a Step-5 wrapper-shape gate (`scripts/tests/zkill-rate-limit-probe-canonicalization.test.mjs`) and converting `scripts/zkill-rate-limit-probe.mjs` into a thin CLI entrypoint that delegates parsing and probe execution to `src/lib/dev/zkillRateLimitProbe.ts`.
- Added a Step-4 dead-export hygiene gate (`scripts/tests/dogma-pipeline-dead-export-hygiene.test.mjs`) and removed scoped dead export surface by deleting `getDogmaVersion` in `src/lib/dogma/loader.ts`, deleting `getAttr` in `src/lib/dogma/index.ts`, and making `buildPilotSnapshotKey` internal in `src/lib/pipeline/snapshotCache.ts`.
- Added a Step-3 duplicate-import hygiene gate (`scripts/tests/pipeline-duplicate-import-hygiene.test.mjs`) and consolidated duplicate module imports in `src/lib/usePilotIntelPipelineEffect.ts`, `src/lib/pipeline/executors.ts`, `src/lib/pipeline/derivedInference.ts`, and `src/lib/pipeline/inferenceWindow.ts` without changing behavior.
- Added a Step-2 unused-symbol hygiene gate (`scripts/tests/pipeline-unused-symbol-hygiene.test.mjs`) and removed stale imports in `src/App.paste.integration.test.tsx` and `src/lib/pipeline/breadthPipeline.ts`, while consolidating `derivedInference` cache test stubs into a single typed helper for deterministic, low-noise coverage.
- Added a repository artifact-hygiene gate (`scripts/tests/repository-artifact-hygiene.test.mjs`), removed tracked `scripts/__pycache__/*.pyc` bytecode artifacts, and added a narrow `.gitignore` rule for `scripts/__pycache__/`.
- Added a Dogma engine type-export hygiene gate (`scripts/tests/dogma-engine-type-export-hygiene.test.mjs`) and removed unused exported types (`EngineContext`, `OffenseStageInput`, `DefenseStageInput`) from `src/lib/dogma/engine/types.ts`, retaining only the actively consumed `EngineTrace` export.
- Switched Triglavian disintegrator offense modeling to always use module maximum spool multipliers for displayed DPS (instead of base-cycle disintegrator DPS), and added regression coverage for synthetic disintegrator max-spool math plus updated Nergal envelope assertions.
- Completed full T3 cruiser subsystem parity coverage by adding pyfa-referenced manual fits for previously uncovered Legion/Loki/Proteus/Tengu subsystem variants, adding a strict coverage test that requires every category-32 T3 subsystem to appear in referenced corpus fits, and fixing missing Amarr/Gallente defensive armor-HP subsystem multiplier handling that caused EHP underreporting on augmented-plating profiles.
- Fixed Tengu offensive-subsystem kinetic missile parity by handling `subsystemBonusCaldariOffensive2MissileLauncherKineticDamage` in Dogma, and closed the regression coverage gap by adding a pyfa-referenced kinetic HAM Tengu fit (`manual-tengu-paomo1-kinetic-ham-1`) to corpus, golden IDs, and strict cruiser follow-up checks.
- Fixed inferred-fit construction for strategic cruisers by including fitted subsystem flags (`125-132`), so in-app Dogma simulation receives subsystem modules in `other` slots and no longer underreports T3 offensive output from missing subsystem effects.
- Improved inferred EFT rendering for T3 cruisers by labeling their `other` section as `Subsystems:` (while retaining `Other:` for non-T3 fits), matching expected strategic cruiser EFT presentation.
- Fixed inferred fit script pairing for missile-guidance mids by treating `Missile Guidance ...` modules as non-charge modules, preventing standalone `Missile Range Script` lines from replacing `Missile Guidance Computer` entries.
- Fixed inferred fit pairing for legacy weapon-module names (`... Missile Bay`, `... Rocket Bay`, and `... 'Probe' Artillery ...`) so their ammo rows no longer replace the fitted module entry when loss item order is charge-first.
- Fixed T3 defensive/speed parity for subsystem-heavy fits by applying fitted subsystem additive HP bonuses in defense evaluation, removing stale hardcoded Loki/Proteus HP uplifts, and using prop thrust-to-mass scaling (with `Mass` from `invTypes`) for active speed so Tengu-style AB fits now align with pyfa `EHP` and max-speed baselines.
- Completed T3 destroyer follow-up gate closure by adding 58 curated zKill destroyer corpus/reference fits (Hecate/Jackdaw/Confessor/Svipul at 15 each), introducing destroyer coverage + strict gate regression tests, and aligning tactical destroyer defensive resist assumptions by hull family so all destroyer hulls now meet `>=10` passing fits under the follow-up `10%` surfaced-metric rule.
- Aligned Reactive Armor Hardener parity with pyfa equilibrium behavior (cycle-based redistribution + deterministic average profile), and closed residual Legion/Proteus T3 cruiser gate deficits to `10/10` passing fits each under follow-up `10%` surfaced-metric rules.
- Added T3 cruiser mechanic-cluster parity fixes for polarized resistance-killer effects, civilian turret skill scaling, Caldari defensive subsystem shield-HP bonuses, and Reactive Armor Hardener profile handling, with new cruiser regression tests for strict 10% surfaced-metric checks.
- Expanded T3 cruiser parity coverage with 35 curated zKill-based Loki/Legion/Proteus/Tengu fits, synced pyfa reference rows for each new fit, and added a regression coverage test enforcing `>=10` corpus+reference fits per cruiser hull.
- Added deterministic follow-up prioritization backlog generation for mismatch mechanic clusters (`damage-output`, `effective-hit-points`, `resist-profile`), including stable ordering and per-cluster score breakdowns (`errorSeverity`, `hullGatePressure`, `mechanicReuse`, `fitPrevalence`).
- Added a follow-up fit/hull gate evaluator for `followup-10pct` parity semantics, including per-fit pass/fail classification, T3 cruiser and T3 destroyer per-hull deficits, and phase sequencing that blocks destroyer completion until cruisers are complete.
- Added deterministic follow-up baseline summary artifact generation (`reports/dogma-parity-followup-baseline-summary.json`) with strict `followup-10pct` threshold policy metadata, per-fit max-relative-delta rollups, per-hull pass/deficit counts, and ranked mismatch output.
- Wired follow-up baseline CLI to run the default baseline artifact pipeline with configurable `--parity-report-path` and `--summary-path` inputs, plus regression coverage for end-to-end summary emission.
- Added follow-up baseline CLI scaffolding with an explicit precondition entry gate (`dogma:parity:followup:baseline`) that exits before baseline generation unless the prerequisite task is marked complete.
- Added deterministic new-fit scope helpers for scoped Dogma parity workflows, including scope-file loading and manual fit-id normalization with regression tests.
- Added scoped Dogma parity comparison helpers that evaluate only selected new-fit IDs, with deterministic ordering and explicit missing-corpus/reference reporting tests.
- Added scoped pyfa reference sync helpers that process only selected new-fit IDs, deterministically merge references by `fitId`, and continue through missing-corpus/pyfa-failure cases with regression tests.
- Added a new-fit parity orchestrator CLI module and import-safe entrypoint that composes scoped scope/sync/compare flows with explicit usage/fatal handling and non-zero-on-mismatch exit policy tests.
- Added deterministic new-fit parity report + optional diagnostics artifact writing (`reports/dogma-parity-new-fits-report.json` + JSONL events), and wired orchestrator emission with regression coverage.
- Added first-class `dogma:parity:new-fits` npm script wiring and new-fit CLI argument-contract tests covering `--scope-file`/`--fit-id(s)` ergonomics and usage errors.
- Added scoped compare guardrails that continue through per-fit Dogma parse/compute failures and emit structured diagnostics error events instead of aborting the full new-fit run.
- Aligned scoped new-fit diagnostics with explicit blocker semantics by adding deterministic `blockedFitCount`/`blockedFitIds`/`blockedFits` report fields and making blocker-only scoped runs exit non-zero with blocker counts in CLI summaries.
- Added an end-to-end zKill fit-fetch CLI (`npm run zkill:fits:fetch`) with strict argument validation and default `--max-records 200`.
- Added deterministic ship-type pagination/merge ordering, strict `--before-killmail-id` cutoff behavior, and max-record short-circuiting.
- Added header-aware retry/backoff (`Retry-After` and rate-limit headers first, exponential fallback second) with timeout-aware retry handling.
- Added fit normalization that includes both destroyed and dropped fitted modules with deterministic slot-family mapping.
- Added deterministic dedupe by primary `killmailId` and secondary canonical `fitHash`, preserving keep-first stream order.
- Added deterministic artifact outputs: fit-record JSONL, structured-error JSONL, and manifest JSON with counts and `nextBeforeKillmailId`.
- Added a dedicated zKill CLI orchestration module plus import-safe script entrypoint wiring, with regression coverage for help/usage/success/fatal exit behavior.
- Added unit and integration regression coverage across args, pagination, retry, normalization, dedupe, artifacts, and full pipeline orchestration.
- Improved zKill cache refresh/revalidation behavior and UI reliability (explicit-ship refresh correctness, reduced background flicker, and unknown-fit role-pill handling fixes).

Boundary source:
- Previous version marker commit `96a7691` (`v0.2.8`) used as lower boundary because no `v0.2.9` tag exists yet.
- Summarized from history in range `96a7691..6e384db`.

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
