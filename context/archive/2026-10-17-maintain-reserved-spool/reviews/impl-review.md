<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Maintain a Reserved Spool

- **Plan**: context/changes/maintain-reserved-spool/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-20
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation
- **Git scope**: `d14a8a6..507def8` (`cb2d8c9^` through reviewed HEAD `adb8b2a71adff516cfb9e0de8788a5f300850b67`).
- **Progress at review**: 10/10 checked rows; all three phases complete; change status was `implemented`.

## Verdicts

| Dimension           | Verdict                                                          |
| ------------------- | ---------------------------------------------------------------- |
| Plan Adherence      | PASS — F1 coverage gap fixed and verified during triage          |
| Scope Discipline    | PASS                                                             |
| Safety & Quality    | PASS                                                             |
| Architecture        | PASS                                                             |
| Pattern Consistency | PASS                                                             |
| Success Criteria    | PASS — required commands passed; F1 follow-up checks also passed |

## Findings

### F1 — Planned colour-conflict restoration scenario is not covered

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/reservation-recovery.spec.ts:345
- **Detail**: Phase 1 explicitly requires drafting Red colour on an unreserved Black spool, then creating a reservation, refreshing without losing the draft, and explicitly restoring the saved colour while retaining grams. The implemented case instead fills the Material field with `Red` and keeps Colour at `Black` throughout (lines 345, 356–357, 379–380). It proves material-conflict handling, but would not detect removal of the colour comparison at `SpoolForm.tsx:103` or the colour restoration at `SpoolForm.tsx:277`. Production code currently implements both correctly; this is a regression-coverage gap, not an observed application failure.
- **Fix**: Parameterize the existing scenario for material and colour conflicts, retaining the draft, no-request, unchanged persisted state, and deliberate-save assertions.
- **Decision**: FIXED — parameterized the existing browser scenario for independent material and colour conflicts; both passed on 2026-10-20.

## Scope and source evidence

The plan filename has no date and its research baseline predates the rebase. The reviewed range therefore uses the first feature implementation commit's parent and all subsequent feature/follow-up commits, rather than a date-wide repository diff. The range changes 11 files. Existing unrelated working-tree edits to toolkit skills and the roadmap were excluded.

| Files                                                                  | Evidence and assessment                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/spools/SpoolForm.tsx`                                  | Generic guardrail messages at lines 206–226 avoid stale numeric minimums. Dedicated refresh at lines 249–271 preserves raw inputs and releases pending state in `finally`. Conflict detection and explicit restoration at lines 99–105 and 274–279 use the latest saved DTO; grams are untouched.                                                                                                                                   |
| `src/components/spools/SpoolInventory.tsx`                             | Lines 72–127 validate the complete list before replacement, preserve the keyed editor for correction, and close a missing target with an unsaved-correction message. Existing uncertainty reconciliation remains separate. Lines 16–17 and 480–495 give truthful deletion guidance and planned-print navigation; refresh performs GET rather than repeating deletion. Existing complete readable cancellation feedback is retained. |
| `tests/e2e/reservation-recovery.spec.ts`                               | Real 87/88 g boundary; 88-to-143 g stale totals; failed refresh; retained draft; disappeared target; explicit label restoration; complete multi-reservation cancellation identities; fresh persisted reads and request counts. F1 qualifies colour-specific coverage.                                                                                                                                                               |
| `tests/e2e/spool-recovery.spec.ts`                                     | Preserves the existing unreserved-delete survivor case and adds a real committed reserved deletion with masked acknowledgement, one deletion POST, failed-refresh guard retention, and successful current-state reconciliation.                                                                                                                                                                                                     |
| `src/styles/global.css`                                                | The three-line descendant rule at lines 434–436 removes duplicate top spacing inside shared feedback actions. This supports the planned dashboard design contract and is documented in the post-rebase verification record; it is a bounded, justified addition.                                                                                                                                                                    |
| Change identity, plan brief, research, plan, plan review, verification | Supporting change artifacts match the approved bounded scope. Verification separates historical/current automated runs, author-reported manual acceptance, failures/adaptations, and unobserved hosting.                                                                                                                                                                                                                            |

Safety and pattern review compared the affected code with existing print forms/lists, recovery tests, shared UI, DTO readers, validation, and database matching rules. No substantive security, reliability, performance, data-safety, architecture, or pattern defect was found in the reviewed changes.

No backend endpoint, migration, dependency, polling, automatic resubmission, automatic cancellation, or persisted correction draft was introduced. Durable deletion receipts/history and broad receipt-parser hardening remain explicitly deferred; these accepted exclusions are not findings. The existing accepted lesson on commit-message content was considered.

## Automated verification rerun

All commands below were executed during this review with Node `v24.21.0`, matching `.nvmrc`. Browser and smoke commands ran against an untouched tracked-source copy of reviewed HEAD in `/tmp/maintain-reserved-impl-review-o66t_7u1`, reusing installed locked dependencies. Its local-only app configuration pointed to the separate `maintain-reserved-spool-verify` Supabase project on ports 56321–56327. Its migrations and database tests were compared with this checkout and matched. The shared database and original environment files were not changed.

| Plan rows | Command                                                                                                                                                              | Actual result                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1, 1.3  | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts`                                  | PASS, exit 0: `18 passed (41.2s)` including auth setup/teardown.                                                                                                                                                                                        |
| 1.2, 3.1  | `npm run verify:deploy` (includes `npm run test:spools` and `npm run test:reservations`)                                                                             | PASS, exit 0. Hooks 16 passed/1 skipped; auth 22/22; spools 15/15; prints 21/21; reservations 9/9; settlements 6/6; settings 5/5. Lint passed; Astro check: `0 errors`, `0 warnings`, five existing unused-parameter hints; production build completed. |
| 2.1       | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts tests/e2e/spool-recovery.spec.ts` | PASS, exit 0: `23 passed (40.8s)` including setup/teardown.                                                                                                                                                                                             |
| 2.2       | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npx supabase test db`                                                                                      | PASS, exit 0: `Files=5, Tests=452`, `All tests successful.`                                                                                                                                                                                             |
| 2.2       | `node /root/work/maintain-reserved-spool/scripts/reservation-concurrency.mjs`, working directory `/tmp/printplan-maintain-reserved-verify`                           | PASS, exit 0: `all 30 interleavings verified; sessions and account fixtures cleaned up`. The working directory selects the isolated database container; this is the same script used by `npm run test:reservations:concurrency`.                        |
| 3.2       | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e`                                                                            | PASS, exit 0: `50 passed (1.3m)` including setup/teardown.                                                                                                                                                                                              |
| 3.3       | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify BASE_URL=http://localhost:4327 MAILPIT_URL=http://127.0.0.1:56324 npm run smoke`                           | PASS, exit 0: `All auth smoke steps passed`, including inventory, prints, reservations, settings, settlement, ownership, JWT expiry/refresh, and signout.                                                                                               |

The smoke preview was started separately after the browser runner stopped, using `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npm run preview -- --host 127.0.0.1 --port 4327` against the production build generated by the passing browser gate. Port 4327 replaced the plan's 4321 because an existing development server occupied 4321; isolated Mailpit used 56324 instead of 54324. No automated check failed during this review.

After verification, the review preview and isolated Supabase project were stopped, and temporary app credentials were removed. The existing development server on port 4321 and shared database remained running.

## Manual evidence and limits

- Progress row 3.4 is checked and supported by `verification.md`: the author reported Chrome, Firefox, phone, keyboard, draft-retention and cancellation-detail checks on 2026-10-20, including the follow-up spacing fix. Exact browser versions/device/viewport were not supplied; no new cross-browser/device manual session was performed for this review. A screenshot was not required by this plan.
- Progress row 3.5 is checked and supported by the same record: the author accepted that lost-response reconciliation shows current inventory and cannot restore the original cancellation list. The changed UI states this limitation explicitly.
- No unsupported manual completion claim was identified. Hosted behavior remains unobserved.
- The initial automated review results predate the colour-specific scenario. The follow-up verification below closes F1.

## Triage

F1 is FIXED. All findings are triaged; no pending findings remain.

### F1 follow-up verification (2026-10-20)

- Parameterized the existing reserved-label scenario with separate `Material` and `Colour` variants. Each changes only its selected field to `Red`, verifies that refresh retains the draft and 100 g, restores both saved labels without requests, confirms unchanged persisted state, and deliberately saves 100 g recorded / 88 g reserved / 12 g available.
- `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts --grep 'reserved-label refresh'`: **PASS**, exit 0, `4 passed (13.0s)` — both variants plus auth setup/teardown. The runner's production build also passed.
- Deliberate-break proof in the isolated verification copy: temporarily omitted `setColour(spool.colour)` and ran only the colour variant. It failed at the expected restoration assertion: `Expected: "Black"`, `Received: "Red"` (1 expected failure, 2 setup/teardown passes). The production source was restored before the passing run and compared with the workspace afterward.
- `npx eslint tests/e2e/reservation-recovery.spec.ts`: **PASS**, exit 0.
- Full lint initially ended with `Killed` while memory was tight. A retry with a 512 MiB Node heap was insufficient and failed with a heap-allocation error. After stopping the isolated test services, `NODE_OPTIONS=--max-old-space-size=1536 npm run lint` completed **PASS**, exit 0. No lint-rule failure was reported.
- The isolated Supabase project was stopped and temporary credentials removed. The earlier complete review gates remain recorded above; this test-only follow-up was verified with the focused browser cases, production build, and full lint.
- Completed follow-up: `context/changes/maintain-reserved-spool/follow-ups/review-fixes.md`.
