# Ralph Implementation Prompt: Dogma New-Fit Failing Test Generation

## Objective
Implement the design in `specs/dogma-failing-test-generation/` to add a one-command workflow that turns newly appended zKill fits into scoped Dogma parity failures, with deterministic artifacts and non-zero exit on mismatch.

## Spec Reference
- `specs/dogma-failing-test-generation/requirements.md`
- `specs/dogma-failing-test-generation/research/dogma-fit-test-workflow.md`
- `specs/dogma-failing-test-generation/design.md`
- `specs/dogma-failing-test-generation/plan.md`

## Key Requirements
1. Use canonical parity corpus path: `data/parity/fit-corpus.jsonl`.
2. Support deterministic new-fit scope input (`runId`, `generatedAt`, `newFitIds`, `source`) via scope file and/or explicit fit-id flags.
3. Process only newly appended fit IDs for this workflow (no full-corpus compare by default).
4. Generate pyfa baselines for scoped fit IDs and merge deterministically into `data/parity/reference-results.json`.
5. Reuse existing parity compare logic and thresholds.
6. Produce required report: `reports/dogma-parity-new-fits-report.json`.
7. Optionally emit JSONL diagnostics for per-fit processing events.
8. Exit non-zero by default when scoped mismatches exist; continue through per-fit partial failures and report them.
9. Keep existing parity workflows backward-compatible (`dogma:parity:*`).
10. Keep fixture-first strategy; do not generate standalone per-fit `*.test.ts` files.

## Implementation Guidance
- Follow TDD red-green-blue per behavior change.
- Prefer minimal, focused changes and shared helper reuse.
- Add an npm script entry for the new orchestrator command.
- Ensure deterministic ordering for fit ID handling and mismatch output.
- Record structured failures for missing corpus entries, pyfa failures, and parse/compute failures.

## Acceptance Criteria (Given-When-Then)
1. Given valid scoped fit IDs in `fit-corpus.jsonl`, when the workflow runs, then only those fit IDs are compared.
2. Given scoped fit IDs with pyfa success, when sync runs, then `reference-results.json` is merged deterministically by `fitId`.
3. Given scoped fits with references, when parity comparison runs, then `reports/dogma-parity-new-fits-report.json` is written with mismatch details.
4. Given at least one scoped mismatch, when command completes, then exit code is non-zero.
5. Given zero scoped mismatches and no fatal errors, when command completes, then exit code is zero.
6. Given partial per-fit failures, when command completes, then failures are reported and successful fits are still compared.
7. Given same scope and unchanged data, when rerun, then mismatch ordering and report semantics remain stable.
8. Given diagnostics flag enabled, when command runs, then JSONL diagnostic events are emitted.

## Required Verification Sequence
1. Run targeted tests for touched modules.
2. Run full suite: `npm test`.
3. Run final verification last: `npm run build`.
4. Update `CHANGELOG.md` with concise summary derived from git history for current version boundary.

## Deliverable
A merged implementation that fulfills the spec at `specs/dogma-failing-test-generation/` and produces reproducible, scoped parity mismatch artifacts for newly appended fits.
