# Reserve and Release Material Implementation Plan

## Overview

Deliver roadmap S-03: preview best-fit or an eligible manual spool, reserve material with the default 10% margin, and release that reservation without consuming recorded stock. Extend existing writes and reads so reservations remain correct under concurrent requests, retries, edits and deletions.

The author approved HIGH complexity, four substantive decisions and the four phases below. This document authorizes planning only; implement through `/10x-implement reserve-and-release-material phase 1`.

## Current State Analysis

Planning baseline: `12740e410d13a8d098093a9bfa57ae147a673dd4` on `feat/reserve-and-release-material`, created from freshly fetched `master` / `origin/master`. Its source tree matches the research baseline `dbc6326`; the newer commit merges that work. Existing uncommitted PRD v3, roadmap v3 and S-03 research were preserved. No domain glossary exists; terminology follows the PRD and existing spool/print contracts.

Spools and planned prints already support private CRUD, SSR and React collections. There is no reservation persistence or RPC contract. Spool DTOs expose reserved/available grams but currently return zero reservations. Print DTOs and both browser parsers contain no reservation state. Existing authenticated table grants permit writes that would bypass reservation checks placed only in HTTP handlers.

Print edits already use `expectedVersion`. The print collection guards uncertain mutations until a readable refresh succeeds. Stock recovery is weaker and must be extended where the new safety/feedback workflow depends on it. Native contract tests, SQL fixtures, authenticated smoke, a populated migration runner and a Chromium recovery suite already exist; no setup project is needed.

## Desired End State

- With matching material/colour, 150 g stock and two 80 g prints, the first reservation commits 88 g, leaving 62 g available. The second is rejected; cancelling the first releases exactly 88 g and permits the second. Recorded stock remains 150 g throughout.
- Preview shows the margin-adjusted amount, suggested spool and eligible manual alternatives before confirmation. The database revalidates confirmation. A changed best-fit suggestion requires a fresh preview and confirmation, even if the previously displayed spool still fits. An explicit manual selection remains usable while eligible.
- Each print has at most one active reservation. Availability is recorded stock minus the sum of active reservations; reservations never exceed that stock. Two identical print records remain independent.
- A reserved print permits name-only editing. Changing its stored normalized material, colour or required grams requires cancellation first, until S-05 introduces recalculation. Unchanged values in the existing full edit payload remain valid.
- A reserved spool rejects changes that alter its canonical material or colour matching key until its reservations are cancelled. Stock corrections remain available when recorded grams stay at or above the reserved total; equality is allowed. Canonically equivalent label input does not change matching.
- Deleting a spool cancels its reservations and leaves surviving prints unreserved; deleting a print releases its reservation. Successful deletion receipts identify cancelled reservations and released grams, and the UI displays that information. Reconstructing the full cancellation list after a lost deletion acknowledgement is deferred to S-06; current state must still reconcile safely.
- Refresh and later login retain committed reservations. No owner can read or mutate another owner's data, including through direct RPC calls, guessed identifiers or request-key collisions.

### Key Discoveries:

- Existing direct grants are the critical bypass: `supabase/migrations/20261010000000_create_spools.sql:80` and `supabase/migrations/20261012000000_create_prints.sql:106`.
- Margin, rounding and deterministic ordering are already settled: `context/foundation/prd.md:119` and `:121`; do not reopen them.
- Reservation-aware mutation safety belongs in S-03, while complete editing workflows follow in S-05/S-06: `context/foundation/roadmap.md:110`.
- Shared services own the placeholder/read and mutation seams: `src/lib/spools.ts:29`, `:85` and `src/lib/prints.ts:16`, `:130`.
- Both print browser parsers reconstruct DTOs and would discard new fields: `src/components/prints/PrintList.tsx:25` and `src/components/prints/PrintForm.tsx:29`.
- Existing recovery and migration infrastructure can be extended: `src/components/prints/PrintList.tsx:158`, `scripts/migration-persistence.mjs:210`, `tests/e2e/print-recovery.spec.ts:133`.

## What We're NOT Doing

- Account-margin configuration or settings UI (S-04); this slice uses the server-owned default of 10%.
- Automatic recalculation/reassignment after editing a reserved print (S-05), including implementing it early under the name of an edit guard.
- Automatic cancellation after changing a spool's matching attributes, or complete reserved-spool maintenance and recovery of deletion cancellation details (S-06).
- Actual-consumption settlement, deductions or newest-first settlement cancellation (S-07).
- Automatic replacement of an active reservation, splitting one print across spools, queue optimisation, public history screens, realtime updates or automatic cross-tab synchronisation.
- A new component system, authentication redesign, deployment platform change or production deployment during planning.

## Implementation Approach

Use PostgreSQL RPCs as the authoritative write boundary. Serialize every spool/print mutation for an owner through one private mutex row, acquired before any product-row reads or locks. This is appropriate for a small personal inventory: independent accounts proceed independently, while writes within one account queue. Remove authenticated direct table mutation privileges and migrate the existing six CRUD writes to the same boundary.

Persist active reservations separately from a private successful-reservation-request ledger. The latter prevents an old successful reserve command from resurrecting a reservation after cancellation or deletion. A browser request UUID is scoped to its owner; the database generates the reservation identity independently. The same request UUID with different command parameters conflicts. Replaying the original successful command reports its current disposition without adding a reservation; a completed/released command returns a readable conflict requiring reconciliation. No public history feature is introduced.

Derive the owner from verified request identity at the HTTP boundary and from `auth.uid()` inside RPCs. Privileged functions check ownership explicitly, use an empty search path with qualified relations, and grant execution only to the required role. Private locking/ledger helpers are not exposed. Keep SELECT protected by owner RLS; use security-invoker read views for reservation-aware projections. No service-role client is needed.

Compute `ceil(requiredGrams * (100 + marginPercent) / 100)` with database numeric arithmetic. Canonical material and persisted `colour_key` determine matching. Rank eligible spools by available grams after reservation ascending, then `created_at` ascending and identifier ascending. Use one server-owned margin calculation seam for preview and confirmation; retain the applied margin, reserved grams, selection provenance and creation time on the committed reservation for later slices.

Advance the existing print version on reservation creation, release and automatic cancellation, as well as ordinary edits. Reserve validates the preview's version; cancellation targets the exact reservation ID. A stale cancellation of A must never release a later reservation B. Return current committed read models, rather than inventing optimistic arithmetic in the browser.

## Critical Implementation Details

### State sequencing

Mutation functions must be `VOLATILE` under Read Committed. Acquire the owner mutex in an earlier statement, then read product state and totals in subsequent statements so a waiter sees the preceding committed mutation. A check performed before waiting, or a lock/check combined around an old snapshot, is not the consistency protocol.

### Timing & lifecycle

Apply the new migration and compatible application as one coordinated release after all phases pass. Existing application writes cannot continue after their table privileges are revoked. Preserve cancellation/replay evidence when a spool or print is deleted; only account deletion may cascade the private request ledger.

### Numeric bounds

Existing requirements and spool stock allow up to 2,147,483,647 whole grams. Margin-adjusted demand can exceed this, up to 4,294,967,294 g at 100%; preview must represent it accurately and report insufficient material without integer overflow or reducing the margin. Active reservations cannot exceed a spool's valid stock.

## Phase 1: Database transactions and mutation safety

### Overview

Create the authoritative persistence and operation contracts, close direct-write bypasses and prove the consistency protocol with independent database sessions.

### Changes Required:

#### 1. Additive reservation persistence and read projections

**Files**: new `supabase/migrations/20261016000000_reserve_and_release_material.sql`; `src/types/database.ts`.

**Intent**: Introduce active reservations without changing existing spool/print data. Provide owner-scoped projections that calculate real reservation totals in a single query snapshot.

**Contract**: Active reservations contain server-generated ID, owner, print, spool, whole reserved grams, applied margin, `best_fit`/`manual` selection provenance and creation time. Enforce one active reservation per print, positive grams, valid percentage snapshots and same-owner relationships through database constraints. Private mutex and successful-request tables have no authenticated direct writes; the request ledger keeps original command parameters and reservation identity after cancellation or product deletion. Add security-invoker `spool_inventory` and `planned_prints` views, preserving base columns and adding totals / nullable reservation data; their underlying SELECT grants and RLS must prevent cross-owner disclosure.

#### 2. Shared transactional operations and existing CRUD protection

**File**: the new migration.

**Intent**: Make every supported application write participate in the same invariant, including writes through the Supabase REST/RPC surface.

**Contract**: Expose `create_spool`, `update_spool`, `delete_spool`, `create_print`, `update_print`, `delete_print`, `preview_print_reservation`, `reserve_print_material` and `release_print_material`. Mutations derive their owner, acquire its private mutex before product reads, then validate and commit atomically. Preserve normalization, quantity limits, creation/update timestamps and print edit-version semantics. Explicitly preserve positive stock on spool creation: it previously depended on an INSERT RLS policy that a definer function bypasses. Revoke INSERT/UPDATE/DELETE on base tables from PUBLIC, anon and authenticated, including effective inherited/column write access; reserve table writes for trusted operation functions. Preserve owner-scoped SELECT.

**Contract**: Reserve rechecks version, active-reservation absence, current best-fit or explicit manual eligibility, and availability. A successful request replay is resolved before rejecting its now-old print version; it must not write again. New request keys cannot replace active reservations. Release uses the exact reservation identity and owner's retained request record; repeating release is a successful no-op with current state. Deletions atomically release all affected reservations and capture cancellation summaries. Surviving affected prints advance version. Reserved-print edits allow only name changes; reserved-spool matching changes and stock reductions below reservations produce explicit business conflicts. No operation alters recorded grams merely to reserve or cancel.

#### 3. Database contracts, deterministic concurrency and upgrade proof

**Files**: new `supabase/tests/reservations.test.sql`; existing `supabase/tests/spools.test.sql`, `supabase/tests/prints.test.sql`; new `scripts/reservation-concurrency.mjs`; `scripts/migration-persistence.mjs`; `package.json`.

**Intent**: Prove correctness against the real database and preserve the existing populated-upgrade guarantee.

**Contract**: Move authenticated supported-write fixtures to RPCs and assert direct DML denial, including effective column privileges. Retain ownership, normalization, numeric and CRUD behavior checks. Add SQL cases for US-01, canonical matching, rounding, best-fit ties, exact-fit stock, manual choice, version invalidation, the agreed edit guards, deletion, replay and stale cancellation. Add `test:reservations:concurrency`: separate authenticated sessions, one holding an uncommitted mutation while an observer proves a competitor is blocked, followed by commit and fresh-state assertions. Bound waits and guarantee cleanup. Cover both operation orderings for reserve/stock-reduction and reserve/deletion, plus reserve/reserve, duplicate request, release/re-reserve/stale cancel, and another owner proceeding independently. Extend the migration inventory and seed committed prints as well as spools before applying the reservation migration; compare every pre-existing field afterwards.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` passes existing and reservation contracts, including denied direct writes and owner isolation.
- `npm run test:reservations:concurrency` proves blocking, fresh-state rechecks, no overbooking, replay safety and independent-owner progress with bounded cleanup.
- `npm run test:migrations` preserves populated spools and prints across the new additive migration.
- `npm run verify:deploy` passes with the extended database types and no unrelated source changes.

## Phase 2: Services, API and authoritative read models

### Overview

Connect the database contract to existing CRUD and add private reservation endpoints with precise, validated outcomes.

### Changes Required:

#### 1. Shared reads and existing mutations

**Files**: `src/lib/spools.ts`, `src/lib/prints.ts`, `src/types/database.ts`; existing spool/print API routes and dashboard SSR callers where required.

**Intent**: Replace placeholder amounts and direct mutation calls without creating different SSR/API interpretations of stock.

**Contract**: Retain all `SpoolDto` fields and calculate `reservedGrams`/`availableGrams` from the shared view. Extend every `PrintDto` with mandatory `reservation: null | { id, spoolId, reservedGrams }`. Use the views for paged collection reads, retaining deterministic collection ordering and current pagination limitations. All six CRUD helpers call their matching RPC and map its confirmed result; no fallback to direct writes. Create/edit receipts contain the same reservation-aware DTOs as GET and SSR. Existing delete responses retain `id` and add `cancelledReservations: [{ reservationId, printId, printName, material, colour, releasedGrams }]`; a deleted print receipt also identifies its affected spool and post-release stock when present.

#### 2. Reservation endpoints and strict payloads

**Files**: new `src/lib/reservations.ts`, `src/lib/reservation-validation.ts`, `src/lib/reservation-response.ts`; new routes under `src/pages/api/prints/[id]/reservation/` (`index.ts`, `reserve.ts`, `cancel.ts`).

**Intent**: Expose advisory preview and atomic commands using the existing verified identity, form transport and private-cache conventions.

**Contract**:

| Route                                      | Input                                                                                           | Confirmed result                                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/prints/:id/reservation`          | Print ID in path                                                                                | `{ printId, expectedVersion, marginPercent, reservationGrams, suggestedSpoolId, eligibleSpools }`; eligible spools use `SpoolDto` and deterministic best-fit order. An empty list is a readable insufficient-material preview. |
| `POST /api/prints/:id/reservation/reserve` | Single text `requestId`, `expectedVersion`, `spoolId`, `selectionMode` (`best_fit` or `manual`) | HTTP 200 with `{ reservationId, disposition: "active", print, spool }`; same successful request returns current state without another write.                                                                                   |
| `POST /api/prints/:id/reservation/cancel`  | Single text `reservationId`                                                                     | HTTP 200 with `{ reservationId, disposition: "released"                                                                                                                                                                        | "already_released", print, spool }`; current print/spool may be null after deletion. A later replacement remains intact. |

**Contract**: Validate identifiers, supported media types, one value per field and exact allowlists; reject file values and forged owners, amounts, margins or availability. Preserve request-scoped Supabase/cookie headers. Unknown and foreign print/reservation IDs are indistinguishable 404s. GET on an already reserved print returns `already_reserved` with current state. Confirmation never silently substitutes another spool. If best-fit changed while A remains eligible, return `selection_stale` without writing; if no eligible stock remains return `insufficient_material`. A manual choice that disappeared or no longer fits returns a readable conflict and requires a new preview.

#### 3. Business outcomes and native contract coverage

**Files**: `src/lib/print-response.ts`, `src/lib/spool-response.ts`, reservation response helpers; existing CRUD routes; new `scripts/reservation-contracts.test.mjs`; existing print/spool contracts; `package.json`.

**Intent**: Keep expected conflicts distinguishable from unexpected failures and protect every caller of the expanded DTO/receipt contract.

**Contract**: Use 409 codes `edit_conflict`, `already_reserved`, `selection_stale`, `insufficient_material`, `reserved_print_edit_requires_cancellation`, `reserved_spool_change_requires_cancellation`, `stock_below_reservations`, `idempotency_conflict` and `reservation_request_completed` as applicable. The last means an earlier successful request was released/deleted and cannot be resurrected; the client must reconcile. Invalid payloads remain 422, unauthenticated requests 401, infrastructure failures 503 and unexpected failures 500. Mutation network/5xx/unreadable-success outcomes require fresh-state review; preserve original server causes without leaking request data. Tests cover the service/RPC interface, DTO preservation, error mappings, private headers, auth/cookie propagation, validators and existing CRUD compatibility. Add `test:reservations` to `verify:deploy`.

### Success Criteria:

#### Automated Verification:

- `npm run test:reservations` passes preview, confirmation, cancellation, payload/authentication, replay and receipt contract cases.
- `npm run test:spools` and `npm run test:prints` pass with real reservation-aware DTO contracts while retaining unreserved fixture expectations.
- `npm run verify:deploy` passes with all existing mutations using RPC and SSR/GET/mutation responses sharing the same read contract.

## Phase 3: Reservation UI and safe existing editing

### Overview

Deliver the complete user interaction using the current collection owners and dashboard design contract.

### Changes Required:

#### 1. Preview, selection, confirmation and release

**Files**: `src/components/prints/PrintList.tsx`; new `src/components/prints/ReservationPanel.tsx`; shared reservation DTO parsing helper under `src/lib/`; `src/pages/dashboard/prints.astro`.

**Intent**: Make reserve/release understandable without conflating print requirements, reserved material and actual consumption.

**Contract**: `PrintList` owns collection state, request handlers, pending coordination, request UUIDs and uncertainty guards. The panel presents the server's adjusted grams and margin, labels the best-fit suggestion, offers eligible manual alternatives and requires confirmation. Display reservation ID/assigned spool and reserved grams alongside the unchanged `requiredGrams` binding. Provide empty/insufficient, loading, ready, pending, stale/conflict, success and failure feedback. A stale automatic suggestion reloads preview and requires another confirmation; switching to a manual choice records manual provenance. Cancellation targets the displayed reservation ID and explains that stock is not consumed. Replays or responses that no longer describe the intended current state require reconciliation rather than optimistic success. Update the page's obsolete future-margin copy.

#### 2. Reservation-aware edit parsing and cancellation feedback

**Files**: `src/components/prints/PrintForm.tsx`, `src/components/prints/PrintList.tsx`, `src/components/spools/SpoolForm.tsx`, `src/components/spools/SpoolInventory.tsx`; shared UI only where a concrete gap exists.

**Intent**: Preserve reservation fields across create/edit/refresh and make the agreed temporary guards and deletion effects visible.

**Contract**: Both print response parsers consume one shared strict DTO parser and reject unreadable reservation state. Reserved-print editors expose the name and explain cancellation before requirement changes. Stock editors explain the matching-label restriction and the minimum allowed recorded grams; the database remains authoritative. Show cancelled reservation summaries from confirmed deletes, distinguishing otherwise identical prints by ID. Retain `recordedGrams`, `reservedGrams`, `availableGrams` and `requiredGrams` bindings. Reuse current buttons, inline panels, feedback classes and tokens; a labelled native select/radio group is sufficient for spool choice. Keep handlers and mutations in the owning collections.

#### 3. Uncertain outcomes and focused browser coverage

**Files**: `PrintList.tsx`, `SpoolInventory.tsx`, `SpoolForm.tsx`; `tests/e2e/fixtures.ts`; new `tests/e2e/reservation-recovery.spec.ts`.

**Intent**: Prevent a lost acknowledgement from presenting a retry as an uncommitted action or discarding useful user input.

**Contract**: A network failure, unreadable success or mutation 5xx keeps the relevant collection guarded until a fully readable authoritative refresh succeeds. Failed refresh preserves the guard and current panel/draft. Extend stock recovery sufficiently to apply the same rule to reservation-affecting updates/deletes; do not leave 503 deletions presented as safely retryable. Already-open other pages remain stale until explicit refresh/navigation. Recover current print/spool state after a lost delete acknowledgement without claiming to reconstruct the deferred cancellation list. Cover the primary reserve/manual/cancel flow, changed best-fit with A still eligible, name-only editing, both edit guards, confirmed deletion feedback, keyboard focus and successful reserve/cancel writes whose acknowledgement is masked after the real request completes.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` passes primary interaction, stale selection, guarded editing, deletion feedback and lost-acknowledgement reconciliation against real persistence.
- `npm run verify:deploy` passes with shared DTO parsing, existing design tokens and collection-owned mutations.

#### Manual Verification:

- Keyboard use reaches selection, confirmation and cancellation; focus returns to an appropriate surviving action and status/error feedback is announced without relying on colour alone.
- At phone width the suggested/manual choices, required/reserved amounts, edit restrictions and cancellation summaries remain readable without horizontal scrolling.

## Phase 4: Integrated verification and release evidence

### Overview

Finish the regression, supported-browser and CI evidence for one coordinated release.

### Changes Required:

#### 1. Persisted HTTP acceptance and regression coverage

**Files**: new `scripts/reservation-smoke.mjs`; `scripts/smoke.mjs`; existing print/spool smoke modules where assumptions change.

**Intent**: Verify the public workflow through authenticated production-preview HTTP requests and fresh reads, not only mocked contracts.

**Contract**: Add US-01 through best-fit and manual choice, unchanged recorded stock, refresh/relogin persistence, foreign IDs, reservation-aware CRUD, stale print versions, duplicate request keys, cancellation/replacement safety and direct-write denial. Keep unreserved fixture assertions scoped to their fixtures. Update smoke checks that currently expect authenticated direct DML; retain wrong-owner denial and supported RPC CRUD assertions. The deterministic multi-session runner remains the proof of contested interleavings, rather than treating concurrent HTTP launch alone as that proof. Preserve bounded fixture cleanup.

#### 2. Recovery matrix, CI and verification record

**Files**: `tests/e2e/reservation-recovery.spec.ts`, `tests/e2e/fixtures.ts`; `.github/workflows/ci.yml`, `package.json`; new `context/changes/reserve-and-release-material/verification.md`; `context/foundation/test-plan.md` where its reservation exclusions become obsolete.

**Intent**: Make the new guarantees repeatable and record the actual limits of validation.

**Contract**: Include reservation native contracts in CI, run SQL and deterministic concurrency gates with local Supabase, and keep the populated-upgrade, full browser and authenticated smoke gates. Add browser cases for a committed reserve and a committed cancel followed by failed then successful reconciliation, and for stale cancellation after a replacement. Run the existing Chromium suite; verify current Firefox and a phone-sized browser manually without claiming automated Firefox coverage. Record commands, outcomes, source revision, screenshots and any unavailable environment dependency. Update only test-plan statements affected by this delivered feature; do not reopen its completed rollout.

### Success Criteria:

#### Automated Verification:

- `npm run verify:deploy` passes the complete native gate including reservation contracts.
- `npx supabase test db`, `npm run test:reservations:concurrency` and `npm run test:migrations` pass against the final migration inventory.
- `npm run smoke` passes against production preview with local Supabase/Mailpit, including persisted US-01, replay, isolation and existing CRUD regressions.
- `npm run test:e2e` passes the complete existing and reservation recovery suites; CI invokes every new required automated gate.

#### Manual Verification:

- Current desktop Chrome and Firefox complete best-fit/manual reserve, insufficient-stock feedback, cancellation, temporary edit guards and confirmed deletion feedback; screenshots and results are recorded in `verification.md`.
- A phone browser completes the same reservation workflow, and fresh navigation plus logout/login show committed quantities and reservation state.

## Testing Strategy

### Unit Tests:

- Native reservation contracts cover strict form validation, known business outcomes, private/authentication headers, DTO/receipt parsing and RPC parameter mapping. Update existing exact-field assertions rather than weakening them.
- Keep arithmetic/matching authority in database fixtures: default 10% (80 -> 88), ceiling with 81 g at 5% (86 g) through the internal calculation seam, 0%/100% boundaries, exact fit, excessive adjusted demand, canonical labels and deterministic ties. Non-default percentage tests exercise the calculation primitive, not an unimplemented account-setting feature.

### Integration Tests:

- SQL fixtures prove cardinality, ownership, privileges, snapshot preservation, version changes, both temporary edit predicates and deletion/release effects.
- Independent sessions prove actual lock waiting and fresh-state validation for the named races. Add replay after cancel/delete and same request ID across distinct owners; request UUID scoping must not disclose or collide with another owner's reservation identity.
- A populated scratch-database upgrade preserves complete existing rows, owners, canonical keys, timestamps and print versions. HTTP smoke proves the user-facing contract and persistence after later authentication.
- Browser tests forward the real mutation before masking its acknowledgement, then fail and recover the reconciliation read. Assert both UI state and independently read persisted state. Include malformed success receipts and an inaccessible/missing record without losing the uncertainty guard prematurely.

### Manual Testing Steps:

1. Add a matching 150 g spool and two separate 80 g prints. Confirm the 88 g preview and reservation; inspect 150 recorded / 88 reserved / 62 available after navigation to stock.
2. Attempt the second reservation, observe insufficient material, cancel the first and reserve the second. Confirm recorded stock remains 150 g.
3. Add multiple matching spools, use best-fit and then an eligible manual alternative. Change stock from another session so the displayed automatic suggestion changes while still eligible; confirm that a new preview requires fresh confirmation.
4. Rename a reserved print, attempt a requirement change and a reserved-spool matching change, then test corrections equal to and below the reserved total. Confirm permitted operations persist and rejected operations leave records unchanged.
5. Delete a reserved spool and inspect the identified cancelled reservations; inspect surviving unreserved prints after refresh. Delete a reserved print and confirm released availability. Repeat the main workflow after logout/login.
6. Check keyboard/focus, current Chrome/Firefox and a phone; record screenshots and actual results. Do not mark manual Progress rows complete from automated tests alone.

## Performance Considerations

Per-owner serialization intentionally trades same-account write concurrency for a small, auditable consistency boundary. Hold the mutex only inside database operations, never across UI preview/confirmation or external network calls. Index active reservations by owner/spool and enforce owner/print uniqueness; use existing canonical labels and owner indexes for eligibility reads. Avoid per-row HTTP queries or client-side scans to compute authoritative stock.

Collection pagination retains its existing non-snapshot semantics across separate requests; confirmation always revalidates atomically. No new hard latency target, realtime subscription or load-testing project is introduced for this small-user MVP. Preserve the private successful-request ledger for replay safety; do not prune it in a way that permits old commands to create new reservations.

## Migration Notes

Use one additive migration and preserve both existing migration files. Existing prints and spools remain unchanged and initially unreserved; do not backfill reservations or fabricate consumption. The mutex can be created lazily for existing owners. Generate/update types against the migrated local schema and prove effective privileges, not only migration text.

Ship database and application compatibility changes together after all phases pass. If application rollback is required after reservations exist, keep database write restrictions and reservation data intact; restore a reservation-aware compatible application or disable mutation access while applying a forward fix. Restoring the old unrestricted writes would violate the invariant, and dropping reservation tables would lose user state. No destructive rollback/reset of a populated or hosted database is part of this plan.

## References

- [S-03 research](research.md), grounded at `dbc6326` with unchanged source tree at planning baseline `12740e4`.
- [PRD v3](../../foundation/prd.md), especially US-01, FR-002–FR-006 and Business Logic.
- [Roadmap S-03 and follow-on boundaries](../../foundation/roadmap.md); [selected transactional RPC direction](../../foundation/tech-stack.md).
- `src/lib/spools.ts:29`, `src/lib/prints.ts:130`, `src/components/prints/PrintList.tsx:158`, `src/components/spools/SpoolInventory.tsx:119`.
- `scripts/migration-persistence.mjs:89`, `:210`; `tests/e2e/print-recovery.spec.ts:133`; `tests/e2e/fixtures.ts:44`.
- [Supabase database-function security](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker), checked through Context7 during planning.
- [PostgreSQL 17 function volatility](https://www.postgresql.org/docs/17/xfunc-volatility.html) and [explicit-lock consistency](https://www.postgresql.org/docs/17/applevel-consistency.html), checked through Context7 during planning.
- [PostgreSQL 17 privilege revocation](https://www.postgresql.org/docs/17/sql-revoke.html), independently checked in focused research.

## Progress

### Phase 1: Database transactions and mutation safety

#### Automated

- [x] 1.1 `npx supabase test db` passes existing and reservation contracts, including denied direct writes and owner isolation. — 9cbb455
- [x] 1.2 `npm run test:reservations:concurrency` proves blocking, fresh-state rechecks, no overbooking, replay safety and independent-owner progress with bounded cleanup. — 9cbb455
- [x] 1.3 `npm run test:migrations` preserves populated spools and prints across the new additive migration. — 9cbb455
- [x] 1.4 `npm run verify:deploy` passes with the extended database types and no unrelated source changes. — 9cbb455

### Phase 2: Services, API and authoritative read models

#### Automated

- [x] 2.1 `npm run test:reservations` passes preview, confirmation, cancellation, payload/authentication, replay and receipt contract cases.
- [x] 2.2 `npm run test:spools` and `npm run test:prints` pass with real reservation-aware DTO contracts while retaining unreserved fixture expectations.
- [x] 2.3 `npm run verify:deploy` passes with all existing mutations using RPC and SSR/GET/mutation responses sharing the same read contract.

### Phase 3: Reservation UI and safe existing editing

#### Automated

- [x] 3.1 `npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` passes primary interaction, stale selection, guarded editing, deletion feedback and lost-acknowledgement reconciliation against real persistence.
- [x] 3.2 `npm run verify:deploy` passes with shared DTO parsing, existing design tokens and collection-owned mutations.

#### Manual

- [x] 3.3 Keyboard use reaches selection, confirmation and cancellation; focus returns to an appropriate surviving action and status/error feedback is announced without relying on colour alone.
- [x] 3.4 At phone width the suggested/manual choices, required/reserved amounts, edit restrictions and cancellation summaries remain readable without horizontal scrolling.

### Phase 4: Integrated verification and release evidence

#### Automated

- [ ] 4.1 `npm run verify:deploy` passes the complete native gate including reservation contracts.
- [ ] 4.2 `npx supabase test db`, `npm run test:reservations:concurrency` and `npm run test:migrations` pass against the final migration inventory.
- [ ] 4.3 `npm run smoke` passes against production preview with local Supabase/Mailpit, including persisted US-01, replay, isolation and existing CRUD regressions.
- [ ] 4.4 `npm run test:e2e` passes the complete existing and reservation recovery suites; CI invokes every new required automated gate.

#### Manual

- [ ] 4.5 Current desktop Chrome and Firefox complete best-fit/manual reserve, insufficient-stock feedback, cancellation, temporary edit guards and confirmed deletion feedback; screenshots and results are recorded in `verification.md`.
- [ ] 4.6 A phone browser completes the same reservation workflow, and fresh navigation plus logout/login show committed quantities and reservation state.
