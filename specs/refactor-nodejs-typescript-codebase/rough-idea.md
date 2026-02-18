# Rough Idea: Refactor nodejs typescript codebase

1. Scope Confirmation

- Stack confirmed: Node.js + TypeScript (React app + Vitest + Node .mjs scripts).
- Objective confirmed: analysis-only refactor planning for readability improvements and dead code removal, preserving behavior unless tests prove a bug.
- Exclusions honored: no findings from ./pyfa/** and ./svcfitstat/**.

2. High-Confidence Findings

1. Issue: Unused imports in integration test.
   Evidence: src/App.paste.integration.test.tsx:11, src/App.paste.integration.test.tsx:13; strict TS unused check fails on these symbols.
   Risk if unchanged: avoidable noise in test setup and weaker signal for real dead code.
   Confidence: High.
2. Issue: Unused imported type in pipeline module.
   Evidence: src/lib/pipeline/breadthPipeline.ts:7 (ZkillCharacterStats) has no in-file usage; strict TS unused check fails.
   Risk if unchanged: dead dependency clutter in a high-churn file.
   Confidence: High.
3. Issue: Unused generic type parameter / arg in test helper typing.
   Evidence: src/lib/pipeline/derivedInference.test.ts:102 (<T> and key pattern triggers strict TS unused check).
   Risk if unchanged: extra cognitive load and avoidable type noise.
   Confidence: High.
4. Issue: Duplicate imports from the same module reduce readability.
   Evidence: src/lib/usePilotIntelPipelineEffect.ts:1, src/lib/usePilotIntelPipelineEffect.ts:2; src/lib/pipeline/executors.ts:16, src/lib/pipeline/executors.ts:17; src/lib/pipeline/derivedInference.ts:2, src/lib/pipeline/derivedInference.ts:4; src/lib/pipeline/inferenceWindow.ts:1, src/lib/pipeline/inferenceWindow.ts:2.
   Risk if unchanged: fragmented import blocks and harder maintenance when dependencies change.
   Confidence: High.
5. Issue: Exported symbol appears internal-only (buildPilotSnapshotKey).
   Evidence: only found in src/lib/pipeline/snapshotCache.ts:19, src/lib/pipeline/snapshotCache.ts:39, declaration at src/lib/pipeline/snapshotCache.ts:57; no external references.
   Risk if unchanged: unnecessary public surface area and false API expectations.
   Confidence: High.
6. Issue: Unreferenced exported function getDogmaVersion.
   Evidence: declaration only at src/lib/dogma/loader.ts:17 (no other repository references).
   Risk if unchanged: dead API surface and maintenance overhead.
   Confidence: High.
7. Issue: Unreferenced exported function getAttr.
   Evidence: declaration only at src/lib/dogma/index.ts:55 (no other repository references).
   Risk if unchanged: dead utility path that can drift untested.
   Confidence: High.
8. Issue: Tracked Python bytecode artifacts committed in repo.
   Evidence: scripts/__pycache__/pyfa_fitstats.cpython-311.pyc, scripts/__pycache__/pyfa_fitstats.cpython-314.pyc.
   Risk if unchanged: repository noise and accidental binary churn in diffs.
   Confidence: High.

3. Proposed Refactor Backlog

1. Change summary: Remove currently-unused imports/types/params identified by strict TS checks.
   Behavior impact statement: No runtime behavior change expected; test-only/source hygiene.
   Red gate test(s) to add/adjust: Add a strict gate command (or CI step) npx tsc -p tsconfig.json --noEmit --noUnusedLocals --noUnusedParameters; confirm it fails on current code.
   Green gate implementation intent (minimal fix): Remove/rename only the unused symbols in src/App.paste.integration.test.tsx, src/lib/pipeline/breadthPipeline.ts, src/lib/pipeline/derivedInference.test.ts.
   Blue gate cleanup/refactor intent: Normalize import ordering and naming in touched files only.
   Validation commands to run: npx vitest run src/App.paste.integration.test.tsx src/lib/pipeline/breadthPipeline.test.ts src/lib/pipeline/derivedInference.test.ts; npm test; npm run build; update CHANGELOG.md.
   Rollback note: Revert only touched files from this item if any targeted regression appears.
2. Change summary: Consolidate duplicate imports from identical modules.
   Behavior impact statement: No functional change; readability-only.
   Red gate test(s) to add/adjust: Add a static hygiene test (for example scripts/tests/import-hygiene.test.mjs) that fails when a file imports the same module more than once; verify current failure on the four files above.
   Green gate implementation intent (minimal fix): Merge duplicate import declarations into single module import per file.
   Blue gate cleanup/refactor intent: Keep type imports explicit but co-located for readability consistency.
   Validation commands to run: npx vitest run scripts/tests/import-hygiene.test.mjs src/lib/usePilotIntelPipelineEffect.test.tsx src/lib/pipeline/executors.test.ts src/lib/pipeline/derivedInference.test.ts src/lib/pipeline/inferenceWindow.test.ts; npm test; npm run build; update CHANGELOG.md.
   Rollback note: Restore previous import blocks if any tooling/test compatibility issue appears.
3. Change summary: Prune dead export surface in Dogma/pipeline modules.
   Behavior impact statement: Intended to preserve runtime behavior; API surface narrows only for symbols with no in-repo consumers.
   Red gate test(s) to add/adjust: Add an export-usage gate (ts-prune-based or explicit allowlist check) and confirm current failure for getDogmaVersion, getAttr, and internal-only exports.
   Green gate implementation intent (minimal fix): Remove/de-export unreferenced symbols; keep internal helpers private where used.
   Blue gate cleanup/refactor intent: Rename any now-internal helpers for clarity and keep module boundaries explicit.
   Validation commands to run: npx vitest run src/lib/dogma/loader.test.ts src/lib/dogma/calc.test.ts src/lib/useDogmaIndex.test.tsx src/lib/pipeline/breadthPipeline.test.ts; npm test; npm run build; update CHANGELOG.md.
   Rollback note: Re-export removed symbols in a follow-up if any consumer was missed.
4. Change summary: Remove tracked bytecode artifacts and enforce ignore rule.
   Behavior impact statement: No application behavior change.
   Red gate test(s) to add/adjust: Add a repository hygiene check that fails if git ls-files matches __pycache__ or *.pyc; confirm current failure.
   Green gate implementation intent (minimal fix): Delete tracked scripts/__pycache__/*.pyc; add/adjust ignore pattern for scripts/__pycache__/.
   Blue gate cleanup/refactor intent: Keep ignore patterns minimal and precise.
   Validation commands to run: git ls-files | rg '__pycache__|\\.pyc$'; npm test; npm run build; update CHANGELOG.md.
   Rollback note: Restore files only if a proven build/runtime dependency exists (unlikely).

4. Dead Code Candidates Requiring Verification

1. scripts/zkill-rate-limit-probe.mjs vs src/lib/dev/zkillRateLimitProbe.ts appears duplicated.
   Exact verification method before removal: confirm intended canonical entrypoint by checking npm scripts/docs/CI references (rg -n "zkill-rate-limit-probe|runProbe|parseProbeArgs" package.json README.md .github scripts src), then temporarily disable one implementation in a branch and run targeted probe tests plus npm test.
2. src/lib/dev/zkillRateLimitProbe.ts appears test-only in current graph.
   Exact verification method before removal: verify no runtime imports (rg -n "from \".*zkillRateLimitProbe\"|parseProbeArgs|runProbe" src scripts tools), then run src/lib/dev/zkillRateLimitProbe.test.ts against the remaining implementation strategy.
3. src/lib/backtest.ts appears non-runtime (primarily test utility) while script logic exists separately.
   Exact verification method before removal: confirm import graph (rg -n "from \".*backtest\"|tuneScoringWeights" src scripts tools), decide whether script should import shared module, then run src/lib/backtest.test.ts and relevant script tests after trial deprecation.
4. src/lib/dogma/engine/types.ts exports (EngineContext, OffenseStageInput, DefenseStageInput) appear unused.
   Exact verification method before removal: verify zero references with repo-wide grep, then de-export/remove in a branch and run Dogma-targeted test set plus full suite.

5. Execution Plan

1. Freeze scope and create a checklist mapping each backlog item to explicit red/green/blue gates.
2. Implement backlog item 1 red gate (strict unused-symbol check), confirm failure.
3. Apply minimal item 1 fixes, run targeted tests, then npm test, then npm run build.
4. Implement backlog item 2 red gate (duplicate-import static test), confirm failure.
5. Apply minimal item 2 fixes, run targeted tests, then npm test, then npm run build.
6. For backlog item 3, run verification scans first, then red gate for unreferenced exports, then minimal de-export/removal, targeted tests, npm test, npm run build.
7. Implement backlog item 4 hygiene red gate, remove artifacts + ignore update, run hygiene check, then npm test, then npm run build.
8. After each item, perform blue-phase cleanup only in touched files and keep behavior stable.
9. Update CHANGELOG.md using git history between version markers/tags before concluding.
10. Deliver a final validation report with gate outcomes and any deferred candidates from section 4.

6. Risks and Open Questions

1. External consumer risk: unreferenced exports may still be used outside this repo; confirm intended public API boundary before removal.
2. Build risk: npm run build triggers prebuild data prep in this repo; execution may be slower/heavier than typical TS-only builds.
3. Tooling assumption: static gates like ts-prune/custom hygiene tests should be pinned or scripted to avoid CI drift.
4. Candidate ambiguity: duplicate probe/backtest implementations may be intentional for standalone script operation; decision needed on canonical source of truth.
5. Current worktree is already dirty; execution should isolate refactor commits to avoid mixing unrelated changes.
