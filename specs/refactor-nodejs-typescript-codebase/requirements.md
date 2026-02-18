# Requirements Clarification Log

## Process Checkpoints

- 2026-02-18: Project structure created at `specs/refactor-nodejs-typescript-codebase/` and approved by user.

## Q&A

### Q1
- Question: For this refactor, what behavior boundaries are strict no-change guarantees, and what behavior changes are acceptable only if tests reveal an existing bug?
- Answer: Functionality must not change.

### Q2
- Question: Should the scope include only the high-confidence findings already listed in `rough-idea.md`, or do you also want a repo-wide sweep for additional readability/dead-code opportunities (still excluding `./pyfa/**` and `./svcfitstat/**`)?
- Answer: Only listed findings.

### Q3
- Question: For unreferenced exported symbols (`getDogmaVersion`, `getAttr`, and potentially `buildPilotSnapshotKey`), do you want removal/de-export now, or keep them exported unless we can prove there are no external consumers beyond this repo?
- Answer: There are no external consumers.

### Q4
- Question: Do you want any new static-gate tooling introduced (for example `ts-prune`), or should we prefer lightweight in-repo checks using existing tooling only?
- Answer: _pending_
