# Edit Reserved Print Implementation Plan

## Overview

Deliver roadmap S-05: allow a reserved planned print to be edited and atomically recalculate its reservation using the current account safety margin. Continue the same reservation identity and age when an allocation remains possible, protect stale commands with the existing print version, and save the print unreserved with explicit insufficient-material feedback when no spool fits.

The author approved HIGH complexity, four decision topics and the four phases below on 2026-10-22. Planning is based on research and source inspection at commit `d0d0b255a2043466bafeb45f79d673d8a2bbb868`; no implementation or runtime verification has been performed.

## Current State Analysis

- Reserved requirement fields are disabled in `src/components/prints/PrintForm.tsx:248`. Current `update_print` rejects changed material, canonical colour or required grams, while allowing names and semantically unchanged values (`supabase/migrations/20261018000000_settle_print_consumption.sql:45`).
- The database already serializes each owner's product mutations through `private.acquire_owner_mutation_lock`; the print trigger advances `version` on every UPDATE, including a no-op (`20261016000000_reserve_and_release_material.sql:55`, `20261012000000_create_prints.sql:88`, both under `supabase/migrations/`).
- Current preview/reserve use the saved margin, ceil-rounded grams, canonical matching and deterministic best-fit. Settings saves leave existing reservations unchanged (`supabase/migrations/20261019000000_preserve_margin_with_settlements.sql:39`, `:148`).
- Public reservation rows hold current selection mode, spool, margin, grams, ID and creation time. Private request evidence currently mixes the original reserve-command fingerprint with the spool consumed by release/settlement (`supabase/migrations/20261016000000_reserve_and_release_material.sql:7`, `:40`, `:313`; `20261018000000_settle_print_consumption.sql:370`).
- Cancellation currently takes only reservation and print IDs. Stable-ID recalculation therefore requires a version precondition for an active allocation. Settlement already checks the print version.
- `src/lib/prints.ts:193` rereads the print after update RPC success, so a failed later read can obscure a committed save. `PrintList.tsx:756` announces generic success; its refresh at `:820` reads only prints and clears uncertainty.
- Settlement supplies a reusable paired print/stock reconciliation pattern (`src/components/prints/PrintList.tsx:266`). Its durable receipt history is a reference, not a requirement for edits.

## Desired End State

Every successful save of a currently reserved print recalculates, including name-only, normalized-equivalent and unchanged submissions. It uses the margin read under the owner mutation lock, reuses its own held capacity, retains an eligible manual spool, and otherwise selects best-fit using the existing PRD ordering.

If a candidate fits, the reservation retains both its ID and original `created_at`, including after reassignment. The print version advances exactly once; this version is the freshness token for edits, cancellation and settlement. If none fits, the requirements still save, the old reservation is released and the print becomes unreserved. An ordinary unreserved edit never automatically reserves material; settled prints remain protected.

For example, a spool with 150 g recorded holds 88 g for an 80 g print at 10%. Changing settings to 5% alone leaves 88 g held. Saving that print, even without changed fields, reserves 84 g under the same reservation ID and timestamp, leaving 66 g available and recorded stock unchanged. A cancellation captured before this save conflicts while the reservation is active.

### Key Discoveries:

- Existing owner locking is the transaction boundary; release/edit/reserve as separate requests cannot meet the atomicity requirement.
- Keeping ID and creation time preserves cancellation priority exactly, including the existing ID tie-breaker (`supabase/migrations/20261018000000_settle_print_consumption.sql:400`).
- An immutable original reserve fingerprint must coexist with mutable current allocation evidence after a spool move. Updating the original fingerprint would change what an earlier request means.
- A plain GET cannot prove a previously submitted mutation has completed. An exact versioned retry through the same owner lock can establish that no request carrying that old version can still apply.

## What We're NOT Doing

- Durable edit receipts, edit request IDs, edit-history tables or receipt lookup endpoints.
- Browser storage for pending edits or recovery guarantees across reload/navigation; recovery state lasts while this page remains open.
- Replacing the reservation identity or resetting its age on successful recalculation.
- A separate reservation-version field: use the existing print version.
- Automatic reservation for unreserved edits, queue-wide recalculation or recalculation caused only by saving account settings.
- A new edit-time spool picker, editable per-print margins, settled-print editing, stock consumption during edits or a dashboard restyle.
- Guaranteed reconstruction of a lost edit outcome after subsequent changes; the chosen recovery contract provides safe resolution and current state.

## Implementation Approach

Use one append-only database migration and the existing update endpoint. Normalize and save the print once inside the owner-serialized transaction, then recalculate against the updated canonical requirements while excluding its existing allocation from capacity totals. Continue the reservation row in place or remove it for a successful no-fit edit. Preserve recorded stock throughout.

Separate original reserve-command evidence from the current spool with `private.reservation_requests.allocation_spool_id`, backfilled from `spool_id`. Add nullable `recalculated_at`, initially NULL for every existing request, as an explicit marker that a new S-05 edit superseded the original reserve command. Do not infer this marker from print-version arithmetic: legacy name-only edits already advanced versions before S-05 and must not lose their existing replay contract during upgrade.

Return the committed print projection and recalculation outcome directly from update RPC. The browser retains this known result separately from later current-state reads. For an unknown result, retain an immutable copy of the submitted edit and retry exactly that payload with its original expected version; then reconcile both collections. An unresolved retry or failed read keeps recovery guarded.

## Critical Implementation Details

### Timing and lifecycle

For cancellation, resolve exact owner/print/reservation evidence under the owner lock. If that reservation is absent, return `already_released` before comparing the current print version; otherwise the first successful release's own version increment would break its retry. For an active reservation, require the captured expected version before any release.

### State sequencing

Only a success or definitive business result emitted after entering the mutation lock resolves an uncertain edit. A version conflict during exact recovery means the old version can no longer apply; it does not prove the original edit failed. A successful collection read, validation rejection, expired session or transport/5xx failure alone must not clear pending-command uncertainty.

### Author-approved execution boundary

The first `10x-goal-implement` run is limited to Phases 1–3. After Phase 3's Automated criteria and commit are complete, end that run and report the pending manual checks; do not start, delegate, implement or verify Phase 4 in the same run. Leave Manual row 3.3 unchecked and keep `change.md` at `implementing`, because Phase 4 is still pending. This explicit author instruction overrides the skill's default automatic continuation past Manual rows.

The author will perform the manual checks before Phase 4. Resume with a separate invocation targeting Phase 4 only after the author confirms that the checks passed; record that confirmation and the actual results in `verification.md`. The first goal's completion condition must name Phases 1–3 only, so reaching the boundary completes that bounded run without claiming the entire change is implemented.

At this boundary, persist any remaining Phase 3 commit-SHA write-back and lifecycle metadata in a scoped checkpoint commit, keeping `change.md` at `implementing`. Do not run the full-plan completion epilogue or mark Phase 4 complete.

### Author-approved per-phase gates and intermediate compatibility

Keep the four phases as written. The common repository-wide gate after each phase is `npm run verify:deploy`, covering all native contracts, lint, types and the production build. Also run every Automated success-criteria command assigned to that phase, plus the skill's deliberate-break check when the phase adds or changes tests. A successful earlier phase does not establish complete application compatibility.

Phase 1 changes database contracts before Phase 2 updates API consumers; Phase 2 requires cancellation versions before Phase 3 updates the browser. These intermediate Phase 1–2 commits are intentionally not independently deployable. Do not deploy them or expose a partially upgraded application to users. Do not add temporary compatibility bypasses, weaken tests or move later acceptance work into earlier phases merely to make the transitional application pass complete browser/HTTP acceptance.

Run full browser acceptance with `npm run test:e2e` in Phases 3 and 4. Run final authenticated HTTP acceptance with `npm run smoke` in Phase 4, against its separately running production preview. The database, populated-upgrade and concurrency commands retain their existing phase assignments. This explicit author-approved schedule defines the autonomous skill's repository-wide checks for this change; browser and smoke acceptance are required at their scheduled phases rather than after every intermediate commit. Missing prerequisites or failing scheduled gates remain blockers, never skipped passes.

## Phase 1: Database and versioning

### Overview

Implement atomic recalculation and the database compatibility needed for a versioned, stable-ID reservation.

### Changes Required:

#### 1. Current allocation evidence and replay

**File**: new `supabase/migrations/20261022000000_recalculate_reserved_print.sql`

**Intent**: Preserve original reserve commands while recording the currently assigned spool. Prevent an old reserve retry from claiming that its superseded allocation is still the original result.

**Contract**: Backfill `allocation_spool_id` from `spool_id` on all private request rows and make it non-null; retain evidence after spool deletion, without a new spool foreign key. Backfill `recalculated_at` as NULL, including requests for historically renamed prints. Update current `reserve_print_material` inserts to populate allocation spool; retain fingerprint comparison first and existing terminal checks, then return `reservation_request_completed` for a recalculated request. Preserve settings-only active replay and legacy NULL amount witnesses. Keep original request ID, print/spool identity, selection mode, expected version and expected grams unchanged.

#### 2. Atomic update and allocation policy

**File**: the same new migration, replacing `public.update_print`

**Intent**: Let every reserved save apply the current margin and selection policy without competing with its own reservation or exposing intermediate stock states.

**Contract**: Keep the existing six edit arguments, authentication, owner lock, ownership, settled guard and expected-version checks. Save/normalize the print exactly once and use the resulting canonical fields. For a reserved print, exclude its hold from all candidate totals; retain an eligible current manual spool, otherwise choose best-fit by available grams, spool creation time, then ID ascending. Update the public row in place with effective mode, spool, grams and margin, preserving ID and creation time. A manual fallback becomes `best_fit` for subsequent edits. Update current allocation evidence and marker; on no-fit remove the row, terminalize its request as released and retain the last held spool in evidence. Invalid/stale edits roll back the entire transaction, including any evidence changes. Return the `{ print, recalculation }` transaction envelope specified in Phase 2, including the final version and reservation projection, from this migration.

#### 3. Versioned release and settlement compatibility

**File**: the same new migration, replacing `release_print_material` and `settle_print_consumption`

**Intent**: Reject stale cancellation after a stable-ID resize or reassignment, while keeping release retries and settlement accurate.

**Contract**: Release requires `(p_reservation_id, p_print_id, p_expected_version)` with a valid positive integer version. Remove the executable two-argument overload; NULL cannot bypass checking. Absent exact reservations remain terminal no-ops, even after deletion, settlement or a later reservation with a different ID. Active release checks current print version, then releases once and advances that version once. Release feedback and settlement evidence checks use `allocation_spool_id`; settlement keeps its current version guard, deduction logic and newest-first ordering. Restrict new/replaced functions with the existing empty search path, owner predicates and authenticated-only grants; private evidence stays inaccessible directly.

#### 4. Database acceptance and existing harness compatibility

**Files**: new `supabase/tests/edit-reserved-prints.test.sql`; existing `supabase/tests/reservations.test.sql`, `supabase/tests/settlements.test.sql`, `supabase/tests/prints.test.sql`; `scripts/migration-persistence.mjs`; `scripts/reservation-concurrency.mjs`

**Intent**: Replace the temporary cancellation-first assertions and keep all direct SQL callers compatible before later acceptance expansion.

**Contract**: Add focused SQL cases for the agreed trigger, margin/rounding, own-held capacity, manual retention/fallback, deterministic best-fit, no-fit success, stable ID/age, a single version increment, repeated spool moves, rollback and isolation. Exercise stale/fresh/terminal release and settlement after reassignment. Register the migration and apply it in populated-upgrade scenarios; update direct release callers with explicitly captured versions and edit-result consumers with the new result shape. Preserve earlier migration fixtures and their historical contracts. Prove original fingerprints remain immutable and legacy replay survives upgrade until an S-05 recalculation actually occurs.

### Success Criteria:

#### Automated Verification:

- Database contracts pass: `npx supabase test db`, including recalculation, stable identity/age, request evidence, versioned release, rollback and owner isolation.
- Migration applies to a populated baseline without losing existing allocations or replay evidence: `npm run test:migrations`.
- Existing concurrency scenarios remain executable with explicit captured cancellation versions: `npm run test:reservations:concurrency`.

## Phase 2: API and contracts

### Overview

Expose the transaction's result directly and carry cancellation versions through validation, services and routes.

### Changes Required:

#### 1. Typed committed edit result

**Files**: `src/lib/prints.ts`, new `src/lib/print-update-dto.ts`, `src/lib/print-dto.ts`, `src/types/database.ts`, `src/pages/api/prints/[id]/update.ts`

**Intent**: Confirm a committed edit without a required later read and explain how its reservation changed.

**Contract**: Successful POST remains HTTP 200 and returns `{ print: PrintDto, recalculation }`, matching the update RPC result. `recalculation` is NULL for an ordinary unreserved edit; otherwise it carries `outcome` (`manual_retained`, `manual_fallback`, `best_fit`, or `insufficient_material`), `marginPercent`, calculated `reservationGrams` and `previousReservation` (`id`, `spoolId`, `reservedGrams`). The resulting reservation is in `print.reservation`. Insufficient material is a saved result with NULL reservation, never a rejected edit. Decode identity, version, numerical bounds and outcome/state consistency directly; the returned print is the transaction snapshot, not a fresh collection. Remove the temporary `reserved_print_edit_requires_cancellation` update contract and its obsolete handling. Create and list contracts remain unchanged; do not add edit request IDs.

#### 2. Versioned cancellation boundary

**Files**: `src/lib/reservation-validation.ts`, `src/lib/reservations.ts`, `src/lib/reservation-response.ts`, `src/pages/api/prints/[id]/reservation/cancel.ts`, `src/types/database.ts`

**Intent**: Carry the version the user reviewed to the active release check.

**Contract**: Cancellation form requires exactly one `reservationId` and `expectedVersion`; reject missing, duplicate, file, invalid, nonpositive, oversized and unexpected values. Pass `p_expected_version` to release RPC. Keep response disposition and owner isolation; return 409 `edit_conflict` for stale active cancellation with cancellation-appropriate refresh guidance. Never silently fetch a newer version on behalf of a submitted command.

#### 3. Native and HTTP contracts

**Files**: `scripts/print-contracts.test.mjs`, `scripts/reservation-contracts.test.mjs`, `scripts/reservation-smoke.mjs`

**Intent**: Verify meaningful response/validation behavior and update real HTTP cancellation callers.

**Contract**: Assert exact RPC arguments, direct-result success without a post-commit print query, malformed/inconsistent receipt rejection, saved-unreserved HTTP 200, settled/stale/foreign rejection and strict release version validation. Cover original reserve replay after recalculation versus settings-only replay. Update smoke command captures and obsolete cancel-first expectations; no helper may hide stale-command behavior by fetching the latest version automatically.

#### 4. Initial reserve confirmation consistency

**Files**: `src/lib/reservations.ts`, `scripts/reservation-contracts.test.mjs`

**Intent**: Prevent a successful initial reserve response from pairing the current print allocation with the originally requested spool after a concurrent same-ID recalculation.

**Contract**: In `reservePrintMaterial`, require the confirmation read's `print.reservation.spoolId` to equal the returned `spool.id`, in addition to the existing reservation-ID check. If the reservation moved between the reserve commit and the confirmation reads, return the existing database-error result with refresh-required mutation guidance rather than an incoherent success; do not claim the reservation failed or undo it. Add a native fixture where reserve commits reservation R on A and the confirmation read observes the same R on B while the selected spool projection still identifies A. Assert that this cannot return success and that ordinary consistent confirmations remain supported. This does not make the paired reads an atomic snapshot.

### Success Criteria:

#### Automated Verification:

- Print, reservation, settlement and settings contracts pass: `npm run test:prints && npm run test:reservations && npm run test:settlements && npm run test:settings`.
- Lint, types and production build pass: `npm run verify:deploy`.

## Phase 3: Form and recovery

### Overview

Make reserved requirements editable and preserve a safe recovery path without a durable edit ledger.

### Changes Required:

#### 1. Editable fields and committed feedback

**Files**: `src/components/prints/PrintForm.tsx`, `src/components/prints/PrintList.tsx`

**Intent**: Allow all requirements to change and show the actual committed allocation outcome.

**Contract**: Remove reservation-dependent field locks and cancellation-first hints; keep validation and pending guards. Explain that every save recalculates with the current margin, including a name-only save. Use shared Carbon UI components/classes. Preserve `requiredGrams`, `recordedGrams`, `reservedGrams` and `availableGrams` meanings. Show retained manual selection, best-fit/fallback and successful saved-unreserved feedback; avoid representing a no-fit success as an error. Distinguish settled-print rejection from a stale edit. Keep focus restoration and explicit consent before discarding an unsaved draft.

#### 2. Exact versioned recovery and collection reconciliation

**Files**: `src/components/prints/PrintList.tsx`, `src/components/prints/PrintForm.tsx`

**Intent**: Resolve an in-flight edit before allowing a new command, while retaining known success through refresh failures.

**Contract**: Keep collection state, mutation handlers, immutable submitted payload and captured expected version in the owning print collection. While uncertain, retain the exact command outside the transient form and block new mutations in this page; offer an exact retry without changing its version or payload. Serialize it through update RPC: success establishes a known committed result; post-lock `edit_conflict`, `print_settled` or `not_found` establishes that the old-version command cannot still apply. A recovery conflict must not claim the original edit was rejected. Transport/5xx, unreadable replies, pre-lock validation and authentication failures remain unresolved.

**Contract**: After resolution, read both `/api/prints` and `/api/spools` with strict decoders before clearing the guard. Reuse the settlement collection-read pattern rather than add a general workflow framework. For known success, retain the transaction's outcome if either later read fails and offer read retries only. For conflict-resolved uncertainty, explain that current state was loaded but the original result cannot be recovered. Neither GET alone nor matching fields proves completion. Keep draft/command until resolution and successful reads; do not let ordinary refresh or closing the editor erase pending recovery. Apply the same exact-command resolution rule to an uncertain versioned cancellation, retaining its reservation ID and expected version. Preserve existing create/delete recovery and settlement guards.

#### 3. Versioned cancellation controls and browser baseline

**Files**: `src/components/prints/PrintList.tsx`; optional explanatory copy only in `src/components/prints/ReservationPanel.tsx`; `tests/e2e/fixtures.ts`, `tests/e2e/reservation-recovery.spec.ts`, `tests/e2e/print-recovery.spec.ts`

**Intent**: Send the reviewed version from the existing controls and replace obsolete browser restrictions.

**Contract**: Capture `print.version` with reservation ID when cancellation starts; stale 409 requires reviewing current print/stock, without automatically cancelling at the latest version. Existing panel props already include the print, so no new reservation-version DTO is needed. Update shared fixtures and inline forms to require explicit captured versions. Preserve existing different-ID replacement protection, draft retention, focus behavior and unrelated recovery assertions; replace disabled-field expectations with editable-field behavior.

### Success Criteria:

#### Automated Verification:

- Existing browser suites pass with unlocked reserved-print fields and explicitly versioned cancellation fixtures: `npm run test:e2e`.
- Native contracts, lint, types and production build remain green: `npm run verify:deploy`.

#### Manual Verification:

- Reserved edits explain retained manual selection, best-fit fallback and saved-unreserved outcomes; keyboard focus and draft-discard consent remain usable.

**Implementation Note**: End the first autonomous run after this phase's Automated criteria and commit, and present Manual row 3.3 to the author. Do not wait interactively or continue into Phase 4 under that goal. Phase 4 requires a separate invocation after the author confirms that the manual checks passed, as specified in the author-approved execution boundary. Execution checkbox state belongs only in Progress.

## Phase 4: End-to-end verification

### Overview

Prove interactions that isolated recalculation tests cannot establish, using the existing local database, concurrency, HTTP and browser harnesses.

### Changes Required:

#### 1. Controlled concurrency and populated upgrade evidence

**Files**: `scripts/reservation-concurrency.mjs`, `scripts/migration-persistence.mjs`, `supabase/tests/edit-reserved-prints.test.sql`

**Intent**: Verify committed outcomes under competing mutations and preserve existing real data during upgrade.

**Contract**: Add both meaningful lock orders for recalculation against settings, competing reserve, release, edit, settlement, stock correction and print/spool deletion. Require observed blocking and committed-state assertions, never sleeps as correctness evidence. Include same-ID stale release after no-op edits, independent-owner progress, immutable request fingerprints, correct current-spool evidence, no overbooking and unchanged unrelated stock. Upgrade active/manual/best-fit/terminal/legacy-NULL-witness reservations plus historically renamed prints; verify backfill, normal replay before S-05 edits, superseded replay afterward, stable age, release/settlement and removed old release overload.

#### 2. Browser and authenticated HTTP acceptance

**Files**: new `tests/e2e/reserved-print-editing.spec.ts`; existing `tests/e2e/fixtures.ts`, `tests/e2e/reservation-recovery.spec.ts`, `tests/e2e/print-recovery.spec.ts`, `scripts/reservation-smoke.mjs`

**Intent**: Verify observable outcomes, including the unknown-request window and recovery after later mutations.

**Contract**: Cover own-capacity recalculation, eligible manual retention against a better-fit alternative, manual fallback followed by a later automatic edit, no-fit save, stable ID and age, and stale cancellation in a second browser page. Forward a real edit to completion then drop its reply; exact retry may conflict, followed by current-state recovery without inventing a historical outcome. Also hold an original request before mutation while allowing successful collection GETs: these reads must not clear the guard; resolve through the same-version retry, then release the held request and assert no late second mutation. Cover each collection failing separately after known success and after resolution; known no-fit success must remain visible. Keep the configured single-worker Chromium suite; verify Firefox/phone usability manually rather than claim Chromium proves them.

**Cancellation recovery acceptance**: Extend `reservation-recovery.spec.ts` with separate versioned-cancellation cases. Complete a real cancellation and lose or corrupt its reply; recover by retrying the exact reservation ID and captured version, accepting the terminal `already_released` response without fetching or substituting a newer version. Hold an original cancellation before mutation while allowing successful collection GETs, and assert that the mutation guard remains active. Cover both a retry that releases once before the held original arrives and a same-ID recalculation in another page that makes the captured cancellation stale; after recovery, releasing the held request must neither release the recalculated allocation nor increment the print version again. Fail `/api/prints` and `/api/spools` separately after known cancellation success and after conflict resolution; keep the guard and retained result until both reads succeed, with read-only retries after a known result. Preserve uncertainty on failed/unreadable retries and pre-lock validation or authentication failures. Replace the existing cancellation-specific GET-only recovery expectations; preserve unrelated initial-reserve recovery assertions.

#### 3. Retained verification evidence

**File**: `context/changes/edit-reserved-print/verification.md` and relevant screenshots under the same change folder

**Intent**: Record actual commands, outcomes and remaining human checks without claiming planned tests already passed.

**Contract**: Record environment prerequisites and command results, migration/concurrency/browser evidence, and current Chrome/Firefox/phone checks. Keep automated and manual results distinct; mark canonical Progress only when each criterion is actually verified.

### Success Criteria:

#### Automated Verification:

- Controlled races pass for recalculation versus settings, reserve, release, edit, settlement, stock correction and deletion: `npm run test:reservations:concurrency`.
- Database and populated-upgrade acceptance pass, including historical rename replay and absence of an unversioned release bypass: `npx supabase test db` and `npm run test:migrations`.
- Browser acceptance proves same-ID stale cancellation rejection, lost-response exact recovery, pending-request guards and paired-read failures: `npm run test:e2e`.
- Authenticated HTTP acceptance passes against production preview with local Supabase and Mailpit: `npm run smoke`.
- Final native, lint, type and build gate passes: `npm run verify:deploy`.

#### Manual Verification:

- Verify reserved editing, no-fit feedback, stale cancellation and recovery in current Chrome and Firefox and at a phone viewport; retain screenshots and findings in the change verification evidence.
- After refresh, logout and login, confirm saved requirements, stable reservation identity/age, recalculated grams and stock totals persist.

## Testing Strategy

### Unit Tests:

- Exercise the direct edit-result decoder across every outcome, numerical bounds, mismatched print identity, saved version and inconsistent reservation state.
- Verify strict release version validation, exact service arguments, business failure mapping and no required print reread after successful update RPC.

### Integration Tests:

- SQL owns allocation arithmetic, normalization, deterministic ordering, no-fit commit, version increments, evidence, terminal replay and isolation. Include margins 0/5/10/100, ceil rounding (81 g at 5% reserves 86 g), maximum supported values and equality at capacity.
- On a 150 g spool, 80 g at 10% holds 88 g. A settings save to 5% keeps 88 g; a name-only or no-op print save holds 84 g, with 66 g available. Separately, changing 80 g to 100 g at 10% holds 110 g and leaves 40 g.
- Require a case where only reusing the old hold makes the new allocation possible. Add no-fit after a higher requirement and mismatching material/colour, plus two other reservations so only the edited print's hold is excluded.
- For reservation R at print version V, a successful recalculation keeps R and yields V+1. Release (R,V) conflicts while active; release (R,V+1) succeeds once; its repeat is already released despite the print advancing again. A subsequent fresh reserve gets a different ID and cannot be affected by R's retries.
- Move A to B to C; original reserve fingerprint still identifies A, current allocation evidence identifies C, and release/settlement affect C only. Verify no-fit and deletion retain enough evidence for terminal release.
- Keep A older than B, edit or reassign A, then force settlement cancellation: its preserved timestamp and ID retain the exact established priority, including ties.
- Native, smoke, concurrency, upgrade and browser suites own their respective contracts. Avoid using mocked success as evidence for transaction or race correctness.

### Manual Testing Steps:

1. Exercise editable fields, name-only/no-op margin application and manual retention/fallback in the existing print collection.
2. Save an edit with no fitting spool; confirm saved requirements, released grams and clear unreserved feedback. Check stock separately.
3. Keep the old reservation open in another tab, edit in the first, then cancel in the old tab; verify rejection, review current data, then cancel with the reviewed version.
4. Simulate interrupted connectivity and use exact recovery; distinguish current-state recovery from a known save whose collection refresh failed.
5. Repeat relevant interactions with keyboard navigation, current Firefox and a phone viewport; inspect wrapping, focus, feedback and persistence across later login.

## Performance Considerations

Retain the existing per-owner mutex and deterministic selection over that owner's spools. Do not introduce polling, background jobs, queue-wide recalculation or per-candidate browser requests. Paired collection reads are subsequent current-state reads, not an atomic cross-collection snapshot; the transaction result remains distinct. No new latency target or performance claim is assumed.

## Migration Notes

Add history rather than editing existing migrations. Backfill allocation spool evidence from original request spool for active and terminal rows; existing reservations and creation times must remain byte-for-byte unchanged until an actual edit. Leave the recalculation marker NULL even if a legacy print's version is already above its initial reserve version. Populate allocation spool on all future initial reserves.

Coordinate migration and application rollout because cancellation now requires a version; old clients must refresh and must not gain an unversioned bypass. Exercise the full populated-upgrade harness before deployment. Use a forward corrective migration if a release problem occurs; do not roll back to unversioned cancellation or rewrite populated historical migration files. No data-destructive down migration or deployment is part of this plan.

Execution uses Node from `.nvmrc`, installed dependencies, Docker/local Supabase, local Supabase credentials configured as documented and Mailpit for authenticated acceptance. The E2E command builds and starts its own preview; run standalone smoke against a separately running production preview after E2E releases the port. Missing environment prerequisites block the corresponding execution check, never count as a passing result. Implementation may require current library documentation for new library-specific questions; source-based discovery for this plan required none.

## References

- Scope and approved product policies: `context/foundation/prd.md:59`, `:87`, `:92`, `:119`, `:121`; roadmap S-05 at `context/foundation/roadmap.md:160`.
- Research: `context/changes/edit-reserved-print/research.md`; change identity: `context/changes/edit-reserved-print/change.md`.
- Database baseline: `supabase/migrations/20261012000000_create_prints.sql:38`; `20261016000000_reserve_and_release_material.sql:40`, `:306`; `20261018000000_settle_print_consumption.sql:45`, `:370`, `:400`; `20261019000000_preserve_margin_with_settlements.sql:115` (all migration filenames under `supabase/migrations/`).
- Update seams: `src/lib/prints.ts:193`, `src/lib/print-validation.ts:172`, `src/pages/api/prints/[id]/update.ts:24`.
- Cancellation seams: `src/lib/reservation-validation.ts:83`, `src/lib/reservations.ts:210`, `src/pages/api/prints/[id]/reservation/cancel.ts:36`.
- Browser baseline and paired reconciliation: `src/components/prints/PrintForm.tsx:101`, `src/components/prints/PrintList.tsx:266`, `:756`, `:820`, `:1110`.
- Verification harnesses: `scripts/migration-persistence.mjs:11`, `scripts/reservation-concurrency.mjs:359`, `scripts/reservation-smoke.mjs:96`, `tests/e2e/fixtures.ts:386`, `playwright.config.ts:13`, `.github/workflows/ci.yml:54`.
- Project conventions: `AGENTS.md`, `context/foundation/tech-stack.md`, `context/foundation/lessons.md`.

## Progress

> Convention: unchecked rows are pending; checked rows are done. Append the closing commit SHA when execution lands. This section alone owns execution checkbox state.

### Phase 1: Database and versioning

#### Automated

- [x] 1.1 Database contracts pass: `npx supabase test db`, including recalculation, stable identity/age, request evidence, versioned release, rollback and owner isolation. — ebd5226
- [x] 1.2 Migration applies to a populated baseline without losing existing allocations or replay evidence: `npm run test:migrations`. — ebd5226
- [x] 1.3 Existing concurrency scenarios remain executable with explicit captured cancellation versions: `npm run test:reservations:concurrency`. — ebd5226

### Phase 2: API and contracts

#### Automated

- [x] 2.1 Print, reservation, settlement and settings contracts pass: `npm run test:prints && npm run test:reservations && npm run test:settlements && npm run test:settings`. — 91afdeb
- [x] 2.2 Lint, types and production build pass: `npm run verify:deploy`. — 91afdeb

### Phase 3: Form and recovery

#### Automated

- [x] 3.1 Existing browser suites pass with unlocked reserved-print fields and explicitly versioned cancellation fixtures: `npm run test:e2e`. — b5780f3
- [x] 3.2 Native contracts, lint, types and production build remain green: `npm run verify:deploy`. — b5780f3

#### Manual

- [x] 3.3 Reserved edits explain retained manual selection, best-fit fallback and saved-unreserved outcomes; keyboard focus and draft-discard consent remain usable. — 1e3df51

### Phase 4: End-to-end verification

#### Automated

- [x] 4.1 Controlled races pass for recalculation versus settings, reserve, release, edit, settlement, stock correction and deletion: `npm run test:reservations:concurrency`. — all 46 interleavings passed (2026-10-22). — 9365348
- [x] 4.2 Database and populated-upgrade acceptance pass, including historical rename replay and absence of an unversioned release bypass: `npx supabase test db` and `npm run test:migrations`. — 546 SQL tests and populated migration acceptance passed (2026-10-22). — 9365348
- [x] 4.3 Browser acceptance proves same-ID stale cancellation rejection, lost-response exact recovery, pending-request guards and paired-read failures: `npm run test:e2e`. — all 67 Chromium tests passed on the built preview (2026-10-22). — 9365348
- [x] 4.4 Authenticated HTTP acceptance passes against production preview with local Supabase and Mailpit: `npm run smoke`. — all smoke checks passed, including session-expiry coverage (2026-10-22). — 9365348
- [x] 4.5 Final native, lint, type and build gate passes: `npm run verify:deploy`. — passed with 0 errors and 0 warnings; Astro reported 6 nonblocking hints (2026-10-22). — 9365348

#### Manual

- [x] 4.6 Reserved editing, no-fit feedback, stale cancellation and recovery passed manual checks in Chrome, Firefox and a phone viewport. The stale-cancellation message was corrected and verified automatically. The author selected option 2, Data Table, from `reviews/row-layout-options.html`; a shared table base now serves Planned Prints and Filament Stock with wide-screen columns and labeled phone cards. The author confirmed both views and button layouts on desktop and phone (2026-10-23). See `verification.md`. — 9365348
- [x] 4.7 The author confirmed saved reservation data persisted correctly in the database after the manual run (2026-10-22). See `verification.md`. — 9365348
