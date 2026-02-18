# Implementation Plan: Performance Refactor

## Checklist
- [ ] Step 1: Fix inventory-type miss-cache sentinel handling
- [ ] Step 2: Add bounded concurrency for background refresh sweep
- [ ] Step 3: Remove duplicate fg/bg zKill in-flight requests
- [ ] Step 4: Add bounded concurrency for CLI ESI killmail hydration
- [ ] Step 5: Refactor history aggregation to incremental ordering
- [ ] Step 6: Precompute timestamps to remove comparator parse amplification
- [ ] Step 7: Optimize role/cyno analysis with per-run evidence indexes
- [ ] Step 8: Reduce local cache budget-check scan amplification
- [ ] Step 9: Unify timeout/retry discipline across direct fetch call sites
- [ ] Step 10: Final regression pass, cleanup, and changelog update

Step 1:
Objective: Ensure miss-cache entries for inventory type lookup are treated as valid cached results.
Red Gate: Add/update `src/lib/api/esi.test.ts` so a cached `0` miss prevents immediate refetch; verify failure on current implementation.
Green Gate: Update cache-hit checks in `src/lib/api/esi.ts` to use explicit nullability semantics and pass targeted ESI tests.
Blue Gate: Refactor cache-check helper usage for clarity while keeping tests green.
Implementation Guidance: Replace truthy cache checks (`if (cached.value)`) with `cached.value !== null` where `0` is a valid sentinel; preserve external behavior (`undefined` for misses).
Test Requirements: Run targeted ESI tests, then `npm test`, then `npm run build`.
Integration Notes: No API contract changes; integrates directly into existing ESI resolver flow.
Demo Description: Repeated explicit-ship miss lookups do not re-hit ESI during miss TTL.

Step 2:
Objective: Reduce roster refresh latency by scheduling per-pilot background refresh with bounded concurrency.
Red Gate: Add/update `src/lib/usePilotIntelPipelineEffect.test.tsx` to prove current background sweep is serial and violates desired scheduling behavior.
Green Gate: Implement bounded concurrency scheduler in background refresh path and pass tests with deterministic ordering guarantees.
Blue Gate: Consolidate scheduler utility reuse if duplicated; keep behavior and tests stable.
Implementation Guidance: Introduce a small concurrency limiter for `runBackgroundRefreshSweep`; retain single in-flight guard per pilot and existing cancellation semantics.
Test Requirements: Run targeted hook/pipeline tests, then `npm test`, then `npm run build`.
Integration Notes: Must preserve `refreshInFlightByPilotKeyRef` semantics and avoid concurrent duplicate refreshes for same pilot.
Demo Description: On a multi-pilot roster, background page-1 checks run concurrently up to configured limit and complete faster than strictly serial execution.

Step 3:
Objective: Prevent equivalent foreground/background zKill list requests from duplicating network calls.
Red Gate: Add/update `src/lib/api/zkill.test.ts` to show equivalent requests currently issue duplicate fetches due to fg/bg key split.
Green Gate: Adjust in-flight keying/dedupe in `src/lib/api/zkill.ts` so equivalent requests share the same in-flight promise when safe.
Blue Gate: Simplify keying logic and comments while retaining passing tests.
Implementation Guidance: Rework `refreshZkillListDeduped` key strategy to prioritize request identity (URL + cache key + forceNetwork/conditional context) over caller mode.
Test Requirements: Run targeted zKill API tests, then `npm test`, then `npm run build`.
Integration Notes: Must not regress explicit forced-network semantics.
Demo Description: Simultaneous equivalent refresh triggers result in one upstream request with shared completion.

Step 4:
Objective: Remove serial ESI hydration bottleneck in fit-fetch CLI pipeline.
Red Gate: Add/update `scripts/tests/fetch-zkill-fits*.test.mjs` proving hydration currently executes serially for candidates.
Green Gate: Implement bounded-concurrency hydration in `scripts/lib/zkill-fit-fetch-cli/pipeline.mjs` with deterministic result assembly.
Blue Gate: Refactor concurrency helper placement and error aggregation readability.
Implementation Guidance: Batch or worker-pool candidate hydration; preserve current structured error collection and output schema.
Test Requirements: Run targeted CLI pipeline tests, then `npm test`, then `npm run build`.
Integration Notes: Preserve artifact determinism and existing duplicate elimination behavior.
Demo Description: Processing a large candidate set completes with parallel ESI hydration and unchanged artifact format.

Step 5:
Objective: Eliminate repeated full-history re-sort on each incremental page update.
Red Gate: Add/update `src/lib/pipeline/breadthPipeline.test.ts` to detect repeated full-sort behavior through observable call patterns or ordering update invariants.
Green Gate: Introduce incremental history ordering strategy in `src/lib/pipeline/breadthPipeline.ts` and related helpers.
Blue Gate: Clean up helper boundaries (index update vs presentation conversion) without changing behavior.
Implementation Guidance: Maintain `historyKills/historyLosses` index structures and apply delta updates; avoid rebuilding/sorting entire arrays for every page increment.
Test Requirements: Run targeted pipeline tests, then `npm test`, then `npm run build`.
Integration Notes: Ensure stage transitions and `fetchPhase` updates remain unchanged.
Demo Description: Deep-history pagination adds new rows with stable ordering and reduced per-round compute overhead.

Step 6:
Objective: Remove repeated timestamp parsing in sort comparator hot paths.
Red Gate: Add/update tests in `src/lib/pipeline/pure.test.ts` or `src/lib/pipeline/breadthPipeline.test.ts` to validate use of precomputed numeric time ordering.
Green Gate: Update merge/sort helpers to use precomputed epoch fields (or cached parse map) instead of comparator `Date.parse` calls.
Blue Gate: Refactor helper names/types for maintainability while preserving behavior.
Implementation Guidance: Keep public return shape unchanged (`ZkillKillmail[]`); internal ordering metadata should remain internal.
Test Requirements: Run targeted pure/pipeline tests, then `npm test`, then `npm run build`.
Integration Notes: Works in tandem with Step 5; land as separate, reviewable commit-sized change.
Demo Description: History merge ordering remains identical while avoiding repeated parse work.

Step 7:
Objective: Flatten repeated per-ship loss/item rescans in role and cyno risk evaluation.
Red Gate: Add/update `src/lib/roles.test.ts` and `src/lib/cyno.test.ts` to lock current behavior and expose repeated-scan/dedupe inefficiency boundaries.
Green Gate: Implement per-run evidence indexes and Set-key dedupe in `src/lib/roles.ts` and `src/lib/cyno.ts` with behavior parity.
Blue Gate: Refactor shared evidence-index helpers to avoid duplicate logic.
Implementation Guidance: Build indexes once per pilot-run keyed by ship and module categories; replace `filter(...findIndex...)` dedupe with key-based Set dedupe.
Test Requirements: Run targeted roles/cyno tests, then `npm test`, then `npm run build`.
Integration Notes: No user-visible semantics should change unless explicitly documented.
Demo Description: Role pills and cyno/bait outputs match prior behavior for existing fixtures with lower internal scan amplification.

Step 8:
Objective: Reduce cache budget accounting scan amplification during write bursts.
Red Gate: Add/update cache tests under `src/lib/cache/*` to show repeated full localStorage scans occur per write and to capture desired amortized behavior.
Green Gate: Implement amortized budget accounting strategy in `src/lib/cache/localStore.ts`.
Blue Gate: Refactor eviction/accounting structure and comments for clarity.
Implementation Guidance: Use cached usage estimates with periodic recompute or batched write context; preserve eviction correctness.
Test Requirements: Run targeted cache tests, then `npm test`, then `npm run build`.
Integration Notes: Must preserve local cache safety limits and corruption handling.
Demo Description: Burst cache writes complete with fewer global storage scans while respecting max-size constraints.

Step 9:
Objective: Standardize timeout/retry handling for direct-fetch call sites lacking shared policy.
Red Gate: Add/update tests for affected modules/scripts (`src/lib/dogma/loader.ts`, `scripts/sync-sde.mjs`, `scripts/backtest-zkill.mjs`, `scripts/build-dogma-fit-corpus.mjs`) to capture required timeout/retry behavior.
Green Gate: Apply shared request helper or equivalent retry/timeout wrapper consistently across these call sites.
Blue Gate: Refactor duplicated request setup to keep one clear policy surface.
Implementation Guidance: Preserve existing success/fallback behavior while improving resiliency and consistency.
Test Requirements: Run targeted module/script tests, then `npm test`, then `npm run build`.
Integration Notes: Any behavior changes (for example retry counts) must be explicitly documented.
Demo Description: Direct-fetch paths exhibit uniform timeout/retry behavior and improved failure handling.

Step 10:
Objective: Finalize refactor quality gates, documentation, and release notes.
Red Gate: Add any remaining missing regression tests discovered during integration.
Green Gate: Ensure all targeted tests pass, then full suite and build pass in required order.
Blue Gate: Final cleanup pass (naming/comments/small abstractions) with zero behavior drift.
Implementation Guidance: Verify no orphaned code paths remain; ensure each previous step is fully integrated and demoable.
Test Requirements: Run full validation sequence: targeted tests for touched areas, `npm test`, `npm run build`.
Integration Notes: Update `CHANGELOG.md` with concise user-facing summary derived from version-to-version git history.
Demo Description: Codebase contains a complete, prioritized performance refactor with validated behavior and documented changes.
