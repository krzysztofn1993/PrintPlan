<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Account Safety Margin Implementation Plan

- **Plan**: context/changes/account-safety-margin/plan.md
- **Scope**: Full plan — phases 1–4 of 4
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation
- **Open findings**: 0 — F2 fixed during triage; prior F1 remains fixed

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS — F2 reconciled during triage; all automated checks pass |

## Findings

### F2 — Verification record still lists completed manual checks as pending

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/account-safety-margin/verification.md:56
- **Detail**: Lines 56–61 say Progress rows 4.4 and 4.5 remain unchecked and list both as outstanding. The canonical plan marks both complete in commit `9b068ba`, whose message records author confirmation of settings, reservation and accessibility checks. The verification record itself describes the author's acceptance at line 54. This is stale documentation, not evidence of missing acceptance or an application defect.
- **Fix**: Reconcile the manual-verification section with completed Progress rows 4.4/4.5 and cite their closing commit `9b068ba`.
- **Decision**: FIXED — On 2026-10-19, the author reaffirmed that manual acceptance had already been confirmed. Updated verification.md to record completed checks 4.4/4.5 and their closing commit `9b068ba`; canonical Progress was already correct and was not changed.

## Review scope and evidence

- Reviewed source revision: `b7cf3ceee32cac1d273a56305c3c16718ab5541d`.
- Canonical Progress: 12/12 steps complete; current phase 4. All four phases are included. Progress was read without modification.
- Feature scope: `261fc50..b7cf3ce` (44 changed files), resolved through feature commits because the plan filename has no date. This range excludes the already integrated settlement workflow from attribution to S-04.
- Two independent read-only agents checked plan adherence and safety/pattern compliance. The main review checked their evidence, acceptance code and recovery boundaries, and ran the commands below.
- Settings persistence, owner-only reads, prohibited direct writes, versioned saves and owner-lock ordering match phase 1. Fresh reservations require bounded amount evidence; exact legacy replay compares NULL-aware request identity before current settings and print checks.
- The settlement compatibility migration is documented integration work. It restores current-margin authority after settlement migration, removes the old five-argument overload and preserves settled-print guards. Related SQL/smoke callers and the shared local callback helper support existing acceptance flows without adding an excluded workflow.
- The unchanged reserve endpoint already forwards the validated command object. Service-local settings DTO placement follows existing patterns; database RPC types are updated separately.
- The settings editor retains drafts after conflicts and uncertain acknowledgements, blocks further saves until a valid authoritative read, and requires another explicit save. Reservation recovery retains eligible manual selection, explains fallback, rejects obsolete preview responses and requires another confirmation after changed grams.
- Phase-4 fixtures persist a restoration marker before settings mutations, restore using the current version, verify restoration and attempt settings cleanup independently of product cleanup. Browser cases exercise both selection modes and delayed/failed responses. Smoke covers isolation, direct-write denial, persistence and direct RPC dispatch with and without a witness.
- Manual acceptance has observable evidence in commit `9b068ba` and `verification.md:54`. It was reported by the author; this review does not claim fresh interactive Firefox or phone verification. F2 concerns the contradictory pending wording.
- Existing unrelated dirty files under `.agents/skills/` were excluded. Review and triage mutations are limited to context artifacts: reports, change status/date, the manual-verification record and follow-up tracking. No production implementation was edited.

## Automated verification

Executed on 2026-10-19 using Node `v24.21.0`, matching `.nvmrc`, with the existing local Supabase project `settle-print-consumption` and Mailpit. Existing local configuration supplied credentials; none are recorded here. Repeated commands shared by phases were run once for this review.

| Reviewed phases | Command | Result and observed output |
|-----------------|---------|----------------------------|
| 1, 4 | `npx supabase test db` | PASS — `All tests successful. Files=5, Tests=452`; `Result: PASS`. |
| 1, 4 | `npm run test:reservations:concurrency` | PASS — `all 30 interleavings verified; sessions and account fixtures cleaned up`. Includes settings/reserve ordering, same-grams changes, competing versions and independent-owner progress. |
| 1, 4 | `npm run test:migrations` | PASS — committed restricted baseline, populated-row preservation, settlement compatibility, changed legacy payload/witness rejection, active replay, fresh witness enforcement and released/deleted legacy replay refusal; scratch database cleaned up. |
| 2 | `npm run test:settings` | PASS — 5 tests passed, 0 failed. |
| 2 | `npm run test:reservations` | PASS — 9 tests passed, 0 failed. |
| 2, 3, 4 | `npm run verify:deploy` | PASS — 94 native/hook tests passed, 1 opt-in hook test skipped; lint passed; Astro checked 106 files with 0 errors, 0 warnings and 5 unused-parameter hints; production build completed. Existing sitemap missing-site warning remains. |
| 4 | `E2E_PORT=4331 npm run test:e2e` | PASS — `44 passed (1.1m)`, including auth teardown and settings restoration. All settings and reservation-recovery cases passed in the complete run. |
| 4 | `BASE_URL=http://127.0.0.1:4322 npm run smoke` | PASS — account isolation, preserved 88 g and stock contribution, new 84 g best-fit/manual reservations, present/omitted RPC witness, fresh-login persistence, settlement, token expiry, refresh and revocation; `All auth smoke steps passed`. |
| Supporting check | `git diff --check` | PASS — no whitespace errors before and after report creation. |

### Runtime setup and limits

The first browser attempt stopped before tests because port 4321 was occupied. A second attempt on port 4331 stopped before tests because the smoke preview had acquired this repository's single preview instance. After smoke completed, the review-owned preview was stopped and the full browser suite passed on port 4331. These were environment startup conflicts, not failed assertions. The unrelated service on port 4321 was left running. Playwright stopped its owned preview after the successful suite; existing Supabase services were retained.

Browser verification uses configured Chromium only. Author-reported manual acceptance supplies the Firefox/phone and keyboard evidence; remote CI and hosted deployment were not observed.

## Prior finding F1 — fixed and retained

The preceding phases-1–3 review and completed triage are preserved in [impl-review-phases-1-3-2026-10-18.md](impl-review-phases-1-3-2026-10-18.md). Its F1 required negative replay checks for migrated NULL-witness requests. Commit `b7cf3ce` contains the fix; the current migration rerun passes changed print/version/spool/mode/witness conflicts and release/deletion terminal checks with complete state-preservation assertions. F1 remains FIXED and is excluded from this review's open-finding count. The original [follow-up](../follow-ups/review-fixes.md) remains valid. New numbering starts at F2 to preserve the prior F1 identity.

## Triage resolution — 2026-10-19

F2 is fixed: the verification record now matches the already completed canonical Progress and records the author's reaffirmation. All six dimensions pass; the verdict remains APPROVED with reviewed phases 1, 2, 3, 4. No findings remain pending. Verification: inspected the documentation diff and ran `git diff --check`; application tests were not repeated for this documentation correction.
