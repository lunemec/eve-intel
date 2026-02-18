# Ralph Implementation Prompt: zKill Fit Fetch CLI

## Objective
Implement the spec in `specs/zkill-fit-fetch-cli/` to deliver an agent-friendly CLI that fetches real zKill fits by ship type IDs and outputs deterministic JSONL fit payload records (normalized + raw snapshots), with robust retry/backoff and partial-failure continuation.

## Spec Reference
- `specs/zkill-fit-fetch-cli/requirements.md`
- `specs/zkill-fit-fetch-cli/design.md`
- `specs/zkill-fit-fetch-cli/plan.md`

## Key Requirements
1. Fetch by numeric ship type filters (`type_id`), supporting multiple IDs per run.
2. Output fit payload only (no pyfa/dogma/diff in this CLI).
3. Write JSONL output records.
4. Default `--max-records` to `200`.
5. Support deterministic newest-to-oldest ordering and optional `--before-killmail-id` cursor.
6. Deduplicate deterministically by `killmailId` and canonical `fitHash`.
7. Include normalized fit object and full raw zKill/ESI snapshots per record.
8. In normalized fit, include both dropped and destroyed fitted items as equipped modules.
9. Preserve destruction/drop state in raw payload.
10. Handle partial failures with skip-and-log continuation.
11. Implement rate-limit handling with retry/backoff using HTTP headers first (Cloudflare/zKill behavior), fallback backoff otherwise.
12. Emit structured errors and run manifest (counts + next cursor) for automation.

## Implementation Guidance
- Follow TDD red-green-blue for each behavior change.
- Keep changes focused and deterministic.
- Implement as Node ESM CLI script under `scripts/` and wire an npm script.
- Reuse existing repo conventions for parity-related fit identifiers and JSONL handling.

## Acceptance Criteria (Given-When-Then)
1. Given valid `--ship-type-ids`, when run, then CLI writes JSONL fit payload records for those ship filters.
2. Given no `--max-records`, when run, then output is limited to 200 records.
3. Given duplicate killmail/fit inputs, when processed, then output is deduplicated deterministically.
4. Given dropped+destroyed fitted items, when normalized, then both are represented in fitted slot summaries.
5. Given raw upstream payloads, when record is written, then full raw snapshots are preserved.
6. Given recoverable fetch/normalize failures, when run completes, then valid records are still emitted and structured errors logged.
7. Given rate-limit responses with headers, when retrying, then backoff follows header guidance before fallback strategy.
8. Given `--before-killmail-id`, when run, then all emitted `killmailId` values are less than the cursor.
9. Given deterministic inputs and unchanged upstream responses, when rerun, then output ordering is stable.
10. Given run completion, when manifest enabled, then manifest includes counts and `nextBeforeKillmailId`.

## Required Verification Sequence
1. Run targeted tests for touched modules/scripts.
2. Run full suite: `npm test`.
3. Run final verification last: `npm run build`.
4. Update `CHANGELOG.md` with concise summary derived from version-boundary git history.

## Deliverable
A merged implementation of the zKill fit fetch CLI as specified in `specs/zkill-fit-fetch-cli/`, ready to feed downstream parity/Dogma workflows.
