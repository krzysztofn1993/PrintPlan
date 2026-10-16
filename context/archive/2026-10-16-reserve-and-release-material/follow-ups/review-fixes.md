# Implementation Review Fixes

## F1 — Bind reservation previews to the active print and request

- **Decision**: User approved the proposed fix during triage on 2026-10-16.
- **Status**: FIXED.
- **Implementation**: `src/components/prints/PrintList.tsx` tracks the active print and a monotonically increasing preview request generation. Success, network failure and conflict responses from obsolete requests are ignored. Closing/reopening a panel, opening an editor, refreshing the list and unmounting invalidate outstanding previews. Display and confirmation require a matching print identity; confirmation is also blocked while loading or refreshing.
- **Regression coverage**: `tests/e2e/reservation-recovery.spec.ts` adds three cases for switching from an 80 g print to a 100 g print with a delayed success, network failure or already-reserved conflict from the first preview. Each confirms the displayed 110 g reservation and independently checks persisted state. A fourth case closes and reopens the same print after a stock correction, then verifies that its earlier preview cannot replace current stock information.
- **Test readiness**: The new cases explicitly wait for the PrintList island to hydrate before clicking SSR-rendered buttons. The installed Astro runtime removes `ssr` after hydration; current Astro documentation confirms that `client:load` components initially render static HTML before becoming interactive.
- **Before the fix**: The three switching cases failed against the original implementation: stale success replaced the displayed quantity, stale network failure added an unrelated alert, and the stale conflict triggered list reconciliation and a timeout. An initial post-fix run passed those three cases but exposed a premature SSR click in the reopening case; the explicit hydration wait resolved that test timing issue.
- **Validation**: `npm run verify:deploy` PASS: 77 native tests passed, 1 intentionally skipped, ESLint, Astro check with no diagnostics, production build. `E2E_PORT=4326 npm run test:e2e` PASS: all 23 tests, including setup/teardown, in 32.8 seconds. `git diff --check` PASS.
- **Scope**: F1 only. No database migration or other pending finding was implemented.

## F2 — Make the existing version and replay comparisons reject NULL

- **Decision**: User approved the fix and requested the lowest implementation cost on 2026-10-16.
- **Status**: FIXED.
- **Implementation**: Three conditions in `supabase/migrations/20261016000000_reserve_and_release_material.sql` now use `IS DISTINCT FROM` instead of `<>`: the print update version, the reservation version, and all four retained replay parameters. Existing non-null stored values make missing versions fail with `edit_conflict` and changed replay arguments fail with `idempotency_conflict`. The existing version column, incrementing trigger and mutation lock continue to provide the versioning protocol.
- **Migration scope**: Updated the migration under review on `feat/reserve-and-release-material`; the local `master` and `origin/master` refs remain at the pre-feature baseline. Refreshed only `update_print` and `reserve_print_material` in the running local database using transactional `CREATE OR REPLACE FUNCTION`. No data reset, additional schema or hosted database operation was performed.
- **Regression coverage**: Nine assertions in `supabase/tests/reservations.test.sql` verify that a NULL version cannot overwrite a newer print, saved version and requirements stay intact, NULL reservation versions fail before writing, and each original replay parameter cannot be replaced with NULL. Existing successful replay coverage still passes.
- **Before the fix**: `npx supabase test db` failed eight assertions: the NULL-version edit and its two preservation checks, the NULL-version reservation error classification, and four replay argument checks.
- **Validation**: `npx supabase test db` PASS: 259 assertions across three files. `npm run test:reservations:concurrency` PASS for the current implemented scenarios. `npm run test:migrations` PASS: complete populated spool/print rows preserved and scratch database removed. `git diff --check` PASS. Broader missing coverage remains tracked by F6/F7.
- **Scope**: F2 only; F3–F9 remain pending.

## F4 — Bind cancellation to the print in its route

- **Decision**: User approved the proposed fix on 2026-10-16.
- **Status**: FIXED.
- **Implementation**: `src/pages/api/prints/[id]/reservation/cancel.ts` validates the print ID using the existing validator and passes it through `releasePrintMaterial` in `src/lib/reservations.ts`. The database RPC now requires `p_print_id`; its lookup in the retained request ledger matches owner, reservation ID and print ID before any release. Updated the RPC type in `src/types/database.ts` and the execution grants in the migration under review.
- **Lifecycle**: The parent binding uses retained request evidence, so repeated release remains valid after the print is deleted. A stale release still targets only its original reservation and leaves a later replacement intact. Invalid, unknown, foreign, NULL or mismatched print identifiers cannot cancel the owner's reservation through that parent identity.
- **Local database**: Transactionally replaced the one-argument local RPC with the two-argument definition, restored its explicit execution grants and reloaded the local REST schema cache. Stored product and reservation data were preserved. No hosted operation was performed.
- **Regression coverage**: The existing native service contract now asserts both RPC arguments; that assertion failed before the service fix. Eleven SQL assertions verify the parent boundary, unchanged stock/version after rejection, repeated release and deleted-print reconciliation. A real authenticated HTTP case checks invalid/unrelated/unknown paths, no mutation on rejection, successful and repeated release, replacement protection and cancellation after print deletion.
- **Validation**: `npm run verify:deploy` PASS: 77 native tests passed, 1 intentionally skipped; ESLint, Astro check with no diagnostics, production build. `npx supabase test db` PASS: 270 assertions. `npm run test:migrations` PASS: complete populated rows preserved, scratch database removed. `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` PASS: all 12 tests, including setup/teardown, in 23.6 seconds. `git diff --check` PASS.
- **Scope**: F4 only. F3 remains skipped; F5–F9 remain pending.

## F5 — Preserve reservation failure classification and diagnostics

- **Decision**: User approved the proposed fix on 2026-10-16.
- **Status**: FIXED.
- **Implementation**: The three reservation routes now pass the complete service failure to `mapReservationFailure`, identifying preview as a read and reserve/cancel as mutations. The mapper reuses `createPrintDatabaseErrorResponse` from `src/lib/print-response.ts` for unexpected database failures while preserving existing business outcomes. This provides the established 500/503 classification, private/retry headers, mutation uncertainty guidance and server diagnostic boundary.
- **Original read failures**: `currentPrintAndSpool` now returns a typed success/failure result. A committed reserve followed by a failed print or spool read retains that read's original error object and status instead of replacing it with a generic error.
- **Diagnostics**: Added reservation source basenames to the existing bounded diagnostic allowlist. Logs preserve error types, safe SQL/provider codes and known filename/line/column coordinates, including nested cause metadata. Raw error messages, URLs, credentials and request values remain excluded.
- **Regression coverage**: Updated business response assertions to pass complete failures. Two new contracts cover non-transient internal errors, transport/provider outages, read versus mutation recovery guidance, private/retry headers, nested safe diagnostics and original failure/status retention for either confirmation read. Before the implementation fix, the classification and original-error assertions failed.
- **Validation**: `npm run test:reservations` PASS: 8 tests. `npm run verify:deploy` PASS: 79 native tests passed, 1 intentionally skipped; ESLint, Astro check with no diagnostics, production build. `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` PASS: all 12 tests, including setup/teardown, in 22.8 seconds. `git diff --check` PASS.
- **Scope**: F5 only. F3 remains skipped; F6–F9 remain pending. No database changes were required for this fix.

## F6 — Prove concurrent mutations through observed locks and controlled commits

- **Decision**: User approved the proposed fix on 2026-10-16.
- **Status**: FIXED.
- **Implementation**: Replaced the single sleep/timing scenario in `scripts/reservation-concurrency.mjs` with nine controlled interleavings. Separate authenticated PostgreSQL sessions execute real RPCs in explicit Read Committed transactions. The holder stays open until an independent observer sees the competitor's `Lock` wait and the holder's PID in `pg_blocking_pids`. Only then does the controller send COMMIT. Polling time limits bound failures; elapsed time never establishes a passing result.
- **State assertions**: An observer verifies that uncommitted changes remain invisible. After commit, scenarios verify exact business outcomes, recorded/reserved/available grams, print versions, cancellation receipts and retained request states. Duplicate replay preserves the complete committed state, including timestamps. Every case verifies the unrelated print stays unchanged and no fixture spool exceeds recorded stock.
- **Independent owners**: A second owner commits a reservation using the same request UUID while the first owner still holds its transaction and its competitor remains blocked. Both reservations have independent server-generated identities.
- **Bounded cleanup**: Process, SQL statement, idle transaction and observation timeouts bound execution. Failure paths terminate scoped backends and child processes before deleting only the two generated accounts, whose cascading relationships remove product/private fixtures. A temporary copy injected a failure immediately after the holder and blocked competitor were observed. The copy failed as intended; direct checks found zero scoped sessions, users, spools, prints, retained requests and mutexes. The temporary copy was removed.
- **Validation**: `npm run test:reservations:concurrency` PASS: all nine interleavings plus independent-owner progress. `npm run lint` PASS. `git diff --check` PASS. Final local checks found zero concurrency fixture accounts and sessions.
- **Scope**: Test runner and review artifacts only. F3 remains skipped; F7–F9 remain pending. The cross-owner request UUID case previously listed in F7 is now covered by this runner.

| Held mutation | Waiting mutation | Required committed result |
|---------------|------------------|---------------------------|
| Reserve print A | Reserve print B | B rejects with `insufficient_material`; stock is 150 recorded / 88 reserved / 62 available. |
| Reduce stock to 80 g | Reserve 88 g | Reservation rejects against the new 80 g stock; no reservation or request is created. |
| Reserve 88 g | Reduce stock to 80 g | Correction rejects with `stock_below_reservations`; stock remains 150 / 88 / 62. |
| Delete spool | Reserve | Reservation rejects with `insufficient_material`; surviving print stays unreserved. |
| Reserve | Delete spool | Deletion reports 88 g cancellation; surviving print advances to version 3, request is retained as deleted and replay cannot resurrect it. |
| Delete print | Reserve | Reservation rejects with `not_found`; stock stays 150 / 0 / 150. |
| Reserve | Delete print | Deletion reports 88 g released; request is retained as deleted and replay cannot resurrect it. |
| Reserve with a request UUID | Repeat the identical command | Same reservation ID, `replayed: true`, one request and no changes to committed state. |
| Release original reservation | Reserve replacement, then queue stale cancellation behind it | Replacement commits at print version 4; stale cancellation reports `already_released` and leaves its 88 g reservation intact. |

Observer semantics were checked against the PostgreSQL 17 documentation for [blocking PIDs](https://www.postgresql.org/docs/17/functions-info.html) and [session activity](https://www.postgresql.org/docs/17/monitoring-stats.html).

## F7 — Move existing affected CRUD tests to the production RPC boundary

- **Decision**: User approved the focused migration of existing tests on 2026-10-16. The original finding bundled separate coverage proposals; the user-approved scope covers the existing suites affected by moving writes into RPCs.
- **Status**: FIXED (agreed scope).
- **Implementation**: Removed all test-only authenticated write grants from `supabase/tests/prints.test.sql` and `supabase/tests/spools.test.sql`. Ordinary product fixtures now use authenticated `create_print` / `create_spool`, retaining returned IDs in transaction-local settings. Supported creation, edits, deletion and Unicode fixture batches execute the deployed RPCs with unchanged production privileges. Setup writes to `auth.users` remain privileged; direct product writes only test permission denial or the generated-column constraint, which deliberately runs under the privileged role.
- **Preserved checks**: Existing assertions still verify saved normalization, Unicode bytes, quantity boundaries, complete unchanged rows after rejected stock corrections, print versions and ownership isolation. Stale print edits now expect `edit_conflict`; foreign mutations expect `not_found`. Spool validation expectations follow the deployed RPC guards (`invalid_spool` for non-positive creation and `stock_below_reservations` for stock corrections below zero reserved grams). Batch edit counts inspect returned receipt IDs. The row/state assertions were compared with the original suites to check that the migration did not replace independent stored-state checks with input constants.
- **Validation**: `npx supabase test db` PASS: all 270 assertions across three files. `git diff --check` PASS. No production implementation or database schema changed for F7.
- **Deferred coverage**: Canonical reservation matching and deterministic ties, 81 g at 5%, 0%/100% calculation bounds, excessive adjusted demand and native route/auth/cookie execution cases from the original bundled finding were not part of this approved fix. The same-request-UUID-across-owners case is already covered by F6.

## F8 — Add the common cancellation summary to print deletion receipts

- **Decision**: User approved the proposed additive fix on 2026-10-16.
- **Status**: FIXED.
- **Implementation**: `delete_print` in the migration under review retains the owned, locked print row before deletion. Its confirmed receipt adds `cancelledReservations` with the reservation ID, print ID, nullable print name, material, colour and released grams; deleting an unreserved print returns `[]`. The receipt retains `id`, `releasedReservationId`, `releasedGrams` and the affected spool with post-release stock. `src/lib/prints.ts` uses the existing `CancelledPrintReservation` type and includes the array in its result. The existing delete route serializes this result without another mapping or query.
- **Local database**: Transactionally refreshed only `delete_print` with `CREATE OR REPLACE FUNCTION` and reloaded the local REST schema cache. Existing data and grants were preserved. No hosted operation was performed.
- **Regression coverage**: Four SQL assertions verify the complete named-print summary, preserved release fields, exact post-release spool and empty unreserved receipt. The native service contract verifies the summary with a null name, existing scalar fields, owner-scoped spool DTO lookup and JSON response serialization. The existing authenticated HTTP lifecycle test now asserts complete deletion responses for reserved and unreserved prints, plus retained release idempotence and persisted stock.
- **Before the SQL fix**: Two new assertions failed against the original local RPC because `cancelledReservations` was absent.
- **Validation**: `npm run verify:deploy` PASS: 80 native tests passed, 1 intentionally skipped; ESLint, Astro check with no errors/warnings, production build. `npx supabase test db` PASS: 274 assertions. `npm run test:migrations` PASS: populated rows preserved and scratch database removed. `npm run test:reservations:concurrency` PASS: all nine controlled interleavings, independent-owner progress and cleanup. `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` PASS: all 12 tests, including setup/teardown, in 24.1 seconds. `git diff --check` PASS.
- **Scope**: F8 only. F3 remains skipped; F7's additional coverage proposals remain deferred; F9 remains pending.

## F9 — Omit the manual screenshot follow-up

- **Decision**: User explicitly chose to skip this finding on 2026-10-16 after discussing automated screenshots and the separate manual evidence they cannot establish.
- **Status**: SKIPPED.
- **Evidence**: Existing author confirmations for Brave, Firefox and phone, and the recorded absence of screenshots, remain unchanged. No additional screenshot or manual browser result is claimed.
- **Triage completion**: Seven findings fixed (F7 within its agreed scope), two skipped, no pending decisions. F7's additional coverage proposals remain deferred.
