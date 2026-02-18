# Implementation Plan: Refactor Node.js TypeScript Codebase

Date: 2026-02-18
Status: Draft for review

## Checklist

- [ ] Step 1: Establish strict red gates and baseline verification
- [ ] Step 2: Remove unused imports/types/unused helper generic patterns
- [ ] Step 3: Consolidate duplicate imports from identical modules
- [ ] Step 4: Prune dead export surface (confirmed no external consumers)
- [ ] Step 5: Execute probe duplication candidate (canonicalize CLI + shared logic)
- [ ] Step 6: Execute backtest duplication candidate (canonicalize script + shared logic)
- [ ] Step 7: Remove unused Dogma engine type exports and clean tracked `.pyc` artifacts
- [ ] Step 8: Final hardening, full validation sequence, changelog update, and blocker report

## Step 1: Establish strict red gates and baseline verification

Objective:
Create deterministic failing gates that prove each scoped issue exists before code edits.

Implementation guidance:
Define and add static checks under existing tooling for:
1. strict TypeScript unused locals/parameters,
2. duplicate imports in single files,
3. targeted dead-export usage assertions,
4. tracked `__pycache__`/`*.pyc` detection.

Test requirements:
Red gate:
1. Each check must fail on current baseline for expected targets.
Green gate:
1. Keep checks stable and runnable via project scripts or direct commands.
Blue gate:
1. Normalize test/check naming and output messages for maintainability.

Integration notes:
Integrate checks into repository test conventions (Vitest/static test files) without introducing external dependency drift.

Demo description:
Run the new checks and show expected baseline failures mapped to each backlog item.

## Step 2: Remove unused imports/types/unused helper generic patterns

Objective:
Eliminate confirmed unused symbols while preserving all behavior.

Implementation guidance:
Apply minimal edits in scoped files only:
1. `src/App.paste.integration.test.tsx`,
2. `src/lib/pipeline/breadthPipeline.ts`,
3. `src/lib/pipeline/derivedInference.test.ts`.

Test requirements:
Red gate:
1. Strict unused-symbol check fails for these files before changes.
Green gate:
1. Strict unused-symbol check passes after minimal edits.
2. Targeted tests for affected modules pass.
Blue gate:
1. Minor import/order cleanup in touched files only.

Integration notes:
No API or runtime path changes; this is source hygiene only.

Demo description:
Show strict-unused gate transitioning from fail to pass with unchanged test behavior.

## Step 3: Consolidate duplicate imports from identical modules

Objective:
Improve readability by merging duplicate import declarations with no semantic changes.

Implementation guidance:
Refactor duplicate imports in:
1. `src/lib/usePilotIntelPipelineEffect.ts`,
2. `src/lib/pipeline/executors.ts`,
3. `src/lib/pipeline/derivedInference.ts`,
4. `src/lib/pipeline/inferenceWindow.ts`.

Test requirements:
Red gate:
1. Duplicate-import static check fails for listed files.
Green gate:
1. Duplicate-import check passes after import consolidation.
2. Targeted tests around affected pipeline/hook modules pass.
Blue gate:
1. Keep type imports explicit but co-located with value imports for consistency.

Integration notes:
No changes to function signatures or module exports.

Demo description:
Show before/after import blocks and passing duplicate-import gate.

## Step 4: Prune dead export surface (confirmed no external consumers)

Objective:
Reduce unnecessary public surface by de-exporting/removing unreferenced exports.

Implementation guidance:
Apply minimal de-export/removal for confirmed symbols:
1. `getDogmaVersion` in `src/lib/dogma/loader.ts`,
2. `getAttr` in `src/lib/dogma/index.ts`,
3. `buildPilotSnapshotKey` in `src/lib/pipeline/snapshotCache.ts` (make internal).

Test requirements:
Red gate:
1. Dead-export usage check fails pre-change for targeted symbols.
Green gate:
1. Dead-export usage check passes after de-export/removal.
2. Targeted Dogma/pipeline tests pass.
Blue gate:
1. Clarify internal helper naming only where needed.

Integration notes:
Because user confirmed no external consumers, narrowing exported API is allowed.

Demo description:
Show targeted symbols no longer exported and all related tests still passing.

## Step 5: Execute probe duplication candidate (canonicalize CLI + shared logic)

Objective:
Resolve duplicate probe implementations by establishing one canonical logic path.

Implementation guidance:
Adopt shared implementation ownership in `src/lib/dev/zkillRateLimitProbe.ts` and make CLI script a thin entrypoint wrapper, or equivalent single-source strategy.

Test requirements:
Red gate:
1. Characterization check demonstrates duplicated behavior/path split pre-change.
Green gate:
1. Existing `src/lib/dev/zkillRateLimitProbe.test.ts` remains green against canonical path.
2. CLI behavior contract remains consistent (usage/options/exit code semantics).
Blue gate:
1. Remove redundant code branches and keep CLI entrypoint minimal.

Integration notes:
Preserve current CLI invocation shape to avoid breaking local automation.

Demo description:
Show CLI still works through one shared implementation and tests remain green.

## Step 6: Execute backtest duplication candidate (canonicalize script + shared logic)

Objective:
Unify overlapping backtest logic so script and library do not drift.

Implementation guidance:
Extract/align shared scoring/backtest behavior so `scripts/backtest-zkill.mjs` delegates to canonical library logic in `src/lib/backtest.ts` (or equivalent single-source arrangement).

Test requirements:
Red gate:
1. Characterization check proves script/library behavior overlap and divergence risk pre-change.
Green gate:
1. `src/lib/backtest.test.ts` remains green.
2. Script behavior contract (inputs/outputs/errors) remains compatible.
Blue gate:
1. Remove duplicate algorithm fragments from non-canonical path.

Integration notes:
Keep `npm run backtest:zkill` contract unchanged while reducing maintenance duplication.

Demo description:
Show backtest script output behavior unchanged while implementation source is unified.

## Step 7: Remove unused Dogma engine type exports and clean tracked `.pyc` artifacts

Objective:
Close remaining dead-code/hygiene items in scoped list.

Implementation guidance:
1. Remove/de-export unused type exports in `src/lib/dogma/engine/types.ts` (`EngineContext`, `OffenseStageInput`, `DefenseStageInput`) while preserving `EngineTrace`.
2. Delete tracked `scripts/__pycache__/*.pyc` artifacts.
3. Add precise ignore coverage for scripts cache artifacts in `.gitignore`.

Test requirements:
Red gate:
1. Export-usage and tracked-artifact checks fail pre-change.
Green gate:
1. Export-usage check passes after type export pruning.
2. Artifact hygiene check passes after file deletion/ignore update.
Blue gate:
1. Keep `.gitignore` patterns narrow and readable.

Integration notes:
Type-only export removals should not affect runtime behavior.

Demo description:
Show no tracked `.pyc`/`__pycache__` files and clean dead-type export check.

## Step 8: Final hardening, full validation sequence, changelog update, and blocker report

Objective:
Complete AGENTS-required verification order and produce release-note traceability.

Implementation guidance:
1. For each prior step, confirm red/green/blue outcomes are recorded.
2. Run final targeted validations as needed.
3. Run `npm test`.
4. Run `npm run build` last.
5. Update `CHANGELOG.md` using git history between version boundaries/tags.
6. Document any unresolved candidate as blocker with explicit evidence.

Test requirements:
Red gate:
1. Any missing validation artifact or failed check blocks completion.
Green gate:
1. All required validations pass in required order.
Blue gate:
1. Final documentation polish only (no behavior changes).

Integration notes:
This step is the release-readiness gate for the refactor scope.

Demo description:
Provide final validation report listing every step’s red/green/blue status, plus any deferred blockers.
