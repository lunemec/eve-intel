# Implementation Plan

## Checklist
- [ ] Step 1: Add CLI contract and argument validation defaults
- [ ] Step 2: Implement deterministic ship-type scoped zKill pagination
- [ ] Step 3: Add header-aware retry/backoff and timeout behavior
- [ ] Step 4: Implement fit normalization for fitted destroyed+dropped items
- [ ] Step 5: Implement deterministic dedupe and ordering
- [ ] Step 6: Implement JSONL output, structured error log, and run manifest
- [ ] Step 7: Add end-to-end integration path and npm script wiring
- [ ] Step 8: Final verification gates and changelog update

Step 1: Add CLI contract and argument validation defaults
- Objective: Establish a stable agent-facing CLI interface with strict input validation and required defaults.
- Implementation Guidance:
  - Define CLI flags (`--ship-type-ids`, `--max-records`, `--before-killmail-id`, output paths, retry/timeouts).
  - Enforce required `--ship-type-ids` and parse as numeric IDs.
  - Default `--max-records` to `200`.
- Test Requirements:
  - Add argument parser tests for required inputs, numeric parsing, invalid values, and default behaviors.
- Success Gates:
  - Red gate: parser/validation tests fail for missing IDs, non-numeric IDs, and wrong default max.
  - Green gate: minimal parser implementation passes all parser tests.
  - Blue gate: refactor parser helpers for readability with tests still green.
- Integration Notes:
  - Keep interface machine-oriented for codex-agent invocation.
- Demo Description:
  - Run CLI help/invalid commands and show clear validation errors and defaulted max.

Step 2: Implement deterministic ship-type scoped zKill pagination
- Objective: Fetch loss candidates by ship type IDs in newest-to-oldest order with optional cursor filtering.
- Implementation Guidance:
  - Implement zKill fetch loop per ship type ID.
  - Apply global stop condition at `maxRecords`.
  - Enforce `killmailId < beforeKillmailId` when cursor is provided.
- Test Requirements:
  - Add mocked fetch tests for pagination, cursor enforcement, and stable ordering.
- Success Gates:
  - Red gate: pagination tests fail (wrong ordering/cursor behavior).
  - Green gate: minimal pagination loop passes ordering and cursor tests.
  - Blue gate: factor shared paging/filter logic while preserving behavior.
- Integration Notes:
  - Preserve deterministic output ordering for repeatable downstream parity runs.
- Demo Description:
  - Run with same inputs twice against fixtures and verify identical candidate order.

Step 3: Add header-aware retry/backoff and timeout behavior
- Objective: Handle zKill/Cloudflare limits robustly using response headers and configurable retry policy.
- Implementation Guidance:
  - Implement retry decision logic using retry headers when present.
  - Add exponential backoff fallback when headers are absent.
  - Respect request timeout and retry cap flags.
- Test Requirements:
  - Add unit tests for header-priority delays, fallback delays, max-attempt exit, and timeout behavior.
- Success Gates:
  - Red gate: retry/backoff tests fail for header precedence and retry cap handling.
  - Green gate: minimal retry engine passes all behavior tests.
  - Blue gate: extract reusable backoff utility with tests still green.
- Integration Notes:
  - Keep retry policy configurable but with safe defaults.
- Demo Description:
  - Simulate rate-limited responses and show controlled retry progression.

Step 4: Implement fit normalization for fitted destroyed+dropped items
- Objective: Build normalized fit payloads suitable for dogma/parity ingestion while preserving raw snapshots.
- Implementation Guidance:
  - Map fitted item flags into normalized slot families.
  - Include both destroyed and dropped fitted modules in normalized slot summaries.
  - Keep full raw zKill/ESI payload under `raw`.
- Test Requirements:
  - Add normalization tests for slot mapping, destroyed+dropped aggregation, subsystem handling, and malformed item paths.
- Success Gates:
  - Red gate: normalization tests fail for mixed dropped/destroyed fitted items and subsystem slot extraction.
  - Green gate: minimal normalizer passes required slot/aggregation tests.
  - Blue gate: clean up mapping tables/helpers without changing outputs.
- Integration Notes:
  - Keep raw payload untouched for forward compatibility with future conditions.
- Demo Description:
  - Process a subsystem-heavy killmail fixture and inspect normalized + raw output fields.

Step 5: Implement deterministic dedupe and ordering
- Objective: Ensure repeated runs are stable and duplicates are filtered by deterministic keys.
- Implementation Guidance:
  - Deduplicate by primary key `killmailId`.
  - Add secondary dedupe by canonical `fitHash`.
  - Keep first deterministic occurrence in sorted stream.
- Test Requirements:
  - Add tests for duplicate killmail entries, equivalent-fit hash collisions, and output order stability.
- Success Gates:
  - Red gate: dedupe tests fail under duplicate inputs.
  - Green gate: dedupe engine passes primary and secondary key tests.
  - Blue gate: isolate canonical hash function and dedupe policy for reuse.
- Integration Notes:
  - Surface `duplicatesSkipped` in manifest.
- Demo Description:
  - Run against fixture set with intentional duplicates and verify stable deduped output.

Step 6: Implement JSONL output, structured error log, and run manifest
- Objective: Emit required machine-consumable artifacts for records, recoverable failures, and continuation paging.
- Implementation Guidance:
  - Write JSONL records to output path.
  - Write structured error JSONL on recoverable per-record failures.
  - Write manifest with input summary, counts, and `nextBeforeKillmailId`.
- Test Requirements:
  - Add tests for schema shape, deterministic ordering, count accuracy, and manifest cursor calculation.
- Success Gates:
  - Red gate: artifact/schema tests fail for missing required fields or wrong counts.
  - Green gate: writer implementations satisfy schema/count tests.
  - Blue gate: refactor artifact serializers while keeping tests green.
- Integration Notes:
  - Treat output/manifest write failures as fatal.
- Demo Description:
  - Execute run and inspect all artifact files for expected fields and counts.

Step 7: Add end-to-end integration path and npm script wiring
- Objective: Make the fetch CLI first-class and usable by downstream agent workflows.
- Implementation Guidance:
  - Add script entry in `package.json` for fetch CLI.
  - Verify integration with canonical parity corpus path expectations.
  - Confirm CLI can be chained by later workflows (e.g., new-fit scoped parity).
- Test Requirements:
  - Add integration test for full mocked run from args -> fetch -> normalize -> dedupe -> artifacts.
- Success Gates:
  - Red gate: full-run integration test fails on current baseline.
  - Green gate: end-to-end pipeline passes for representative fixtures.
  - Blue gate: reduce orchestration duplication and keep integration tests green.
- Integration Notes:
  - Do not introduce pyfa/dogma computations in this CLI scope.
- Demo Description:
  - Run npm script with ship type IDs and confirm JSONL fit payload output only.

Step 8: Final verification gates and changelog update
- Objective: Complete repository-required quality gates and release documentation updates.
- Implementation Guidance:
  - Run targeted tests for touched areas.
  - Run full suite: `npm test`.
  - Run build verification last: `npm run build`.
  - Update `CHANGELOG.md` with concise summary from git history range.
- Test Requirements:
  - Ensure all new/updated behavior is covered by tests and passing.
- Success Gates:
  - Red gate: new behavior tests fail before implementation.
  - Green gate: targeted tests + `npm test` pass.
  - Blue gate: cleanup/refactor complete, `npm run build` passes as final gate, changelog updated.
- Integration Notes:
  - Follow repository validation order with build as the final check.
- Demo Description:
  - Provide verification summary of targeted tests, full tests, build, and changelog entry.
