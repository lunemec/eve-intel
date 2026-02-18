# Summary: Ship Combat Capability Accuracy Follow-up

Date: 2026-02-18

## Artifacts Created
- `specs/improve-accuracy-of-ship-combat-capability/rough-idea.md`
- `specs/improve-accuracy-of-ship-combat-capability/requirements.md`
- `specs/improve-accuracy-of-ship-combat-capability/research/00-research-plan.md`
- `specs/improve-accuracy-of-ship-combat-capability/research/01-baseline-gap-measurement.md`
- `specs/improve-accuracy-of-ship-combat-capability/research/02-t3-mechanics-audit.md`
- `specs/improve-accuracy-of-ship-combat-capability/research/03-parity-corpus-expansion.md`
- `specs/improve-accuracy-of-ship-combat-capability/research/04-prioritization-iteration-loop.md`
- `specs/improve-accuracy-of-ship-combat-capability/design.md`
- `specs/improve-accuracy-of-ship-combat-capability/plan.md`
- `specs/improve-accuracy-of-ship-combat-capability/summary.md`

## Brief Overview
This planning package defines a post-Ralph follow-up workflow to improve Dogma combat capability parity against pyfa for currently surfaced metrics only, with a strict fit-level pass rule of <=10% delta per metric (exact match preferred).

The phase-gated target is:
1. T3 cruisers first (Loki, Legion, Proteus, Tengu): at least 10 passing fits per hull
2. T3 destroyers next (Hecate, Jackdaw, Confessor, Svipul): at least 10 passing fits per hull

The design and plan emphasize:
- Reuse of current parity infrastructure
- Deterministic baseline/gate artifacts
- Mechanic-cluster prioritization
- Red/green/blue TDD loops with regression-first parity fit/reference updates

## Key Planning Conclusions
- Current parity report is green for existing corpus/golden set, but T3 hull coverage is far below the required pass-count gate.
- Current T3 subsystem handling appears partial; multiple subsystem effects in corpus are likely under-modeled.
- Follow-up should start with post-merge baseline + explicit 10% gate reporting, then iterate through scoped corpus expansion and targeted mechanic fixes.

## Suggested Next Steps
1. Wait for the current Ralph task to complete/merge.
2. Execute Step 1 from `plan.md` to produce a post-merge baseline and follow-up gate rollup.
3. Start T3 cruiser coverage expansion and prioritized mismatch cycles before moving to T3 destroyers.
4. Use the implementation plan checklist as the source of truth for progress and completion.
