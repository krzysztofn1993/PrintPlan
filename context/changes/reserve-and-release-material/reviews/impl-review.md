<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Reserve and Release Material

- **Plan**: context/changes/reserve-and-release-material/plan.md
- **Scope**: Full plan (4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-16
- **Source revision**: c67df75
- **Baseline**: 12740e410d13a8d098093a9bfa57ae147a673dd4
- **Progress**: 17/17 checked; current phase 4; change status was `implemented`.
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

The non-critical Plan Adherence failure reflects missing explicit database acceptance coverage and incomplete boundary contracts. Existing automated checks pass, but their implemented scope is narrower than the completed plan claims. No cross-owner data disclosure or overbooking was demonstrated. The preview race was established by tracing the handlers; the NULL version and replay defects were reproduced against the local database in transactions ending with ROLLBACK.

## Findings

### F1 — Late preview responses can confirm a different quantity

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/prints/PrintList.tsx:269
- **Detail**: `loadReservationPreview` stores every successful response in shared preview state without checking the currently open print or request generation. Switching panels does not invalidate an outstanding request. Open A (80 g), then B (100 g), both version 1 with the same matching labels and a 150 g spool. If B's preview completes first and A's completes last, B's panel displays an 88 g reservation. `confirmReservation` at line 300 posts B's ID with A's preview version and spool, and the database correctly reserves 110 g for B. The committed quantity differs from the quantity shown for confirmation. Response validation checks the request's captured print ID, which does not establish that the panel is still displaying that print.
- **Fix**: Track the active print and preview request generation, invalidate outstanding previews on switch/close/refresh, ignore obsolete results, and require `preview.printId === print.id` before rendering and submitting confirmation. Cover overlapping preview completions.
  - Strength: Preserves database authority while binding the user's confirmation to the displayed print and preview.
  - Tradeoff: Requires coordinated lifecycle handling for successful and failed preview responses.
  - Confidence: HIGH — the shared state and unchecked submission path directly permit the described interleaving.
  - Blind spot: The existing browser suite does not reproduce overlapping preview requests; this finding was verified by code tracing.
- **Decision**: FIXED — user selected the proposed fix on 2026-10-16. Preview responses now require the current request generation and active print; closing, reopening, entering another editor, refreshing and unmounting invalidate obsolete requests. Rendering and confirmation check the preview's print identity. Four browser regressions pass, including stale success/network/conflict responses and reopening the same print. See `../follow-ups/review-fixes.md` for validation.

### F2 — NULL arguments bypass RPC version and replay checks

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261016000000_reserve_and_release_material.sql:189
- **Detail**: The authenticated `update_print` RPC compares versions with `<>`. A NULL `p_expected_version` makes the condition NULL, so the update proceeds. In a local authenticated transaction, an edit advanced the print to version 2 with 90 g, then an RPC call with NULL version overwrote it with an older 80 g payload and advanced to version 3. HTTP validation does not protect direct RPC callers. Related replay fingerprint comparisons at line 265 use the same nullable `<>` predicates: replaying a successful reserve with NULL expected version returned `replayed: true`, instead of rejecting different command parameters. A new reserve with NULL version does not commit: the request ledger's NOT NULL constraint eventually rejects it.
- **Fix**: Reject missing or invalid required RPC parameters explicitly, and use `IS DISTINCT FROM` for version and retained-command fingerprint comparisons. Exercise NULL values at the authenticated RPC boundary.
  - Strength: Protects the authoritative mutation boundary for both application and direct RPC callers.
  - Tradeoff: Requires a migration strategy appropriate to whether the reviewed migration has already shipped.
  - Confidence: HIGH — both the overwrite and permissive replay were reproduced against local PostgreSQL with rollback.
  - Blind spot: Hosted migration application state was not inspected.
- **Decision**: FIXED — user requested the smallest implementation cost on 2026-10-16. Three existing SQL conditions now use `IS DISTINCT FROM`: print edit version, reservation version and retained replay parameters. The existing version column and trigger remain the mechanism. Nine authenticated SQL assertions cover NULL versions, unchanged saved data and each nullable replay parameter. All 259 database tests, the current concurrency runner and populated migration verification pass. See `../follow-ups/review-fixes.md`.

### F3 — Malformed mutation receipts can be accepted as confirmed success

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/spools/SpoolInventory.tsx:207
- **Detail**: The confirmed spool-delete branch uses `flatMap` to silently discard malformed cancellation entries. A successful response `{ id: spool.id, cancelledReservations: [{}] }` removes the row and reports that no active reservations were cancelled, rather than preserving the uncertainty guard. The print-delete branch (`PrintList.tsx:465`) accepts an ID-only receipt and defaults unreadable released grams to zero. Reserve/release handlers (`PrintList.tsx:333` and `:413`) also omit parts of their declared receipt, including disposition and spool validation. Phase 3 requires unreadable successes to stay guarded until a readable authoritative refresh, and malformed structured receipts are not covered by the current browser cases.
- **Fix**: Introduce strict parsers for complete mutation receipts, validate every cancellation entry without filtering, and route malformed successes through the existing uncertainty guard. Add committed-write cases with malformed structured receipts.
  - Strength: Makes deletion feedback truthful and applies the planned recovery contract consistently.
  - Tradeoff: Requires updates across the receipt producers, collection handlers and contract fixtures.
  - Confidence: HIGH — malformed data reaches the explicit success branches in the current handlers.
  - Blind spot: The current suite checks unreadable JSON/body cases but does not exercise each malformed structured receipt described here.
- **Reassessment**: Downgraded during triage. No current server path producing such malformed structured success receipts was identified. Existing recovery covers HTTP failures and unreadable JSON; the proposed checks would harden the declared response contract but cannot detect every semantically incomplete, correctly shaped response. This is lower-priority defensive work for the current implementation.
- **Decision**: SKIPPED — user accepted deferring this contract hardening on 2026-10-16, given the low apparent likelihood and preference for minimal implementation cost. No code change requested for F3.

### F4 — Cancellation ignores the print identifier in its route

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/prints/[id]/reservation/cancel.ts:39
- **Detail**: The cancellation route never reads `context.params.id`; it passes only the form reservation ID to the service/RPC. An owner can cancel their reservation using an invalid, unrelated or foreign print ID in the URL. The preview and reserve siblings validate their print paths. Phase 2 requires identifier validation and indistinguishable unknown/foreign print failures. Reservation ownership still prevents cancelling another owner's reservation; this finding concerns the missing parent-resource binding.
- **Fix**: Validate the path ID and bind it to the owner's retained reservation request before cancellation, preserving repeat cancellation after product deletion and protection of later replacement reservations.
  - Strength: Enforces the documented nested endpoint contract without discarding retained lifecycle evidence.
  - Tradeoff: Requires carrying the expected print ID through the service and authoritative operation boundary.
  - Confidence: HIGH — neither the route nor its called release service receives or checks the path ID.
  - Blind spot: Existing reservation native tests do not execute this route with mismatched print/reservation pairs.
- **Decision**: FIXED — user approved the proposed fix on 2026-10-16. The cancellation route validates its print ID and passes it through the service and typed RPC contract. The release RPC matches the owner, reservation ID and required print ID against the retained request before modifying state. SQL and real HTTP tests cover mismatched paths, unchanged reservation/version, repeated release, replacement safety and release after print deletion. See `../follow-ups/review-fixes.md`.

### F5 — Unexpected reservation errors lose their causes and classification

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/reservation-response.ts:25
- **Detail**: Services retain `error` and `status`, but the routes pass only `result.reason` into `mapReservationFailure`. Every unrecognised failure becomes an availability 503 with no retained server cause or diagnostic path. A programming error, malformed RPC receipt or non-transient database failure therefore looks like a temporary outage. Phase 2 specifies infrastructure 503, unexpected 500 and preserved original causes. Existing print/spool response helpers classify these cases and retain a cause; the reservation boundary omits that pattern. `currentPrintAndSpool` also replaces read failure details with `undefined`.
- **Fix**: Pass complete failure objects through the established database error classification and diagnostic seam, preserve the original cause, and retain refresh-required guidance for uncertain mutations regardless of whether the HTTP result is 500 or 503.
  - Strength: Restores the planned failure contract and makes unexpected reservation failures diagnosable without exposing request data.
  - Tradeoff: Requires updating all three reservation routes and error mapping assertions.
  - Confidence: HIGH — the mapper accepts only a string and its fallback always returns 503.
  - Blind spot: No hosted monitoring system was inspected; this finding is limited to the implemented error path.
- **Decision**: FIXED — user approved the proposed fix on 2026-10-16. All three reservation routes pass the complete failure and read/mutation context to the existing print database response boundary. Unexpected failures retain bounded safe cause diagnostics and return 500; transient failures retain 503/retry guidance. Mutation failures retain refresh-required guidance. Confirmation reads now preserve their original error/status instead of replacing them with a generic error. Native regression coverage and the reservation recovery suite pass. See `../follow-ups/review-fixes.md`.

### F6 — Concurrency runner does not prove the required interleavings

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: scripts/reservation-concurrency.mjs:103
- **Detail**: The holder updates a 150 g spool to the same 150 g, sleeps 1.8 seconds, and one competitor reserves it. A 250 ms launch delay and elapsed-time thresholds replace the planned observer confirming lock waiting. Because the holder changes no relevant value, a stale pre-wait read would produce the same final 150/88/62 state. Missing cases include both operation orders for reserve/stock reduction and reserve/deletion, reserve/reserve, duplicate request, and release/re-reserve/stale cancel. Independent-owner progress is exercised, but checked Progress item 1.2 overstates fresh-state, no-overbooking and replay proof.
- **Fix**: Add deterministic session barriers and observed lock waiting, hold operations that change eligibility/state, and assert the required outcomes for every named interleaving with bounded cleanup.
  - Strength: Detects stale checks and lifecycle races that the current successful runner cannot distinguish.
  - Tradeoff: Expands the database integration harness and its coordination logic.
  - Confidence: HIGH — the runner contains one held no-op stock update and one same-owner competing mutation.
  - Blind spot: This is missing proof; no overbooking defect was demonstrated.
- **Decision**: FIXED — user approved the proposed fix on 2026-10-16. The runner now controls transaction commits explicitly and observes the blocking backend with `pg_stat_activity` and `pg_blocking_pids`. All nine required interleavings pass, including both directions of stock correction and both product deletion types, duplicate requests and release/replacement/stale cancellation. Another owner commits with the same request UUID before the held owner is released. State assertions cover visibility, stock, versions, receipts, retained request evidence and the unchanged control print. An injected failure with an open holder and blocked competitor verified complete session/fixture cleanup. See `../follow-ups/review-fixes.md`.

### F7 — SQL regression tests restore the write access removed in production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/prints.test.sql:6
- **Detail**: Both legacy SQL suites (`prints.test.sql:6` and `spools.test.sql:6`) re-grant authenticated INSERT/UPDATE/DELETE and continue testing supported writes through the old direct table boundary. Phase 1 explicitly requires migrating authenticated supported-write fixtures to RPCs. Their constraint/normalization assertions remain useful, but passing them does not prove the deployed definer RPC contracts. The new reservation SQL suite omits the specified canonical matching, deterministic ties, 81 g at 5%, 0%/100% calculation bounds, excessive adjusted demand and identical request UUIDs across owners. The native reservation suite also lacks the planned route/auth/cookie execution checks. The reproduced NULL version defect is an example of an RPC-only regression the old table fixtures miss.
- **Coverage update**: F6 verifies identical request UUIDs across owners through real concurrent authenticated SQL sessions. The F7 fix migrates both existing CRUD suites to authenticated RPCs without restoring write grants. The user explicitly narrowed this fix to existing tests affected by the RPC migration; the additional numeric/matching and native route scenarios listed in the original finding remain deferred outside this approved scope.
- **Fix**: Exercise supported authenticated CRUD through the deployed RPC boundary, retain privileged setup only for constraint-specific fixtures, and add the named reservation edge and route/authentication contracts.
  - Strength: Aligns verification with the production permissions and operation functions that now own correctness.
  - Tradeoff: Requires rewriting existing fixtures and adding the omitted boundary cases.
  - Confidence: HIGH — the restored grants and omitted cases are explicit in the reviewed test sources.
  - Blind spot: Existing smoke/browser checks cover some ordinary RPC behavior, but cannot replace the missing database edge cases.
- **Decision**: FIXED (agreed scope) — user approved migrating the existing affected CRUD tests on 2026-10-16 after separating the additional coverage work from this finding. Both suites now create their ordinary fixtures and execute supported writes through authenticated RPCs under production permissions. Existing normalization, quantity, version and ownership assertions are retained; expected failures follow the RPC contract. Privileged direct product writes remain only for the generated-column constraint. `npx supabase test db` passes all 270 assertions. The additional scenarios in the original bundled finding are deferred, not claimed as covered. See `../follow-ups/review-fixes.md`.

### F8 — Print deletion omits the planned cancellation summary array

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/prints.ts:201
- **Detail**: Phase 2 specifies that existing delete responses retain `id` and add `cancelledReservations` entries containing reservation/print identity, name, material, colour and released grams. Print deletion instead returns `releasedReservationId`, `releasedGrams` and `spool`; the database receipt has the same alternative shape. Existing UI still communicates released grams, so no stock loss or broken current caller was demonstrated, but the documented common deletion contract is absent.
- **Fix**: Add the planned `cancelledReservations` array to the print-delete database/service/HTTP receipt and cover it in contract tests, preserving existing fields for current callers.
- **Decision**: FIXED — user approved the proposed additive fix on 2026-10-16. The delete RPC captures the owned print before deleting it and returns `cancelledReservations` with reservation/print identity, nullable name, material, colour and released grams, or an empty array when unreserved. The service forwards the summary through the existing HTTP response while preserving `id`, `releasedReservationId`, `releasedGrams` and the post-release spool. Four SQL assertions, a native SDK/service contract and real authenticated HTTP assertions cover both outcomes and existing fields. All verification passes; see `../follow-ups/review-fixes.md`.

### F9 — Required manual screenshots are absent

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/reserve-and-release-material/verification.md:29
- **Detail**: Phase 4 requires screenshots and results for supported desktop/phone checks. The verification record explicitly says no screenshots were attached while Progress 4.5/4.6 are checked. It records author confirmation for Brave, Firefox and phone, and accepts Brave in place of Chrome. Those confirmations are acknowledged; the missing screenshots limit independently reviewable evidence. Keyboard browser automation is present, but this review did not independently repeat manual Firefox or phone interaction.
- **Fix**: Attach the planned desktop/phone screenshots to the verification record and state the actual browser versions, viewport and manual results.
- **Decision**: SKIPPED — user explicitly chose to omit the screenshot follow-up on 2026-10-16 after discussing its cost and evidence limits. Existing author confirmations for Brave, Firefox and phone remain recorded, together with the absence of screenshots. No automated screenshot was substituted for those manual checks.

## Scope and plan comparison

- Reviewed all four completed phases, against the plan's explicit baseline rather than an ambiguous date-derived range. Git scope contains 50 changed files; the starting working tree was clean.
- Persistence, owner mutex acquisition before product reads, numeric arithmetic, same-owner constraints, security-invoker views, private retained request evidence and direct production write revocation match the selected architecture.
- Shared view reads, RPC CRUD, reservation DTOs, temporary edit controls, collection-owned mutations, normal committed-write recovery, upgrade verification and CI wiring are present. Exceptions are recorded as findings rather than counted as unconditional matches.
- No early margin settings, automatic recalculation, settlement, reservation splitting, realtime synchronization or unrelated production feature was found. Shared DTO parser files implement the explicitly planned parser contract. PRD/roadmap edits include planning inputs acknowledged by the plan; affected test-plan updates are authorized phase 4 work.
- Accepted lesson checked: commit messages do not list changed file paths. No violation found.

## Verification

Commands were run with Node v24.21.0 against the existing local Supabase services. Repeated phase commands were satisfied by the final integrated run; the scoped reservation browser command was also run separately.

| Command | Current review result |
|---------|-----------------------|
| `npm run verify:deploy` | PASS: 77 native tests passed, 1 intentionally skipped hook integration test; ESLint; Astro check with 0 errors/0 warnings; production build. |
| `npm run test:reservations` | PASS as part of the integrated gate: 6 tests. |
| `npm run test:spools` | PASS as part of the integrated gate: 15 tests. |
| `npm run test:prints` | PASS as part of the integrated gate: 19 tests. |
| `npx supabase test db` | PASS: 250 pgTAP tests across 3 files. Coverage limitations: F6/F7. |
| `npm run test:reservations:concurrency` | PASS: independent owner, one same-owner wait, final 150/88/62 totals. Coverage limitations: F6. |
| `npm run test:migrations` | PASS: complete committed spool/print row preservation; scratch database removed. |
| `E2E_PORT=4326 npm run test:e2e` | PASS: 19 tests, including setup/teardown, in 28.5 seconds. |
| `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` | PASS: 7 tests, including setup/teardown, in 15.9 seconds. |
| `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` | PASS: authenticated production preview; persisted US-01, replay/replacement, owner isolation, CRUD, logout/login, expired-session refresh and revoked-session checks. |

Observed native output: `tests 16 / pass 15 / skipped 1` (hooks), `tests 22 / pass 22` (auth), `tests 15 / pass 15` (spools), `tests 19 / pass 19` (prints), `tests 6 / pass 6` (reservations). SQL output: `Files=3, Tests=250`, `All tests successful`, `Result: PASS`. Migration output confirms complete spool/print preservation and scratch database cleanup. Build emitted the existing missing `site` sitemap warning.

Local rollback probes additionally established:

```text
update_print(valid version 1, required grams 90) -> version 2
update_print(NULL version, stale required grams 80) -> accepted
persisted inside transaction -> version 3, stale name, required grams 80
reserve_print_material(original successful arguments) -> replayed false
reserve_print_material(same key, expected version NULL) -> replayed true
ROLLBACK after each probe
```

Manual Progress rows 3.3, 3.4, 4.5 and 4.6 remain unchanged. Author browser/phone confirmations are preserved as existing evidence; missing screenshots are recorded in F9. No new remote CI run or hosted database was inspected. The initial review did not edit production implementation files; subsequent authorized triage changes are recorded below.

## Triage progress

- **Fixed**: F1, F2, F4, F5, F6, F7 (agreed scope), F8.
- **Skipped**: F3 (downgraded to OBSERVATION; deferred contract hardening), F9 (manual screenshots omitted by user decision).
- **Pending**: none. Triage complete.
- **F1 verification**: `npm run verify:deploy` passed (77 native tests passed, 1 intentionally skipped; ESLint, Astro check and build passed). `E2E_PORT=4326 npm run test:e2e` passed all 23 tests, including setup/teardown, in 32.8 seconds. The four new browser cases verify real persisted reservation amounts after controlled preview interleavings.
- **F2 verification**: Before the SQL change, eight regression assertions failed. After refreshing the two local RPC definitions, `npx supabase test db` passed all 259 assertions, `npm run test:reservations:concurrency` passed its current scenarios, and `npm run test:migrations` preserved complete spool/print rows and removed its scratch database. The broader concurrency/coverage limitations in F6/F7 remain pending.
- **F4 verification**: `npm run verify:deploy` passed (77 native tests passed, 1 intentionally skipped; ESLint, Astro check and build passed). `npx supabase test db` passed 270 assertions, including eleven new release boundary/lifecycle checks. `npm run test:migrations` passed. `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` passed all 12 tests, including setup/teardown, in 23.6 seconds; the new HTTP case checks invalid/unrelated/unknown print paths, current state, repeated release, replacement safety and print deletion.
- **F5 verification**: `npm run verify:deploy` passed (79 native tests passed, 1 intentionally skipped; ESLint, Astro check and build passed), including 8 reservation contracts. New assertions cover 500/503 classification for reads and mutations, refresh/retry/private headers, safe cause diagnostics and both possible failed confirmation reads. `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` passed all 12 tests, including setup/teardown, in 22.8 seconds.
- **F6 verification**: `npm run test:reservations:concurrency` passed all nine controlled interleavings and independent-owner/same-request-UUID progress. `npm run lint` passed. A temporary copy deliberately threw after an open holder and observed blocked competitor; it exited with the injected error and left zero scoped sessions, accounts, products, request ledger rows or mutexes. Final local checks found zero concurrency fixture accounts and sessions. No production code or schema was changed for F6.
- **F7 verification**: `npx supabase test db` passed all 270 assertions across the three SQL suites. Both existing CRUD suites use the applied RPCs for ordinary fixtures and supported authenticated writes without any test-only grants. Existing row/state assertions were compared with the original suites and retained, with the stale-update expectation adapted to `edit_conflict` and batch counts based on RPC receipts. Direct writes exercise denied access or, under the privileged role, the generated-column constraint. Additional reservation edge and native route coverage remains deferred outside the scope approved by the user.
- **F8 verification**: Before refreshing the local RPC, two new summary assertions failed against the old function. After the fix, `npx supabase test db` passed all 274 assertions. `npm run verify:deploy` passed (80 native tests passed, 1 intentionally skipped; ESLint, Astro check with no errors/warnings, build). `npm run test:migrations` preserved populated rows and removed its scratch database. All nine controlled concurrency interleavings passed. `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` passed all 12 tests, including setup/teardown, in 24.1 seconds; real deletion responses cover reserved and unreserved prints, the summary array, existing fields and post-release stock.
- **Final triage**: Seven findings fixed: F1, F2, F4, F5, F6, F7 (agreed scope), F8. Two findings skipped by user decision: F3 and F9. No pending decisions remain. F7's additional coverage proposals remain deferred, and its cross-owner request UUID case is covered by F6. The report's original NEEDS ATTENTION verdict and dimension table are retained as the initial review assessment; completing triage does not claim the deferred coverage or missing screenshots were supplied.
