# Maintain a Reserved Spool — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Finish S-06 with useful stock-correction feedback and clear confirmed/uncertain deletion behavior. The author chose a bounded MVP change on 2026-10-17: recovering an original cancellation list after a lost response does not justify a durable result/history workflow now.

## Starting Point

The database already rejects corrections below active reservations and atomically cancels reservations when deleting a spool. The UI displays received cancellation details and guards uncertain writes, but correction errors can quote stale grams and refreshing currently closes the editor.

## Desired End State

With 88 g reserved, 87 g is rejected and 88 g is accepted with 0 g available. Users can refresh reservation quantities without losing their correction draft and can navigate to planned prints to cancel reservations. Confirmed deletion identifies all cancellations; an uncertain result directs users to current data without promising the original list.

## Key Decisions Made

| Decision                      | Choice                                                                                                                 | Why                                                                                    | Source                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| Correction rule               | Cancel enough reservations before reducing stock below reserved grams; equality is valid                               | Preserves the existing invariant                                                       | PRD / Research                         |
| Matching labels               | Cancel reservations before changing canonical material or colour                                                       | Retains the accepted S-03 rule                                                         | S-03 / Research                        |
| Recovery scope                | Defer durable cancellation-list recovery, history, acknowledgements, and retention                                     | The missing information does not indicate corrupted stock; keep MVP work proportionate | Author, 2026-10-17                     |
| Correction refresh            | Dedicated refresh retains raw draft, updates saved quantities, and never resubmits                                     | Makes a rejected correction actionable                                                 | Approved phase outline / Plan          |
| Matching-label draft recovery | Explicit `Use saved material and colour` restores the latest read labels while retaining raw grams; no request or save | Avoids trapping a conflicting draft when refreshed reservations lock matching fields   | Author, plan-review triage, 2026-10-17 |
| Conflict text                 | Generic guardrail message; numeric hints reflect the latest readable DTO snapshot                                      | Avoids claiming an outdated total is the current minimum                               | Research / Plan                        |
| Cancellation access           | Link to the existing planned-prints page                                                                               | Reuses current reservation management                                                  | Approved phase outline / Plan          |
| Verification scope            | Reuse existing database/native/browser infrastructure and test real writes                                             | Covers the user-visible risks without adding backend machinery                         | Research / Plan                        |

## Scope

**In scope:**

- Correction feedback, dedicated draft-preserving refresh, and reservation-management guidance.
- Complete received deletion feedback; clear lost-response guidance and retained uncertainty guard.
- Boundary, stale-total, multiple-reservation, and committed-but-unreadable deletion browser cases; existing integrated gates and evidence.

**Out of scope:**

- Durable deletion receipts/history/replay or recovery of the cancellation list after lost responses, navigation, or login.
- Schema/API changes, spool edit versioning, automatic cancellation/clamping/resubmission, or draft persistence across navigation/login.
- Broad parser hardening deferred in S-03; margin settings, print recalculation, settlement, and new test infrastructure.

## Architecture / Approach

Keep saved list state and mutations in `SpoolInventory` and raw input in `SpoolForm`. Reuse `GET /api/spools`; distinguish a known-rejection refresh that preserves the editor from uncertain-mutation reconciliation that closes it for review. Retain all existing database and HTTP contracts and the dashboard design contract.

## Phases at a Glance

| Phase                  | What it delivers                                                                          | Key risk                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Correction guidance | Truthful guardrail feedback, refreshed quantities without draft loss, browser regressions | Refresh discards input or presents a stale minimum            |
| 2. Deletion guidance   | Complete normal feedback and bounded lost-response behavior with multiple reservations    | Live-state reconciliation is presented as historical recovery |
| 3. Verification        | Native/build, browser, smoke, supported-browser checks, and recorded evidence             | Completion overstates tested behavior or deferred scope       |

**Prerequisites:** Node from `.nvmrc`, locked dependencies, local Supabase/Mailpit and Docker, installed Chromium, and a free browser preview port. No new migrations or endpoints.
**Estimated effort:** Roughly 2–3 focused implementation/verification sessions across three phases; an estimate, not a commitment.

## Open Risks & Assumptions

- After a lost deletion response, refresh can establish current stock and print reservations but cannot restore that deletion's cancellation list. The author explicitly accepted this limitation.
- Reservation totals may change after a refresh; the server validates each save. No spool edit-version protection is added.
- Draft preservation applies to the dedicated in-page correction refresh; navigation, reload, and login do not restore inputs.
- Research and planning inspected source. Product verification remains pending; Chromium is automated, with Chrome/Firefox and phone acceptance recorded separately. No mandatory screenshot artifact is introduced.

## Success Criteria (Summary)

- The 87/88 g boundary and 88-to-143 g changing-reservation case work through the real UI while refresh retains the unsaved draft.
- A received deletion result identifies both reservations; a lost result stays guarded until a readable refresh, never repeats deletion automatically, and leaves both prints unreserved.
- Existing safety regressions, native/build, browser, and smoke gates pass; manual acceptance and the deferred recovery limitation are recorded.

## References

- [Full plan](plan.md), [research](research.md), [PRD](../../foundation/prd.md), [roadmap](../../foundation/roadmap.md), and [test stack](../../foundation/test-stack.md).
- [S-03 decisions](../../archive/2026-10-16-reserve-and-release-material/plan-brief.md) and [accepted review deferrals](../../archive/2026-10-16-reserve-and-release-material/reviews/impl-review.md).
