# Memories

## Patterns

### mem-1771427419-eb8e
> Dogma tactical destroyer defense assumptions are now family-specific: Gallente applies armor+hull resist profile, Amarr armor only, Caldari shield only, and Minmatar armor+shield; blanket all-family hull bonus was removed to match pyfa parity.
<!-- tags: parity, dogma, testing | created: 2026-02-18 -->

### mem-1771427415-6b1b
> T3 destroyer follow-up closure now uses scripts/tests/dogma-parity-followup-destroyer-coverage.test.mjs for corpus/reference >=10 coverage and src/lib/dogma/parity/followup-destroyer-gate.test.ts for strict <=10% gate pass counts per destroyer hull.
<!-- tags: parity, testing, coverage | created: 2026-02-18 -->

### mem-1771425723-5fb4
> Cruiser follow-up strict regression coverage now lives in src/lib/dogma/parity/followup-cruiser-regressions.test.ts, asserting <=10% surfaced-metric deltas for zkill-legion-133466796, zkill-loki-133468890, zkill-proteus-133467601, zkill-tengu-133463746, and zkill-tengu-133469643.
<!-- tags: parity, testing, coverage | created: 2026-02-18 -->

### mem-1771425723-5e8f
> Dogma defense assembly now evaluates all fitted high-slot modules (not just bastion/command bursts), enabling polarized resistance-killer effects to enforce zero shield/armor/hull resists when present.
<!-- tags: parity, dogma, testing, error-handling | created: 2026-02-18 -->

### mem-1771424566-21a0
> T3 cruiser follow-up coverage is now enforced by scripts/tests/dogma-parity-followup-cruiser-coverage.test.mjs, requiring >=10 Loki/Legion/Proteus/Tengu corpus rows each with matching reference-results entries.
<!-- tags: parity, testing, coverage | created: 2026-02-18 -->

### mem-1771423870-65c4
> Scoped new-fit diagnostics now expose deterministic blocker rollups via blockedFitCount/blockedFitIds/blockedFits in artifacts, and runDogmaParityNewFitsCli treats blocker-only runs as non-zero while printing blocked=<count> in summary output.
<!-- tags: parity, cli, testing, error-handling | created: 2026-02-18 -->

### mem-1771423504-cc34
> Follow-up baseline now emits deterministic prioritizationBacklog via scripts/lib/dogma-parity-followup-baseline/prioritization.mjs, scoring mechanic-family clusters with followup-priority-v1 breakdown fields (errorSeverity, hullGatePressure, mechanicReuse, fitPrevalence) and stable ordering.
<!-- tags: parity, testing, cli | created: 2026-02-18 -->

### mem-1771423121-71ec
> Follow-up gate evaluation now lives in scripts/lib/dogma-parity-followup-baseline/gates.mjs via evaluateDogmaParityFollowupGates, producing deterministic fit pass/fail rows, phased T3 cruiser/destroyer hull deficits, and destroyer blocking when cruiser phase is incomplete; baseline summary now embeds gateEvaluation.
<!-- tags: parity, testing | created: 2026-02-18 -->

### mem-1771422753-ad7d
> Dogma follow-up baseline now has scripts/lib/dogma-parity-followup-baseline/baseline.mjs with deterministic followup-10pct summary generation (per-fit max rel delta, per-hull pass/deficit, top mismatches) and CLI wiring supports --parity-report-path/--summary-path default baseline artifact emission.
<!-- tags: parity, cli, testing | created: 2026-02-18 -->

### mem-1771422341-ea19
> Dogma follow-up baseline orchestration now has dedicated CLI scaffolding at scripts/lib/dogma-parity-followup-baseline/cli.mjs with --precondition-met entry gate enforcement and npm alias dogma:parity:followup:baseline.
<!-- tags: parity, cli, testing | created: 2026-02-18 -->

### mem-1771420738-74f7
> Dogma new-fit scoped compare now continues through per-fit parse/compute exceptions in compareDogmaParityForScope, returning structured failed rows (reason=dogma_compute_failed plus optional stage/stderrTail), and diagnostics artifacts include those compare failures as error events.
<!-- tags: parity, cli, testing, error-handling | created: 2026-02-18 -->

### mem-1771420422-13f5
> Dogma new-fit CLI arg contract now enforces a scope source (either --scope-file or --fit-id/--fit-ids, except --help), and package.json exposes dogma:parity:new-fits -> node scripts/run-dogma-parity-new-fits.mjs with regression tests in scripts/tests/dogma-parity-new-fits.args.test.mjs.
<!-- tags: parity, cli, testing | created: 2026-02-18 -->

### mem-1771420188-1902
> Dogma new-fit artifact emission now lives in scripts/lib/dogma-parity-new-fits/artifacts.mjs via writeDogmaParityNewFitArtifacts, producing deterministic reports/dogma-parity-new-fits-report.json plus optional diagnostics JSONL events and is wired into runDogmaParityNewFitsCli.
<!-- tags: parity, cli, testing, error-handling | created: 2026-02-18 -->

### mem-1771419831-82ef
> Dogma new-fit orchestration CLI now lives in scripts/lib/dogma-parity-new-fits/cli.mjs via runDogmaParityNewFitsCli, composing scope resolution + scoped sync + scoped compare with usage/fatal handling and mismatch-driven exit policy; import-safe entrypoint is scripts/run-dogma-parity-new-fits.mjs.
<!-- tags: parity, cli, testing, error-handling | created: 2026-02-18 -->

### mem-1771419455-43fd
> Scoped pyfa sync for new-fit parity now lives in scripts/lib/dogma-parity-new-fits/sync.mjs via syncDogmaParityReferencesForScope, which dedupes/sorts scoped fitIds, skips already-present refs, continues past missing corpus/pyfa failures, and returns deterministic merged reference fits sorted by fitId.
<!-- tags: parity, cli, testing, error-handling | created: 2026-02-18 -->

### mem-1771419139-0886
> Dogma new-fit scoped parity comparison now lives in scripts/lib/dogma-parity-new-fits/compare.mjs via compareDogmaParityForScope, which dedupes/sorts scoped fitIds, compares only scoped corpus+reference rows, reports missing corpus/reference fitIds explicitly, and preserves sample/ci threshold behavior.
<!-- tags: parity, cli, testing, error-handling | created: 2026-02-18 -->

### mem-1771418860-522f
> Dogma new-fit scope contract helpers now live in scripts/lib/dogma-parity-new-fits/scope.mjs via parseDogmaNewFitScopeIdFlags and resolveDogmaNewFitScope (scope-file + manual flags merged with deterministic dedupe/sort + manual runId hash).
<!-- tags: parity, cli, testing | created: 2026-02-18 -->

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

### mem-1771427140-bedb
> failure: cmd=npx vitest run src/lib/dogma/parity/followup-destroyer-gate.test.ts, exit=1, error=expected red gate; destroyer gate test shows Jackdaw 0 passing with large shield/armor/hull resist deltas, next=align tactical destroyer defense resist profile handling by hull to match pyfa semantics
<!-- tags: testing, error-handling, parity | created: 2026-02-18 -->

### mem-1771426679-52ea
> failure: cmd=npx vitest run scripts/tests/dogma-parity-followup-destroyer-coverage.test.mjs, exit=1, error=expected red gate; new destroyer coverage test fails with Hecate corpus count 2 < 10, next=expand destroyer fit corpus and sync pyfa references for all four T3 destroyer hulls
<!-- tags: testing, error-handling, parity | created: 2026-02-18 -->

### mem-1771426586-15c5
> failure: cmd=node summary probe reading gate.phaseA, exit=1, error=TypeError because gateEvaluation shape changed and phase fields were undefined, next=inspect summary.gateEvaluation keys first before dereferencing nested phase paths
<!-- tags: parity, testing, error-handling | created: 2026-02-18 -->

### mem-1771426524-54b8
> failure: cmd=cat >> scratchpad with unquoted EOF containing backticks, exit=0-with-shell-errors, error=backticks triggered command substitution and polluted scratchpad content, next=always use quoted heredoc (<<'EOF') when appending markdown containing backticks
<!-- tags: tooling, error-handling | created: 2026-02-18 -->

### mem-1771426371-a412
> failure: cmd=npm test && npm run build, exit=1, error=TS2322 in reactive equilibrium helpers because tuple arrays inferred as number[][], next=type cycle arrays explicitly as [number, number, number, number] in calc.ts and calc.test.ts then rerun npm test and build-last order
<!-- tags: testing, error-handling, build, parity | created: 2026-02-18 -->

### mem-1771426221-08af
> failure: cmd=npx vitest run src/lib/dogma/calc.test.ts src/lib/dogma/parity/followup-cruiser-regressions.test.ts, exit=1, error=expected red gate; new residual Legion/Proteus follow-up regression IDs fail on armor therm/exp and reactive-equilibrium unit test fails under weak-type heuristic, next=implement pyfa-style reactive armor equilibrium handling in calc defense path
<!-- tags: testing, error-handling, parity | created: 2026-02-18 -->

### mem-1771426079-1693
> failure: cmd=node - <<NODE with require plus top-level await>>, exit=1, error=ERR_AMBIGUOUS_MODULE_SYNTAX, next=use pure CommonJS or pure ESM syntax in one script when probing JSON data
<!-- tags: tooling, error-handling, parity | created: 2026-02-18 -->

### mem-1771426025-8fe7
> failure: cmd=ls pyfa/eos/effects, exit=2, error=path does not exist because pyfa effects are in single file pyfa/eos/effects.py, next=inspect pyfa/eos/effects.py directly with grep/sed
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771426006-21eb
> failure: cmd=node - <<NODE inspect dogma pack path via data/sde/dogma-pack.<manifest.version>.json>>, exit=1, error=ENOENT because compiled dogma pack is not stored at data/sde, next=resolve pack filename from data/sde/.manifest.json and read from public/data/dogma-pack.<version>.json
<!-- tags: tooling, error-handling, parity | created: 2026-02-18 -->

### mem-1771425937-584b
> failure: cmd=grep -R -n <damage profile patterns> scripts/lib src/lib/dogma/parity scripts/tests, exit=1, error=no matches caused non-zero exit, next=append || true for exploratory grep patterns that may legitimately return zero results
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771425816-cac1
> failure: cmd=node - <<NODE summary gate probe v2>>, exit=1, error=TypeError reading gateEvaluation.phaseA.cruisers because current artifact schema does not expose phaseA at that path, next=inspect gateEvaluation keys first and query actual fields
<!-- tags: parity, testing, error-handling | created: 2026-02-18 -->

### mem-1771425810-50a1
> failure: cmd=node - <<NODE summary gate probe>>, exit=1, error=TypeError reading gate.phaseA because phaseA is nested under summary.gateEvaluation, next=read summary.gateEvaluation.phaseA for cruiser hull gates
<!-- tags: parity, testing, error-handling | created: 2026-02-18 -->

### mem-1771425810-0e58
> failure: cmd=ralph tools memory add <message containing ${...}>, exit=1, error=bash expanded ${...} and reported bad substitution, next=quote memory payload with single quotes or escape dollar braces
<!-- tags: tooling, error-handling | created: 2026-02-18 -->

### mem-1771424965-6ab0
> failure: cmd=node --experimental-strip-types -e 'import calc.ts', exit=1, error=ERR_MODULE_NOT_FOUND for extensionless internal imports (src/lib/dogma/index), next=use vitest probe or compiled JS path for runtime diagnostics
<!-- tags: tooling, error-handling, testing | created: 2026-02-18 -->

### mem-1771424932-5814
> failure: cmd=grep -n 'function evaluateHullWeaponBonuses...' src/lib/dogma/calc.ts, exit=1, error=no exact symbol match, next=use broader grep patterns with '|| true' when function names may differ
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771424897-1354
> failure: cmd=grep -n <fit ids> reports/dogma-parity-reference-trace.jsonl, exit=1, error=no matches caused non-zero exit, next=use 'grep ... || true' for exploratory searches that may legitimately return zero matches
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771424792-294b
> failure: cmd=node -e <dogma pack lookup with m.sdeVersion>, exit=1, error=ENOENT public/data/dogma-pack.undefined.json, next=use data/sde/.manifest.json field version when resolving dogma pack filename
<!-- tags: tooling, error-handling, parity | created: 2026-02-18 -->

### mem-1771424690-bbd2
> failure: cmd=node -e <read followup summary> in parallel with baseline generation, exit=1, error=ENOENT reports/dogma-parity-followup-baseline-summary.json due to race, next=run baseline generation and summary read sequentially for dependent steps
<!-- tags: tooling, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771424562-a5b8
> failure: scoped pyfa reference sync returned pyfa_failed (stage=runtime_error, stderrTail=No module named ...); next=install Debian python deps python3-bs4 python3-logbook python3-sqlalchemy python3-yaml python3-cryptography python3-requests python3-jose python3-requests-cache before running syncDogmaParityReferencesForScope
<!-- tags: parity, pyfa, testing, error-handling | created: 2026-02-18 -->

### mem-1771423755-6a60
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.cli.test.mjs scripts/tests/dogma-parity-new-fits.artifacts.test.mjs, exit=1, error=scoped new-fit CLI exit policy ignores blocker-only runs and report lacks blockedFitCount/blockedFitIds/blockedFits fields (expected red gate), next=add deterministic blocked-fit normalization in artifacts and include blocked count in CLI exit+summary
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771423311-cd0a
> failure: cmd=npx vitest run scripts/tests/dogma-parity-followup-baseline.prioritization.test.mjs scripts/tests/dogma-parity-followup-baseline.artifacts.test.mjs, exit=1, error=missing followup prioritization module and baseline summary lacks prioritizationBacklog output (expected red gate), next=implement prioritization module and wire prioritizationBacklog into baseline summary
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771423001-ec0c
> failure: cmd=npx vitest run scripts/tests/dogma-parity-followup-baseline.gates.test.mjs scripts/tests/dogma-parity-followup-baseline.artifacts.test.mjs, exit=1, error=missing followup gates module and baseline summary lacks gateEvaluation output (expected red gate), next=implement follow-up fit+hull gate evaluator module and wire gateEvaluation into baseline summary
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771422586-0451
> failure: cmd=npx vitest run scripts/tests/dogma-parity-followup-baseline.artifacts.test.mjs scripts/tests/dogma-parity-followup-baseline.cli.test.mjs, exit=1, error=baseline module missing and CLI exits usage error for --parity-report-path/--summary-path, next=implement baseline module and CLI path args/default runner wiring
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771422561-093e
> failure: cmd=npx vitest run scripts/tests/dogma-parity-followup-baseline.artifacts.test.mjs, exit=1, error=missing ../lib/dogma-parity-followup-baseline/baseline.mjs (expected red gate), next=implement baseline artifact module and wire CLI default baseline runner
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771422219-658c
> failure: cmd=npx vitest run scripts/tests/dogma-parity-followup-baseline.cli.test.mjs, exit=1, error=missing ../lib/dogma-parity-followup-baseline/cli.mjs (expected red gate), next=implement follow-up baseline CLI module with entry-gate enforcement and rerun targeted tests
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771420626-1234
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.compare.test.mjs scripts/tests/dogma-parity-new-fits.artifacts.test.mjs, exit=1, error=compare bubbled compute exception and diagnostics missed compare-stage error rows (expected red gate), next=catch per-fit compute errors in scoped compare and include compare failures in diagnostics error normalization
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771420335-bc4f
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.args.test.mjs, exit=1, error=parser allowed empty scope input and package.json lacked dogma:parity:new-fits script (expected red gate), next=enforce scope-source arg requirement except --help and add npm script alias
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771420275-a301
> failure: cmd=grep -n "--scope-file\|--fit-id\|Usage\|new-fit" -n specs/dogma-failing-test-generation/design.md | head -n 80, exit=2, error=grep treated pattern starting with -- as option, next=use grep -n -- '<pattern>' <file> for patterns that start with --
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771420023-0fb4
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.artifacts.test.mjs scripts/tests/dogma-parity-new-fits.cli.test.mjs, exit=1, error=missing ../lib/dogma-parity-new-fits/artifacts.mjs and no writeArtifactsFn invocation in CLI tests (expected red gate), next=implement report/diagnostics artifact writer and wire CLI to call it
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771419664-cd51
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.cli.test.mjs, exit=1, error=missing ../lib/dogma-parity-new-fits/cli.mjs (expected red gate), next=implement new-fit orchestrator CLI module and rerun targeted test
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771419477-5911
> failure: cmd=grep -n "\$\{ts\}" -n .ralph/agent/scratchpad.md, exit=2, error=grep invalid regex for braces, next=use fixed-string search (grep -nF '${ts}') when matching literal template tokens
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771419333-de40
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.sync.test.mjs, exit=1, error=missing ../lib/dogma-parity-new-fits/sync.mjs (expected red gate), next=implement scoped pyfa sync merge helper and rerun targeted test
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771419207-c307
> failure: cmd=rg -n "sync-parity|reference-results|pyfa|fitId" scripts src specs/dogma-failing-test-generation -g '!node_modules', exit=127, error=rg: command not found, next=use grep/find fallback for repo searches
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771419029-0c3b
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.compare.test.mjs, exit=1, error=missing ../lib/dogma-parity-new-fits/compare.mjs (expected red gate), next=implement scoped parity compare helper module and rerun targeted test
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

### mem-1771418955-292b
> failure: cmd=sed -n '1,260p' src/lib/dogma/parity/parity.ts, exit=2, error=No such file or directory, next=use discovered parity.test.ts/compare.ts paths instead of assumed parity.ts
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771418955-6a46
> failure: cmd=sed -n '1,260p' src/lib/dogma/parity/index.ts, exit=2, error=No such file or directory, next=inspect src/lib/dogma/parity file list first and read existing files directly
<!-- tags: tooling, error-handling, search | created: 2026-02-18 -->

### mem-1771418734-79c0
> failure: cmd=npx vitest run scripts/tests/dogma-parity-new-fits.scope.test.mjs, exit=1, error=missing ../lib/dogma-parity-new-fits/scope.mjs (expected red gate), next=implement scope module with deterministic fit-id normalization and scope-file loading
<!-- tags: testing, error-handling, parity, cli | created: 2026-02-18 -->

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

### mem-1771427629-f3e9
> Follow-up baseline final verification confirms gateEvaluation.complete=true with T3 cruiser hulls at 10/10 passing fits each and T3 destroyer hulls at 15/10 each; no remaining follow-up hull deficits.
<!-- tags: parity, testing, release | created: 2026-02-18 -->

### mem-1771420870-071e
> v0.2.9 changelog boundary is now finalized to git history range 96a7691..9a85483 to include all zKill and dogma new-fit workflow commits through partial-failure guardrails.
<!-- tags: changelog, release, parity | created: 2026-02-18 -->

### mem-1771417042-fa55
> v0.2.9 changelog boundary was finalized to git range 96a7691..41d5f0a after final zKill CLI orchestration coverage landed.
<!-- tags: changelog, release, cli | created: 2026-02-18 -->

### mem-1771416444-e8ea
> v0.2.9 changelog boundary now anchored to git history range 96a7691..0dac499 (v0.2.8 marker to zKill CLI integration head) with concise user-facing summaries.
<!-- tags: changelog, release, cli | created: 2026-02-18 -->
