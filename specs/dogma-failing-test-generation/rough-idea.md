# Rough Idea

Continuation of the zKill fit fetch CLI work: use fetched/normalized real fit data to generate failing tests for our internal Dogma simulator so parity mismatches against pyfa baseline become reproducible regression tests.

Goal for this spec: define a workflow and tooling to convert fit samples into deterministic failing test cases that can drive Dogma bug fixing (starting with known T3 Cruiser issues, extensible to other hull classes).
