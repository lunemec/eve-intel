# Memories

## Patterns

### mem-1771416900-5fd7
> zKill CLI orchestration is now isolated in scripts/lib/zkill-fit-fetch-cli/cli.mjs via runFetchZkillFitsCli with injectable parse/pipeline/log deps, while scripts/fetch-zkill-fits.mjs is import-safe main-wrapper wiring.
<!-- tags: cli, zkill, testing | created: 2026-02-18 -->

### mem-1771416267-8f12
> zKill CLI orchestration now lives in scripts/lib/zkill-fit-fetch-cli/pipeline.mjs via runFetchZkillFitPipeline, composing pagination->ESI hydration->normalization->dedupe->artifact writing with structured skip-and-log errors; npm alias is zkill:fits:fetch.
<!-- tags: cli, zkill, testing, error-handling | created: 2026-02-18 -->

### mem-1771415876-695d
> zKill fit artifact serialization now lives in scripts/lib/zkill-fit-fetch-cli/artifacts.mjs via writeFetchZkillFitArtifacts, which writes deterministic record JSONL, optional structured-error JSONL, and manifest counts/paging (nextBeforeKillmailId from oldest emitted killmail).
<!-- tags: cli, zkill, testing | created: 2026-02-18 -->

### mem-1771415593-05a4
> zKill deterministic dedupe now lives in scripts/lib/zkill-fit-fetch-cli/dedupe.mjs via dedupeFitRecords, which keeps first-seen stream order while skipping duplicates by killmailId and canonical fit hash from computeCanonicalFitHash.
<!-- tags: cli, zkill, testing | created: 2026-02-18 -->

### mem-1771415331-c842
> zKill fit normalization now lives in scripts/lib/zkill-fit-fetch-cli/normalize.mjs via normalizeZkillFittedItems, mapping fitted flags to high/mid/low/rig/subsystem/otherFitted and summing quantity_destroyed+quantity_dropped while skipping malformed/non-fitted rows.
<!-- tags: cli, zkill, testing | created: 2026-02-18 -->

### mem-1771414999-71d4
> zKill fetch retry policy is implemented in scripts/lib/zkill-fit-fetch-cli/retry.mjs via executeWithRetry, using Retry-After/rate-limit reset headers before exponential fallback and per-attempt AbortController timeout wrapping.
<!-- tags: cli, testing, zkill, error-handling | created: 2026-02-18 -->

### mem-1771414765-a8f6
> zKill ship-type candidate paging now lives in scripts/lib/zkill-fit-fetch-cli/pagination.mjs and merges per-ship pages into deterministic newest-to-oldest order with strict beforeKillmailId cutoff and input-order tie-breaks.
<!-- tags: cli, testing, zkill | created: 2026-02-18 -->

### mem-1771414482-1135
> zKill fit fetch CLI arg parser lives at scripts/lib/zkill-fit-fetch-cli/args.mjs with default maxRecords=200 and usage-error class for deterministic automation-friendly validation
<!-- tags: cli, testing, zkill | created: 2026-02-18 -->

## Decisions

## Fixes

### mem-1771416806-f3bf
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.cli.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/cli.mjs (expected red gate), next=implement dedicated CLI orchestration module and wire import-safe script entrypoint
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771416673-f4c8
> failure: cmd=cat .ralph/agent/scratchpad.md, exit=1, error=No such file or directory, next=create .ralph/agent/scratchpad.md before reading
<!-- tags: tooling, error-handling | created: 2026-02-18 -->

### mem-1771416282-4a08
> failure: cmd=cat >> .ralph/agent/scratchpad.md <<EOF ... (with backticks), exit=127, error=backticks in unquoted heredoc triggered shell command substitution, next=use quoted heredoc (<<'EOF') or avoid backticks when appending scratchpad
<!-- tags: tooling, error-handling | created: 2026-02-18 -->

### mem-1771416066-f56d
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.integration.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/pipeline.mjs (expected red gate), next=implement pipeline orchestration module and wire CLI+npm script
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771415752-335b
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.artifacts.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/artifacts.mjs (expected red gate), next=implement artifact writer module for records/errors/manifest output
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771415462-10e8
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.dedupe.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/dedupe.mjs (expected red gate), next=implement dedupe module with canonical fit hash + keep-first policy
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771415186-2b5d
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.normalize.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/normalize.mjs (expected red gate), next=implement normalization module for fitted destroyed+dropped slot mapping
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771415097-7345
> failure: cmd=grep -R -n "quantity_destroyed\|quantity_dropped\|ship_type_id\|victim" scripts/tests src/lib -S, exit=2, error=grep invalid option -S, next=use grep -R -n without -S or use find+xargs
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771414901-bd91
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.retry.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/retry.mjs (expected red gate), next=implement retry module with header-aware delay + timeout-aware retry loop
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771414625-42b3
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.pagination.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/pagination.mjs (expected red gate), next=implement pagination module for ship-type ordered cursor-aware candidate collection
<!-- tags: testing, error-handling, cli, zkill | created: 2026-02-18 -->

### mem-1771414463-7d09
> failure: cmd=git commit -m "feat(cli): scaffold zkill fit fetch arg contract", exit=128, error=Author identity unknown, next=set local git user.name and user.email before committing
<!-- tags: git, error-handling, tooling | created: 2026-02-18 -->

### mem-1771414342-64b9
> failure: cmd=npx vitest run scripts/tests/fetch-zkill-fits.args.test.mjs, exit=1, error=missing ../lib/zkill-fit-fetch-cli/args.mjs (expected red gate), next=implement args parser module
<!-- tags: testing, error-handling, cli | created: 2026-02-18 -->

### mem-1771414240-4e5e
> failure: cmd=rg -n "zkill|killmail|fit fetch|fetch-zkill" scripts src test tests specs -S, exit=127, error=rg: command not found, next=use grep/find fallback for searches
<!-- tags: tooling, error-handling | created: 2026-02-18 -->

### mem-1771414221-7a84
> failure: cmd=cat .ralph/agent/scratchpad.md, exit=1, error=No such file or directory, next=create scratchpad file before reads
<!-- tags: tooling, error-handling | created: 2026-02-18 -->

## Context

### mem-1771417042-fa55
> v0.2.9 changelog boundary was finalized to git range 96a7691..41d5f0a after final zKill CLI orchestration coverage landed.
<!-- tags: changelog, release, cli | created: 2026-02-18 -->

### mem-1771416444-e8ea
> v0.2.9 changelog boundary now anchored to git history range 96a7691..0dac499 (v0.2.8 marker to zKill CLI integration head) with concise user-facing summaries.
<!-- tags: changelog, release, cli | created: 2026-02-18 -->
