# Maintain a Reserved Spool Implementation Plan

## Overview

Complete the bounded S-06 maintenance flow: help users correct recorded stock without violating active reservations, identify cancellations after a confirmed spool deletion, and give truthful guidance when a deletion result cannot be confirmed. Reuse the existing database invariants and API contracts.

The author approved a narrower scope after reviewing the lost-response scenario on 2026-10-17. Durable recovery of the original cancellation list is explicitly deferred. This decision supersedes the research handoff's proposed durable-result investigation and S-03's assignment of that work to S-06.

## Current State Analysis

The research baseline is commit `5587b2184b889c752f8d615ed7728c3221e2b1ef` on `maintain-reserved-spool`. Only the existing change artifacts were untracked when planning began; this plan does not authorize implementation.

`update_spool` already serializes mutations per owner and rejects recorded stock below active reservations. Equality is allowed; changing canonical material or colour while reserved requires cancellation first. `delete_spool` already cancels all reservations on the owned spool, preserves affected prints, advances their versions, and returns cancellation details atomically.

The remaining correction issue is in the browser. A `409 stock_below_reservations` message interpolates the form's old `reservedGrams`, which can be outdated. The form retains its draft after rejection, but the existing collection refresh closes the editor and discards it. A rejected correction therefore needs a dedicated way to refresh saved reservation quantities while retaining the attempted inputs.

Confirmed deletion already displays cancellation details. An uncertain deletion blocks collection mutations until a readable stock refresh; that refresh reconciles live inventory but cannot reconstruct the original cancellation list. Keep that limitation explicit. There is no evidence that this feedback gap corrupts persisted stock or reservations.

## Desired End State

- With 150 g recorded and an 88 g reservation, a correction to 87 g is rejected without changing either record; 88 g is accepted and leaves 0 g available.
- A guardrail rejection explains that enough reservations must be cancelled first without presenting an old quantity as the current server minimum. The user can refresh reservation quantities while retaining their correction draft and can navigate to planned prints to manage reservations.
- If reservations change during editing, refreshed recorded/reserved/available quantities and reservation-aware controls reflect the last successful read. The raw correction remains an unsaved draft; refresh never clamps or submits it.
- A readable deletion success identifies every cancelled reservation, including print identity and released grams, and leaves the prints unreserved. A lost or unreadable response instead gives uncertainty guidance and an explicit route to inspect current stock and planned prints.
- Failed or unreadable stock reconciliation retains the existing uncertainty guard. Successful reconciliation permits review and a new deliberate action, never an automatic repeat of deletion.

### Key Discoveries:

- `supabase/migrations/20261016000000_reserve_and_release_material.sql:118` and `:143` already implement the correction guardrail and atomic deletion summary; no migration is required.
- `src/components/spools/SpoolForm.tsx:189` uses the stale DTO in conflict text; `:215` currently confirms draft disposal before an uncertain-save refresh.
- `src/components/spools/SpoolInventory.tsx:69` validates the live list before replacing state and closing editors. Its stable spool-keyed form at `:421` provides a seam for preserving a correction while its backing DTO changes.
- `tests/e2e/reservation-recovery.spec.ts:237` covers ordinary reserved deletion, while `tests/e2e/spool-recovery.spec.ts:174` masks a real committed unreserved deletion. Extend these patterns instead of setting up another runner.
- `supabase/tests/reservations.test.sql:69` and `scripts/reservation-concurrency.mjs:378` already protect correction boundaries and competing reserve/correction/deletion operations.

## What We're NOT Doing

- Durable deletion receipts, deletion command identities or replay, history/inbox screens, read acknowledgements, retention policies, or restoration of cancellation lists across refresh, navigation, session expiry, login, or devices.
- Inferring an original cancellation list from current prints or treating spool absence as proof of that list. An absent spool without a receipt remains an absent spool.
- Expected-version protection for competing spool edits, automatic cancellation during stock correction, automatic correction/clamping, or automatic resubmission.
- Persisting correction drafts across navigation, reload, or login; adding cancellation controls or a new filtered print workflow inside the stock editor. Ordinary navigation may discard the draft.
- Broad structured-receipt/parser hardening deferred in S-03 review F3, including unrelated print/reserve/release parsers. Preserve existing unreadable-JSON and missing-array recovery behavior.
- Account margin settings, reserved-print recalculation, settlement, realtime synchronization, new backend endpoints, migrations, dependency upgrades, or runner setup.

## Implementation Approach

Keep collection state, reads, and mutation handlers in `SpoolInventory`, and keep raw inputs and field feedback in `SpoolForm`. Separate a known rejected correction from an uncertain mutation: only the former gets a dedicated refresh that keeps its editor and draft. Reuse `GET /api/spools` and its complete DTO validation for both refresh intents. Existing uncertain create/update/delete reconciliation keeps its close-and-review behavior.

Use a generic guardrail message on rejection. Display numeric recorded/reserved/available values and the minimum hint from the latest readable DTO as a snapshot, with the database remaining authoritative at every save. Provide a normal link to `/dashboard/prints` for cancellation; do not silently cancel reservations or promise draft restoration after navigation.

Retain the current delete endpoint's empty form and `{id, cancelledReservations}` success shape. For readable results, preserve all returned cancellations. For uncertain results, direct users to current stock and planned prints without claiming the original cancellation details were recovered. Reuse the dashboard design contract and existing feedback/button components.

## Phase 1: Correct stock with current reservation guidance

### Overview

Make rejected corrections actionable without reporting a stale minimum or losing the user's draft during a dedicated reservation refresh.

### Changes Required:

#### 1. Guardrail feedback and reservation actions

**File**: `src/components/spools/SpoolForm.tsx`

**Intent**: Explain guardrail rejection using truthful text, offer a reservation-state refresh, and link to planned prints. Retain raw input after rejection and refresh; show a distinct error if that refresh fails.

**Contract**: Handle the existing `409 stock_below_reservations` and `reserved_spool_change_requires_cancellation` codes without an asserted current minimum from the pre-submit DTO. Add a callback for the dedicated known-rejection refresh; keep the existing uncertain-save refresh separate. Refresh updates hints and disabled matching-label controls from the new DTO, never submits the draft, and reliably releases pending state after failure.

If the refreshed DTO has active reservations and the retained material or colour draft conflicts with its saved matching labels, explain the conflict and offer an explicit `Use saved material and colour` button. Only that deliberate action replaces both matching-field inputs with the labels from the latest successfully read DTO; preserve the raw recorded-grams draft. The button performs no additional request, save, or reservation cancellation and is disabled while a request is pending. Refresh itself never overwrites the draft. The database still validates the subsequent deliberate save.

#### 2. Refresh saved quantities while retaining the correction

**File**: `src/components/spools/SpoolInventory.tsx`

**Intent**: Reuse authoritative list reads while keeping the same editor mounted for the dedicated correction refresh. Preserve the existing collection guard for uncertain mutation outcomes.

**Contract**: Distinguish the refresh intent at the collection boundary. Only a completely readable list replaces saved DTOs; keep the active spool ID and form identity for the correction intent. A missing target closes its editor with an explicit no-longer-available message, never a saved message. Failed reads retain the prior list and draft. Prevent competing interactions during the read; a known rejection is not a committed or uncertain save.

#### 3. Correction browser regressions

**Files**: `tests/e2e/reservation-recovery.spec.ts`, `tests/e2e/helpers/ui.ts` only if existing helpers need a small extension.

**Intent**: Verify the real guardrail and the stale-reservation case through the actual app. Reuse authenticated fixture APIs for competing reservation changes.

**Contract**: Cover 87 g rejection and 88 g equality with an 88 g reservation. Separately start with 200 g recorded and 88 g reserved, open a 100 g draft, then add a 55 g reservation: the 100 g save must fail against 143 g reserved. A dedicated refresh retains `100` and updates the hint to 143 g; after explicitly releasing the 55 g reservation, another refresh permits a deliberate 100 g save with 88 g reserved and 12 g available. Include failed refresh and disappeared-target outcomes without automatic saves.

Also open an unreserved 200 g Black spool, draft Red and `100`, then create an 88 g reservation against the saved Black spool through the fixture API. After the rejected save and dedicated refresh, verify that Red and `100` remain, matching-label fields are disabled, and the explicit restoration action is available. Clicking `Use saved material and colour` restores the latest saved material and Black colour while retaining `100`; assert that the action sends no GET or POST and leaves persisted stock and the reservation unchanged. A subsequent deliberate save succeeds with 100 g recorded, 88 g reserved, and 12 g available.

### Success Criteria:

#### Automated Verification:

- Correction browser cases pass: `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts`, proving 87/88 g boundaries, the 88-to-143 g stale-total case, draft preservation, failed refresh, and disappearance handling.
- Existing native spool and reservation contracts pass: `npm run test:spools` and `npm run test:reservations`.
- The matching-label restoration browser case passes: `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts`, proving that an unreserved-to-reserved transition preserves the draft, explicit label restoration retains grams without requests or writes, and a deliberate subsequent stock correction succeeds.

## Phase 2: Explain confirmed and uncertain spool deletion

### Overview

Keep complete feedback for received deletion results and make the limits of lost-response reconciliation clear.

### Changes Required:

#### 1. Deletion feedback and navigation

**File**: `src/components/spools/SpoolInventory.tsx`

**Intent**: Give users a clear next step when deletion may have committed, including access to current planned-print reservations. Retain the complete normal-success cancellation message.

**Contract**: Received success continues to identify print IDs, names or label fallbacks, and released grams for all valid server-produced cancellation entries. Uncertain deletion feedback states that deletion may have completed and offers stock refresh plus a link to `/dashboard/prints`; it never promises historical cancellation recovery. List refresh does not repeat the POST or fabricate a summary. Keep the current endpoint and parser scope.

#### 2. Multiple-reservation deletion and uncertainty browser cases

**Files**: `tests/e2e/reservation-recovery.spec.ts`, `tests/e2e/spool-recovery.spec.ts`

**Intent**: Prove received feedback is complete and a genuinely committed reserved deletion remains safe when its response is lost.

**Contract**: Use a 200 g spool with 88 g and 55 g reservations, capturing their exact reservation IDs before deletion. A readable result identifies both prints and released quantities; fresh authenticated reads show both prints survive unreserved and an unrelated spool remains unchanged. In a separate forward-then-mask case, commit the real deletion and return unreadable JSON. Assert one browser deletion POST, blocked mutations, retained guard after a failed stock refresh, and successful later reconciliation without a cancellation-history claim. Keep the existing unreserved-deletion survivor regression.

### Success Criteria:

#### Automated Verification:

- Reserved and unreserved deletion browser cases pass: `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts tests/e2e/spool-recovery.spec.ts`, including both cancellation identities, lost committed response, failed refresh, surviving prints, unchanged unrelated stock, and one deletion POST.
- Existing database safety regressions pass: `npx supabase test db` and `npm run test:reservations:concurrency`.

## Phase 3: Verify the bounded S-06 outcome and record evidence

### Overview

Run the integrated gates and record both delivered behavior and the explicitly accepted feedback limitation.

### Changes Required:

#### 1. Verification record

**File**: `context/changes/maintain-reserved-spool/verification.md`

**Intent**: Record commands, outcomes, browser acceptance, and the agreed scope so completion does not imply durable deletion-history recovery.

**Contract**: Distinguish executed automated checks from human checks and unobserved hosted behavior. Record the new boundary/stale-total/multiple-reservation/lost-response scenarios, any actual failures, browser/device details supplied during manual acceptance, and the retained recovery limitation. No mandatory screenshot artifact is introduced.

### Success Criteria:

#### Automated Verification:

- The complete native, lint, type and production-build gate passes: `npm run verify:deploy`.
- The complete configured browser suite passes: `E2E_PORT=4326 npm run test:e2e`.
- The existing authenticated smoke suite passes against a separately running production preview: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual Verification:

- On current Chrome and Firefox plus a phone viewport/device, the user can follow the rejection, refresh, and cancellation guidance; refresh preserves the correction draft, controls remain keyboard reachable, and all received cancellation details are readable.
- Verification records the author's acceptance that lost-response recovery shows current data only and cannot restore the original cancellation list; this limitation is not reported as recovered history or an unimplemented in-scope feature.

## Testing Strategy

### Native and database tests

Reuse the existing quantity, service, owner isolation, correction equality, reserved-label, and deletion transaction tests. Re-run controlled concurrency scenarios to protect reserve-versus-correction and reserve-versus-delete behavior. No new database contract, receipt parser, or mutation helper needs implementation-specific unit tests for this UI change.

### Browser tests

Use real authenticated fixture APIs and independent reads of persisted spools and prints. Intercept only the browser transport boundary when simulating a failed read or unreadable acknowledgement, forwarding the actual deletion first. Verify mutation request counts and persisted state as well as visible text. Reuse fixture tracking and cleanup; do not reset shared database state or introduce receipt-ledger cleanup.

The stale-total arithmetic is fixed: 80 g at 10% reserves 88 g; another 50 g at 10% reserves 55 g; total reserved is 143 g. A retained 100 g draft is rejected at 143 g, then accepted after explicitly releasing the 55 g reservation, leaving 12 g available. Test the final predicate and persisted values, not just the presence of a refresh button.

### Manual Testing Steps

1. Reserve 88 g from 150 g; attempt 87 g, then save 88 g and inspect 0 g available.
2. Reproduce the 200 g / 143 g reserved / 100 g draft case, refresh quantities without losing the draft, and follow the planned-prints link to manage reservations. Navigation itself does not preserve the draft.
3. Delete a spool carrying two reservations and inspect both cancellation descriptions and the surviving unreserved prints.
4. Use the automated lost-response evidence alongside the UI guidance to confirm that no message claims historical recovery. Check the new feedback/actions with keyboard navigation and a narrow viewport.

## Performance Considerations

Use the existing bounded, complete inventory-list read on explicit user refresh. Add no polling, background recovery, extra per-row queries, or new account-wide mutation work. Render the existing received cancellation list completely.

## Migration Notes

No schema migration, historical backfill, RPC signature change, new HTTP contract, or browser-storage migration is needed. Existing persisted spools and reservations remain compatible. Application rollback reverts the UI/test changes without a data rollback.

For implementation prerequisites, use Node from `.nvmrc` and locked dependencies. Database/concurrency/browser/smoke verification requires the local Supabase/Mailpit services and Docker; browser runs need installed Chromium and a free `E2E_PORT`. The browser runner owns its build/preview, so start the separate smoke preview only after it finishes. Implementation verification remains pending at plan creation.

## References

- [Research](research.md) — current-state evidence and original planning handoff; the conversation-approved scope here supersedes its durable-recovery proposal.
- [PRD](../../foundation/prd.md) — FR-002, FR-005, FR-006, stock correction guardrail, and automatic cancellation feedback.
- [Roadmap](../../foundation/roadmap.md) — S-06 and its S-03 prerequisite.
- [S-03 brief](../../archive/2026-10-16-reserve-and-release-material/plan-brief.md) — correction/matching decisions and historical deletion-feedback deferral.
- [S-03 implementation review](../../archive/2026-10-16-reserve-and-release-material/reviews/impl-review.md) — accepted F3 parser-hardening and F9 screenshot deferrals.
- [Test stack](../../foundation/test-stack.md), `package.json:16`, `playwright.config.ts:12` — existing verification layers and runner prerequisites.
- `src/components/spools/SpoolForm.tsx:189`, `src/components/spools/SpoolInventory.tsx:69`, `src/components/spools/SpoolInventory.tsx:172` — affected browser contracts.
- `supabase/migrations/20261016000000_reserve_and_release_material.sql:118`, `supabase/tests/reservations.test.sql:69`, `scripts/reservation-concurrency.mjs:378` — existing authoritative behavior and regressions.

## Progress

### Phase 1: Correct stock with current reservation guidance

#### Automated

- [x] 1.1 Correction browser cases pass: `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts`, proving 87/88 g boundaries, the 88-to-143 g stale-total case, draft preservation, failed refresh, and disappearance handling.
- [x] 1.2 Existing native spool and reservation contracts pass: `npm run test:spools` and `npm run test:reservations`.
- [x] 1.3 The matching-label restoration browser case passes: `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts`, proving that an unreserved-to-reserved transition preserves the draft, explicit label restoration retains grams without requests or writes, and a deliberate subsequent stock correction succeeds.

### Phase 2: Explain confirmed and uncertain spool deletion

#### Automated

- [ ] 2.1 Reserved and unreserved deletion browser cases pass: `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts tests/e2e/spool-recovery.spec.ts`, including both cancellation identities, lost committed response, failed refresh, surviving prints, unchanged unrelated stock, and one deletion POST.
- [ ] 2.2 Existing database safety regressions pass: `npx supabase test db` and `npm run test:reservations:concurrency`.

### Phase 3: Verify the bounded S-06 outcome and record evidence

#### Automated

- [ ] 3.1 The complete native, lint, type and production-build gate passes: `npm run verify:deploy`.
- [ ] 3.2 The complete configured browser suite passes: `E2E_PORT=4326 npm run test:e2e`.
- [ ] 3.3 The existing authenticated smoke suite passes against a separately running production preview: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual

- [ ] 3.4 On current Chrome and Firefox plus a phone viewport/device, the user can follow the rejection, refresh, and cancellation guidance; refresh preserves the correction draft, controls remain keyboard reachable, and all received cancellation details are readable.
- [ ] 3.5 Verification records the author's acceptance that lost-response recovery shows current data only and cannot restore the original cancellation list; this limitation is not reported as recovered history or an unimplemented in-scope feature.
