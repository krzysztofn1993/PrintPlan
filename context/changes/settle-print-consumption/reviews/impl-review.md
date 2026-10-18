<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Settle Print Consumption Implementation Plan

- **Plan**: context/changes/settle-print-consumption/plan.md
- **Scope**: Full plan (4 of 4 completed phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-18
- **Verdict**: APPROVED
- **Initial verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation (initial review; all resolved)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

The verdicts reflect completed triage: F1 and F2 are FIXED; F3 was withdrawn as non-actionable ancillary development tooling after the author's clarification. All executed automated gates pass, and manual acceptance has recorded author evidence. Initially, Plan Adherence, Scope Discipline, Safety & Quality and Success Criteria were WARNING; Architecture and Pattern Consistency were PASS. The original findings and historical verification evidence remain below.

## Findings

### F1 — Closing a deleted print's recovered receipt removes its review path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/prints/PrintList.tsx:672
- **Detail**: After a settlement commits and its print is deleted during acknowledgement recovery, the receipt is recovered and both collections reconcile successfully. The workflow becomes `state: "receipt"`, `reconciliation: "complete"` and the guard clears (lines 296–314). Closing the panel then clears `settlementPanelPrintId` (lines 672–673). The deleted print has no row with a Review settlement action; detached rendering requires that selected panel ID (lines 1206–1209 and 1657–1666), while the banner's reopen action requires a blocking workflow (lines 225–231 and 1332–1367). The saved receipt remains in memory and in the database, but the current screen has no way to reopen it. This contradicts the plan's explicit recovery contract that a successful receipt remains reviewable after deletion and closing does not discard the saved review path. The existing deletion-recovery test stops with the panel open (tests/e2e/settlement-recovery.spec.ts:390–439).
- **Fix**: Render an in-memory review action for confirmed settlement workflows whose print row is absent, independently of panel selection and the mutation guard; extend the deletion-recovery test to close and reopen that receipt.
  - Strength: Preserves the approved retained-result behavior using existing collection-owned state, without introducing a history route or persistent browser storage.
  - Tradeoff: Adds a small collection-level presentation and focus path for detached results.
  - Confidence: HIGH — both independent reviews traced the same unreachable state through the selection, guard and rendering conditions.
  - Blind spot: The close/reopen sequence was established by source inspection; the existing runtime test covers deletion recovery only until the result is open.
- **Decision**: FIXED — Author selected the proposed fix on 2026-10-18. Deleted completed prints retain an in-session Review settlement action even when the receipt was never opened in that page. Saved receipts also remain accessible after closing and list refresh; reopening refreshes current collections without resubmitting consumption. Keyboard focus returns to the review action when available, otherwise to the collection heading. Both deletion regressions failed before their respective fixes and now pass in the complete 32-test Chromium suite. See follow-ups/review-fixes.md.

### F2 — Required recovery and database edge cases lack executable proof

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/settlement-recovery.spec.ts:128
- **Detail**: The test titled “a held settlement blocks duplicate actions, a null receipt is not rollback, and exact replay recovers” checks null through `recoveryApi.readPrintSettlement` at line 190 while the UI is still pending. It releases the first POST at line 191; that POST commits before its acknowledgement is masked as 503 (lines 168–175), and the browser's recovery GET also receives 503 (lines 148–153). The browser never receives `{ settlement: null }` while the original command can still commit. Consequently the critical UI branch at PrintList.tsx:384–393 is untested, although Phase 4 explicitly requires this scenario and test-plan.md:184 describes it as covered. Other explicit database proof gaps are consolidated here: the retained-key conflict test changes only actual grams (supabase/tests/settlements.test.sql:127–130), not print/version/reservation; the cancellation fixtures leave spare stock rather than a positive surviving reservation at exact fit (lines 90–109 and 188–191); and the controlled races do not combine settlement with replacement of that print's original reservation (scripts/reservation-concurrency.mjs:513 and 548–802). Current implementation appears to handle these cases; missing proof is not evidence of an additional stock-integrity bug.
- **Fix**: Add a browser scenario that makes the first acknowledgement uncertain while the real original command remains held before commit, delivers a real null result to the UI, verifies the frozen command and collection guard through close/reopen and refresh, then resolves with exact replay. Add focused database cases for retained-key identity/version changes, positive exact-fit cancellation and a replacement-reservation race; make coverage documentation match the observed sequences.
  - Strength: Directly exercises the failure ordering and boundary conditions promised by the approved plan.
  - Tradeoff: Requires coordinated browser acknowledgement and commit gates plus additional SQL/concurrency fixtures.
  - Confidence: HIGH — the missing browser ordering is visible in the route handler and assertions, and the database cases were checked against the complete suites.
  - Blind spot: These omitted cases were not added during this read-only implementation review.
- **Decision**: FIXED — Author selected test completion on 2026-10-18. The browser now receives two real null receipts while the captured original command remains held before forwarding, retains its frozen draft and collection guard through close/reopen and refresh, then resolves with the exact same command after the original commits. SQL tests cover every retained-key command field, complete fixture-state preservation, positive exact-fit cancellation and additional direct-RPC numeric boundaries. Two observed-lock replacement/settlement interleavings were added. Verification passed: verify:deploy, 376 SQL assertions, all 26 concurrency cases and all 32 Chromium tests. See follow-ups/review-fixes.md.

### F3 — Local reset tooling extends the reviewed plan without an addendum

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/reset-local-dev.mjs:1
- **Detail**: The branch adds a 471-line local reset/fixture/server tool, `dev:reset` in package.json:7, and Supabase project/SMTP/POP configuration changes. These are outside the plan's Changes Required inventory. Separate commits 20b0015 and 6f7ce2f explain their local-development purpose, but the plan has no corresponding addendum. No security or data-integrity defect is asserted; the reset command was inspected, not executed.
- **Fix**: Add a short scope addendum describing the ancillary development tooling, local reset behavior and configuration changes.
- **Decision**: DISMISSED — The author clarified that dev:reset is an additional command supporting developer testing. The reviewer withdraws the observation as non-actionable: this is justified ancillary development tooling, with its purpose already explained by the separate development commits, and no functional, security or data-integrity defect was identified. No command removal, implementation change or plan addendum is required.

## Scope and evidence

- Reviewed checkout: `d5cce2b`; comparison: `f9be5d3..d5cce2b` (41 changed files, 6,014 additions and 145 deletions).
- The plan filename has no date. Scope was resolved from the feature commit sequence beginning at `0dcc343`, whose parent is `f9be5d3`, through the current feature epilogue; ancillary commits in that interval were included.
- Canonical Progress: 16/16 checkboxes complete, phases 1–4. The previous change status was `implemented`, updated 2026-10-18.
- Two independent reviews covered plan drift and safety/quality/pattern compliance. No actionable authorization, double-deduction, destructive migration or substantive architecture/pattern violation was found.
- Expected implementation groups match: atomic owner-serialized SQL and durable evidence; additive populated upgrade; completion projections; strict form/receipt/API boundaries; direct receipt success without projection reads; frozen exact-command recovery; completed-row controls; HTTP/browser/native/CI wiring. F1 and F2 qualify that assessment.
- Button focus styling fits Phase 3's allowance for genuinely missing shared UI semantics. The helper heading update supports Phase 4's affected browser helpers. Neither is an extra finding.
- Pre-existing uncommitted skill changes and the roadmap edit were excluded from implementation findings and preserved. Production code was not modified during the initial review; F1 was subsequently fixed during triage as recorded below.

## Automated verification

Commands were run again during this review with Node 24.21.0, the existing local Supabase stack and generated fixtures.

| Command | Result | Observed output |
|---------|--------|-----------------|
| `npm run verify:deploy` | PASS | 88 native tests passed, 1 optional real-tool hook test skipped; lint passed; Astro diagnostics: 0 errors, 0 warnings, 5 hints; production build complete. |
| `npm run test:settlements` | PASS, executed within verify:deploy | 6 tests passed, 0 failed. |
| `npm run test:prints` | PASS, executed within verify:deploy | 21 tests passed, 0 failed. |
| `npm run test:reservations` | PASS, executed within verify:deploy | 8 tests passed, 0 failed. |
| `npx supabase test db` | PASS | Files=4, Tests=354; all tests successful. |
| `npm run test:reservations:concurrency` | PASS | All 24 interleavings verified; sessions and account fixtures cleaned up. |
| `npm run test:migrations` | PASS | Additive settlement migration preserves stock, timestamps, active reservations and request evidence; upgraded reservation settles; scratch database cleaned up. |
| `E2E_PORT=4322 npm run test:e2e` | PASS | 31 passed (51.0s), including auth setup/teardown and 9 settlement tests. |
| `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` | PASS | All auth smoke steps passed, including settlement acceptance and JWT-expiry/refresh checks. |

The existing development server occupied port 4321, so Chromium used port 4322. An initial smoke attempt on a separate built preview at port 4323 stopped at email confirmation because local Supabase generates confirmation links for port 4321. The smoke was rerun with the planned origin and a built preview on port 4321, temporarily replacing the development server. The original development-server command was restored afterward, and the three temporary smoke accounts from these two attempts were deleted; browser and database fixture teardown passed.

Logs from this review: `/tmp/settlement-review-native.log`, `/tmp/settlement-review-db.log`, `/tmp/settlement-review-concurrency.log`, `/tmp/settlement-review-migrations.log`, `/tmp/settlement-review-e2e.log`, `/tmp/settlement-review-smoke.log`.

## Manual verification evidence and limits

All four Manual Progress rows (3.2, 3.3, 4.5 and 4.6) are checked. The sibling verification.md explicitly records author confirmation on 2026-10-18 for keyboard/focus behavior; Chrome, Firefox and phone usability; ordinary, zero and exceeded-estimate consumption; refresh/fresh-login result review; and completed deletion without a stock refund. Corresponding UI and persisted-behavior assertions are present in the browser and HTTP suites, subject to F1/F2. These are accepted recorded author checks, not newly performed Firefox or phone tests by this review.

Browser response faults were simulated at the HTTP boundary against real local writes and independent persisted reads. No remote CI run, hosted outage, production behavior or additional manual device coverage was observed or claimed.

## Triage verification — F1

Author decision on 2026-10-18: apply the proposed F1 fix. F2 and F3 remain PENDING; the original review verdict and finding counts above describe the initial review.

- Before the production fix, the extended deletion-recovery test failed because Review settlement was absent after Close. Auth setup/teardown and fixture cleanup completed normally.
- PrintList now retains review controls for saved receipts whose print rows are absent, using existing in-memory workflow state. Closing the selected panel does not remove those controls; ordinary list refresh also preserves them. Reopening reads current collections using the known receipt rather than submitting a new settlement.
- The regression checks closing, keyboard focus, list refresh and reopening. It independently corrects current stock from 100 g to 90 g and verifies the reopened panel shows 90 g current stock, retains the historical 100 g result and 50 g actual consumption, keeps the print absent, and has issued exactly one settlement POST.
- `npm run verify:deploy` passed: native contracts, lint, Astro diagnostics and build. Diagnostics remained at 0 errors, 0 warnings and 5 existing hints. The final focus fallback adjustment also passed targeted ESLint and the E2E production build.
- `E2E_PORT=4322 npm run test:e2e` passed all 31 tests (44.0s), including the extended regression and generated-account teardown. The existing development server on port 4321 was left running.
- Logs: `/tmp/settlement-f1-red.log`, `/tmp/settlement-f1-native.log`, `/tmp/settlement-f1-e2e.log`.

### Follow-up: completed deletion without a previously loaded receipt

A second regression exposed a gap in the initial F1 fix: after reloading the page, deleting a completed print without opening its result left no workflow or review control. That regression failed with Review settlement absent, reproducing the missing-entry behavior in this supported flow.

Confirmed deletion now preserves the completed print identity and completion summary in existing in-memory workflow state, even when the full receipt has not been loaded. The collection renders its review action from that summary; the existing owner-scoped receipt GET is invoked only when the user chooses Review settlement. Deletion success does not depend on an extra receipt read. Unsettled deleted prints have no settlement result and do not gain this action. Full page reload or navigation still clears these session-only controls; no history route or browser persistence was added.

- The new test completes a print, reloads the page, deletes it without reviewing, refreshes the list, opens and closes its retained result, and checks focus, unchanged stock and exactly one settlement POST.
- `npm run verify:deploy` passed again with 0 Astro errors, 0 warnings and the same 5 hints.
- `E2E_PORT=4322 npm run test:e2e` passed all 32 tests (44.3s), including both F1 regressions and auth teardown.
- The running development server on port 4321 was queried directly and serves the updated deletion handling.
- Logs: `/tmp/settlement-f1-delete-red.log`, `/tmp/settlement-f1-delete-native.log`, `/tmp/settlement-f1-delete-e2e.log`.
- Author acceptance: on 2026-10-18, the author confirmed that the updated behavior works in the local application after retrying it.

## Triage verification — F2

Author decision on 2026-10-18: complete the missing tests. F1 and F2 are now FIXED; only F3 remains PENDING. The initial verdict, findings and historical verification results above are retained as the original review record.

- Browser recovery now has separate gates for the acknowledgement and forwarding of the original captured request. The UI receives a simulated 503 before that command is forwarded. Two actual receipt GETs return null to the browser, including Refresh list with the panel closed. Assertions verify the blocked Add/Delete/Confirm controls, preserved 75 g draft, disabled input, unchanged 150 g recorded / 88 g reserved / 62 g available stock and no saved settlement before forwarding. The original request then commits; exact replay sends identical form data, returns the same immutable receipt with replayed=true and leaves 75 g recorded / 0 g reserved / 75 g available stock.
- SQL replay tests now separately change amount, owned print, expected version and reservation identity under the retained request key. Privileged fixture-only snapshots compare complete product rows, versions, timestamps, active reservations, reserve-request evidence and settlement evidence before/after the rejected commands. Invalid direct-RPC inputs include null, NaN and both infinities, with inclusive maximum consumption also accepted and checked.
- The exact-fit fixture starts at 300 g, settles 234 g, cancels only the newest 44 g reservation and retains the older 66 g reservation against exactly 66 g of stock. It checks zero availability and affected/unaffected versions.
- Observed-lock concurrency now includes release → replacement → stale settlement and settlement → attempted release/replacement. The first also rejects the old reservation identity with the current print version and proves the replacement's complete state remains unchanged. The second preserves the committed settlement exactly and rejects replacement of the completed print.
- Coverage descriptions in context/foundation/test-plan.md distinguish the simulated queued-request/acknowledgement fault from the real database writes and GETs.

| Command | Result |
|---------|--------|
| `npm run verify:deploy` | PASS; native contracts, lint, Astro diagnostics and build; 0 errors, 0 warnings and the same 5 hints. |
| `npx supabase test db` | PASS; 376 assertions across 4 files (22 new assertions). |
| `npm run test:reservations:concurrency` | PASS; all 26 interleavings and fixture/session cleanup. |
| `E2E_PORT=4322 npm run test:e2e` | PASS; all 32 tests (44.6s), including both F1 regressions, the corrected F2 sequence and auth teardown. |

Logs: `/tmp/settlement-f2-browser.log` (focused scenario), `/tmp/settlement-f2-db.log`, `/tmp/settlement-f2-concurrency.log`, `/tmp/settlement-f2-native.log`, `/tmp/settlement-f2-e2e.log`. The existing development server on port 4321 was preserved.

## Triage complete

- **Date**: 2026-10-18.
- **Fixed**: F1, F2.
- **Dismissed**: F3 — justified developer-testing support; no actionable defect.
- **Pending**: none.
- **Final verdict**: APPROVED.

The latest code verification remains the passing native gate, 376 SQL assertions, 26 observed-lock concurrency cases and 32 Chromium tests recorded under F2. Closing F3 changes review documentation only and requires no additional code checks.

