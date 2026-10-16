# Reserve and Release Material — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Deliver S-03 so a user can reserve filament for a planned print and release it without consuming stock. The database must prevent double booking even when requests compete or a successful write loses its response.

## Starting Point

Private spool/print CRUD, stock quantities, versioned print edits and browser recovery tests already exist. Reservations do not: stock reads currently report zero reserved grams, print DTOs have no reservation state, and direct database writes bypass any future endpoint-only checks. Planning starts on `feat/reserve-and-release-material` at fetched master `12740e4`, preserving existing PRD v3 and research edits.

## Desired End State

An 80 g print reserves 88 g from a matching 150 g spool at the default 10% margin, leaving 62 g available. A second identical print cannot reserve until the first reservation is cancelled; recorded stock remains 150 g. Users preview best-fit or choose an eligible alternative, see committed reservations and can release them safely.

## Key Decisions Made

| Decision                      | Choice                                                                                                                  | Why                                                                          | Source               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| Arithmetic and ordering       | Whole grams rounded up; 10% default; best-fit by least remaining availability, earlier creation, then ascending ID      | Retains settled product rules; 81 g at 5% rounds to 86 g.                    | PRD v3 / Research    |
| Reserved-print editing        | Allow name-only edits; cancel before changing normalized material, colour or required grams                             | Protects reservations while automatic recalculation remains in S-05.         | Author, question 1   |
| Reserved-spool matching edits | Cancel reservations before changing canonical material/colour matching; stock corrections must still cover reservations | Keeps existing stock editing safe without silently cancelling assignments.   | Author, question 2   |
| Changed automatic suggestion  | Fresh preview and confirmation even when the earlier spool still fits; eligible manual choices remain valid             | Preserves current best-fit and explicit user confirmation.                   | Author, question 3   |
| Deletion feedback             | Identify cancellations after confirmed deletion; recovery of the full list after a lost reply remains in S-06           | Adds useful feedback now without a deletion-history workflow.                | Author, question 4   |
| Consistency boundary          | All CRUD/reservation writes through owner-checked RPCs with a per-owner database mutex; remove direct write grants      | Every reachable application write preserves the same invariant.              | Plan / code evidence |
| Retry and cancellation safety | Private successful-request ledger; server-generated reservation ID; cancel that exact ID                                | Old requests cannot resurrect released reservations or cancel a replacement. | Plan / Research      |

## Scope

**In scope:**

- Reservation persistence, best-fit/manual preview, atomic reserve/release and real stock totals.
- Existing CRUD safety, version invalidation, confirmed deletion summaries and guarded recovery of uncertain writes.
- SQL, deterministic concurrency, populated-upgrade, native, HTTP and browser verification.

**Out of scope:**

- Account margin settings (S-04), automatic reserved-print recalculation (S-05), full reserved-spool maintenance/deletion-feedback recovery (S-06), actual consumption (S-07).
- Automatic reservation replacement, public history, splitting across spools, realtime and cross-tab synchronisation.

## Architecture / Approach

React collections retain state and handlers; authenticated Astro endpoints call PostgreSQL operations through the request Supabase client. Every mutation locks the owner's private mutex before reading product state, then validates and commits atomically. Owner-scoped projections supply shared SSR/API DTOs; successful receipts provide committed values. Reservation changes advance print versions, and unreadable mutation outcomes require authoritative reconciliation.

## Phases at a Glance

| Phase                                           | What it delivers                                                                   | Key risk                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Database transactions and mutation safety    | Persistence, RPCs, privileges, edit/delete guards, concurrency and upgrade proof   | A bypass or stale snapshot permits overbooking.                |
| 2. Services, API and authoritative read models  | Existing CRUD through RPC, reservation endpoints, DTOs and explicit errors         | Old callers discard reservation state or misclassify outcomes. |
| 3. Reservation UI and safe existing editing     | Preview/choice/confirm/cancel, guarded editors, feedback and focused browser cases | Lost replies cause unsafe retries or misleading UI.            |
| 4. Integrated verification and release evidence | Smoke, complete recovery suite, CI and supported-browser evidence                  | Layer tests miss an end-to-end regression.                     |

**Prerequisites:** Node from `.nvmrc`, installed dependencies, local Supabase/Mailpit, Docker and the existing Chromium setup. No implementation or deployment was performed during planning.
**Estimated effort:** Roughly 6–9 focused implementation/verification sessions across four phases; an estimate, not a measured commitment.

## Open Risks & Assumptions

- Database privilege changes and the compatible application must ship together; phase 1 is not a standalone production release. Rollback must preserve reservation data and guarded writes.
- Writes within one account queue intentionally; other accounts remain independent. Independent-session tests must prove lock waiting and fresh-state checks.
- Existing other tabs/pages update on explicit refresh/navigation. After a lost delete acknowledgement, current state can recover but the complete cancellation list is deferred to S-06.
- Research inspected source; runtime guarantees remain to be proved during implementation. Firefox and phone checks are manual alongside the existing Chromium suite.

## Success Criteria (Summary)

- Persisted US-01 passes: 150 recorded / 88 reserved / 62 available; insufficient second reservation; release enables the second without consuming stock.
- Concurrent/replayed requests, foreign IDs, guarded edits and deletions preserve ownership and reservation totals.
- Preview, manual choice, stale best-fit and lost-response recovery work through the UI; automated gates and supported-browser checks are recorded.

## References

- [PRD v3](../../foundation/prd.md), [roadmap](../../foundation/roadmap.md), [research](research.md) and [full plan](plan.md).
- The full plan links affected source contracts and the current Supabase/PostgreSQL documentation used for the concurrency/security design.
