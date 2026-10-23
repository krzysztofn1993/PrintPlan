<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Edit Reserved Print

- **Plan**: `context/changes/edit-reserved-print/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-22
- **Verdict**: SOUND — all four findings have approved planning fixes.
- **Findings**: 0 critical, 4 warnings, 0 observations at review time.

## Verdicts

| Dimension             | Review verdict | After current triage |
| --------------------- | -------------- | -------------------- |
| End-State Alignment   | PASS           | PASS                 |
| Lean Execution        | PASS           | PASS                 |
| Architectural Fitness | PASS           | PASS                 |
| Blind Spots           | WARNING        | PASS                 |
| Plan Completeness     | WARNING        | PASS                 |

## Grounding

Grounding: 22/22 existing modification paths verified, referenced symbols verified, brief and plan consistent. All 15 Progress entries match the phase success criteria. New migration, decoder, SQL test, browser spec and verification evidence are intentional new deliverables. Read-only deep verification confirmed owner locking, version fencing, in-place allocation feasibility, request-evidence consumers, caller coverage and browser recovery seams. No runtime tests were run for this review.

## Findings

### F1 — Initial reserve confirmation can pair a moved reservation with the old spool

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — reservation service and native contracts
- **Detail**: `reservePrintMaterial` selects the confirmation spool using `input.spoolId` and validates only the current reservation ID (`src/lib/reservations.ts:180`, `:183`). If initial reserve commits R on A and a concurrent edit moves the same R to B before confirmation reads, the service returns success with the print assigned to B and the spool projection for A. The plan's replay marker protects a later reserve retry, but cannot protect this already successful in-flight original reserve.
- **Fix**: Require `print.reservation.spoolId === spool.id` before returning initial reserve success. On mismatch use the existing database-error/refresh-required mutation path without claiming the reservation failed or undoing it. Add a native same-ID move fixture and retain consistent success coverage.
  - Strength: Narrow check prevents an incoherent response while using existing recovery.
  - Tradeoff: A committed reservation can require a refresh when a concurrent edit moves it.
  - Confidence: HIGH — the missing equality follows directly from the service implementation.
  - Blind spot: Paired collection reads remain non-atomic, as already acknowledged in the plan.
- **Decision**: FIXED — the author approved F1. Added Phase 2 subsection 4 with the exact consistency check, error policy and native fixture; synchronized the brief.

### F2 — Intermediate phase compatibility and repository-wide gates are ambiguous

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phases 1–3 and autonomous per-phase gate policy
- **Detail**: Phase 1 changes the update RPC envelope while the old service still requires a top-level `data.id` (`src/lib/prints.ts:211`), and removes two-argument release while the service still calls that signature (`src/lib/reservations.ts:217`). Phase 2 adds cancellation version validation while the browser continues sending only `reservationId` until Phase 3 (`src/components/prints/PrintList.tsx:1128`). `verify:deploy` runs native contracts using mocked responses plus lint/types/build (`package.json`); it does not establish real browser/API compatibility. Running full browser/smoke acceptance after every phase therefore conflicts with these boundaries. The execution contract needs an explicit decision; this is not evidence that the completed design is infeasible.
- **Fix A ⭐ Recommended**: Preserve the four phases, explicitly define `npm run verify:deploy` as the common per-phase repository gate plus each phase's listed acceptance commands, and prohibit deploying intermediate Phase 1–2 commits. Run full browser acceptance in Phases 3–4 and final smoke in Phase 4, without weakening or deleting any tests.
  - Strength: Preserves the planned work split and all final acceptance requirements.
  - Tradeoff: Intermediate commits are not independently deployable, and per-phase browser/smoke checks must follow the approved schedule.
  - Confidence: HIGH — matches the known API and browser handoff points.
  - Blind spot: Runtime environment prerequisites have not been checked in this review.
- **Fix B**: Reorganize the first phase to include the DB/API/browser compatibility seams and their baseline tests before its commit.
  - Strength: Allows complete application acceptance at each phase boundary.
  - Tradeoff: A significantly larger first phase and reworked phase/Progress boundaries.
  - Confidence: HIGH — moves both ends of each breaking contract together.
  - Blind spot: Detailed repartitioning remains to be planned if selected.
- **Decision**: FIXED via Fix A — after a simpler explanation, the author selected A. Added the explicit per-phase gate schedule, prohibited deploying transitional Phase 1–2 commits, and synchronized the brief. All scheduled acceptance and deliberate-break requirements remain mandatory; no tests are weakened or deleted.

### F3 — Unknown versioned cancellation lacks explicit browser acceptance

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 4 — browser acceptance
- **Detail**: Phase 3 promises exact-command resolution for uncertain versioned cancellation, but Phase 4's held-request and lost-response cases explicitly describe edits. Existing cancellation coverage (`tests/e2e/reservation-recovery.spec.ts:598`) completes release, corrupts the acknowledgement and recovers through GETs. It does not prove that an original pending cancellation cannot later release a recalculated same-ID allocation.
- **Fix**: Add cancellation-specific lost/unreadable response, held original request, exact captured-version retry, same-ID stale conflict and separate collection-read failure cases. Update cancellation-specific GET-only expectations while preserving unrelated reserve coverage.
  - Strength: Exercises the new cancellation safety boundary through its own browser handler and RPC.
  - Tradeoff: Adds controlled browser scenarios to the existing recovery suite.
  - Confidence: HIGH — edit acceptance does not execute the cancellation handler.
  - Blind spot: Test synchronization details remain implementation work.
- **Decision**: FIXED — the author approved F3. Added the cancellation recovery acceptance contract to Phase 4 and synchronized the brief. Existing success-criteria and Progress titles are unchanged.

### F4 — Manual Phase 3 approval conflicts with default autonomous continuation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Implementation Note and goal execution boundary
- **Detail**: The original Phase 3 note requires human confirmation before Phase 4, while `10x-goal-implement` normally never blocks on Manual rows and continues through all Automated rows. An all-phases goal and this note cannot both be satisfied without an explicit author override.
- **Fix**: Bound the first goal to Phases 1–3, end the run after the Phase 3 Automated gates and commit, and resume Phase 4 in a separate invocation only after the author confirms that manual checks passed. Keep Manual rows unchecked and the overall change at `implementing` until Phase 4 completes.
- **Decision**: FIXED — the author explicitly chose to end the first goal before Phase 4, perform the manual checks, and implement Phase 4 afterward if they pass. Added the execution boundary, replaced the Phase 3 note and synchronized the brief. This author instruction overrides the skill's default continuation policy.

## Triage Summary

- Fixed: F1, F2 (Fix A), F3, F4.
- Pending: none.
- Skipped: none.
- Accepted: none.
- Dismissed: none.
- Verdict after fixes: REVISE → SOUND; all dimensions PASS.

Only planning artifacts were changed. Implementation, runtime verification and all Progress checkboxes remain pending. The implementation prompt limits the first goal to Phases 1–3 and applies the approved gate schedule. Phase 4 requires a separate invocation after the author's manual checks pass. A scoped Phase 3 checkpoint persists the final SHA write-back while keeping the overall change at `implementing`.
