# Quality, Changelog, And Robustness

This document defines repository expectations for changelog maintenance, robustness, and change quality.

## Changelog Maintenance
- `CHANGELOG.md` must keep `## Unreleased` as the first changelog section after intro text.
- In-flight changes are added under `## Unreleased`.
- Versioned sections (`## vX.Y.Z - YYYY-MM-DD`) are immutable historical release snapshots.
- During a release cut, move or duplicate `## Unreleased` notes into the new versioned section, then reset `## Unreleased`.
- `CHANGELOG.md` must be kept up to date for every version.
- Summaries must be derived from git history between versions. Prefer tagged ranges, for example: `git log <previous_tag>..<current_tag> --oneline`.
- Entries should be concise, user-facing, and grouped by version.
- If tags are missing for a version boundary, use the closest version marker commit(s) in git history and document the assumption in the changelog entry.

## Robustness Standards
- Validate inputs at boundaries and fail clearly when data is invalid.
- Handle edge cases explicitly (empty values, missing data, unexpected types, out-of-range numbers).
- Avoid hidden side effects; keep functions deterministic where possible.
- Preserve backward-compatible behavior unless a change is intentional and documented.
- Add error handling that is actionable and easy to diagnose.

## Fetch And Cache Guardrails
- Keep one canonical orchestration path for pilot fetching. Wrappers may add pre-resolution or UX glue, but they must delegate to the same runtime pipeline entrypoint.
- Preserve first paint semantics: complete base page-1 round, then recompute immediately. Do not delay first paint behind deep paging or weighting batches.
- Allow deepening rounds to be danger-weighted, but keep weighting isolated to post-first-paint scheduling.
- Cache and regroup signatures must track only material evidence actually used by grouping logic. Do not include non-material deep-history fields in signature keys.
- Non-material pilot-card updates should not force regroup recomputation. Use explicit skip behavior and reasoned logs when signatures are unchanged.
- Long-running active fetches may use periodic guard refreshes, but guard refresh must stop when selected pilots reach terminal fetch phases.
- Keep debug logs sufficient to diagnose waiting points: scheduling reason, cache hit/miss reason, and per-page fetch timing should remain observable.

## Change Quality Checklist
- Tests added or updated for behavior changes.
- Edge cases covered for new logic.
- No unrelated refactors mixed into focused changes.
- Clear naming and readable structure.
- Reference parity with `pyfa` and `svcfitstat` validated for combat calculations.
- For combat capability bugfixes: new fit added to `data/parity/fit-corpus`, pyfa CLI harness reference generated, parity test updated, and Dogma fix implemented.
- `CHANGELOG.md` updated with version-to-version summaries based on git history.
