# Settle Print Consumption — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Let a user settle actual filament consumption once for a completed print. Deduct stock, release its reservation, cancel other reservations only when needed, and retain the result so a lost response cannot cause another deduction or lose feedback.

## Starting Point

Spool stock, planned prints and reservations already work through authenticated database functions with an owner mutex, version checks and retained reserve-request evidence. Settlement, completed state and durable settlement feedback are missing; existing SQL, Node, concurrency, migration, HTTP and browser suites can be extended.

## Desired End State

A reserved print offers a whole-gram consumption form, including 0 g. After settlement it stays in the current collection as Completed, showing actual grams and result review, with deletion allowed but editing and new reservations blocked. Users see which other reservations were cancelled, current stock when readable, and any exceeded-estimate warning, including after response recovery.

## Key Decisions Made

| Decision               | Choice                                                                                                                     | Why                                                                                         | Source                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Eligibility            | Require the current active reservation and its exact identity.                                                             | It identifies the consumption spool and protects replacement reservations.                  | Plan: author                                                                                                |
| Actual grams           | Whole integers from 0 through 2,147,483,647 g; no margin or rounding.                                                      | Matches current units and permits zero actual consumption; zero still completes the print.  | Plan: author accepted whole grams and explicitly confirmed zero; bound follows existing quantity convention |
| Visibility/actions     | Keep Completed rows in the current collection; review/delete only.                                                         | Completion remains visible after refresh/login, without a second collection.                | Plan: author                                                                                                |
| Deduction/cancellation | Record `max(0, recorded - actual)`; release own reservation; cancel others by `created_at DESC, id DESC` until they fit.   | Preserves the committed stock invariant and the required newest-first policy.               | PRD / Research                                                                                              |
| Exceeded estimate      | Warn only when actual exceeds pre-settlement recorded stock; allow settlement and record 0 g.                              | An entered estimate is not a physical-empty guarantee.                                      | PRD / Research                                                                                              |
| Exactly once           | Unique owner/print ledger plus request-key replay, checked before live rows.                                               | New keys, lost responses and later product deletion cannot cause another deduction.         | PRD / Research / Plan                                                                                       |
| Durable result         | Immutable receipt snapshots retained until account deletion, independent of product deletion.                              | Required cancellation and estimate feedback remains recoverable.                            | Research / Plan                                                                                             |
| Recovery               | Keep confirmed receipt success separate from current-data refresh; null receipt alone never unlocks changed-input retries. | An earlier request may still commit, and stock reads may fail after a confirmed settlement. | Research / Plan                                                                                             |

## Scope

**In scope:**

- Atomic settlement, version invalidation, durable receipt lookup and owner isolation.
- The current collection's form, Completed rows, cancellation/estimate feedback and current-stock reconciliation.
- SQL, controlled races, populated upgrades, native contracts, HTTP persistence and browser recovery tests.

**Out of scope:**

- Unreserved settlement, fractional grams, undo, editing/reusing settled prints or a separate history/completed section.
- Margin settings, reserved-print recalculation, S-06's full maintenance flow and unrelated deferred F1 testing.
- New infrastructure or test runners, printer integrations and visual snapshot tests.

## Architecture / Approach

PrintList owns the form, immutable submitted command and recovery guard; a presentation panel uses existing dashboard components. The settlement API calls one owner-serialized database function that records the entire transition and receipt. Nullable completion fields extend the ordinary print DTO. Owner-scoped receipt reads survive product deletion; fresh print/spool reads update current state separately, and deleting a Completed row never refunds stock.

## Phases at a Glance

| Phase                                           | What it delivers                                                      | Key risk                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Atomic settlement and durable evidence       | Additive migration, once-per-print ledger, SQL/race/upgrade proof.    | Duplicate deductions or reservations surviving beyond stock. |
| 2. API and durable result contracts             | Validated command/result endpoints, strict DTOs and native CI gate.   | Losing committed success behind a later read failure.        |
| 3. Settlement form and completed rows           | Whole-gram form, visible completion, result/stock recovery and focus. | Stale actions, lost drafts or premature mutation unlock.     |
| 4. End-to-end recovery and release verification | HTTP/browser proof, full gates and current documentation.             | Missing cancellation feedback after lost acknowledgement.    |

**Prerequisites:** Implemented S-03; Node from `.nvmrc`; dependencies; local Supabase/Docker and Mailpit for database, browser and HTTP gates. S-04/S-05/S-06 are not prerequisites.
**Estimated effort:** Roughly 4–6 focused development sessions across four phases, plus author browser/phone checks; an estimate, not a measured commitment.

## Open Risks & Assumptions

- The existing owner mutex is appropriate for the declared small user base; no latency benchmark is claimed.
- Completed rows and retained receipts accumulate until product/account deletion respectively; no history filtering or receipt purge is included.
- A pre-feature application rollback could misrepresent completed rows; retain the schema/evidence and use a forward fix or suspend the new entry point while preserving completion guards.
- Chromium automation does not prove Firefox/phone usability; those remain explicit author checks. Deployed behavior and remote CI were not verified during planning.

## Success Criteria (Summary)

- In separate fixtures with 150 g recorded and 88 g reserved for an 80 g print, actual 75 g leaves 75 g recorded/available; actual 0 g leaves 150 g recorded/available and still completes the print.
- Cancellation follows the required order and stops when reservations fit; only consumption strictly above recorded stock triggers exceeded-estimate feedback.
- Retries never deduct twice; completion and identifiable feedback survive recovery, refresh and login, while completed deletion never refunds stock.

## References

- [Full plan and canonical Progress](plan.md), [research](research.md), [PRD](../../foundation/prd.md), [S-07 roadmap](../../foundation/roadmap.md#s-07-settle-actual-consumption-once), [test strategy](../../foundation/test-plan.md).
