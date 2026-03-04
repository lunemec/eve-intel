# Combat Parity Guidance

This document defines combat capability implementation and bugfix policy.

## Combat Capability Implementation Guidance
- For combat capability details, use `pyfa` and `svcfitstat` as reference implementations.
- Cross-check formulas, assumptions, and behavior against those references before finalizing changes.
- When behavior intentionally differs from references, document the reason in code comments or PR notes.

## Combat Capability Bugfix Workflow
- When fixing any combat capability problem for a fit, always add a new test fit to the parity fit corpus in `data/parity/fit-corpus`.
- Generate a reference result for that fit using the pyfa CLI harness, and store or update the corresponding parity reference data.
- Add or update a parity test that captures the failing behavior and validates the expected reference result.
- Implement the fix in our Dogma implementation only after the failing test and reference result are in place.
- Confirm the new fit-based test passes after the Dogma change.
