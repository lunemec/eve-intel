# Workflow And TDD

This document defines the default development workflow for all code changes in this repository.

## Core Principles
- Use test-driven development (TDD) in an explicit red/green/blue cycle as the default workflow.
- Keep the codebase robust, predictable, and safe under invalid or edge-case inputs.
- Prefer small, focused changes over broad rewrites.

## Test-Driven Development
- Follow the red/green/blue loop for each behavior change:
  - Red: add or adjust a test that fails for the intended reason.
  - Green: implement the smallest change that makes the test pass.
  - Blue: clean up or refactor while keeping tests green and behavior stable.
- Write or update tests before implementing behavior changes whenever practical.
- Every functional change should include a corresponding test when possible.
- Exception: pure style or presentation-only changes (for example CSS-only visual tweaks) do not require new tests.
- Bug fixes must include a regression test that fails before the fix and passes after it.

## Planning And Success Gates
- For every planned change, define explicit success gates before implementation.
- Each planned change must include red/green/blue gates:
  - Red gate: failing test(s) proving the current gap or bug.
  - Green gate: targeted tests pass after the minimal fix.
  - Blue gate: cleanup or refactor complete with tests still passing.
- Do not consider a planned change complete unless all defined success gates are satisfied.

## Mandatory Change Workflow (All Changes)
Use this workflow for feature work, bug fixes, reliability changes, and refactors:

1. Define success gates for each planned change (red gate, green gate, blue gate).
2. Write or update tests first for the intended behavior (red).
3. Confirm the new or updated tests fail for the expected reason (red gate satisfied).
4. Implement the smallest code change needed to pass (green).
5. Run targeted tests for the touched area (green gate satisfied).
6. Run the full test suite: `npm test`.
7. Run full compilation and build as the final verification step: `npm run build`.
8. Perform cleanup or refactor only if needed while preserving passing tests (blue).
9. Update `CHANGELOG.md` with a concise summary of changes for the current version using git history between versions or tags.

Additional enforcement:
- Do not begin large structural refactors without characterization or regression tests in place first.
- Keep behavior stable during refactors unless an intentional behavior change is explicitly documented.
- If a build or type error appears after tests pass, fix it and rerun the validation order with `npm run build` last.
