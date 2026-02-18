# Requirements Q&A Log

## Process Decisions
- 2026-02-18: Project structure created at `specs/dogma-failing-test-generation/` and approved by user.

## Requirements Clarification

### Q1
Question: For v1 of this continuation, what should be the primary artifact generated from fetched fits: parity test files directly in the repo, or an intermediate candidate corpus that a separate command turns into tests?
Answer: Append to the existing file/corpus that already stores zKill fetched test fits/

### Q2
Question: What is the exact existing file or directory path we should append to for zKill fetched test fits?
Answer: Use `data/parity/fit-corpus.jsonl` as canonical append target (verified from parity tests/scripts); `data/parity/fit-corpus.dev.jsonl` is for desktop/dev dumping.

### Q3
Question: Should the continuation workflow auto-append directly to `data/parity/fit-corpus.jsonl`, or write a reviewed candidate file first and require an explicit promote/merge step into the canonical corpus?
Answer: auto-append directly to `data/parity/fit-corpus.jsonl`

### Q4
Question: After appending fits, should v1 automatically run the pyfa baseline + dogma parity comparison and emit failing test cases for mismatches in one command?
Answer: yes

### Q5
Question: Should generated failing tests be created only for newly appended fits in the current run (recommended), or for every mismatch across the full corpus each run?
Answer: only for newly appended fits in the current run

### Q6
Question: Should mismatch output create/append deterministic test vectors in an existing parity fixture file (recommended) or generate standalone per-fit test files?
Answer: generate deterministic vectors in existing parity fixture files

## Research Notes Link
- 2026-02-18: Investigated existing dogma parity test workflow to answer Q6.
- See `specs/dogma-failing-test-generation/research/dogma-fit-test-workflow.md`.

### Q7
Question: When newly appended fits produce parity mismatches, should the command exit non-zero by default (so CI/automation fails fast), or succeed and only write a report?
Answer: exit non-zero by default

### Q8
Question: Where should run artifacts for newly appended fit mismatches be written (recommended: `reports/dogma-parity-new-fits-report.json` plus optional JSONL diagnostics)?
Answer: yes; write to `reports/dogma-parity-new-fits-report.json` (with optional JSONL diagnostics)

### Q9
Question: Is requirements clarification complete for this continuation spec, or do you want to refine requirements further?
Answer: yes, requirements clarification is complete for now

## Process Decisions
- 2026-02-18: User chose to proceed to design creation.
- 2026-02-18: Design approved by user; implementation planning started.
- 2026-02-18: Implementation plan approved by user.
- 2026-02-18: Summary artifact generated.
