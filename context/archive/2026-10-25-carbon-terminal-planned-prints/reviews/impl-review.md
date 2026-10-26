<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Carbon Terminal Prints Implementation Plan

- **Plan**: context/changes/carbon-terminal-planned-prints/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-25
- **Verdict**: APPROVED
- **Initial verdict**: REJECTED
- **Findings**: 0 critical, 3 warnings, 0 observations
- **Triage**: 2 fixed, 1 skipped; no pending decisions

The initial review rejected the workbench layout change because ten browser scenarios failed in both phase-specific runs and the complete suite. Their error output identified test-locator regressions. F1 has now been fixed and verified in the working tree: the focused recovery run passes 34 checks, the complete suite passes 83, and `verify:deploy` passes. F2 is resolved by the plan's follow-up design addendum. For F3, the author's browser versions, keyboard/focus, visual contrast and Firefox 200% zoom results are now recorded. The author subsequently chose not to perform the unavailable screen-reader test and closed F3 as SKIPPED. Approval carries that explicit manual verification limitation; screen-reader support was not verified. Original review results below are retained as historical evidence.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Workbench locator migration leaves ten browser scenarios failing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: tests/e2e/helpers/ui.ts:55
- **Detail**: The follow-up changes `printRecord()` and `spoolRecord()` into unions of a table record and an external workbench (`ui.ts:51–57`). Several callers still assume a single container. In `settlement-recovery.spec.ts:435`, `expect(row).toContainText(changedName)` now resolves to two elements and fails strict mode. Other callers search inside that union for a named region which is now the workbench root itself: settlement result assertions at lines 44–46 and 380–382 and reservation assertions at lines 66, 444 and 1262 time out. The spool-edit lookup at `reservation-recovery.spec.ts:645–646` has the same problem. Finally, the available-grams assertion at line 142 now matches both the option and the new context panel. Phase 1 recovery fails 3 scenarios, Phase 2 affected coverage fails 7, and the full suite reproduces all 10 failures. These required gates were marked complete on commits preceding `34488c8`.
- **Fix**: Use the existing explicit summary and ID-scoped workbench helpers at affected call sites. Assert the workbench's own name/visibility on its root, scope receipt/form assertions to `.carbon-record-workbench-form`, and keep collection assertions scoped to the summary. Preserve behavior, quantity and exact-request assertions; rerun the affected gates and complete suite.
  - Strength: Corrects the three reproduced locator failure modes while retaining the existing recovery acceptance checks.
  - Tradeoff: Requires coordinated edits across reservation and settlement scenarios, followed by browser verification.
  - Confidence: HIGH — both focused and complete executions reproduce the failures, and error snapshots contain the expected rendered quantities and retained drafts.
  - Blind spot: Assertions after the failing steps remain unverified until their locators are corrected. A page-wide region lookup alone would still encounter duplicate receipt/context quantity labels.
- **Decision**: FIXED — the author selected Fix now on 2026-10-25. Explicit workbench/form/summary locators preserve existing behavior checks, with region-role and accessible-name assertions retained. Focused recovery, the complete browser suite and `verify:deploy` pass; see F1 triage verification below.

### F2 — The plan still specifies superseded in-table workflow panels

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/carbon-terminal-planned-prints/plan.md:80
- **Detail**: Phase 1, the desired end state and the testing strategy require print edit/reservation/settlement and stock edit surfaces inside separate detail rows associated with their summary records. The final implementation instead renders these workflows above the table in `CollectionRecordWorkbench` (`PrintList.tsx:1969`, `SpoolInventory.tsx:368`), and presentation tests explicitly require that placement. Current `AGENTS.md:39` mandates this final arrangement and `verification.md:63` records the follow-up revision, so this is documented intentional evolution. However, the plan has no addendum reconciling its original structural/geometry requirements, the workbench primitive or the added request-ID compatibility helper. Future implementation or archive reviews would receive conflicting contracts. This also accounts for the Scope Discipline warning; no rollback to the original layout is recommended.
- **Fix**: Add a follow-up design addendum describing deletion detail rows versus external workbenches, the revised geometry/ownership expectations and the request-ID helper's rationale. Preserve historical Progress entries and identify which original verification expectations are superseded.
- **Decision**: FIXED — the author selected Fix now on 2026-10-25. The plan's Follow-up design addendum records deletion detail rows versus external workbenches, revised geometry and test scoping, retained ownership/accessibility obligations and the request-ID helper's rationale. Original plan text and Progress entries are preserved.

### F3 — Required accessibility review details are absent

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/carbon-terminal-planned-prints/verification.md:85
- **Detail**: Progress item 3.5 is checked and explicitly requires one recorded screen-reader/browser combination plus keyboard/focus, rendered contrast and 200% zoom/reflow checks. The verification document records the author's report of completed manual checks, but expressly states that the screen-reader/browser pairing and measurement notes were not supplied. The capture metadata and sampled screenshots provide current browser evidence; they cannot supply that missing human-review record. This finding concerns incomplete evidence, not whether the author performed the review.
- **Fix**: Record the actual screen reader and browser/version, reviewed workflows and outcomes for keyboard/focus, rendered contrast and 200% zoom/reflow. Identify any unavailable details as pending evidence rather than inventing results.
  - Strength: Makes the existing author acceptance traceable to the specific manual requirement.
  - Tradeoff: Needs the author's original review details or a repeat of the missing manual checks.
  - Confidence: HIGH — the verification document explicitly acknowledges the omitted details.
  - Blind spot: The manual accessibility results were not independently observed during this implementation review.
- **Decision**: SKIPPED — on 2026-10-25, after confirming that a screen reader was unavailable, the author explicitly chose not to perform this check. Supplied browser versions and keyboard/focus, visual contrast and Firefox 200% zoom results are documented. Screen-reader verification remains NOT PERFORMED as a known limitation; this triage decision closes the finding without recording a screen-reader pass.

## Review scope and method

- All 13 Progress items are checked: 9 Automated and 4 Manual. All three completed phases were reviewed; the current phase is Phase 3.
- Reviewed application revision: `82783c4`. Feature commits establish the implementation range `24a8bb0..82783c4`, including the post-plan layout change `34488c8`. The plan's research baseline `29b69ff` has the same production/test/script content as `24a8bb0`.
- Compared the planned file list with the 24 changed code/test/guidance files and the change's evidence artifacts. `CollectionRecordWorkbench.tsx` and `src/lib/request-id.ts` are follow-up additions; related account-settings assertions are dependent verification updates.
- Two parallel reviewers examined plan drift and safety/quality/pattern compliance. The primary reviewer independently inspected the plan, accepted lesson, table/workbench consumers, test helpers, failure output and evidence index, and ran the required commands.
- Sampled current captures include print editing at 1440px, reservation preview at 320px and stock editing at 390px. Evidence JSON parsed successfully. The author's manual acceptance is retained with the limitations in F3.

## Initial automated verification

Environment: Node `24.21.0`, installed dependencies, local Supabase and Mailpit. Browser commands used `E2E_PORT=4331` because the existing development server occupied 4321. Smoke used a separately started built preview at 4332 after the browser runner exited. Counts below include browser authentication setup and teardown.

Initial browser attempts stopped at authentication setup because `.env` and `.dev.vars` supplied conflicting Supabase keys. For the recorded reruns, `.env` was temporarily aligned with `.dev.vars`; no key values are retained in this report. The original `.env` was restored byte-for-byte after verification, its private backup was removed, and browser authentication teardown left no private fixture files. That local prerequisite failure is excluded from the implementation findings.

| Progress items | Command                                                                                                                                                                                | Result | Output summary                                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1            | `npm run test:e2e -- tests/e2e/collection-table-presentation.spec.ts`                                                                                                                  | PASS   | `3 passed (13.9s)`; geometry at 320, 390, 1279, 1280 and 1440px.                                                                                                                         |
| 1.2            | `npm run test:e2e -- tests/e2e/print-recovery.spec.ts tests/e2e/spool-recovery.spec.ts tests/e2e/settlement-recovery.spec.ts`                                                          | FAIL   | `3 failed`, `27 passed (1.2m)`; all failures in settlement scenarios, detailed below.                                                                                                    |
| 1.3, 2.2       | `npm run lint`                                                                                                                                                                         | PASS   | Executed successfully inside `verify:deploy`.                                                                                                                                            |
| 2.1            | `npm run test:e2e -- tests/e2e/collection-table-presentation.spec.ts tests/e2e/print-recovery.spec.ts tests/e2e/reserved-print-editing.spec.ts tests/e2e/reservation-recovery.spec.ts` | FAIL   | `7 failed`, `39 passed (2.2m)`; all failures in reservation scenarios.                                                                                                                   |
| 2.4            | `npm run test:e2e -- tests/e2e/exact-command-recovery.spec.ts`                                                                                                                         | PASS   | `15 passed (32.8s)`.                                                                                                                                                                     |
| 3.1            | `npm run verify:deploy`                                                                                                                                                                | PASS   | 100 native contract tests pass; lint succeeds; Astro reports 0 errors, 0 warnings and 6 hints; production build completes.                                                               |
| 3.2            | `npm run test:e2e`                                                                                                                                                                     | FAIL   | `10 failed`, `73 passed (3.5m)`; reproduces the same reservation/settlement failures.                                                                                                    |
| 3.3            | `BASE_URL=http://localhost:4332 npm run smoke`                                                                                                                                         | PASS   | All auth and product smoke steps passed, including reservation persistence, account settings, settlement accounting, receipt replay, completed deletion and session rotation/revocation. |

### Reproduced failing browser scenarios

| File and test declaration           | Scenario                                                                           | Failure                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `reservation-recovery.spec.ts:17`   | Late preview success, network failure, and already-reserved response (3 scenarios) | Root workbench region searched as a descendant at line 66.        |
| `reservation-recovery.spec.ts:102`  | Reopening a print uses latest stock                                                | Available-grams text matches option and context at line 142.      |
| `reservation-recovery.spec.ts:428`  | Best-fit reserve/release preserves recorded stock                                  | Root workbench region searched as a descendant at line 444.       |
| `reservation-recovery.spec.ts:577`  | Changed best fit, manual choice and spool deletion                                 | Root spool-edit region searched as a descendant at lines 645–646. |
| `reservation-recovery.spec.ts:1242` | Lower margin leaves existing reservation unchanged                                 | Root workbench region searched as a descendant at line 1262.      |
| `settlement-recovery.spec.ts:17`    | Zero-gram settlement, refresh and deletion                                         | Root result region searched as a descendant at lines 44–46.       |
| `settlement-recovery.spec.ts:306`   | Failed receipt/stock reads recover without resubmission                            | Same result-region lookup at lines 380–382.                       |
| `settlement-recovery.spec.ts:411`   | Stale-command rejection retains the draft                                          | Record union resolves to two elements at line 435.                |

Representative output: `Error: element(s) not found`; `Error: strict mode violation` with two resolved elements; and `Error: expect(locator).toContainText(expected) failed`. Late-preview tests also report route cleanup errors after their primary assertion times out. The full-suite error snapshots retain the expected receipt quantities, current print name and draft fields.

## Manual verification disposition

| Progress item | Recorded evidence                                                               | Review disposition                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4           | Before captures at 1440/390px and follow-up print/stock editing captures        | Observable captures and author attribution exist; final workbench placement needs the plan addendum in F2.                                                                                     |
| 2.3           | Mixed collection, contextual help, distinct spool choices and recovery examples | Current and original indexed captures support the recorded author review.                                                                                                                      |
| 3.4           | Seven-state index and follow-up Chrome/Firefox default/expanded samples         | Browser evidence and author attribution exist. The original seven-state capture is explicitly attributed to the earlier revision; follow-up images document the final layout.                  |
| 3.5           | Author's report of completion and subsequent triage details                     | Browser versions, keyboard/focus, visual contrast and Firefox 200% zoom results are recorded. The author chose to skip the unavailable screen-reader check under F3; it remains NOT PERFORMED. |

## F1 triage verification

Verified on 2026-10-25 against `82783c4` plus the working-tree corrections in `tests/e2e/reservation-recovery.spec.ts` and `tests/e2e/settlement-recovery.spec.ts`. The changes retain persisted-quantity, draft, request-count and recovery assertions. Names and region roles are checked on workbench roots; receipt values are checked inside the form, spool descriptions inside the choice group, and refreshed print names on the summary record.

| Command                                                                                                          | Result | Output summary                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_PORT=4331 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts tests/e2e/settlement-recovery.spec.ts` | PASS   | `34 passed (1.1m)`, including all ten previously failing scenarios.                                                                   |
| `E2E_PORT=4331 npm run test:e2e`                                                                                 | PASS   | `83 passed (2.7m)`; no skipped scenarios. Counts include authentication setup and teardown.                                           |
| `npm run verify:deploy`                                                                                          | PASS   | 100 native contract tests pass; lint, type checks and production build pass. Astro reports 0 errors, 0 warnings and 6 existing hints. |

The first focused attempt timed out during the runner's built-preview startup, before any scenarios ran. A standalone production build completed normally, and the unchanged runner configuration then passed the recorded rerun. Standalone lint, build and formatting checks also passed.

Node remained `24.21.0`. Browser verification temporarily aligned local Supabase configuration; the original `.env` was restored byte-for-byte afterward, the private backup was removed and browser teardown left no private authentication artifacts. The initial HTTP smoke result is retained; this test-only fix did not change the application source.

The completed work is tracked in [review-fixes.md](../follow-ups/review-fixes.md). The initial phase coverage and plan Progress entries are unchanged.

## Triage status

Triage is complete: F1 and F2 are FIXED; F3 is SKIPPED on the author's explicit decision. There are no pending decisions. The Success Criteria warning records the screen-reader check as NOT PERFORMED; the other manual observations and passing automated gates remain documented. Approval includes this manual verification limitation.
