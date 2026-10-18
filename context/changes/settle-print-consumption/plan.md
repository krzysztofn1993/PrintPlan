# Settle Print Consumption Implementation Plan

## Overview

Deliver roadmap S-07: settle a completed print using actual filament consumption exactly once, release its reservation, and cancel other reservations newest first until they fit the remaining recorded stock. Preserve a durable result so a lost response never causes another deduction or loses cancellation feedback.

The author confirmed HIGH complexity and three product decisions on 2026-10-17: require an active reservation; accept whole grams including 0 g; keep completed prints in the existing collection, read-only except for deletion. The four phases below were approved before writing. This plan builds on [the completed research](research.md) at repository revision `5587b2184b889c752f8d615ed7728c3221e2b1ef`.

## Current State Analysis

Stock, planned prints, reservations, best-fit/manual selection and release already exist. Product mutations serialize through an owner mutex, enforce ownership in database functions, retain reservation request evidence, and invalidate stale print versions. Settlement persistence, terminal print state, actual-consumption input and durable settlement feedback are missing.

The browser currently refreshes prints and clears its uncertainty guard after that read alone. Reservation services also perform projection reads after a successful mutation; those reads can fail after commit. Settlement must return its durable result independently and use a dedicated recovery completion condition. Existing SQL, controlled concurrency, populated migration, Node, HTTP and Chromium suites provide the verification seams; no additional runner is needed.

The research remains the codebase baseline. Its references were checked against the unchanged revision, and the proposed receipt and lifecycle contracts were checked against the current mutation/read paths. These are source findings; no application tests or deployed schema checks were performed during planning. AGENTS.md's statements that reservations are planned and no browser runner exists are stale; its language, shared UI and ownership rules still apply.

## Desired End State

- Only an unsettled print with a current active reservation offers settlement. Its exact reservation identifies the consumption spool. A released or automatically cancelled reservation, or deletion of its spool, makes the print ineligible until it has a new active reservation.
- Actual consumption accepts integers from **0 through 2,147,483,647 g**, with no safety margin or rounding. Reject missing, negative, fractional, nonfinite and out-of-range values at the relevant browser, HTTP and direct-RPC boundaries.
- One transaction deducts actual grams from recorded stock, releases the completed print's reservation, cancels the minimum newest-first prefix of other reservations needed to restore the stock invariant, marks the print settled and saves the complete result.
- Consumption above recorded stock succeeds, stores 0 g of estimated stock, cancels every other reservation on that spool, and explains that the entered estimate was exceeded. Equality with recorded stock does not trigger that warning.
- Completed prints remain in their existing order in the current collection, labelled Completed with actual grams and access to their settlement result. They allow Delete, but no Edit, Reserve, Release or Settle action. Deletion does not restore consumed stock or remove retained settlement evidence.
- Repeat clicks, identical retries, new-key repeats and concurrent operations never deduct consumption twice for a print. Result recovery identifies cancelled reservations even after later deletion or renaming of their product records.
- After a confirmed result, the UI refreshes all print rows and the relevant spool's recorded/reserved/available values. Failed reads preserve the confirmed result and require reconciliation before further collection mutations.

### Key Discoveries:

- [PRD:121](../../foundation/prd.md#L121) fixes cancellation ordering as reservation `created_at DESC, id DESC`; [PRD:125](../../foundation/prd.md#L125) fixes deduction and the exceeded-estimate rule.
- [Reservation migration:55](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L55) provides the shared owner lock; [reserve:267](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L267) demonstrates lock acquisition before state reads and replay checks before current-row checks.
- [Reservation request evidence:40](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L40) survives product deletion and supports terminal request states. [Release:313](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L313) targets the exact original reservation, protecting replacements.
- [Print trigger:80](../../../supabase/migrations/20261012000000_create_prints.sql#L80) increments versions on updates. Settlement and collateral cancellations must invalidate their respective print versions.
- [PrintList:220](../../../src/components/prints/PrintList.tsx#L220) clears uncertainty after a print-list read, while [its actions:707](../../../src/components/prints/PrintList.tsx#L707) treat a null reservation as eligible for reservation. Both need an explicit settlement discriminator.
- [Migration runner:226](../../../scripts/migration-persistence.mjs#L226) rejects unknown migration inventories. [Its upgrade scenario:355](../../../scripts/migration-persistence.mjs#L355) must gain committed active reservations and request evidence before applying settlement persistence.

## What We're NOT Doing

- Settling unreserved prints, choosing a consumption spool separately, or falling back silently to a replacement reservation.
- Fractional grams, applying a safety margin to actual consumption, reversing settlement, editing settled requirements or reusing the same print identity for another physical print.
- A separate completed-print section, a history route, queue filters, or hidden completion records. Completed rows stay in the existing collection until deleted.
- Account margin settings, automatic reservation recalculation after edits, or S-06's complete reserved-spool maintenance and deletion-recovery flow.
- Automatic redistribution of cancelled reservations, print priorities, printer integration, file import or new infrastructure.
- Reopening the previously deferred general print refresh/write overlap F1, adding visual snapshot tests, or claiming Firefox/phone coverage from desktop Chromium alone. Settlement's own pending/recovery coordination is included.
- Production implementation, commits or deployment during this planning task.

## Implementation Approach

Extend the existing route → service → authenticated database-function boundary. Keep the owner mutex, direct-write restrictions, exact reservation identity and version protocol. A private settlement ledger owns once-per-print evidence and immutable result snapshots; nullable public print completion fields supply the ordinary owner-scoped read model without granting access to that private ledger.

### Transaction and persistence contracts

| Area              | Required contract                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private ledger    | Add `private.print_settlements` with a settlement UUID, owner, request UUID, print UUID, reservation UUID, expected print version, actual grams, settlement timestamp and immutable receipt JSON. Enforce uniqueness for `(user_id, request_id)` and `(user_id, print_id)`. Only the account foreign key cascades on deletion; print/spool identities and receipt snapshots survive product deletion.                                                    |
| Public completion | Add nullable `settlement_id`, `settled_at` and `actual_grams` to `public.prints`, with an all-null or all-present valid combination. Populate them together with the ledger in the settlement transaction. Existing prints remain unsettled without changing their versions or timestamps.                                                                                                                                                               |
| Mutation RPC      | `settle_print_consumption(p_request_id uuid, p_print_id uuid, p_expected_version integer, p_reservation_id uuid, p_actual_grams numeric)` returns an immutable receipt plus a separate replay indicator. Derive the spool from the exact active reservation; never accept a client-selected substitute spool. Validate explicit nulls and numeric bounds as well as HTTP inputs.                                                                         |
| Replay order      | Authenticate and validate command shape, acquire the owner lock, check retained request evidence, then check retained print settlement evidence, then inspect current print/version/reservation. An identical same-key retry returns the original receipt before current-row checks. A reused key with different command parameters conflicts. A different key for an already settled print conflicts as `already_settled`, even after product deletion. |
| Stock transition  | With pre-settlement recorded grams `S` and actual grams `A`, store `max(0, S - A)`. Remove the completed print's reservation without another stock deduction. Cancel other reservations in `created_at DESC, id DESC` order until surviving reserved grams are at most the new recorded grams. Stop immediately when they fit, including exact equality.                                                                                                 |
| Terminal evidence | Mark the completed print's and each cancelled reservation's matching reserve-request evidence `released`, setting `completed_at`. Keep those rows so reserve replays cannot resurrect allocations. Increment each affected print version once; setting completion fields advances the completed print through the existing trigger.                                                                                                                      |
| Other commands    | Reject settled prints in `update_print`, reservation preview and new reservation creation, with `print_settled`. Preserve terminal reserve replay precedence. Existing exact-identity release remains an idempotent no-op after settlement; deletion remains allowed and never deletes the ledger.                                                                                                                                                       |
| Result read RPC   | `read_print_settlement(p_print_id uuid)` reads only the authenticated owner's retained evidence. Return the receipt if present, including after deletion; return null only when the owner has an existing unsettled print; otherwise return the same `not_found` for foreign and missing IDs. It does not change product state.                                                                                                                          |
| Privileges        | Keep the private schema/table inaccessible to application roles. Both new public RPCs authenticate explicitly, use owner predicates, `SECURITY DEFINER` and an empty search path, revoke PUBLIC/anon execution and grant authenticated execution. Preserve product-table direct-write restrictions.                                                                                                                                                      |

### Durable receipt and application contracts

The immutable `SettlementReceipt` contains `schemaVersion: 1`, `id`, `requestId`, `printId`, `reservationId`, `expectedVersion`, `actualGrams`, `settledAt`, `exceededEstimate`, a print snapshot (`id`, nullable name, material, colour, required grams), a spool snapshot (`id`, material, colour, recorded grams before/after, reserved grams after, available grams after), `releasedGrams`, and ordered `cancelledReservations`. Each cancellation retains `reservationId`, `printId`, nullable `printName`, material, colour and `releasedGrams`. Snapshot totals describe the settlement transaction, not current stock after later operations. Receipt snapshots use the existing canonical labels without later reconstruction from live rows.

`PrintDto` gains required `settlement: null | { id, settledAt, actualGrams }`. All three completion columns must agree; a settled print with an active reservation is invalid read state. Extend the mapper, selected columns, database types and browser decoder together, including existing fixture producers. Append completion columns to the existing `planned_prints` view without changing existing column names/order or its invoker-security setting.

At `/api/prints/[id]/settlement`, POST accepts exactly one text value for `requestId`, `expectedVersion`, `reservationId` and `actualGrams`; the path supplies print identity and the authenticated session supplies ownership. Use digits-only whole-gram input, including 0, and supported form content types. Return HTTP 200 `{ settlement: SettlementReceipt, replayed: boolean }` directly from the RPC result, without making success depend on subsequent projection reads. GET returns HTTP 200 `{ settlement: SettlementReceipt | null }` under the read-RPC rules above. Both responses use the existing private/no-store header policy.

Keep named HTTP outcomes: 401 unauthenticated with sign-in guidance; 404 missing/foreign identity; 409 `already_settled`, `idempotency_conflict`, `edit_conflict`, `reservation_changed`, `reservation_required` or `print_settled` as applicable; 422 malformed/invalid form or input; 415 unsupported media; 405 unsupported method with Allow; and existing sanitized 500/503 handling for unexpected failures/outages. A 409 `already_settled` directs the owner to GET the saved receipt rather than treating the submitted new amount as applied. Known business rejection means that invocation made no changes; it does not erase uncertainty from an earlier invocation. Never return raw database/provider errors.

### Recovery contracts

PrintList owns draft text, the exact submitted command and request ID, pending state, receipt state and reconciliation state. Freeze a command when submitted and reuse it unchanged for that attempt. Retain a draft and its identity through failed recovery and panel close/reopen. New intentional input after a definitive rejection starts a new attempt. No receipt or draft is stored in browser persistent storage.

A valid POST/GET receipt confirms the original settlement independently of current projections. Display its consumed grams, ordered cancellations and exceeded-estimate warning immediately; projection failure must not turn that confirmed outcome into a failed or unknown settlement. Fetch fresh `/api/prints` and `/api/spools`, decode the full lists, update affected rows from the print collection, and find the receipt's spool. A successfully read list with that spool absent means it was deleted; show that state with the historical receipt instead of presenting zero current stock. The three current stock quantities come from one current spool DTO, never from mixed historical/current arithmetic. These reads do not promise a shared cross-request snapshot or real-time synchronization.

If the receipt cannot be read, keep uncertainty and disable ordinary collection mutations. A successful GET returning null means only that no committed result was visible at that instant; an earlier POST can still commit later. Keep the original command and offer explicit exact same-key resubmission to resolve that attempt safely. Do not unlock changed-input/new-key retries from null plus fresh lists alone. A definitive rejection of that exact retained command after the owner lock and both ledger checks, such as a stale version or missing original reservation, establishes that this attempt cannot settle against the current state; its immutable version/reservation preconditions cannot become valid again. After fresh collection reads succeed, show the not-applied outcome, retain draft text and allow a new intentional attempt against a new eligible state. A transport failure, unrelated-command rejection or non-locking null GET does not establish this outcome.

Once a receipt is known, retry only failed reconciliation reads; never resubmit the settlement to refresh stock. Clear the settlement guard only after both current collections have been decoded successfully. Failed reconciliation retains the receipt, draft/command evidence and a usable retry action. Ordinary Refresh list cannot bypass this condition or replace settlement feedback with a generic refreshed message. On session expiry, retain the current screen's evidence and offer Sign in; after login/reload, completed DTOs and Review settlement retrieve the durable result by print identity. A successful receipt remains reviewable if the current print was deleted. Focus returns to the completed row's Review settlement control, or to the collection heading/add control if the row is absent.

## Critical Implementation Details

### Timing and lifecycle

The owner lock must be acquired in a separate statement before state-dependent product reads, following the existing VOLATILE/Read Committed protocol. Both same-key and already-settled ledger checks precede current-row checks, because successful settlement removes its active reservation and the user may later delete its product rows.

### State sequencing

Persist the deduction, every release/cancellation, completion fields and immutable receipt in one transaction. In the browser, a known receipt and a successful current-stock refresh are separate facts: absence of a receipt is not proof of rollback, and failed projection reads do not undo a confirmed settlement.

## Phase 1: Atomic settlement and durable evidence

### Overview

Establish the once-per-print database contract and prove correctness against existing data, restricted callers and competing mutations.

### Changes Required:

#### 1. Additive settlement migration

**File**: `supabase/migrations/20261017000000_settle_print_consumption.sql` (new)

**Intent**: Add terminal state and durable feedback without rewriting historical migrations or breaking existing reservation workflows. Perform settlement as one owner-serialized operation and protect settled prints through every supported mutation entry point.

**Contract**: Implement the persistence, RPC, replay, stock transition, lifecycle and privilege contracts above; append completion fields to `planned_prints`. Preserve safe delayed release and product deletion, with receipt retention through account lifetime.

#### 2. Database behavior and controlled concurrency

**Files**: `supabase/tests/settlements.test.sql` (new), `supabase/tests/reservations.test.sql`, `scripts/reservation-concurrency.mjs`

**Intent**: Prove arithmetic, ownership, terminal behavior and serialization using the database's real restricted roles and observed lock waits. Extend the existing controlled concurrency harness rather than launching unobserved parallel requests.

**Contract**: Add the SQL and race cases in Testing Strategy. Observe the expected PostgreSQL blocker under Read Committed, commit the holder, then assert the waiter's result and final stock, versions, reservations and durable evidence. Retain independent-owner progress and cleanup.

#### 3. Populated upgrade preservation

**File**: `scripts/migration-persistence.mjs`

**Intent**: Demonstrate preservation of committed stock, prints, active reservations and replay evidence through the additive migration.

**Contract**: Extend the named inventory and seed reservations through the supported authenticated RPC before taking pre-settlement-migration snapshots. Compare all prior fields and ledger evidence after upgrade, verify new completion fields are null without version/timestamp changes, then prove settlement works on an upgraded reservation. Clean up the disposable database on success and failure.

### Success Criteria:

#### Automated Verification:

- Database settlement and existing contracts pass with restricted-role ownership, arithmetic, replay and lifecycle assertions: `npx supabase test db`.
- Observed-lock concurrency cases pass with one deduction, valid surviving reservations and independent-owner progress: `npm run test:reservations:concurrency`.
- The populated upgrade preserves committed product, reservation and request evidence and supports settlement afterward: `npm run test:migrations`.

## Phase 2: API and durable result contracts

### Overview

Expose settlement and result recovery through the existing authenticated transport and strict browser read model.

### Changes Required:

#### 1. Settlement boundary modules and route

**Files**: `src/lib/settlement-validation.ts`, `src/lib/settlement-dto.ts`, `src/lib/settlements.ts`, `src/lib/settlement-response.ts`, `src/pages/api/prints/[id]/settlement.ts` (new)

**Intent**: Keep validation, database outcomes, durable-result decoding and HTTP responses explicit and testable. Return the committed receipt without introducing a read-after-commit failure into the command's success path.

**Contract**: Implement the command, receipt, GET/POST and named error contracts above. Share existing privacy/error utilities where appropriate, retain causal diagnostics server-side, and make authenticated receipt reads independent of current product existence. Decode every nested receipt field and numeric invariant; malformed success remains uncertain rather than being accepted partially.

#### 2. Print completion projection and existing failure mapping

**Files**: `src/types/database.ts`, `src/lib/prints.ts`, `src/lib/print-dto.ts`, `src/lib/print-response.ts`, `src/lib/reservations.ts`, `src/lib/reservation-response.ts`, `src/pages/api/prints/[id]/update.ts`

**Intent**: Carry completion through SSR, collection reads and browser parsing, and make existing edit/reservation endpoints report terminal conflicts clearly.

**Contract**: Add the completion fields/RPC types and required nullable settlement DTO. Map `print_settled` from supported print-update/reservation functions to HTTP 409 rather than a database failure. In `src/pages/api/prints/[id]/update.ts`, explicitly handle the `print_settled` service result before the database-error fallback and return HTTP 409 with error code `print_settled` and a clear message that completed prints cannot be edited. Keep current DTO gram bindings unchanged and reject inconsistent settled/reserved state.

#### 3. Native contracts and verification wiring

**Files**: `scripts/settlement-contracts.test.mjs` (new), `scripts/print-contracts.test.mjs`, `scripts/reservation-contracts.test.mjs`, `package.json`, `.github/workflows/ci.yml`

**Intent**: Protect the new input/result boundary and retain existing contract coverage as print DTOs evolve.

**Contract**: Add `test:settlements` using the existing native Node runner, include it in `verify:deploy` and the CI native job, and update existing fixture payloads to carry explicit completion nulls. Test valid zero/maximum, invalid numeric/form boundaries, exact RPC arguments, strict receipt parsing, direct receipt success without projection queries, business statuses and sanitized private failures.

### Success Criteria:

#### Automated Verification:

- Settlement input, DTO, service and response contracts pass: `npm run test:settlements`.
- Existing print and reservation contracts pass with completion-aware fixtures and terminal conflict mapping: `npm run test:prints` and `npm run test:reservations`.
- Native contracts, lint, type checks and build pass with settlement contracts included: `npm run verify:deploy`.

## Phase 3: Settlement form and completed rows

### Overview

Provide the approved flow in the current print collection and preserve usable result/recovery states.

### Changes Required:

#### 1. Presentational form and result panel

**File**: `src/components/prints/SettlementPanel.tsx` (new)

**Intent**: Make actual consumption explicit before an irreversible settlement, and explain the saved result using existing dashboard presentation components.

**Contract**: Accept state and callbacks from PrintList; reuse FormField, Button and Carbon feedback styles. Show the exact reserved spool and reservation, a labelled Actual consumption (g) field with whole-gram/zero support, and Confirm settlement. Explain that settlement releases this reservation and may cancel newer ones; zero also completes the print. Start with a blank field, preserving the submitted text on failures. Present actual grams, own released grams, ordered cancellation identities, exceeded-estimate feedback and clearly separated historical/current stock quantities.

#### 2. Owning collection state and lifecycle

**File**: `src/components/prints/PrintList.tsx`

**Intent**: Coordinate submission, exact replay and reconciliation with the existing collection mutation guard. Keep settled prints visible and prevent stale or completed controls from issuing new changes.

**Contract**: Implement the recovery contracts above. Offer Settle print only for an unsettled reserved row; completed rows offer Review settlement and Delete. Maintain collection ordering, guard duplicate clicks synchronously, invalidate obsolete reads/panels, preserve drafts through failed recovery, and prevent ordinary refresh from bypassing settlement reconciliation. Deleting a completed row never adjusts stock; use completed-aware confirmation and focus wording. Cancel before submission has no effect; closing an uncertain panel never clears its command or guard. With a known result, closing the panel may hide its presentation but cannot clear a reconciliation guard or discard the saved review path.

#### 3. Dashboard explanation and form semantics

**Files**: `src/pages/dashboard/prints.astro`, existing shared UI/style components only if a genuinely missing semantic primitive is needed

**Intent**: Explain how planned and completed rows share the page and how actual consumption differs from required/reserved grams.

**Contract**: Keep the current route and shell, update English copy for completion, and retain SSR error/privacy handling. Use design tokens and shared components, accessible error associations, live status and logical keyboard focus; add no literal dashboard colours or arbitrary sizing.

### Success Criteria:

#### Automated Verification:

- The settlement UI integrates with strict DTOs and the existing native/type/build gates: `npm run verify:deploy`.

#### Manual Verification:

- Keyboard use supports entering 0 g or positive whole grams, confirming once, reading result feedback and returning focus to an existing review control.
- Completed rows remain visible after refresh, show actual consumption and offer only review/delete; deleting one leaves consumed stock unchanged.

**Implementation Note**: Complete the automated criteria, then obtain author confirmation of this phase's manual checks before advancing to Phase 4. Record execution state only in Progress.

## Phase 4: End-to-end recovery and release verification

### Overview

Prove the complete persisted workflow, browser failure recovery and integration with the repository's existing gates.

### Changes Required:

#### 1. Authenticated HTTP acceptance

**Files**: `scripts/settlement-smoke.mjs` (new), `scripts/smoke.mjs`, existing smoke helpers as needed

**Intent**: Verify settlement through the built application using real sessions and independently read persisted data.

**Contract**: Wire the new scenario into `npm run smoke`. Prove ownership and anonymous denials, zero/positive settlement, automatic cancellation feedback, exceeded-estimate feedback, same/new-key retries, completed mutation rejection, exact persistence after fresh login, and receipt access after product deletion. Explicitly assert that an edit submitted to `/api/prints/[id]/update` for a completed print with its current version returns HTTP 409 with error code `print_settled` and leaves the persisted print unchanged. Compare unrelated same-owner and other-owner records; retain generated fixture cleanup.

#### 2. Browser recovery and fixture lifecycle

**Files**: `tests/e2e/settlement-recovery.spec.ts` (new), `tests/e2e/fixtures.ts`, existing browser helpers/specs only for affected DTO fixtures

**Intent**: Test the rendered states HTTP smoke cannot prove, using real writes with acknowledgement faults at the browser boundary.

**Contract**: Add fixture settlement/result helpers and completion-aware records. Cover validation, held requests/duplicate-click prevention, committed settlement with unreadable success or masked 5xx/network acknowledgement, failed then successful receipt and collection reads, null receipt while an original POST is still held before commit, exact replay recovery, definitive stale-command rejection with no saved settlement, confirmed receipt with failed stock refresh, expired-session sign-in guidance, deletion during recovery, and result review after reload. Assert persisted stock and completion through independent API reads, including cancellation identities and estimate warning. Cleanup removes remaining product rows; retained receipts are removed by the existing generated-account teardown.

#### 3. Verification documentation and integration

**Files**: `.github/workflows/ci.yml`, `context/foundation/test-plan.md`, `AGENTS.md`, `context/changes/settle-print-consumption/verification.md` (created during implementation)

**Intent**: Make the completed feature's proof reproducible and remove documentation claims superseded by its implementation.

**Contract**: Retain existing CI database/concurrency/migration/browser/smoke jobs and include the new suites through their normal discovery/wiring. Record settlement patterns in the test-plan cookbook and replace its now-expired settlement deferral with S-07 coverage and remaining evidence limits; do not reopen unrelated strategy. Correct AGENTS.md's stale reservation/browser-runner baseline and add the settlement contract gate where applicable. Verification distinguishes local automated passes, author checks, simulated response faults and any unobserved remote CI or hosted behavior.

### Success Criteria:

#### Automated Verification:

- The complete native gate passes with settlement contracts wired in: `npm run verify:deploy`.
- SQL behavior, observed-lock concurrency and populated upgrades pass: `npx supabase test db`, `npm run test:reservations:concurrency`, and `npm run test:migrations`.
- Chromium settlement and existing recovery suites pass with persisted-state assertions: `npm run test:e2e`.
- Authenticated settlement and existing smoke scenarios pass against a separate built preview with local Supabase/Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual Verification:

- In current Chrome and Firefox and on a phone, the form, completed rows, cancellation feedback and stock review remain readable and usable without clipped controls.
- The author confirms ordinary, 0 g and exceeded-estimate settlement, result review after refresh/login, and completed deletion without a stock refund.

**Implementation Note**: After the automated gates pass, obtain author confirmation of the manual acceptance checks before treating the change as complete. Report unavailable checks explicitly rather than marking them passed.

## Testing Strategy

### Unit Tests:

Use independent literal oracles for 0, 1 and 2,147,483,647 g, and rejection of negative, fractional, over-limit, blank, whitespace, signed/exponent/nonfinite strings, duplicate fields, files, unknown fields and invalid identifiers/versions. Cover receipt field types, nested snapshots, ordered cancellation preservation, arithmetic consistency, completion nullability and settled/reserved contradictions. A valid mutation receipt must succeed without querying current projections; failure to decode it must never count as confirmed success.

### Integration Tests:

- **Ordinary arithmetic:** 150 g recorded, an 80 g requirement reserving 88 g, actual 75 g → 75 g recorded, 0 g reserved and 75 g available. In a separate identical starting fixture, actual 0 g → 150 g recorded, 0 g reserved and 150 g available; the print is still completed. Include actual consumption equal to and greater than its own reservation.
- **Cancellation prefix:** 300 g recorded, own reservation 88 g, oldest other reservation 66 g, next 55 g and newest 44 g. Actual 200 g → 100 g recorded; cancel 44 g then 55 g, leaving 66 g reserved and 34 g available. Force equal creation timestamps to verify descending reservation-ID ties. Test no cancellations when totals already fit, and stop at exact fit.
- **Estimate boundary:** on a fresh 150 g fixture, actual 150 g gives zero stock without exceeded-estimate feedback; actual 151 g gives zero with that feedback. Both release/cancel all positive reservations as needed; no message claims the physical spool must be empty.
- **Exactly once:** same key/same parameters returns the same immutable receipt; changed amount/version/reservation/print for the same key conflicts. A new key for the same settled print conflicts, including after deleting the print or spool. Old reserve requests remain terminal and delayed release never touches a replacement reservation. Failed commands leave complete state unchanged.
- **Restricted access:** authenticate SQL/RPC calls as the real owner or another user, deny anonymous execution and direct ledger/product writes, and make foreign/missing receipt lookups indistinguishable. Privileged access is limited to fixture setup, private-evidence assertions and cleanup.
- **Controlled races:** same-print settlement with matching and different keys; two different prints on one spool; settlement versus reserve, exact release, replacement reservation, print edit/delete and spool correction/delete. Exercise both meaningful lock orders, including committed effects observed by waiters. Verify one deduction, correct terminal outcomes, cancellation version bumps and independent-owner progress.
- **Persistence and recovery:** independently read acknowledged data, repeat after fresh login, preserve populated upgrade fixtures, and recover immutable receipts after later rename/deletion. Forward real browser writes before masking acknowledgements; test receipt absence before a pending commit without treating that absence as rollback. Keep known receipt success through projection failures.

### Manual Testing Steps:

1. Create the 150 g / 80 g / 88 g example, settle with 75 g and inspect all three current stock values and the completed row. Repeat with a separate 150 g spool and a new reserved print using actual 0 g.
2. Use the 300 g fixture above, settle with 200 g and check that the displayed cancellation order is newest 44 g followed by 55 g, leaving the older 66 g reservation.
3. Compare separate 150 g and 151 g consumption fixtures against 150 g stock; only the latter explains that the estimate was exceeded.
4. Review a saved result after refresh and a fresh login, then delete a completed print and verify that stock is unchanged. Check keyboard focus, Chrome, Firefox and phone layout as specified in the phase criteria.

## Performance Considerations

Preserve owner-level serialization for the PRD's small user base; different owners remain independent. Select only the owner's affected spool reservations and stop cancellations when the invariant is restored. Reuse the current owner/spool lookup and paginated collection reads; do not introduce polling, background jobs or a new cache. Receipts grow with the number of actual cancellations, so return the complete operation result without silently truncating required identities. This plan makes no unmeasured latency or scale claim.

## Migration Notes

Apply the additive migration before application code that selects completion columns or calls settlement RPCs. Existing records gain null completion fields, with no backfill settlement, timestamp changes or inferred consumption. Seed committed reservations before the upgrade test so it proves more than an empty-schema rebuild. Earlier database phases remain compatible with ordinary existing reads; deploy the complete application only after all phases and required gates.

After any real settlement, preserve the ledger and completion evidence during application rollback. Do not drop the migration or return to an application version that presents settled rows as ordinary unreserved prints. Prefer a forward fix; if settlement must be suspended, disable its entry point while retaining completed read-only behavior and result lookup. Never restore stock by deleting settlement evidence. Account deletion removes retained evidence via its account foreign key. No retention purge or separate history feature is introduced.

## References

- [S-07 research](research.md), [change identity](change.md), [plan brief](plan-brief.md), [PRD](../../foundation/prd.md), [roadmap S-07](../../foundation/roadmap.md#s-07-settle-actual-consumption-once), [selected stack](../../foundation/tech-stack.md), [lessons](../../foundation/lessons.md).
- [Owner lock and reservation ledger](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L40), [print version trigger](../../../supabase/migrations/20261012000000_create_prints.sql#L80).
- [Print service and DTO](../../../src/lib/prints.ts#L25), [browser decoder](../../../src/lib/print-dto.ts#L8), [collection recovery](../../../src/components/prints/PrintList.tsx#L220), [reservation route pattern](../../../src/pages/api/prints/[id]/reservation/reserve.ts#L15).
- [Native reservation contracts](../../../scripts/reservation-contracts.test.mjs), [observed-lock concurrency](../../../scripts/reservation-concurrency.mjs#L285), [populated upgrade](../../../scripts/migration-persistence.mjs#L355), [browser fixtures](../../../tests/e2e/fixtures.ts#L54), [CI](../../../.github/workflows/ci.yml#L51), [test strategy](../../foundation/test-plan.md).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Atomic settlement and durable evidence

#### Automated

- [x] 1.1 Database settlement and existing contracts pass with restricted-role ownership, arithmetic, replay and lifecycle assertions: `npx supabase test db`. — 74b878c
- [x] 1.2 Observed-lock concurrency cases pass with one deduction, valid surviving reservations and independent-owner progress: `npm run test:reservations:concurrency`. — 74b878c
- [x] 1.3 The populated upgrade preserves committed product, reservation and request evidence and supports settlement afterward: `npm run test:migrations`. — 74b878c

### Phase 2: API and durable result contracts

#### Automated

- [x] 2.1 Settlement input, DTO, service and response contracts pass: `npm run test:settlements`.
- [x] 2.2 Existing print and reservation contracts pass with completion-aware fixtures and terminal conflict mapping: `npm run test:prints` and `npm run test:reservations`.
- [x] 2.3 Native contracts, lint, type checks and build pass with settlement contracts included: `npm run verify:deploy`.

### Phase 3: Settlement form and completed rows

#### Automated

- [ ] 3.1 The settlement UI integrates with strict DTOs and the existing native/type/build gates: `npm run verify:deploy`.

#### Manual

- [ ] 3.2 Keyboard use supports entering 0 g or positive whole grams, confirming once, reading result feedback and returning focus to an existing review control.
- [ ] 3.3 Completed rows remain visible after refresh, show actual consumption and offer only review/delete; deleting one leaves consumed stock unchanged.

### Phase 4: End-to-end recovery and release verification

#### Automated

- [ ] 4.1 The complete native gate passes with settlement contracts wired in: `npm run verify:deploy`.
- [ ] 4.2 SQL behavior, observed-lock concurrency and populated upgrades pass: `npx supabase test db`, `npm run test:reservations:concurrency`, and `npm run test:migrations`.
- [ ] 4.3 Chromium settlement and existing recovery suites pass with persisted-state assertions: `npm run test:e2e`.
- [ ] 4.4 Authenticated settlement and existing smoke scenarios pass against a separate built preview with local Supabase/Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual

- [ ] 4.5 In current Chrome and Firefox and on a phone, the form, completed rows, cancellation feedback and stock review remain readable and usable without clipped controls.
- [ ] 4.6 The author confirms ordinary, 0 g and exceeded-estimate settlement, result review after refresh/login, and completed deletion without a stock refund.
