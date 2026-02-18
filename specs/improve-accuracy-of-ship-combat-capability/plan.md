# Implementation Plan: Ship Combat Capability Accuracy Follow-up

Date: 2026-02-18
Status: Draft for review

## Checklist
- [ ] Step 1: Post-merge baseline + follow-up threshold policy artifact
- [ ] Step 2: Fit-level and hull-level gate evaluator (10% rule + phase sequencing)
- [ ] Step 3: Deterministic prioritization backlog generation
- [ ] Step 4: Scoped parity execution path + diagnostics hardening
- [ ] Step 5: T3 cruiser corpus expansion to 10-pass target per hull
- [ ] Step 6: T3 cruiser mismatch-fix cycles (mechanic-cluster driven)
- [ ] Step 7: T3 destroyer corpus expansion and fix cycles
- [ ] Step 8: Final gate automation, reporting, and release readiness checks

## Step 1: Post-merge baseline + follow-up threshold policy artifact
Objective:
- Establish the post-Ralph baseline run and generate a follow-up rollup that evaluates the explicit 10% per-metric gate for currently surfaced metrics.

Implementation guidance:
- Add a follow-up baseline artifact generator that consumes existing parity report output and emits per-fit max deltas plus per-hull pass counts.
- Version the threshold policy in artifact output (`followup-10pct`) to avoid ambiguity with existing sample/ci threshold sets.
- Keep this step read-only with respect to Dogma combat logic.

Test requirements:
- Red gate: add tests that fail when no follow-up baseline artifact is produced and when threshold policy metadata is missing.
- Green gate: implement minimal artifact generation to satisfy tests.
- Blue gate: refactor for deterministic ordering and stable serialization while keeping tests green.

Integration notes:
- Run targeted tests for follow-up baseline artifact generation.
- Then run `npm test`.
- Then run `npm run build`.

Demo description:
- Show one baseline run producing `reports/dogma-parity-report.json` and a new follow-up baseline summary with per-hull pass/deficit values.

## Step 2: Fit-level and hull-level gate evaluator (10% rule + phase sequencing)
Objective:
- Enforce the follow-up pass semantics and phase ordering: T3 cruisers complete before T3 destroyers can be completed.

Implementation guidance:
- Implement evaluator logic: fit passes only if every in-scope surfaced metric delta is `<=10%`.
- Compute per-hull pass counts and deficits against required minimum of 10.
- Add explicit phase state handling (`t3-cruiser`, `t3-destroyer`) and sequence guard.

Test requirements:
- Red gate: tests fail for boundary cases (just above/below 10%), mixed-metric fit outcomes, and invalid phase progression.
- Green gate: implement minimal evaluator and sequence guard to pass tests.
- Blue gate: remove duplication and normalize shared delta-calculation helpers.

Integration notes:
- Run targeted evaluator and sequence tests.
- Then run `npm test`.
- Then run `npm run build`.

Demo description:
- Show evaluator output for a sample dataset where cruiser gate is unmet and destroyer phase is blocked.

## Step 3: Deterministic prioritization backlog generation
Objective:
- Rank mismatch work by impact so fix cycles target reusable mechanic gaps first.

Implementation guidance:
- Implement scoring model with at least: error severity, hull gate pressure, mechanic reuse, fit prevalence.
- Emit deterministic backlog ordering and score breakdown per item.
- Group by likely mechanic family rather than isolated fit IDs.

Test requirements:
- Red gate: tests fail when ordering is non-deterministic or score breakdown fields are incomplete.
- Green gate: implement minimal scorer and stable sorter to pass tests.
- Blue gate: simplify scoring pipeline and isolate pure functions for easier extension.

Integration notes:
- Run targeted prioritization tests.
- Then run `npm test`.
- Then run `npm run build`.

Demo description:
- Show top prioritized mismatch clusters with score components and affected hull deficits.

## Step 4: Scoped parity execution path + diagnostics hardening
Objective:
- Ensure scoped new-fit parity runs are operational and diagnosable for incremental follow-up cycles.

Implementation guidance:
- Verify the scoped new-fit parity path can compute Dogma actuals end-to-end for scoped fits.
- If runtime binding is still missing, implement the minimal binding required for scoped comparison execution.
- Standardize diagnostics for pyfa failures, missing corpus/reference rows, and dogma compute failures.

Test requirements:
- Red gate: add failing tests for scoped execution with compute path unavailable and for missing diagnostics fields.
- Green gate: implement minimal compute binding/diagnostic propagation to pass tests.
- Blue gate: consolidate error-normalization helpers and de-duplicate report shaping logic.

Integration notes:
- Run targeted tests for `dogma-parity-new-fits` CLI/sync/compare/artifact flows.
- Then run `npm test`.
- Then run `npm run build`.

Demo description:
- Run a scoped parity command showing compared count, mismatches, and structured failure diagnostics.

## Step 5: T3 cruiser corpus expansion to 10-pass target per hull
Objective:
- Grow and curate T3 cruiser fits so each cruiser hull can reach at least 10 passing fits.

Implementation guidance:
- Expand candidate inputs for Loki, Legion, Proteus, Tengu using existing fetch/curation flow.
- Deduplicate via canonical fit identity; avoid counting near-duplicates toward hull targets.
- Generate/update pyfa references for selected cruiser fits.
- Update parity/golden scope as required by enforcement policy.

Test requirements:
- Red gate: add failing parity coverage tests asserting per-hull cruiser minimums are not yet met.
- Green gate: add curated cruiser fits/references until coverage tests pass and parity pass-count increases.
- Blue gate: cleanup fixture metadata/tags for readability and maintenance without altering outcomes.

Integration notes:
- Run targeted parity and corpus/reference consistency checks.
- Then run `npm test`.
- Then run `npm run build`.

Demo description:
- Show cruiser coverage report before/after, with per-hull deficits reduced to zero or remaining explicit counts.

## Step 6: T3 cruiser mismatch-fix cycles (mechanic-cluster driven)
Objective:
- Resolve highest-impact cruiser mismatch clusters while preserving regression safety.

Implementation guidance:
- For each prioritized cruiser cluster, first add regression fit/test/reference artifacts (red) before Dogma logic edits.
- Apply minimal Dogma changes focused on reusable mechanics (subsystem offensive/defensive effect handling).
- Avoid one-off hull hacks unless strictly required and documented.

Test requirements:
- Red gate: new/updated parity tests fail for targeted cruiser mismatch cluster.
- Green gate: minimal logic fix makes targeted tests pass.
- Blue gate: refactor touched code paths for clarity while keeping parity and existing behavior stable.

Integration notes:
- Per cycle: run targeted parity tests, then `npm test`, then `npm run build`.
- Track trend deltas per cycle in follow-up artifacts.

Demo description:
- Show a completed cruiser fix cycle with mismatch count reduction and preserved green full suite/build.

## Step 7: T3 destroyer corpus expansion and fix cycles
Objective:
- Repeat the same controlled process for Hecate, Jackdaw, Confessor, and Svipul until each reaches 10 passing fits.

Implementation guidance:
- Expand destroyer corpus with mode/fit diversity (defensive/sharpshooter/propulsion-relevant combinations where represented).
- Generate references and run scoped/full parity evaluations.
- Execute mechanic-cluster fix cycles with regression-first workflow.

Test requirements:
- Red gate: destroyer per-hull minimum tests fail initially.
- Green gate: curated fits + logic fixes raise each destroyer hull to required passing count.
- Blue gate: streamline shared T3D handling paths and remove temporary scaffolding.

Integration notes:
- Per cycle: targeted tests -> `npm test` -> `npm run build`.

Demo description:
- Show destroyer phase completion report with all four hulls at or above 10 passing fits.

## Step 8: Final gate automation, reporting, and release readiness checks
Objective:
- Finalize completion checks and make follow-up status auditable for future iterations.

Implementation guidance:
- Add/complete a final follow-up gate command/report that summarizes:
- fit-level pass/fail under 10% rule
- per-hull pass counts and deficits
- unresolved pyfa/reference/compute blockers
- Ensure completion criteria are machine-verifiable and fail loudly when unmet.
- Update changelog with concise user-facing summary derived from git history, per repository policy.

Test requirements:
- Red gate: tests fail when final gate report omits required fields or incorrectly passes unmet hull targets.
- Green gate: implement minimal final gate/report logic to pass tests.
- Blue gate: polish naming/output format and remove dead code, preserving stable outputs.

Integration notes:
- Run final targeted gate tests.
- Run `npm test`.
- Run `npm run build` last.

Demo description:
- Show a final report that clearly marks completion or remaining blockers for T3 cruiser/destroyer targets.

## Execution Rules (Apply to Every Step)
1. Follow explicit red -> green -> blue sequence before marking a step complete.
2. For combat capability bug fixes, always add/update fit corpus + pyfa reference + parity test before Dogma behavior changes.
3. Keep each change focused; avoid unrelated refactors.
4. Keep deterministic artifacts and explicit diagnostics for failures.
5. Do not mark checklist items complete until targeted tests, full `npm test`, and `npm run build` pass in order.
