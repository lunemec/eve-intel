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
