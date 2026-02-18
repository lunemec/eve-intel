# Objective

Implement the approved refactor in `specs/refactor-nodejs-typescript-codebase/` for readability improvements and dead code removal, while preserving behavior.

# Spec Reference

- Primary spec directory: `specs/refactor-nodejs-typescript-codebase/`
- Read and follow:
  - `design.md`
  - `plan.md`
  - `requirements.md`
  - `research/`

# Key Requirements

1. Behavior must not change.
2. Scope is limited to listed findings/candidates in the spec; do not broaden scope.
3. Exclude `pyfa/**` and `svcfitstat/**` from refactor findings/work.
4. Remove/de-export confirmed dead exports (`getDogmaVersion`, `getAttr`, internal-only `buildPilotSnapshotKey`) per design.
5. Execute dead-code candidate work for:
   - `scripts/zkill-rate-limit-probe.mjs` vs `src/lib/dev/zkillRateLimitProbe.ts`
   - `scripts/backtest-zkill.mjs` vs `src/lib/backtest.ts`
   - `src/lib/dogma/engine/types.ts` unused exports
6. Remove tracked `scripts/__pycache__/*.pyc` artifacts and enforce ignore rule.
7. If any removal cannot be proven safe, keep it and document blocker evidence.

# Process Requirements

1. Follow explicit Red-Green-Blue TDD gates for each plan step.
2. Use minimal changes per step; avoid unrelated refactors.
3. Validation order is mandatory:
   1. Targeted tests/checks for touched area
   2. `npm test`
   3. `npm run build` (last)
4. Update `CHANGELOG.md` from git history between version markers/tags, documenting any boundary assumption.

# Acceptance Criteria (Given-When-Then)

1. Given strict unused-symbol checks are enabled,
   When run before cleanup,
   Then they fail on the listed unused symbols and pass after minimal fixes.

2. Given duplicate-import static checks,
   When run before import consolidation,
   Then they fail on known files and pass after consolidation.

3. Given dead-export checks for confirmed unreferenced symbols,
   When run before de-export,
   Then they fail, and after de-export they pass with no behavior regressions.

4. Given dead-code candidate canonicalization tasks,
   When executed,
   Then one canonical implementation path remains per duplicated capability with existing behavior preserved.

5. Given tracked `__pycache__`/`*.pyc` artifacts,
   When hygiene checks run pre-change,
   Then they fail; after cleanup they pass.

6. Given the completed refactor,
   When full validation runs,
   Then `npm test` passes and `npm run build` passes last.

# Delivery

1. Implement step-by-step from `plan.md` and report Red/Green/Blue outcomes per step.
2. Provide final validation report and explicit blocker list (if any).
3. Do not start unrelated feature work.
