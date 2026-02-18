# Summary

## Artifacts Created
- `specs/dogma-failing-test-generation/rough-idea.md`
  - Continuation objective: use fetched zKill fits to generate deterministic failing Dogma parity tests.

- `specs/dogma-failing-test-generation/requirements.md`
  - Full Q&A log and process decisions.
  - Confirms canonical corpus path, new-fit-only scope, fixture-based failing vector strategy, non-zero-on-mismatch policy, and report path.

- `specs/dogma-failing-test-generation/research/dogma-fit-test-workflow.md`
  - Repository-grounded research of current parity workflow.
  - Includes architecture/component mermaid diagrams.
  - Concludes existing fixture-driven parity pipeline is the correct extension point.

- `specs/dogma-failing-test-generation/design.md`
  - Standalone detailed design covering:
    - overview and consolidated requirements
    - architecture and component interfaces
    - data models
    - error handling
    - Given-When-Then acceptance criteria
    - testing strategy with red/green/blue gates
    - appendices and alternatives considered

- `specs/dogma-failing-test-generation/plan.md`
  - Incremental TDD-first implementation plan.
  - Includes top checklist plus `Step N` entries with objective, implementation guidance, test requirements, integration notes, and demo description.

## Brief Overview
This continuation spec defines a one-command, new-fit-scoped parity workflow that appends real zKill fits to canonical fixtures, generates pyfa references for the new fit IDs, compares Dogma vs pyfa for that scoped set, writes `reports/dogma-parity-new-fits-report.json`, and exits non-zero when mismatches are found.

The design intentionally reuses and preserves the current fixture-first parity architecture (`fit-corpus.jsonl`, `reference-results.json`, `golden-fit-ids.json`) rather than introducing standalone per-fit source test files.

## Suggested Next Steps
1. Run implementation via Ralph using this spec directory.
2. Start with Step 1-2 from `plan.md` (scope contract + scoped comparator) in strict red-green-blue order.
3. Validate against known T3 cruiser cases first, then broaden to additional hull classes.
