# Dogma Parity Harness

This repository includes a pyfa-first parity harness for dogma combat metrics.

## Deterministic Inputs

- Active SDE manifest: `public/data/dogma-manifest.json`
- Fit corpus: `data/parity/fit-corpus.jsonl`
- Golden fit IDs: `data/parity/golden-fit-ids.json`
- Reference metrics: `data/parity/reference-results.json`

## Commands

- `npm run dogma:parity:sample`
  - Runs parity test suite with phase-1 thresholds.
  - Writes machine-readable report: `reports/dogma-parity-report.json`.
- `npm run dogma:parity:ci`
  - Runs parity test suite with CI thresholds.
  - Writes machine-readable report: `reports/dogma-parity-report.json`.
- `npm run dogma:parity:refs`
  - Attempts to populate missing golden references in `data/parity/reference-results.json` via the pyfa Docker adapter.
  - Writes sync report: `reports/dogma-parity-reference-sync.json`.
- `npm run dogma:parity:export`
  - Exports missing golden fits as normalized EFT payloads to `data/parity/pyfa-inputs.json` for out-of-band pyfa processing.
- `npm run dogma:parity:import -- [path-to-pyfa-results.json]`
  - Imports externally-produced pyfa results into `data/parity/reference-results.json`.
- `npm run dogma:fixtures:zkill -- <characterIdsCsv> [lookbackDays]`
  - Appends deduplicated zKill-derived pseudo-EFT fits to `data/parity/fit-corpus.jsonl`.

## Comparator Runtime

- Dockerized pyfa adapter path: `tools/parity/pyfa-adapter/`
- Pinned default image is defined in `tools/parity/pyfa-adapter/run-pyfa-docker.mjs` via `DEFAULT_PYFA_IMAGE`.
- Override runtime image via `PYFA_DOCKER_IMAGE`.

## Thresholds

- Phase-1 thresholds:
  - DPS/alpha: `max(8%, 25 abs)`
  - EHP: `max(10%, 500 abs)`
  - Resist channels: `0.05 abs`
- CI thresholds:
  - DPS/alpha: `max(5%, 15 abs)`
  - EHP: `max(7%, 350 abs)`
  - Resist channels: `0.03 abs`
