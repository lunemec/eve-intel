Q1: What exact outcome should define success for this follow-up effort after the current Ralph task completes (for example, specific parity metrics, error thresholds, or target fit categories)?
A1: Improve overall accuracy of capability metrics across a wide range of ships and fits, getting as close as possible to pyfa real numbers.

Q2: Which specific capability metrics are in scope for this phase (for example DPS, volley, tank/EHP, capacitor stability, application, projection), and are any explicitly out of scope?
A2: Scope is limited to currently surfaced metrics; capacitor and application are out of scope.

Q3: For in-scope surfaced metrics, what acceptable parity threshold should we target versus pyfa (for example exact match where possible, <=1% relative error, or per-metric thresholds)?
A3: Target exact match where possible; acceptable differences can be up to 10%.

Q4: How should we define “wide range” coverage for ships/fits in this phase (for example minimum number of corpus fits, required ship classes, weapon systems, and tank styles)?
A4: Cover as many combinations as possible, with ability to keep iterating on new combinations later or focus on specific known problems.

Q5: What concrete completion gate should end this follow-up phase (for example, all existing parity corpus fits within 10%, or top N biggest mismatches investigated and fixed)?
A5: Completion gate: at least 10 different fits per specified ship type must have passing parity checks.

Q6: Which ship types should be explicitly included in this phase’s parity gate?
A6: Prioritize T3 cruisers (subsystems complexity), then continue with T3 destroyers.

Q7: For each fit, what exact rule should determine a “passing parity check” (for example every in-scope surfaced metric within 10% of pyfa, with exact match preferred)?
A7: A fit passes parity when every in-scope surfaced metric is within 10% of pyfa, with exact match preferred.

Q8: Should this follow-up work explicitly start only after the current Ralph task is merged/completed, with an initial baseline step to measure remaining parity gaps before new fixes?
A8: Follow-up begins only after the current Ralph task is completed, including an initial baseline step to measure remaining parity gaps before new fixes.

Q9: Is requirements clarification complete now, or do you want to continue clarifying requirements (and optionally switch to research to answer any open questions)?
A9: Requirements clarification is complete.
