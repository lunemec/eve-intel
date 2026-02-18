# AGENTS.md

This file defines how code should be written in this repository.

## Core Principles
- Use test-driven development (TDD) in an explicit red-green-blue cycle as the default workflow.
- Keep the codebase robust, predictable, and safe under invalid or edge-case inputs.
- Prefer small, focused changes over broad rewrites.

## Test-Driven Development
- Follow the red-green-blue loop for each behavior change:
  - Red: add/adjust a test that fails for the intended reason.
  - Green: implement the smallest change that makes the test pass.
  - Blue: clean up/refactor while keeping tests green and behavior stable.
- Write or update tests before implementing behavior changes whenever practical.
- Every functional change should include a corresponding test when possible.
- Exception: pure style or presentation-only changes (for example CSS-only visual tweaks) do not require new tests.
- Bug fixes must include a regression test that fails before the fix and passes after it.

## Planning and Success Gates
- For every planned change, always define explicit success gates before implementation.
- Each planned change must include red/green/blue gates:
  - Red gate: failing test(s) proving the current gap/bug.
  - Green gate: targeted tests pass after the minimal fix.
  - Blue gate: cleanup/refactor complete with tests still passing.
- Do not consider a planned change complete unless all defined success gates are satisfied.

## Mandatory Change Workflow (All Changes)
Use this workflow for any code change in this repository (feature work, bug fixes, reliability changes, and refactors):

1. Define success gates for each planned change (red gate, green gate, blue gate).
2. Write or update tests first for the intended behavior (red).
3. Confirm the new/updated tests fail for the expected reason (red gate satisfied).
4. Implement the smallest code change needed to pass (green).
5. Run targeted tests for the touched area (green gate satisfied).
6. Run the full test suite: `npm test`.
7. Run full compilation/build as the final verification step: `npm run build`.
8. Perform cleanup/refactor only if needed while preserving passing tests (blue).
9. Update `CHANGELOG.md` with a concise summary of changes for the current version using git history between versions/tags.

Additional enforcement:
- Do not begin large structural refactors without characterization/regression tests in place first.
- Keep behavior stable during refactors unless an intentional behavior change is explicitly documented.
- If a build/type error appears after tests pass, fix it and rerun the validation order with `npm run build` last.

## Changelog Maintenance
- `CHANGELOG.md` must be kept up to date for every version.
- Summaries must be derived from git history between versions (prefer tagged ranges, for example `git log <previous_tag>..<current_tag> --oneline`).
- Entries should be concise, user-facing, and grouped by version.
- If tags are missing for a version boundary, use the closest version marker commit(s) in git history and document the assumption in the changelog entry.

## Robustness Standards
- Validate inputs at boundaries and fail clearly when data is invalid.
- Handle edge cases explicitly (empty values, missing data, unexpected types, out-of-range numbers).
- Avoid hidden side effects; keep functions deterministic where possible.
- Preserve backward-compatible behavior unless a change is intentional and documented.
- Add error handling that is actionable and easy to diagnose.

## Combat Capability Implementation Guidance
- For combat capability details, use `pyfa` and `svcfitstat` as reference implementations.
- Cross-check formulas, assumptions, and behavior against those references before finalizing changes.
- When behavior intentionally differs from references, document the reason in code comments or PR notes.

## Combat Capability Bugfix Workflow
- When fixing any combat capability problem for a fit, always add a new test fit to the parity fit corpus in `data/parity/fit-corpus`.
- Generate a reference result for that fit using the pyfa CLI harness, and store/update the corresponding parity reference data.
- Add or update a parity test that captures the failing behavior and validates the expected reference result.
- Implement the fix in our Dogma implementation only after the failing test and reference result are in place.
- Confirm the new fit-based test passes after the Dogma change.

## Change Quality Checklist
- Tests added/updated for behavior changes.
- Edge cases covered for new logic.
- No unrelated refactors mixed into focused changes.
- Clear naming and readable structure.
- Reference parity with `pyfa`/`svcfitstat` validated for combat calculations.
- For combat capability bugfixes: new fit added to `data/parity/fit-corpus`, pyfa CLI harness reference generated, parity test updated, and Dogma fix implemented.
- `CHANGELOG.md` updated with version-to-version summaries based on git history.
