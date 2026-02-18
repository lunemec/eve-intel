# Summary

## Artifacts Created
- `specs/zkill-fit-fetch-cli/rough-idea.md`
  - Original problem statement: fetch real zKill fits for parity diagnostics.

- `specs/zkill-fit-fetch-cli/requirements.md`
  - Full Q&A log and process decisions.
  - Captures key decisions: ship-type-ID filters, JSONL output, dedupe, default max=200, raw+normalized payload retention, partial-failure continuation, header-aware backoff, deterministic paging cursor.

- `specs/zkill-fit-fetch-cli/design.md`
  - Standalone design with:
    - architecture and component contracts
    - normalized record/error/manifest schemas
    - rate-limit/backoff strategy
    - deterministic ordering and dedupe policy
    - Given-When-Then acceptance criteria
    - testing strategy with red/green/blue gates

- `specs/zkill-fit-fetch-cli/plan.md`
  - Incremental TDD-first implementation plan.
  - Includes top checklist and `Step N` details with objective, implementation guidance, tests, success gates, integration notes, and demo expectations.

## Brief Overview
This spec defines an agent-oriented zKill fetch CLI that retrieves losses by numeric ship type filters, normalizes fitted modules into deterministic fit payload records, preserves complete raw snapshots for future rule expansion, and emits JSONL + structured diagnostics with robust rate-limit-aware retry behavior.

The output is intentionally scoped to fit payload generation only, so it can be used as the upstream input for later pyfa/Dogma parity workflows.

## Suggested Next Steps
1. Implement `plan.md` Step 1-3 first (CLI contract, deterministic pagination, backoff engine).
2. Add normalization + dedupe + artifact writers (Step 4-6) with regression fixtures for T3/subsystem-heavy kills.
3. Validate full repository gates in order (`npm test`, then `npm run build`) and update changelog.
