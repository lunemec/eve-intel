# PROMPT: Ship Combat Capability Accuracy Follow-up

## Objective
Implement the follow-up phase to improve Dogma combat capability parity against pyfa for currently surfaced metrics, prioritizing T3 cruisers first and T3 destroyers second.

## Spec Reference
Use `specs/improve-accuracy-of-ship-combat-capability/` as the source of truth:
- `requirements.md`
- `research/*.md`
- `design.md`
- `plan.md`

## Preconditions
- Start only after the current in-progress Ralph task is completed/merged.

## Key Requirements
1. Scope only currently surfaced metrics (exclude capacitor/application).
2. Fit pass rule: every in-scope surfaced metric must be within 10% of pyfa (exact match preferred).
3. Phase gate A: T3 cruisers (Loki, Legion, Proteus, Tengu) each reach >=10 passing fits.
4. Phase gate B: T3 destroyers (Hecate, Jackdaw, Confessor, Svipul) each reach >=10 passing fits.
5. Reuse existing parity infrastructure (`fit-corpus`, `reference-results`, `golden-fit-ids`, parity scripts/tests).
6. Use deterministic artifacts/reporting for baseline, gating, and prioritization.
7. Use mechanic-cluster prioritization (not isolated fit hacks) where possible.
8. For combat-capability fixes, always add/update parity fit corpus + pyfa reference + parity test before Dogma logic changes.

## Implementation Rules
1. Follow explicit TDD red-green-blue loops for each behavior change.
2. Keep changes focused; avoid unrelated refactors.
3. After targeted tests pass, run `npm test`, then `npm run build` (build last).
4. Update `CHANGELOG.md` with concise user-facing changes based on git history.

## Acceptance Criteria (Given-When-Then)
1. Given the precondition is unmet, when follow-up starts, then execution stops before baseline generation.
2. Given canonical parity inputs exist, when baseline runs, then parity report and follow-up gate summary are generated deterministically.
3. Given a fit has all in-scope metrics within 10%, when gate evaluation runs, then the fit is marked passing.
4. Given any in-scope metric exceeds 10%, when gate evaluation runs, then the fit is marked failing with metric deltas.
5. Given T3 cruiser per-hull pass counts are evaluated, when each cruiser hull has >=10 passing fits, then cruiser phase is complete.
6. Given cruiser phase is incomplete, when destroyer phase completion is evaluated, then destroyer completion is rejected.
7. Given fixed inputs, when prioritization runs repeatedly, then backlog order remains deterministic.
8. Given all specified cruiser and destroyer hulls have >=10 passing fits, when final evaluation runs, then follow-up phase is complete.

## Deliverables
1. Code and tests implementing `plan.md` steps.
2. Updated parity artifacts required by changed behavior.
3. Final report showing per-hull pass counts, deficits, and remaining blockers (if any).
4. Updated `CHANGELOG.md`.
