# Objective
Implement the performance refactor defined in `specs/refactor-codebase-for-performance/` for the Node/TypeScript codebase, prioritizing impact while preserving broad application behavior.

# Scope
- In scope: Node/TypeScript code under `src/`, `scripts/`, `tools/`, `electron/`.
- Out of scope: `pyfa/`, `svcfitstat/`.

# Required References
- `specs/refactor-codebase-for-performance/design.md`
- `specs/refactor-codebase-for-performance/plan.md`
- `specs/refactor-codebase-for-performance/research/04-synthesis-prioritized-findings.md`

# Key Requirements
1. Execute implementation in incremental steps aligned with `plan.md`.
2. Prioritize highest-impact findings first:
   - cache sentinel miss handling in `src/lib/api/esi.ts`
   - bounded concurrency for background refresh in `src/lib/usePilotIntelPipelineEffect.ts`
   - bounded concurrency for CLI ESI hydration in `scripts/lib/zkill-fit-fetch-cli/pipeline.mjs`
   - reduce repeated full-history sorting/parsing in pipeline history paths
3. Cover HTTP inefficiency classes: duplicate requests, N+1, serializable calls, batching/windowing, timeout/retry, over-fetching, connection reuse opportunities.
4. Rank and implement changes by estimated impact (not by category).
5. Behavior should remain functionally equivalent unless a justified API/behavior change is explicitly documented.

# Delivery Constraints
- Follow TDD red-green-blue for each behavior change.
- Each functional fix must include tests; bug fixes need regression tests.
- Validation order per step set:
  1. targeted tests
  2. `npm test`
  3. `npm run build`
- Update `CHANGELOG.md` with concise version-scoped summary from git history.
- Keep changes focused; avoid unrelated refactors.

# Acceptance Criteria (Given-When-Then)
1. Given inventory-type miss cache value `0`, when lookup repeats before TTL, then no duplicate ESI miss request is made.
2. Given multi-pilot background refresh, when sweep runs, then work is bounded-concurrent (not strictly serial) and per-pilot single-flight is preserved.
3. Given simultaneous equivalent zKill list refreshes, when dedupe applies, then only one upstream request executes.
4. Given N fit-fetch candidates requiring ESI hydration, when pipeline runs, then hydration uses bounded concurrency with deterministic outputs.
5. Given incremental history page updates, when rows are merged, then ordering stays correct without repeated full-list parse/sort amplification.
6. Given role/cyno evaluation inputs, when computation runs, then outputs remain behaviorally consistent while reducing repeated rescans.
7. Given cache write bursts, when budget checks run, then localStorage scanning is amortized rather than full-scan per write.
8. Given direct-fetch call sites, when failures/timeouts occur, then timeout/retry handling is consistent with agreed policy.
9. Given completed implementation, when full validation runs, then `npm test` and `npm run build` succeed.

# Expected Output
- Code changes implementing the plan steps.
- Updated/added tests demonstrating red-green-blue completion.
- Updated `CHANGELOG.md`.
- Brief implementation summary mapping completed work to acceptance criteria.
