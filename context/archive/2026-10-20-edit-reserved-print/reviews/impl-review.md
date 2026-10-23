<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit Reserved Print Implementation Plan

- **Plan**: context/changes/edit-reserved-print/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-23
- **Verdict**: APPROVED
- **Original verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 0 observations
- **Triage**: Complete — F1, F2 and F3 fixed and verified on 2026-10-23

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Recovery feedback asserts an unknown edit did not apply

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/prints/PrintList.tsx:391
- **Detail**: An exact recovery retry returning `edit_conflict` produces “A newer edit changed this print before the command could apply.” The original edit may itself have committed and advanced the version. The existing real-commit fixture at `tests/e2e/print-recovery.spec.ts:232` commits the original request, drops its reply and observes a 409 on retry without another edit. The displayed sentence therefore invents a rejection history, even though the following sentence correctly acknowledges that the historical result cannot be recovered. The `print_settled` branch similarly assumes settlement preceded the original edit; settlement could have followed it. Phase 3 explicitly requires a recovery conflict not to claim the original edit failed.
- **Fix**: Use neutral recovery wording stating that the submitted version is no longer current (or the print is now settled), that the original edit may have completed, and that its exact result cannot be recovered; strengthen the existing lost-response browser assertion.
- **Decision**: FIXED — author selected Fix now on 2026-10-23. Recovery now describes the current print state and explicitly acknowledges that the original edit may have completed. Existing lost-response E2E cases verify the neutral message during failed collection reads and after successful reconciliation.

### F2 — Committed edit receipts accept contradictory recalculation arithmetic

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/print-update-dto.ts:101
- **Detail**: The decoder compares `print.reservation.reservedGrams` with `recalculation.reservationGrams`, but never derives the expected amount from `print.requiredGrams` and `recalculation.marginPercent`. A read-only runtime probe accepted a 100 g print at 10% with both reservation amount fields equal to 1 g; the required result is 110 g. The insufficient-material branch also accepts an unrelated calculated amount. This violates Phase 2's inconsistent-result rejection contract and allows an internally inconsistent response to be treated as confirmed success by both the service and browser. No database misallocation was reproduced.
- **Fix**: Validate `reservationGrams === Math.ceil(print.requiredGrams * (100 + marginPercent) / 100)` for every recalculation outcome and add negative native fixtures where the two returned totals agree with each other but contradict the requirements and margin.
- **Decision**: FIXED — author selected Fix now on 2026-10-23. The shared decoder now checks the derived reservation amount before handling any recalculation outcome. Native regression fixtures cover all four outcomes, margins 0/5/10/100, ceil rounding, supported numerical boundaries, and mutually consistent but incorrect returned amounts.

### F3 — Browser acceptance omits failed retries of already uncertain commands

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/reservation-recovery.spec.ts:683
- **Detail**: Phase 4 expressly requires uncertainty to survive failed/unreadable exact retries and pre-lock validation or authentication failures. Current cancellation recovery fixtures corrupt the initial reply, then require the retry to succeed (lines 686–690); edit recovery fixtures likewise resolve via success or post-lock conflict. Neither suite exercises an already uncertain exact retry receiving 401, 422, a transport failure, unreadable success, or 5xx. The held-request cases (`print-recovery.spec.ts:405`, `reservation-recovery.spec.ts:823`) keep the first browser fetch pending and submit the competing command from another page; they prove pending guards and database stale-command safety, but do not exercise the originating page's uncertain recovery while the original server command remains outstanding. These are gaps in the claimed Phase 4 acceptance, not reproduced failures of the current guard implementation.
- **Fix**: Extend the existing recovery fixtures with failed exact retries and a detached held original request, asserting unchanged command bytes/version, disabled mutations, and inability of successful collection reads to clear uncertainty.
  - Strength: Directly proves the plan's key distinction between an unresolved command and a post-lock definitive result using the existing browser harness.
  - Tradeoff: Adds browser scenarios and requires explicit coordination of the held request and cleanup.
  - Confidence: HIGH — the missing branches are explicit in the plan and absent from the reviewed browser suites.
  - Blind spot: Current code appears conservative on these responses; this review did not demonstrate a guard failure.
- **Decision**: FIXED — author selected Fix now on 2026-10-23. Added 13 browser scenarios covering failed exact retries for both operations and recovery on the originating page before a detached original command arrives. The full 80-test browser suite and deploy verification gate passed.

## Scope and evidence

- Baseline: `4a722a8e5dcc172353d889de884603b48bc6b707`; reviewed through `6c57d0f`, with an initially clean working tree. The baseline is named in the plan and immediately precedes the feature commits, avoiding a date-only range that could mix unrelated work.
- Canonical Progress: 15/15 criteria checked; current phase 4; `change.md` initially `implemented`, updated 2026-10-23.
- All four phases were reviewed: database/versioning, API/contracts, form/recovery, end-to-end acceptance.
- Planned production and test changes are present. The append-only migration preserves identity/age, immutable original request fingerprints, mutable current-spool evidence, versioned cancellation, no-fit saves, and settlement compatibility. No security, owner-isolation, atomicity, or substantive architecture/pattern violation was found.
- The extra shared table component, stock presentation, CSS and related E2E helper changes are covered by the author's recorded Data Table approval in `verification.md` and Progress 4.6. They are not unauthorized scope creep.
- Manual rows 3.3, 4.6 and 4.7 are checked. `verification.md` records author-run Chrome, Firefox, phone and persistence checks. This review acknowledges that evidence and does not independently claim to have repeated those manual checks.
- Existing create/delete and settlement recovery behavior was inspected alongside the changed edit/cancellation paths.
- The initial review made no production-code or test edits. The author-approved triage changes are recorded below.

## Verification rerun

Node `v24.21.0` matches `.nvmrc`. Existing dependencies, local Supabase, Docker and Mailpit were available. Commands were run from the project root. Repeated phase commands were executed once against the final tree, covering all phases that require them.

| Command | Result | Actual output excerpt |
|---------|--------|-----------------------|
| `npx supabase test db` | PASS | `All tests successful. Files=6, Tests=546 ... Result: PASS` |
| `npm run test:migrations` | PASS | `PASS populated upgrade backfills evidence, preserves renamed legacy replay, and supersedes it only after S-05 recalculation`; `PASS scratch database cleaned up` |
| `npm run test:reservations:concurrency` | PASS | `PASS all 46 interleavings verified; sessions and account fixtures cleaned up` |
| `npm run test:prints && npm run test:reservations && npm run test:settlements && npm run test:settings` | PASS | Print 22/22; reservation 12/12; settlement 6/6; settings 5/5 |
| `npm run verify:deploy` | PASS | Native contracts passed; lint passed; Astro: `0 errors, 0 warnings, 6 hints`; production build: `Complete!` |
| `E2E_PORT=4322 npm run test:e2e` | PASS | `67 passed (1.9m)`, including auth provisioning/teardown and the single-worker Chromium suite |
| `BASE_URL=http://127.0.0.1:4322 npm run smoke` | PASS | Separate built preview after E2E completed; `PASS expired account A session refreshes and rotates cookie tokens`; `PASS revoked account B refresh is rejected and auth chunks are deleted`; `All auth smoke steps passed` |
| Read-only inconsistent-receipt probe | GAP REPRODUCED | `{"expectedGrams":110,"returnedGrams":1,"invalidReceiptAccepted":true}` |

The deploy gate includes one intentionally skipped opt-in hook integration test; all executed native tests passed. Astro also emitted the existing missing-`site` sitemap build warning. Neither caused a failing command.

Full command logs for this review run are in `/tmp/printplan-impl-review-{deploy,db,migrations,concurrency,e2e,smoke}.log`; these temporary logs are not durable repository artifacts. The command results and relevant output excerpts are retained above.

Passing existing automated gates does not establish the omitted browser acceptance cases in F3. Manual results remain the author's recorded evidence.

## Triage verification

### Verification for F1 — 2026-10-23

- Changed `src/components/prints/PrintList.tsx` to describe a no-longer-current version or a print that is now settled without asserting which event preceded the original edit. Both recovery messages acknowledge that the original edit may have completed.
- Extended the existing lost-response cases in `tests/e2e/print-recovery.spec.ts` to assert the neutral message while either collection read fails and after reconciliation.
- `npm run lint`: PASS.
- Production build through the browser harness: PASS.
- `E2E_PORT=4322 npm run test:e2e -- tests/e2e/print-recovery.spec.ts --grep 'a lost committed reserved edit cannot be reconstructed'`: PASS, `4 passed (14.4s)` (two Chromium cases plus authentication setup and teardown).
- The first browser attempt failed before running either acceptance case because local Supabase status discovery timed out. A separate status check succeeded; the unchanged test command then passed. No timeout or harness configuration was altered.
- `git diff --check`: PASS.
- Logs: `/tmp/printplan-triage-f1-lint.log`, `/tmp/printplan-triage-f1-e2e.log`, `/tmp/printplan-triage-f1-e2e-retry.log` (temporary files).

### Verification for F2 — 2026-10-23

- Added the derived-amount check in `src/lib/print-update-dto.ts` before branching on the outcome, so saved-unreserved results are checked too. The validated integer bounds keep the multiplication below JavaScript's safe-integer limit.
- Added native fixtures with independently specified expected amounts: 1 g at 0% yields 1 g, 81 g at 5% yields 86 g, 100 g at 10% yields 110 g, and 2,147,483,647 g at 100% yields 4,294,967,294 g. All four recalculation outcomes accept valid amounts and reject both small contradictory totals and off-by-one totals, even when both returned reservation amounts agree.
- `npm run test:prints`: PASS, 23/23 tests.
- `npm run verify:deploy`: PASS; native contracts, lint, type checks and production build passed, with the existing six nonblocking Astro hints and missing-site sitemap warning.
- `git diff --check`: PASS.
- Logs: `/tmp/printplan-triage-f2-prints.log`, `/tmp/printplan-triage-f2-deploy.log` (temporary files).

### Verification for F3 — 2026-10-23

- Added `tests/e2e/exact-command-recovery.spec.ts` with ten cases for authentication (401), validation (422), server (503), transport, and unreadable-success failures on already uncertain edit and cancellation retries.
- Unreadable-success cases execute the real mutation before corrupting its reply. The following exact retry resolves through the existing version conflict or terminal release contract. Other injected failures leave the database unchanged until the final successful retry.
- Every failure case checks identical submitted command bytes and the original expected version, guarded mutations after successful reads of both collections, retained edit drafts, and the final version, reservation and stock totals.
- Three more cases queue a captured original command at the transport boundary independently of the failed browser connection. The originating page resolves uncertainty while that command is still queued; releasing it afterward yields an edit conflict or terminal `already_released` response, with no second version increment. A competing same-ID recalculation also leaves its resized allocation intact after both the retry and late original cancellation are rejected.
- The tests use explicit deferred coordination without sleeps. Playwright's shared browser-context request cookies were checked against the official APIRequestContext documentation via Context7.
- The first development run exposed incorrect assumptions in the new assertions about hidden Delete controls during editing and the Releasing label during guarded cancellation. The run was stopped, those test assertions were corrected to the existing UI, and the focused suite then passed. F3 required no production-code changes.
- `E2E_PORT=4322 npm run test:e2e -- tests/e2e/exact-command-recovery.spec.ts`: PASS, `15 passed (35.5s)` (13 new Chromium cases plus authentication setup and teardown).
- `npm run verify:deploy`: PASS; native contracts, lint, type checks and production build passed. Astro checked 110 files with 0 errors, 0 warnings and the existing six hints. The existing sitemap configuration warning remains nonblocking.
- `E2E_PORT=4322 npm run test:e2e`: PASS, `80 passed (2.4m)`, covering all three triage fixes and the existing browser recovery suites.
- `git diff --check`: PASS.
- Logs: `/tmp/printplan-triage-f3-focused.log`, `/tmp/printplan-triage-f3-focused-retry.log`, `/tmp/printplan-triage-final-deploy.log`, `/tmp/printplan-triage-final-e2e.log` (temporary files).

## Triage summary

- Fixed: F1, F2, F3 (3).
- Pending: none.
- Post-triage verdict: APPROVED. The original findings and review evidence above are retained alongside their decisions and subsequent verification.
