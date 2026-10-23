# Implementation Review Fixes

## F1 — Neutral feedback for an unknown original edit outcome

- Decision: Fix now, approved by the author during triage on 2026-10-23.
- Scope: Replace inferred event ordering in exact edit recovery with current-state wording and acknowledge that the original edit may have completed. Extend the existing lost-response E2E cases for both print and spool collection read failures.
- Files: `src/components/prints/PrintList.tsx`, `tests/e2e/print-recovery.spec.ts`.
- Status: FIXED.
- Verification: `npm run lint` passed; the built-preview lost-response cases passed for both print and spool collection failures (`4 passed`, including authentication setup and teardown). The initial browser attempt failed during Supabase status discovery; a status check and the unchanged test retry passed. `git diff --check` passed.

## F2 — Validate recalculation arithmetic in committed edit receipts

- Decision: Fix now, approved by the author during triage on 2026-10-23.
- Scope: Reject recalculation amounts that contradict the committed print requirements and margin, including saved-unreserved outcomes. Add native regression cases for all outcomes, rounding and numerical boundaries.
- Files: `src/lib/print-update-dto.ts`, `scripts/print-contracts.test.mjs`.
- Status: FIXED.
- Verification: `npm run test:prints` passed all 23 tests, including fixtures for all recalculation outcomes, rounding, zero and maximum margins, numerical limits and contradictory totals. `npm run verify:deploy` and `git diff --check` passed.

## F3 — Complete exact-command recovery browser acceptance

- Decision: Fix now, approved by the author during triage on 2026-10-23.
- Scope: Exercise authentication, validation, server, transport and unreadable-response failures on already uncertain edit and cancellation retries. Keep a detached original command queued independently of the browser failure, resolve through the originating page and prove the late original cannot mutate twice or release a recalculated allocation.
- Files: `tests/e2e/exact-command-recovery.spec.ts`.
- Status: FIXED.
- Verification: All 13 new scenarios passed in the focused run (`15 passed`, including authentication setup and teardown). The full browser suite passed all 80 tests; `npm run verify:deploy` and `git diff --check` passed. F3 required no production-code changes.
