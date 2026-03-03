# Agent Docs Index

Canonical navigation for repository policy documents.

## Read Order
1. [Workflow and TDD](workflow.md): red/green/blue gates and mandatory validation order.
2. [Quality, Changelog, and Robustness](quality.md): changelog policy and quality checklist.
3. [Combat Parity Guidance](combat-parity.md): combat implementation references and bugfix flow.

## Non-Negotiables
- Follow red/green/blue gates and the mandatory validation order from `workflow.md`.
- Keep behavior stable during refactors unless the behavior change is explicitly documented.
- For combat bugfixes, add fit corpus coverage and pyfa reference data before Dogma fixes.

## Documentation Format
- `AGENTS.md` is the compact entrypoint: it states mandatory rules and links here first.
- `docs/agents/index.md` is the navigation hub: it defines read order and points to domain-specific policies.
- Detailed docs in this folder are the source of truth: when guidance differs, follow the most specific linked document.

## Maintenance Workflow
1. Pick the smallest source-of-truth file for the policy change:
   - Entrypoint or mandatory cross-cutting rules: `AGENTS.md`.
   - Navigation, read order, or doc map updates: `docs/agents/index.md`.
   - TDD gates and validation order: `docs/agents/workflow.md`.
   - Changelog, robustness, or change quality expectations: `docs/agents/quality.md`.
   - Combat parity policy and bugfix flow: `docs/agents/combat-parity.md`.
2. Keep `AGENTS.md` and `docs/agents/index.md` aligned: `AGENTS.md` stays compact, and detailed policy lives in `docs/agents/*`.
3. Run governance validation after edits: `npm run check:docs-governance`.
4. Treat governance as required:
   - Required docs files exist.
   - Required local links remain valid.
   - Required section markers remain present in `docs/agents/index.md`.
