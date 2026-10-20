# Implementation Review Follow-ups

## F1 — Cover independent material and colour conflicts

- **Status**: FIXED on 2026-10-20.
- **Source**: `../reviews/impl-review.md`, F1.
- **File**: `tests/e2e/reservation-recovery.spec.ts`.
- **Change**: Parameterized the existing reserved-label refresh/restoration scenario for material and colour conflicts, preserving draft, request-count, persisted-state, and deliberate-save assertions.
- **Verification**: Both variants passed (`4 passed`, including auth setup/teardown); the runner's production build and full lint passed. Deliberately omitting colour restoration in the isolated copy failed at the expected Black-versus-Red assertion; source was restored before the passing run.

No pending review fixes remain.
