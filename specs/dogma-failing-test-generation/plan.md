# Implementation Plan

## Checklist
- [ ] Step 1: Define and persist deterministic new-fit scope contract
- [ ] Step 2: Add scoped parity comparison core (new-fit-only)
- [ ] Step 3: Add scoped pyfa reference sync and deterministic merge
- [ ] Step 4: Build one-command new-fit parity orchestrator with exit policy
- [ ] Step 5: Emit required scoped report and optional diagnostics JSONL
- [ ] Step 6: Integrate with canonical parity workflow and npm scripts
- [ ] Step 7: Harden edge cases and operational guardrails
- [ ] Step 8: Final validation, build verification, and changelog update

Step 1: Define and persist deterministic new-fit scope contract
- Objective: Create a stable machine-readable contract for "fits appended in this run" so downstream parity steps consume the same deterministic fitId set.
- Implementation Guidance:
  - Define scope payload shape (`runId`, `generatedAt`, `newFitIds`, `source`) as designed.
  - Extend/compose fetch flow to write scope artifact (or provide equivalent explicit `--fit-ids` fallback).
  - Enforce dedupe + stable ordering for `newFitIds`.
- Test Requirements:
  - Red gate: add tests that fail when fitId order is unstable, duplicates are retained, or empty-input handling is incorrect.
  - Green gate: implement minimal scope writer/loader to pass those tests.
  - Blue gate: refactor shared scope parsing/validation helpers; keep tests green.
- Integration Notes:
  - Use `data/parity/fit-corpus.jsonl` IDs as source of truth for fit identity.
  - Keep contract compatible with agent-to-agent invocation patterns.
- Demo Description:
  - Run fetch/scope command and show deterministic scope file with expected `newFitIds`.

Step 2: Add scoped parity comparison core (new-fit-only)
- Objective: Introduce reusable comparison logic that evaluates only `newFitIds`, never full-corpus by default.
- Implementation Guidance:
  - Extract comparison path from current parity flow into reusable scoped function/module.
  - Resolve corpus + references by `fitId`; skip non-scoped entries.
  - Preserve existing threshold behavior.
- Test Requirements:
  - Red gate: add failing tests proving non-scoped fits are excluded and missing-reference behavior is explicit.
  - Green gate: implement minimal scoped comparator until tests pass.
  - Blue gate: remove duplication with existing parity test logic while preserving outputs.
- Integration Notes:
  - Keep compatibility with `src/lib/dogma/parity/compare.ts` and existing types.
- Demo Description:
  - Execute scoped comparator on a mixed dataset and show only scoped fitIds are compared.

Step 3: Add scoped pyfa reference sync and deterministic merge
- Objective: Generate pyfa baselines for scoped fitIds and merge into `data/parity/reference-results.json` deterministically.
- Implementation Guidance:
  - Reuse existing pyfa local runner adapter and normalization flow.
  - Add scoped sync path that processes only `newFitIds`.
  - Merge by `fitId`; stable sort final reference array.
- Test Requirements:
  - Red gate: add failing tests for merge ordering, partial pyfa failures, and skip/continue behavior.
  - Green gate: implement minimal scoped sync to satisfy tests.
  - Blue gate: refactor shared sync helpers between full and scoped workflows.
- Integration Notes:
  - Avoid regressions to existing full sync script behavior.
- Demo Description:
  - Run scoped sync with a small fit set and show deterministic reference merge result.

Step 4: Build one-command new-fit parity orchestrator with exit policy
- Objective: Deliver a single command that runs scoped reference sync + scoped parity compare and returns policy-driven exit code.
- Implementation Guidance:
  - Add orchestration script (new command entry) that:
    - loads scope (scope file or explicit fitIds)
    - performs scoped reference sync
    - performs scoped comparison
    - computes exit status
  - Default policy: exit non-zero if any scoped mismatch exists.
- Test Requirements:
  - Red gate: add failing tests for exit code on mismatch/non-mismatch and fatal orchestration error paths.
  - Green gate: implement minimal orchestration until tests pass.
  - Blue gate: simplify control flow and isolate pure exit-policy function.
- Integration Notes:
  - Maintain compatibility with current parity scripts and local/CI usage.
- Demo Description:
  - Run command with intentional mismatch and show non-zero exit.

Step 5: Emit required scoped report and optional diagnostics JSONL
- Objective: Produce machine-consumable artifacts for downstream agent workflows and debugging.
- Implementation Guidance:
  - Write required report to `reports/dogma-parity-new-fits-report.json` with designed schema.
  - Add optional diagnostics JSONL event stream behind a flag.
  - Ensure deterministic mismatch ordering in artifacts.
- Test Requirements:
  - Red gate: add failing tests validating report schema fields and deterministic ordering.
  - Green gate: implement minimal report/diagnostics writers to pass tests.
  - Blue gate: refactor event/report serialization helpers; keep tests green.
- Integration Notes:
  - Report must include pyfa failures, missing IDs, mismatch details, and `exitCode`.
- Demo Description:
  - Run command and inspect generated report + diagnostics entries.

Step 6: Integrate with canonical parity workflow and npm scripts
- Objective: Make the new workflow first-class for repeatable local and CI-like use.
- Implementation Guidance:
  - Add npm script entry for the new orchestrator.
  - Ensure script argument ergonomics for agent invocation (`--scope-file`, `--fit-ids`, diagnostics flag).
  - Keep existing `dogma:parity:*` commands unchanged.
- Test Requirements:
  - Red gate: add failing invocation/argument contract tests (including invalid combinations).
  - Green gate: implement command parsing and defaults until tests pass.
  - Blue gate: centralize arg validation and usage/help text.
- Integration Notes:
  - Preserve backward-compatible behavior for current parity workflows.
- Demo Description:
  - Execute new npm script using scope file generated from fetch run.

Step 7: Harden edge cases and operational guardrails
- Objective: Ensure resilient behavior under partial failures and invalid inputs.
- Implementation Guidance:
  - Handle empty scope, missing corpus fitIds, missing references, pyfa timeouts, and parse failures with structured output.
  - Continue processing valid fits while recording failures.
  - Keep fatal only for true orchestration/report-write failures.
- Test Requirements:
  - Red gate: add failing edge-case tests for each guardrail path.
  - Green gate: implement minimal error handling to pass tests.
  - Blue gate: normalize error taxonomy and shared diagnostics formatting.
- Integration Notes:
  - Guardrails must align with skip-and-log continuation policy.
- Demo Description:
  - Run with mixed valid/invalid scoped fits and show partial success plus structured failures.

Step 8: Final validation, build verification, and changelog update
- Objective: Complete repository-required verification and release hygiene.
- Implementation Guidance:
  - Run targeted tests for touched areas after each step.
  - Run full suite: `npm test`.
  - Run final build verification last: `npm run build`.
  - Update `CHANGELOG.md` with concise user-facing summary derived from git history range for current version boundary.
- Test Requirements:
  - Red gate: ensure newly added/updated tests fail before implementation where behavior changed.
  - Green gate: all targeted + full tests pass.
  - Blue gate: cleanup/refactor complete with test suite still green.
- Integration Notes:
  - Build step remains final verification gate.
- Demo Description:
  - Provide command outputs summary: targeted tests, full tests, build success, and changelog entry.
