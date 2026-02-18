# Research: Scope and Runtime Flows

## Scope
- Included: Node/TypeScript code under `src/`, `scripts/`, `tools/`, `electron/`.
- Excluded: `pyfa/`, `svcfitstat/`.
- Focus areas:
  - Big O-driven complexity risks.
  - HTTP inefficiencies: duplicate requests, N+1, serializable request chains, missing batching, timeout/retry gaps, over-fetching, connection reuse controls.

## Method
- Static code inspection (no implementation changes, no benchmark/script execution).
- Prioritized runtime paths first: `src/lib/api/*`, `src/lib/pipeline/*`, `src/lib/intel/*`, `src/lib/cyno.ts`, `src/lib/roles.ts`, plus CLI/network scripts.
- Ranked impact by: likely call frequency x asymptotic growth x remote-call latency exposure.

## Architecture Overview
```mermaid
flowchart TD
  UI[React App UI] --> PIPE[Pipeline Orchestration]
  PIPE --> ESI[ESI API]
  PIPE --> ZK[zKill API]
  PIPE --> CACHE[Local/Indexed Cache]
  PIPE --> DOGMA[Dogma Data + Inference]
  DOGMA --> CARD[Pilot Cards]
  CACHE --> PIPE
```

## HTTP Data Flow (Primary Runtime)
```mermaid
sequenceDiagram
  participant U as UI Effect
  participant P as runPilotPipeline / breadthPipeline
  participant E as ESI
  participant Z as zKill
  participant C as Cache

  U->>P: Start run for pilot roster
  P->>E: resolveCharacterIds(names)
  P->>E: fetchCharacterPublic(characterId)
  P->>Z: fetchLatestKillsPage / fetchLatestLossesPage
  Z-->>P: zKill list payloads
  P->>E: optional killmail hydration (ESI /killmails)
  P->>E: resolveUniverseNames(ids)
  P->>C: write/read cache envelopes
  P-->>U: stage updates + final cards
```

## Component Relationship (Hot Paths)
```mermaid
graph LR
  A[src/lib/usePilotIntelPipelineEffect.ts] --> B[src/lib/pipeline/runPipeline.ts]
  B --> C[src/lib/pipeline/breadthPipeline.ts]
  C --> D[src/lib/api/esi.ts]
  C --> E[src/lib/api/zkill.ts]
  C --> F[src/lib/pipeline/executors.ts]
  F --> G[src/lib/intel/*]
  F --> H[src/lib/cyno.ts]
  F --> I[src/lib/roles.ts]
```

## HTTP Call-Site Inventory (key)
- Shared HTTP client with retry/timeout:
  - `src/lib/api/http.ts`
  - Used by `src/lib/api/esi.ts`, `src/lib/api/zkill.ts`.
- Direct `fetch` without shared retry wrapper (selected):
  - `src/lib/dogma/loader.ts`
  - `scripts/sync-sde.mjs`
  - `scripts/backtest-zkill.mjs`
  - `scripts/build-dogma-fit-corpus.mjs`
- Dedicated retry wrapper exists in CLI path:
  - `scripts/lib/zkill-fit-fetch-cli/retry.mjs`
  - `scripts/lib/zkill-fit-fetch-cli/pipeline.mjs`
