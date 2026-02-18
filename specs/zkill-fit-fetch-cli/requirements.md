# Requirements Q&A Log

## Process Decisions
- 2026-02-18: Project structure created at `specs/zkill-fit-fetch-cli/` and approved by user.

## Requirements Clarification

### Q1
Question: For the first usable version of the CLI, what exact output do you want it to produce per fetched zKill fit (for example: normalized fit payload only, plus pyfa baseline stats, plus our dogma stats, plus diff report)?
Answer: fit payload only

### Q2
Question: How should the CLI choose which zKill fits to fetch in v1 (for example: explicit kill IDs, ship-type filters like T3 cruisers, or time-window + limit)?
Answer: ship-type filters

### Q3
Question: What should the ship-type filter input look like in v1 (for example: exact type names, group/class aliases like `t3c`, or numeric type IDs), and should multiple ship types be allowed in one run?
Answer: It should be used by another codex agent, whichever would be best for that

### Q4
Question: For agent-friendly input, should v1 accept ship filters as numeric EVE type IDs (recommended) rather than names/aliases?
Answer: yes

### Q5
Question: What output format should v1 write for downstream agents: newline-delimited JSON (JSONL) file, single JSON array file, or stdout only?
Answer: JSONL file

### Q6
Question: Should v1 enforce deduplication of fits (for example by killmail ID and/or canonicalized fit hash), and what default maximum records per run do you want?
Answer: yes deduplicate

### Q7
Question: What should the default maximum number of records fetched per run be?
Answer: requested recommended default

### Q8
Question: Recommended default is 200 records per run (large enough for useful coverage, small enough for fast iterative parity checks). Do you want to set the default max to 200?
Answer: yes

### Q9
Question: Which fields are mandatory in each JSONL record for v1 (for example: killmail_id, kill_time, ship_type_id, fit modules/charges/rigs, victim character/corp/alliance IDs, and zKill URL)?
Answer: Propose schema for dogma check to work; prefer saving all available data for future dogma conditions

### Q10
Question: Should each JSONL line include both (a) a normalized `fit` object for immediate dogma parity checks and (b) the full raw zKill/ESI payload snapshot for forward compatibility?
Answer: yes

### Q11
Question: How should v1 handle partial failures (rate limits, missing ESI killmail details, malformed fit data): skip-and-log errors while continuing, or fail-fast?
Answer: Skip bad records, log structured errors, continue

### Q12
Question: Should v1 include built-in rate-limit handling with retries/backoff, with defaults configurable via CLI flags?
Answer: yes; zKill uses Cloudflare limits and HTTP headers should drive backoff

### Q13
Question: In normalized `fit`, should slot-fitted items treat both destroyed and dropped killmail entries as equipped modules (aggregated by slot/type), while preserving original destruction state only in the raw payload?
Answer: yes, keep both destroyed and dropped items that were fitted

### Q14
Question: For deterministic agent runs, should fetch order be newest-to-oldest with optional `--before-killmail-id` cursor so repeated runs can page predictably?
Answer: yes

### Q15
Question: Is requirements clarification complete for now, or do you want to continue refining requirements?
Answer: Requirements clarification complete; next requested spec is continuation to use this CLI for generating failing dogma tests
- 2026-02-18: User requested completion of zKill fetch CLI planning/design before continuation implementation.
- 2026-02-18: Design document created for zKill fetch CLI.
- 2026-02-18: zKill fetch CLI design approved by user; implementation planning started.
- 2026-02-18: zKill fetch CLI implementation plan approved by user.
- 2026-02-18: Summary artifact generated.
