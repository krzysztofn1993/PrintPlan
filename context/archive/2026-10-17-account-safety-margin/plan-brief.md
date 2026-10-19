# Account Safety Margin — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Deliver S-04: users configure the account safety margin used for new reservations.
Changing the setting preserves existing reserved grams, so a preference change cannot unexpectedly resize work already planned.

## Starting Point

Reservation RPCs already calculate and store grams, serialize account mutations and replay successful requests safely.
They currently hardcode 10%; settings persistence, an editor and evidence of the previewed amount are missing.

## Desired End State

Settings has a whole-percentage input and an explicit save button, with persistent state and version-conflict recovery.
New best-fit and manual reservations use the current margin; changed rounded grams require a fresh preview and another click.

## Key Decisions Made

| Decision                    | Choice                                                         | Why                                                    | Source          |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ | --------------- |
| Bounds and default          | Whole 0–100%; default 10%; round grams upward                  | Accepted product policy                                | PRD / Research  |
| Existing reservations       | Preserve stored grams and applied percentage                   | Settings changes must not resize them                  | PRD / Research  |
| Location                    | Separate /dashboard/settings with navigation link              | Stable account-level destination                       | Plan            |
| Confirmation freshness      | Compare expectedReservationGrams with current calculated grams | Reconfirm only when the amount changes                 | Plan            |
| Same grams, new percentage  | Allow confirmation and store current percentage                | Quantity is the confirmation contract                  | Plan            |
| Change away and back        | Allow if grams and other checks still match                    | No reservation dependency on settings revision         | Plan            |
| Manual selection recovery   | Retain if eligible; otherwise explain best-fit fallback        | Preserve a deliberate spool choice                     | Plan            |
| Concurrent settings saves   | Compare settings version; stale save conflicts                 | Retain the existing versioning convention              | Plan            |
| Defaults and initialization | Missing row reads 10% / version 0; first save creates row      | No registration hook or backfill                       | Plan            |
| Lost acknowledgement        | Retain draft; block saves until authoritative reread           | Avoid overwriting a later change by blind retry        | Research / Plan |
| Successful request replay   | Replay before current-margin checks                            | Preserve original committed result and legacy identity | Research / Plan |

## Scope

**In scope:** owner-isolated persistence, versioned settings API/editor, current-margin reservation authority, amount witness and recovery, migration/concurrency/native/browser/smoke verification.

**Out of scope:** resizing existing reservations, reserved-print recalculation (S-05), per-print margins, queue recalculation, realtime cross-tab synchronization, historical-percentage UI and deployment.

## Architecture / Approach

A lazily created owner-keyed settings row feeds database preview and reserve calculations.
Settings saves share the existing owner mutex and use optimistic versions; reserve checks preview grams and stores the current percentage.
Legacy requests retain a NULL witness for exact successful replay, while all fresh reservations require amount evidence.

## Phases at a Glance

| Phase                  | What it delivers                                                      | Key risk                                       |
| ---------------------- | --------------------------------------------------------------------- | ---------------------------------------------- |
| 1. Database            | Settings, current-margin calculation and migration/concurrency proofs | Preserve snapshots and replay ordering         |
| 2. API and contracts   | Settings endpoint, amount witness and native gates                    | Missing witness must never permit fresh writes |
| 3. Interface           | Settings form, retained drafts and fresh-preview recovery             | Uncertain outcome or obsolete response         |
| 4. Complete acceptance | Browser/smoke proofs and author verification                          | Shared account settings contaminating tests    |

**Prerequisites:** S-03 is complete; Node 24.21.0, installed dependencies and local Supabase/Docker/Mailpit are available for runtime gates.
**Estimated effort:** approximately 4–6 focused implementation sessions across four dependent phases; concurrency and recovery proofs dominate.

## Open Risks & Assumptions

- Ship all four phases together; old fresh requests without amount evidence must fail closed and require a page reload.
- A changed percentage can be stored without another click when rounded grams match; the UI must explain the current-margin policy.
- Browser tests share an account: restore the original percentage with a fresh version and recover failed cleanup before another test.

## Success Criteria (Summary)

- Save 5% and retain an existing 88 g reservation; new 80 g reservations use 84 g with sufficient eligible stock in either selection mode.
- For 80 g, 10% → 9% still reserves 88 g directly and stores 9%; 10% → 5% requires a fresh 84 g confirmation.
- Settings persist across fresh login; stale saves, uncertain responses and concurrent reservation attempts preserve ownership and stock invariants.

## References

[PRD US-02 / FR-008](../../foundation/prd.md) · [Roadmap S-04](../../foundation/roadmap.md) · [Full plan](plan.md) · [Research](research.md)
