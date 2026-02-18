# Research Synthesis: Prioritized Findings

## Cross-Cut Priority List
1. Fix inventory-type miss-cache falsey check (`src/lib/api/esi.ts:178`, `src/lib/api/esi.ts:328`).
2. Parallelize/throttle per-pilot background refresh sweep (`src/lib/usePilotIntelPipelineEffect.ts:285`, `src/lib/usePilotIntelPipelineEffect.ts:319`).
3. Replace serial ESI hydration in fit-fetch CLI with bounded concurrency (`scripts/lib/zkill-fit-fetch-cli/pipeline.mjs:64`).
4. Reduce repeated full-history sorting (`src/lib/pipeline/breadthPipeline.ts:625`, `src/lib/pipeline/pure.ts:20`).
5. Add universe-name in-flight dedupe and tune batch strategy (`src/lib/api/esi.ts:144`, no in-flight map for name requests).
6. Remove duplicate fg/bg zKill refreshes when URL/cache-key matches (`src/lib/api/zkill.ts:296`).
7. Add shared timeout/retry discipline to direct-fetch call sites (`src/lib/dogma/loader.ts:26`, `scripts/sync-sde.mjs:31`, `scripts/backtest-zkill.mjs:83`, `scripts/build-dogma-fit-corpus.mjs:102`).
8. Reduce quadratic tendencies in role/cyno analysis and cache budget accounting (`src/lib/roles.ts:182`, `src/lib/cyno.ts:243`, `src/lib/cache/localStore.ts:92`).

## Why This Order
- Items 1-3 are direct request-amplification or serial-latency multipliers.
- Item 4 is the primary CPU-side asymptotic hotspot in core runtime flow.
- Items 5-7 reduce avoidable network load/tail-latency.
- Item 8 is medium impact but worthwhile cleanup for scale safety.

## Expected Outcome if Top 4 Are Addressed
- Fewer duplicate/unnecessary remote calls.
- Lower p95 roster-refresh latency under larger fleets.
- Better resilience under ESI/zKill throttling.
- Lower CPU churn during history accumulation.
