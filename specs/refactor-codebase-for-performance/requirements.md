# Requirements Q&A

## Q1
Question: Which parts of the codebase are currently too slow, and what concrete performance targets should this refactor achieve (for example p95 latency, throughput, memory, build time)?

Answer: Current runtime appears fast with good caching; focus should be on identifying potentially bad code that is unnecessarily complex and could become slow based on Big O characteristics.

## Q2
Question: Which runtime paths should be prioritized for Big O review first (for example combat calculations, fit parsing, parity test tooling, build pipeline, or specific modules/files)?

Answer: Prioritize the entire Node/TypeScript codebase, excluding `pyfa` and `svcfitstat` folders; specifically investigate inefficient HTTP queries.

## Q3
Question: For HTTP query inefficiency, which issues should be treated as in-scope findings: duplicate requests, N+1 request patterns, sequential calls that could be parallelized, missing batching, missing timeouts/retries, over-fetching payloads, lack of connection reuse, or all of these?

Answer: All listed HTTP inefficiency categories are in scope.

## Q4
Question: What output do you want from this effort: a prioritized findings report only, or a full change proposal with concrete refactor tasks, estimated impact, and acceptance tests per finding?

Answer: Provide a full change proposal with concrete refactor tasks, estimated impact, and acceptance tests per finding.

## Q5
Question: Should proposed refactors be limited to low-risk internal changes that preserve all external behavior and public interfaces, or can they include API/behavior changes if justified by performance?

Answer: API and behavior changes are allowed if justified.

## Q6
Question: How should we prioritize findings: should HTTP-query inefficiencies be treated as highest priority, or should all Big O risks (HTTP and non-HTTP) be ranked purely by estimated impact/severity regardless of category?

Answer: Rank all findings by estimated impact.

## Q7
Question: Should estimated impact be based only on static analysis/Big O reasoning, or do you also want lightweight empirical evidence (for example microbenchmarks or timing traces) included for high-impact findings?

Answer: Base impact estimates on Big O reasoning, optionally informed by existing unit-test execution time where useful; this approach is generally not applicable to HTTP inefficiency analysis.

## Q8
Question: Are there any areas where API/behavior changes are not allowed (for example public endpoints, CLI outputs, or parity-related behaviors), even though such changes are generally permitted?

Answer: Application behavior should generally remain the same, but better APIs can be adopted when available within public API constraints.

## Q9
Question: Should the proposal prefer refactors within the current dependency stack, or can it recommend introducing new libraries/tools when they materially improve performance or HTTP efficiency?

Answer: It can make recommendations.

## Q10
Question: Is requirements clarification complete, or do you want to continue with more requirement questions (and/or switch to preliminary research now)?

Answer: Requirements clarification is complete.

