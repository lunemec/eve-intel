# Requirements Clarification Log

## Process Checkpoints

- 2026-02-18: Project structure created at `specs/refactor-nodejs-typescript-codebase/` and approved by user.
- 2026-02-18: Requirements clarification marked complete by user.
- 2026-02-18: Research completed across three topic notes; user confirmed research is sufficient.

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
- Answer: Use what exists in AGENTS.md, and use static analysis/compilation with settings as tight as possible without being too pedantic.

### Q5
- Question: Should the “dead code candidates requiring verification” (probe duplication, `backtest.ts`, and `src/lib/dogma/engine/types.ts` exports) be executed in this refactor, or only documented as deferred follow-up candidates?
- Answer: Execute them in this refactor.

### Q6
- Question: If a candidate removal cannot be proven safe within current tests and strict checks, should we keep it and document the blocker, or force removal and add compatibility shims?
- Answer: Keep it and document as blocker/unable to verify.
- 2026-02-18: Design draft reviewed and approved by user.
- 2026-02-18: Implementation plan reviewed and approved by user.
