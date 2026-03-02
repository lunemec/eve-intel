# Quality, Changelog, And Robustness

This document defines repository expectations for changelog maintenance, robustness, and change quality.

## Changelog Maintenance
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

## Change Quality Checklist
- Tests added or updated for behavior changes.
- Edge cases covered for new logic.
- No unrelated refactors mixed into focused changes.
- Clear naming and readable structure.
- Reference parity with `pyfa` and `svcfitstat` validated for combat calculations.
- For combat capability bugfixes: new fit added to `data/parity/fit-corpus`, pyfa CLI harness reference generated, parity test updated, and Dogma fix implemented.
- `CHANGELOG.md` updated with version-to-version summaries based on git history.
