# Implementation Review Follow-ups

## F1 — Preserve review access to recovered receipts after print deletion

- **Source**: [Implementation review](../reviews/impl-review.md#f1--closing-a-deleted-prints-recovered-receipt-removes-its-review-path).
- **Decision**: Apply the proposed fix, confirmed by the author on 2026-10-18.
- **Status**: FIXED.
- **Changes**: Keep in-session review controls for deleted completed prints, including ordinary deletion before any receipt was loaded in the current page. Retain completed identity/summary after confirmed deletion and fetch the receipt only on review. Restore keyboard focus on close and refresh current collections on reopen without another settlement mutation. Extend the existing browser deletion-recovery scenario with close/reopen, refresh, independent stock correction and one-POST assertions; add a fresh-page completed-deletion regression.
- **Files**: `src/components/prints/PrintList.tsx`, `tests/e2e/settlement-recovery.spec.ts`.
- **Verification**: Both regressions failed before their respective fixes; `npm run verify:deploy` and the complete Chromium suite passed after the final update (32 tests, including both deletion regressions). The development server on port 4321 serves the updated code.
- **Author acceptance**: Confirmed working in the local application on 2026-10-18.

## F2 — Complete pending-command recovery and database boundary coverage

- **Source**: [Implementation review](../reviews/impl-review.md#f2--required-recovery-and-database-edge-cases-lack-executable-proof).
- **Decision**: Complete the missing tests, confirmed by the author on 2026-10-18.
- **Status**: FIXED.
- **Changes**: Deliver real null receipts to the UI while the captured original settlement command waits before forwarding; assert frozen input and guarded collection actions through close/reopen and refresh, then verify the original commit and exact replay. Cover retained-key print/version/reservation changes, complete fixture-state preservation, positive exact-fit cancellation, direct-RPC null/nonfinite/maximum grams and both meaningful replacement/settlement lock orders. Update coverage documentation to describe the observed sequence.
- **Files**: `tests/e2e/settlement-recovery.spec.ts`, `supabase/tests/settlements.test.sql`, `scripts/reservation-concurrency.mjs`, `context/foundation/test-plan.md`.
- **Verification**: `npm run verify:deploy`, 376 database assertions, all 26 observed-lock interleavings and all 32 Chromium tests passed; generated fixture cleanup passed.

## F3 — Ancillary local development tooling

- **Status**: DISMISSED.
- **Resolution**: The author clarified that dev:reset supports developer testing. The reviewer withdrew the observation as non-actionable; the separate development commits already explain its purpose. No implementation change or plan addendum is required.

Triage is complete: F1 and F2 are FIXED; F3 is DISMISSED. No follow-ups remain pending.
