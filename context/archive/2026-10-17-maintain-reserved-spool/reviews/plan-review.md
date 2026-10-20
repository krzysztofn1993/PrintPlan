<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Maintain a Reserved Spool

- **Plan**: `context/changes/maintain-reserved-spool/plan.md`
- **Mode**: Deep
- **Date**: 2026-10-17
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations; F1 fixed during triage.

## Verdicts

| Dimension             | Review verdict | After triage |
| --------------------- | -------------- | ------------ |
| End-State Alignment   | PASS           | PASS         |
| Lean Execution        | PASS           | PASS         |
| Architectural Fitness | PASS           | PASS         |
| Blind Spots           | WARNING        | PASS         |
| Plan Completeness     | PASS           | PASS         |

## Grounding

Grounding: 5/5 existing modification paths verified, 3/3 symbols verified, brief and plan consistent. All 9 original Progress entries matched their success criteria. The new verification document is an intentional new artifact. Source verification confirmed the database invariants, existing API/DTO contracts, fixture support, and local caller coverage; runtime tests were not run for the review.

## Findings

### F1 — Refreshed reservations can lock a conflicting draft

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — correction refresh
- **Detail**: The plan retains raw material/colour inputs while refreshed reservations disable those controls. Opening an unreserved Black spool, drafting Red and 100 g, then creating a reservation against saved Black causes rejection. Refresh would retain Red but disable Colour, preventing the user from abandoning only the matching-label edit and saving the grams correction. Local input initialization and submission are in `src/components/spools/SpoolForm.tsx:83`, `:119`, and `:129`; reservation-based disabling is at `:241` and `:268`; the database rejects conflicting matching labels at `supabase/migrations/20261016000000_reserve_and_release_material.sql:131`.
- **Fix**: Offer an explicit `Use saved material and colour` action that restores both labels from the latest successfully read DTO while retaining raw grams. Add a browser case for an unreserved-to-reserved transition with a conflicting label draft.
  - Strength: Restores an actionable correction without cancelling reservations or adding backend changes.
  - Tradeoff: Adds one conditional action and browser case.
  - Confidence: HIGH — follows directly from the current state and submission behavior.
  - Blind spot: Exact explanatory copy and placement remain implementation choices.
- **Decision**: FIXED — the author approved the proposed fix during triage. The action uses the latest successfully read DTO without another request or automatic save. Added the behavior and browser scenario to Phase 1, appended criterion/Progress step 1.3 without renaming existing steps, and synchronized the brief.

## Triage Summary

- Fixed: F1.
- Skipped: none.
- Accepted risks: none added by triage; existing scope deferrals remain as documented in the plan.
- Dismissed: none.
- Verdict after fixes: SOUND; all dimensions PASS.

These changes update planning artifacts only. Implementation and product verification remain pending.
