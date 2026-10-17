# Account Safety Margin Implementation Plan

## Overview

Deliver roadmap S-04: configure one persistent account safety margin for new best-fit and manual reservations while preserving existing reservation snapshots. Add a Settings page, versioned saves, database-authoritative calculations and recovery when the grams being confirmed change.

## Current State Analysis

The completed [research](research.md) is the baseline at commit `5587b2184b889c752f8d615ed7728c3221e2b1ef`. There is no settings table, read/save API or editor. Reservation preview and confirmation hardcode 10%; the existing calculation helper already accepts a margin and uses numeric upward rounding.

Reservations store `reserved_grams` and `margin_percent`; stock totals sum those stored grams. Mutations serialize per account through `private.acquire_owner_mutation_lock`. Successful request replay precedes print-version and eligibility checks. The browser protects against obsolete preview responses and uncertain mutations, but reserve commands carry no evidence of the displayed amount.

Existing native, SQL, independent-session concurrency, populated-upgrade, browser and HTTP smoke suites provide the verification seams. Some repository guidance still describes reservations and browser testing as unimplemented; checked-in source and CI establish the current baseline. No glossary exists; domain terms below come from the PRD and existing code.

## Desired End State

- A signed-in user opens `/dashboard/settings` from account navigation, edits a whole percentage from 0 through 100 and explicitly saves it. Accounts without a saved row read 10%; read failures remain visible failures.
- Settings persist across reload, sign-out and fresh sign-in. A stale settings version cannot overwrite a newer save; the draft survives conflict and recovery.
- New reservations use `ceil(requiredGrams * (100 + currentMarginPercent) / 100)`, calculated in the database after owner-lock acquisition. Best-fit and manual modes share this authority.
- Confirmation carries the rounded grams shown in the preview. If current calculation produces different grams, reject without writing, fetch a fresh preview and require another explicit confirmation. A changed percentage with identical rounded grams can succeed and stores the current percentage.
- Preserve an eligible manually selected spool during that fresh preview. If it is no longer eligible, select the suggested best-fit when one exists and explain the change; otherwise show insufficient material with no confirmation action.
- A setting change alone leaves every existing reservation, product version, stock quantity and reservation request unchanged. Exact replay of an already successful request returns its original reservation before consulting the new margin.
- Existing print-version, selection-staleness, ownership and stock checks still apply even when confirmed grams match.

### Key Discoveries:

- Product bounds, default, rounding and snapshot preservation are settled: `context/foundation/prd.md:61`, `:105`, `:119`, `:121`; S-04/S-05 boundary: `context/foundation/roadmap.md:148`, `:160`.
- Owner locking, numeric calculation and stored totals already exist: `supabase/migrations/20261016000000_reserve_and_release_material.sql:55`, `:69`, `:81`.
- Preview and reserve contain the fixed-margin seams; replay ordering must survive the change: same migration `:229`, `:258`, `:267`.
- The exact-field validator, RPC service and browser confirmation must change together: `src/lib/reservation-validation.ts:27`, `src/lib/reservations.ts:130`, `src/components/prints/PrintList.tsx:330`.
- Settings can reuse the protected dashboard and design contract: `src/lib/auth-response.ts:3`, `src/layouts/DashboardShell.astro:15`, `src/components/ui/FormField.tsx:29`, `src/components/Topbar.astro:21`.
- The upgrade harness rejects an unknown migration inventory: `scripts/migration-persistence.mjs:11`, `:226`. Browser contexts share an account whose current cleanup covers only spools and prints: `tests/e2e/fixtures.ts:35`, `:114`, `:307`.
- Native hooks discover new test files, while deployment and CI scripts enumerate suites: `.codex/hooks/shared.mjs:142`, `package.json:16`, `.github/workflows/ci.yml:18`.

## What We're NOT Doing

- Recalculating existing reservations on a settings save, editing reserved-print requirements, settlement, or the later S-05/S-06/S-07 workflows.
- Per-print margins, automatic queue recalculation, realtime cross-tab synchronization, or a settings editor embedded in the print collection.
- Requiring reconfirmation solely because the percentage changed, including 10% → 5% → 10%, when rounded grams and the other reservation checks still match.
- Showing historical applied percentages in print DTOs or changing the meanings of `recordedGrams`, `reservedGrams`, `availableGrams` and `requiredGrams`.
- Replacing the test stack, introducing a general preferences framework or telemetry service, deploying, or modifying production code during this planning task.

## Implementation Approach

Use one owner-keyed settings row, created on first save, with an effective default of 10% and version 0 for absence. Persisted rows start at version 1; every accepted explicit save increments the version, including a same-value save. Reuse the existing owner mutex for save and reserve so concurrent settings and reservations have an ordered result. Keep authoritative state reads in statements after lock acquisition under Read Committed.

Expose authenticated settings read/save RPCs and one private HTTP endpoint. The editor tracks saved state, editable draft, pending state and recovery state separately. A failed read never supplies a fabricated default. Version conflicts and uncertain mutation outcomes require an authoritative reread; retain the draft and require an explicit later save.

Use `expectedReservationGrams` as the reservation witness. The server recomputes with its current percentage and uses the client value only for comparison. For example, an 80 g print previewed at 10% needs 88 g; at 9% it still needs 88 g, so confirmation may succeed and store 9%. At 5% it needs 84 g, so the old 88 g confirmation fails.

The approved phases are dependency-ordered and form one release. Database and API phases are not independently deployable product increments. Manual acceptance is consolidated in phase 4; automated results never mark those manual rows complete.

## Critical Implementation Details

### Replay before freshness

The new grams witness belongs to request identity. Historical ledger rows must retain a NULL witness because their callers supplied none. Under the owner lock, compare the original request payload and replay a matching active request before reading current settings, checking current print state or recalculating grams; completed requests remain completed. Require a valid witness for every fresh reservation, so a compatibility path cannot create reservations without preview evidence.

### Numeric boundary

The largest supported print requirement, 2,147,483,647 g at 100%, produces 4,294,967,294 g. Use numeric SQL parameters/storage and safe-integer JavaScript validation for adjusted grams; this demand must reach eligibility evaluation and produce insufficient material rather than overflow.

## Phase 1: Database settings and reservation authority

### Overview

Introduce settings persistence and versioned saves, connect the current margin to reservation authority and prove migration, replay and concurrency behavior.

### Changes Required:

#### 1. Settings persistence and access

**File**: `supabase/migrations/20261017000000_account_safety_margin.sql` (new)

**Intent**: Persist one setting per owner without an auth-registration trigger or migration-time account backfill. Retain the current authenticated RPC mutation boundary.

**Contract**: Add `public.account_settings` with `user_id` as primary key referencing `auth.users` with cascading deletion, `margin_percent numeric NOT NULL` constrained to integral 0–100, `version integer NOT NULL` constrained positive, and `updated_at`. Enable owner-only authenticated SELECT through RLS and revoke direct writes from PUBLIC, anon and authenticated. Add `get_account_settings()` returning `{marginPercent, version}`, with `{10, 0}` only when the owner's row is absent. Add `save_account_safety_margin(p_margin_percent numeric, p_expected_version integer)` returning the saved pair; derive owner from `auth.uid()`, validate inputs, acquire the existing owner mutex and then compare the saved version (or 0 for absence). A mismatch raises `settings_conflict` without writing. Both RPCs require authentication; definer functions use an empty search path and fully qualified relations with explicit execution grants.

#### 2. Preview, confirmation and replay

**File**: the new S-04 migration; existing S-03 definitions remain historical inputs

**Intent**: Apply the saved margin consistently and protect the amount the user confirmed while preserving original successful requests.

**Contract**: Replace preview's fixed percentage with the effective current setting, retaining its advisory snapshot semantics. Replace the exact five-argument reserve function with the sole six-argument signature ending in `p_expected_reservation_grams numeric DEFAULT NULL`; revoke PUBLIC/anon execution and explicitly grant authenticated execution on that signature. Extend `private.reservation_requests` with nullable `expected_reservation_grams numeric`, constrained when present to integral 1–4,294,967,294; keep legacy rows NULL. Under the owner lock, compare the witness with the original ledger payload using NULL-aware equality. An exact legacy NULL request can replay only its legacy successful row; an altered witness conflicts. For a fresh command, a missing witness raises `reservation_preview_required`; an invalid witness is rejected. Read the effective margin after locking, recompute grams and raise `reservation_amount_stale` on a mismatch before stock selection or writes. Otherwise retain all current print-version, reservation, best-fit and manual eligibility checks; store current percentage, recomputed grams and supplied witness atomically. Refresh PostgREST's schema cache after the function changes. Do not leave the old executable fresh-write implementation behind.

#### 3. Database contracts and arithmetic

**Files**: `supabase/tests/account-settings.test.sql` (new), `supabase/tests/reservations.test.sql`

**Intent**: Prove the product rules at the database boundary and update existing fresh-reservation calls to provide their preview amount.

**Contract**: Cover absent defaults for pre-existing and newly created accounts; first-save and subsequent version increments; stale-version refusal; integral 0/5/10/100 acceptance; NULL, fractional, negative and above-100 rejection; direct-write denial and owner isolation for reads and RPCs. Cover unchanged reservation snapshots and product versions on save; both selection modes; 81 g at 5% → 86 g; 80 g at 10% → 9% retaining 88 g but storing 9%; 80 g at 10% → 5% rejecting 88 g and accepting a later 84 g confirmation; 1 g at 10% → 5% retaining 2 g; change-away-and-back; maximum adjusted demand and insufficient stock. Exact replay after later settings changes must preserve snapshots; changed witness, released and deleted requests retain their rejection semantics.

#### 4. Deterministic concurrency

**File**: `scripts/reservation-concurrency.mjs`

**Intent**: Extend the observed-blocker, controlled-commit harness to settings mutations; mocks cannot prove owner serialization.

**Contract**: Add the grams witness to fresh reserve calls and include settings plus reservation snapshots in relevant state observations. Test save-before-reserve (old amount rejects after waiting), reserve-before-save (original snapshot remains), a same-grams percentage change that allows the waiting reserve with the new percentage, two saves sharing one expected version (only the first commits), and another owner's progress while the first owner is locked. Preserve existing races, request-replay invariants and cleanup. Reset settings between scenarios using fresh versions so new cases cannot contaminate default-margin cases; update fixed scenario-count assertions/output to the actual cases.

#### 5. Populated upgrade

**File**: `scripts/migration-persistence.mjs`

**Intent**: Exercise S-04 against a genuinely committed S-03 reservation instead of only an empty schema.

**Contract**: Extend the explicit migration inventory. After S-03, create and commit a five-argument 88 g reservation and capture complete product rows, reservation snapshot and ledger state. Apply S-04 transactionally, prove preservation and effective 10% for an absent setting, then save 5% and prove the old snapshot remains 88 g. Exact legacy replay without a witness must succeed after that change; changed payloads conflict and released/deleted requests cannot recreate. A fresh witness-less request must fail; a fresh witnessed reservation must use 84 g when enough eligible stock exists. Retain the existing scratch-database and restricted-owner checks.

### Success Criteria:

#### Automated Verification:

- Database contracts pass against the S-04 schema: `npx supabase test db`.
- Observed-lock concurrency scenarios pass, including save/reserve in both orders and competing settings versions: `npm run test:reservations:concurrency`.
- Fresh and populated upgrades preserve committed product rows, reservation snapshots and legacy replay: `npm run test:migrations`.

---

## Phase 2: Settings API and reservation contracts

### Overview

Expose private settings operations, forward amount evidence through reservation confirmation and wire native verification.

### Changes Required:

#### 1. Typed settings contract and boundary helpers

**Files**: `src/types/database.ts`, `src/lib/account-settings.ts` (new), `src/lib/account-settings-validation.ts` (new), `src/lib/account-settings-response.ts` (new)

**Intent**: Follow the existing typed service, exact form validation and private response conventions with settings-specific feedback.

**Contract**: Define `AccountSettingsDto = {marginPercent: number; version: number}`, with a shared runtime reader for server and browser. Margin must be integral 0–100; version must be an integral 0–2,147,483,647, with 0 representing an absent preference. The save form accepts exactly `marginPercent` and `expectedVersion` as single text fields; reject missing, duplicate, file, fractional, non-finite, out-of-range and unexpected fields. Require decimal digit syntax for percentages and versions. Service functions call the read/save RPCs, validate receipts and preserve database error causes and status. Distinguish an absent row from a failed read. Use sanitized server diagnostics following existing response helpers and settings-specific messages; keep credentials, submitted data and raw database messages out of responses/logs.

#### 2. Settings HTTP endpoint

**File**: `src/pages/api/account/settings.ts` (new)

**Intent**: Provide one authenticated read/save boundary for SSR, browser recovery and smoke verification.

**Contract**: GET returns `{settings: AccountSettingsDto}`; POST accepts supported URL-encoded/multipart forms and returns the same envelope after a verified save receipt. Derive identity from verified locals, never a submitted owner ID. Return 401 for no identity, 503 for unavailable authentication/dependency, 415 for unsupported content type, 422 for invalid payload, 409 with `settings_conflict` and `refreshRequired: true` for a stale version, and 500 for unexpected failure. Mutation 5xx responses communicate uncertain outcomes; include Retry-After for 503. All responses use the existing private/no-store cache policy; unsupported methods return 405 with an Allow header. Preserve existing cookie and origin protection.

#### 3. Reservation command and response update

**Files**: `src/lib/reservation-validation.ts`, `src/lib/reservations.ts`, `src/lib/reservation-response.ts`, `src/pages/api/prints/[id]/reservation/reserve.ts`, `src/types/database.ts`

**Intent**: Carry preview grams without letting the browser choose authoritative margin or reserved stock.

**Contract**: Accept `expectedReservationGrams` as one integral text value in 1–4,294,967,294 when present and forward it to `p_expected_reservation_grams`. Absence alone maps to NULL for legacy replay; empty, malformed, file and duplicated fields remain invalid. The database decides whether a witness-less request is an exact legacy replay or a forbidden fresh write. Add precise HTTP 409 mappings for `reservation_amount_stale` and `reservation_preview_required`, with refresh guidance. Keep `expectedVersion` as the independent print-version check. Tighten preview percentage parsing to whole 0–100 and validate adjusted-gram bounds at service/browser boundaries. Preserve existing print/spool DTO shapes and successful receipt semantics.

#### 4. Native suites and existing caller compatibility

**Files**: `scripts/settings-contracts.test.mjs` (new), `scripts/reservation-contracts.test.mjs`, `package.json`, `.github/workflows/ci.yml`, `scripts/reservation-smoke.mjs`, `tests/e2e/fixtures.ts`

**Intent**: Verify the new boundary contracts and keep all existing acceptance callers compatible with fresh witness requirements.

**Contract**: Add `test:settings` using the existing native runner and include it in `verify:deploy` and CI's native job. Hooks already discover `scripts/*.test.mjs`; do not reconfigure them. Test validation including both boundaries, DTO refusal, absent-read/error separation, RPC arguments, settings-version conflicts, private headers, causes and status mapping. Update reservation native expectations for witnessed commands, legacy absence and new errors. Existing smoke/browser helpers must use a preview for fresh attempts and retain original request parameters for replay; do not fetch a new preview to replay a request whose print is already reserved. Update existing raw HTTP submissions and SQL callers as needed; preserve default 10% acceptance expectations.

### Success Criteria:

#### Automated Verification:

- Settings validation, DTO, service and response contracts pass: `npm run test:settings`.
- Updated reservation validation, witness forwarding, replay and conflict mappings pass: `npm run test:reservations`.
- The native deployment gate includes settings coverage and passes: `npm run verify:deploy`.

---

## Phase 3: Settings editor and reservation recovery

### Overview

Deliver the approved Settings location and explicit save interaction, including conflict and uncertain-outcome recovery, then apply amount-based confirmation in the print collection.

### Changes Required:

#### 1. Protected settings page and navigation

**Files**: `src/pages/dashboard/settings.astro` (new), `src/components/Topbar.astro`

**Intent**: Give the account preference a stable destination within the existing dashboard.

**Contract**: Add a Settings navigation link with correct active-page semantics. SSR-load settings through the service under the existing verified dashboard protection and private cache policy. Show a settings-specific load error with retry on failure; never render a fabricated editable 10% after an unavailable read. Reuse `DashboardShell`, the Carbon design contract and shared UI components.

#### 2. Margin editor

**File**: `src/components/account/AccountSafetyMarginForm.tsx` (new)

**Intent**: Make saving and recovery explicit while protecting a user's draft and later saves from other tabs.

**Contract**: Hydrate from the verified saved pair; use a labeled numeric `FormField` with min 0, max 100 and step 1, local validation, and a “Save safety margin” button. Show the saved value separately from the draft and explain that the setting applies to new reservations while existing reserved grams remain unchanged. Successful save uses the returned version. Disable duplicate submissions while pending. On `settings_conflict`, retain the draft, read current saved state and require an explicit save against that fresh version; never silently overwrite. On network error, unreadable success, invalid receipt or 5xx, mark the result uncertain and block further saves until GET successfully recovers authoritative state. A failed reread keeps the guard and draft; a successful reread shows the current saved value without claiming that this client's request caused it. Never auto-retry a save. Offer sign-in recovery on 401 and restore useful keyboard focus after validation/recovery.

#### 3. Amount confirmation and fresh-preview selection

**Files**: `src/components/prints/PrintList.tsx`, `src/components/prints/ReservationPanel.tsx`, `src/pages/dashboard/prints.astro`

**Intent**: Confirm the amount the user reviewed and retain an eligible manual choice when a changed amount requires a new preview.

**Contract**: New UI commands always submit `expectedReservationGrams` from the accepted preview. Handle `reservation_amount_stale` by invalidating the old preview, loading a new one and requiring another explicit click; never automatically reserve after recovery. Preserve manual mode/id only for the same active print when the returned eligible list still contains that spool; otherwise select the suggested best-fit and explain the replacement, or clear selection if no eligible spool exists. Preserve existing request-counter and active-print guards so obsolete responses cannot restore the old amount or selection. A failed refresh leaves no actionable stale preview. Settings changes in another tab are handled at server confirmation without realtime synchronization. Remove fixed-10% page wording, link to Settings, and explain that confirmed grams use the current account margin; the existing preview can still display the percentage used when it was fetched. Keep successful feedback focused on committed grams and do not claim that an obsolete preview percentage was applied. Existing reservation displays continue to bind stored grams.

### Success Criteria:

#### Automated Verification:

- The Settings page, editor and reservation changes pass native contracts, lint, Astro checks and build: `npm run verify:deploy`.

---

## Phase 4: Browser recovery and complete acceptance

### Overview

Prove the full user flow and recovery against the running application, with settings isolation and final author acceptance.

### Changes Required:

#### 1. Browser fixture restoration

**Files**: `tests/e2e/fixtures.ts`, `tests/e2e/account-settings.spec.ts` (new), `tests/e2e/reservation-recovery.spec.ts`

**Intent**: Exercise real UI failures without leaking account-wide margin changes into the rest of the suite.

**Contract**: Keep the existing single-worker scheduling. Extend the fixture API with settings read/save helpers and a persistent restoration marker written before any browser settings mutation, including commits with masked acknowledgements. Cleanup reads the current version, restores the original percentage through the real API and rereads to verify it; never restore an old version. Attempt this cleanup even when product cleanup fails, retain failed markers, and recover them before another test/retry can proceed. Cover initial saved display, 0/100 boundaries, visible invalid input, pending duplicate prevention, successful explicit save, reload persistence, version conflict with retained draft, and real commit followed by lost/unreadable acknowledgement with failed then successful reread.

#### 2. Cross-tab reservation cases

**Files**: the new settings browser spec and existing reservation recovery spec

**Intent**: Prove the user-approved amount rule and manual-choice recovery in the browser.

**Contract**: Test a real settings change from a second page/session between preview and confirmation in both best-fit and manual modes. For 80 g at 10% → 5%, show 88 g becoming 84 g, require the second click and retain an eligible manual choice. For fallback, preview 80 g at 5% with a manually chosen 85 g spool, then increase the margin to 10%: the new 88 g demand excludes that spool, selects another eligible best-fit and explains the replacement. Test 80 g at 10% → 9% succeeding directly for 88 g; prove current 9% storage in the SQL layer, since the public print DTO intentionally does not expose historical percentages. Cover change-away-and-back, delayed obsolete preview rejection, failed fresh-preview loading and unchanged display of an existing 88 g reservation after a settings save. Use sufficient matching stock in every successful example.

#### 3. HTTP smoke and persistence

**Files**: `scripts/account-settings-smoke.mjs` (new), `scripts/smoke.mjs`, `scripts/reservation-smoke.mjs`

**Intent**: Verify settings through real authenticated HTTP and a fresh login, using the existing smoke lifecycle.

**Contract**: Integrate settings smoke with the existing account jars, bounded scenario/cleanup budget and shared helpers. After the existing default-margin reservation scenario, verify A/B isolation, protected page/API behavior, private headers and direct settings INSERT/UPDATE/DELETE denial. Reserve 88 g at 10%, save 5%, prove that reservation and its available-stock contribution are unchanged, and reserve 84 g for another 80 g print using additional eligible stock. Include a manual reservation under the same 5% setting and a fresh-login settings read. Exercise direct authenticated RPC dispatch with a present and omitted witness to prove that old clients cannot create fresh reservations. Restore the original setting using a fresh version and clean fixtures even after a failure; preserve errors from both scenario and cleanup.

#### 4. Verification record and current guidance

**Files**: `context/changes/account-safety-margin/verification.md` (new during implementation), `context/foundation/test-stack.md`, `AGENTS.md`

**Intent**: Leave reproducible evidence and correct repository guidance that would mislead the next implementation.

**Contract**: Record source revision, executed commands/results, local runtime configuration prerequisites, browser recovery evidence and any outstanding manual checks. Update only relevant test-stack/gate documentation for settings coverage and the stale AGENTS statements about implemented reservations and the existing browser runner. Preserve the language, secret-handling and design-contract rules. Do not report historical S-03/research results as S-04 evidence.

### Success Criteria:

#### Automated Verification:

- The browser suite passes with restored account settings and no regressions in existing recovery scenarios: `npm run test:e2e`.
- Production-preview smoke proves account isolation, fresh-login persistence and the 88 g / 84 g acceptance flow: `npm run smoke`.
- Final native, database, concurrency and populated-upgrade gates pass: `npm run verify:deploy`, `npx supabase test db`, `npm run test:reservations:concurrency`, and `npm run test:migrations`.

#### Manual Verification:

- Settings and reservation flows are usable with keyboard navigation in current Chrome and Firefox and on a phone, with readable feedback and no horizontal overflow.
- The author verifies that saving 5% preserves an existing 88 g reservation and that a new 80 g reservation uses 84 g when enough eligible material is available.

**Implementation Note**: Complete automated work and record results before requesting the phase-4 manual checks. Keep manual Progress rows pending until the author confirms them; deployment is outside this plan.

## Testing Strategy

### Unit Tests:

Native tests own exact form fields, numeric bounds, runtime DTO refusal, RPC argument forwarding, conflict/status mappings and private-response behavior. Keep business authority in SQL tests instead of treating mocked 10% previews as arithmetic proof.

### Integration Tests:

SQL tests prove current-margin arithmetic, saved snapshots, replay and ownership. The independent-session harness proves actual blocking and post-lock visibility; populated upgrade proves committed pre-S04 preservation. Browser tests own retained drafts, pending/uncertain state, obsolete responses and manual-selection recovery. Smoke owns real HTTP/session persistence and verifies PostgREST dispatch after the signature migration.

Named acceptance cases shared across these layers:

| Case                                                             | Required result                                                                           |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Existing 80 g reservation at 10%; save 5%                        | Existing 88 g and applied 10% remain unchanged; stock and product versions do not change. |
| New 80 g at 5%, sufficient stock                                 | 84 g through best-fit and manual modes.                                                   |
| 81 g at 5%                                                       | 86 g, using numeric upward rounding.                                                      |
| Preview 80 g at 10%; save 9%; confirm 88 g                       | Succeeds if other checks pass; stores 88 g with current 9%.                               |
| Preview 1 g at 10%; save 5%; confirm 2 g                         | Succeeds if other checks pass; stores 2 g with current 5%.                                |
| Preview 80 g at 10%; save 5%; confirm 88 g                       | No write; fresh 84 g preview and another explicit click required.                         |
| Preview 10%; change to 5% then back to 10%                       | Same grams may confirm if other checks pass.                                              |
| Two settings saves from version N                                | First accepted save increments version; second conflicts and preserves its draft.         |
| Commit reservation; later change margin; replay original request | Original reservation is returned unchanged before freshness checks.                       |
| Fresh command with no amount witness                             | Rejected; only an exact successful legacy request may replay without it.                  |
| Maximum input at 100%                                            | Represents 4,294,967,294 g and reports insufficient material without overflow.            |

### Manual Testing Steps:

1. In Chrome and Firefox, navigate to Settings by keyboard, verify the label, hints, focus and saved/draft feedback, and save 0%, 5% and 100%.
2. Verify the same form and reservation panel on a phone, including validation, pending and error states, without horizontal scrolling.
3. With sufficient eligible stock, create an 88 g reservation at 10%, save 5%, check that 88 g remains reserved, then create a new 84 g reservation for another 80 g print.
4. Use two tabs to verify the saved-version conflict and the changed-grams recovery; confirm that a manual spool remains selected when still eligible.
5. Restore the intended account setting after acceptance.

## Performance Considerations

Each settings read adds one primary-key lookup; absent reads do not create rows. Saves join the existing per-owner mutex, so one account's writes serialize without blocking unrelated accounts. Keep preview advisory and avoid new table scans, polling, realtime subscriptions or a cache that could hide a current margin. No new numeric latency target was requested.

## Migration Notes

Use the new migration without rewriting S-03 history. Do not backfill account rows or change committed reservation/product rows. The nullable request-witness column represents legacy request identity, and only newly committed requests acquire non-null evidence.

Apply the migration and refresh the RPC schema cache before the matching application release. An old page attempting a fresh witness-less reservation must fail closed and direct the user to reload; completed legacy requests retain replay support. Do not ship any intermediate phase or leave an executable old fixed-10% fresh-write path.

Rollback must preserve saved preferences, request identity and reservation snapshots. Reverting to the old fixed-10% application/function would violate the current-setting rule after preferences exist; disable affected writes until a compatible forward fix is available rather than dropping data or reverting authoritative calculation. No deployment or rollback is performed by this planning task.

## References

- [S-04 research](research.md), [change identity](change.md), [PRD](../../foundation/prd.md), [roadmap](../../foundation/roadmap.md), [stack](../../foundation/tech-stack.md), [lessons](../../foundation/lessons.md).
- [S-03 reservation plan](../../archive/2026-10-16-reserve-and-release-material/plan.md).
- Reservation authority: `supabase/migrations/20261016000000_reserve_and_release_material.sql:40`, `:55`, `:69`, `:229`, `:258`.
- Services/UI: `src/lib/reservations.ts:130`, `src/components/prints/PrintList.tsx:254`, `:330`, `:391`, `src/components/prints/ReservationPanel.tsx:90`.
- Verification seams: `scripts/reservation-concurrency.mjs:117`, `:258`, `:285`; `scripts/migration-persistence.mjs:226`, `:370`; `tests/e2e/fixtures.ts:76`, `:280`, `:307`; `scripts/reservation-smoke.mjs:71`.
- Current documentation checked through Context7 and the primary source: [PostgREST RPC calls and schema-cache refresh](https://docs.postgrest.org/en/v14/references/api/functions.html), [schema-cache reloading](https://docs.postgrest.org/en/v14/references/schema_cache.html). These support the signature/cache integration; runtime acceptance remains implementation work.

## Progress

> Convention: pending and completed checkboxes below are the only execution state. Append the closing commit SHA when a step lands; do not rename step titles.

### Phase 1: Database settings and reservation authority

#### Automated

- [x] 1.1 Database contracts pass against the S-04 schema: `npx supabase test db`. — abf0bf1
- [x] 1.2 Observed-lock concurrency scenarios pass, including save/reserve in both orders and competing settings versions: `npm run test:reservations:concurrency`. — abf0bf1
- [x] 1.3 Fresh and populated upgrades preserve committed product rows, reservation snapshots and legacy replay: `npm run test:migrations`. — abf0bf1

### Phase 2: Settings API and reservation contracts

#### Automated

- [x] 2.1 Settings validation, DTO, service and response contracts pass: `npm run test:settings`.
- [x] 2.2 Updated reservation validation, witness forwarding, replay and conflict mappings pass: `npm run test:reservations`.
- [x] 2.3 The native deployment gate includes settings coverage and passes: `npm run verify:deploy`.

### Phase 3: Settings editor and reservation recovery

#### Automated

- [ ] 3.1 The Settings page, editor and reservation changes pass native contracts, lint, Astro checks and build: `npm run verify:deploy`.

### Phase 4: Browser recovery and complete acceptance

#### Automated

- [ ] 4.1 The browser suite passes with restored account settings and no regressions in existing recovery scenarios: `npm run test:e2e`.
- [ ] 4.2 Production-preview smoke proves account isolation, fresh-login persistence and the 88 g / 84 g acceptance flow: `npm run smoke`.
- [ ] 4.3 Final native, database, concurrency and populated-upgrade gates pass: `npm run verify:deploy`, `npx supabase test db`, `npm run test:reservations:concurrency`, and `npm run test:migrations`.

#### Manual

- [ ] 4.4 Settings and reservation flows are usable with keyboard navigation in current Chrome and Firefox and on a phone, with readable feedback and no horizontal overflow.
- [ ] 4.5 The author verifies that saving 5% preserves an existing 88 g reservation and that a new 80 g reservation uses 84 g when enough eligible material is available.
