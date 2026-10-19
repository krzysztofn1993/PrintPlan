<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Account Safety Margin Implementation Plan

- **Plan**: context/changes/account-safety-margin/plan.md
- **Scope**: Full plan — completed phases only (1–3 of 4)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-18
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations
- **Open findings**: 0 — F1 fixed and verified during triage

## Verdicts

| Dimension           | Verdict                                         |
| ------------------- | ----------------------------------------------- |
| Plan Adherence      | PASS — F1 fixed and verified during triage      |
| Scope Discipline    | PASS                                            |
| Safety & Quality    | PASS                                            |
| Architecture        | PASS                                            |
| Pattern Consistency | PASS                                            |
| Success Criteria    | PASS — reviewed phases' automated commands pass |

## Findings

### F1 — Missing negative legacy replay checks after upgrade

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/migration-persistence.mjs:687
- **Detail**: Phase 1, Changes Required item 5 explicitly requires changed legacy payloads to conflict and released/deleted legacy requests to refuse recreation after a populated upgrade. The harness checks exact active legacy replay at lines 687–707 and a fresh witness-less request at lines 708–719, but never changes a migrated legacy request's payload or NULL witness, or retries one after release/deletion. SQL tests cover changed witnesses and completed requests created under the new schema; those do not exercise migrated NULL request identity. The production function uses NULL-aware equality and a terminal-state guard correctly, so this is a missing planned verification item rather than a demonstrated runtime defect. Plan Adherence fails for this partial omission; the executed success-criterion commands themselves pass.
- **Fix**: Extend the populated-upgrade harness with changed legacy payload/witness rejection and replay refusal after release/deletion, asserting that rejected attempts leave reservation, product and ledger state unchanged.
- **Decision**: FIXED — Applied the proposed fix after the author selected “napraw” on 2026-10-18. The populated-upgrade harness now rejects changed legacy print/version/spool/mode/witness values and exact replay after explicit release or deletion of an actively reserved print. Every negative attempt verifies unchanged complete spool, print, reservation and request rows. A separate pre-upgrade legacy reservation proves deletion independently from explicit release. Verification and the deliberate-break result are recorded below.

## Review scope and evidence

- Reviewed source revision: `30e53d1`.
- Canonical Progress: 10/12 steps complete; current phase 4. Phases 1, 2 and 3 have every checkbox checked. Phase 4 has three automated rows checked and manual rows 4.4/4.5 unchecked, so it is excluded from review coverage.
- `verification.md` records author-reported manual acceptance, but explicitly retains unchecked rows. This review does not change Progress or infer completion from that narrative.
- Scope was resolved from feature-referencing commits `8ebd1e5`, `ec6e342`, `db58f2e`, `d715228`, `4692573`, `78bc960`, `e04319a` and `30e53d1`; diff baseline is `261fc50..30e53d1` (42 files). The plan filename has no date; the feature commit range avoids unrelated date-based history.
- Two independent read-only review agents checked plan drift and safety/pattern compliance. The main review checked their findings and reran the automated commands below.
- The additive settlement compatibility migration is justified by the already integrated settlement baseline and documented in `verification.md`. It retains settled-print guards and restores the planned current-margin/witness authority. Related settlement caller updates and roadmap/guidance changes support that integration; they do not add a new settlement workflow.
- The unchanged reserve endpoint already forwards the validated command object, so it needs no textual change to carry the new witness. DTO placement in the settings service follows existing service-local DTO conventions.
- Existing unrelated changes under `.agents/skills/` were present before review and excluded from the feature diff. No production files were changed by this review.
- Phase-4 browser and HTTP smoke code was consulted as supporting evidence only. Those commands were not rerun and are not covered by this report.

## Automated verification

Executed with Node `v24.21.0`, matching `.nvmrc`, against the running local Supabase project `settle-print-consumption`. Repeated references to `verify:deploy` in phases 2 and 3 were satisfied by one full run. The table records review-time results; the triage section records subsequent test changes and checks.

| Reviewed phase   | Command                                 | Result and observed output                                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1                | `npx supabase test db`                  | PASS — `All tests successful. Files=5, Tests=452`; `Result: PASS`.                                                                                                                                                                                                                       |
| 1                | `npm run test:reservations:concurrency` | PASS — `all 30 interleavings verified; sessions and account fixtures cleaned up`.                                                                                                                                                                                                        |
| 1                | `npm run test:migrations`               | PASS — committed restricted baseline, populated product preservation, compatibility signature, legacy replay, fresh witness enforcement and current-margin reservation checks passed; `scratch database cleaned up`. F1 records missing negative scenarios despite this passing command. |
| 2                | `npm run test:settings`                 | PASS — 5 tests passed, 0 failed.                                                                                                                                                                                                                                                         |
| 2                | `npm run test:reservations`             | PASS — 9 tests passed, 0 failed.                                                                                                                                                                                                                                                         |
| 2, 3             | `npm run verify:deploy`                 | PASS — 94 native/hook tests passed, 1 opt-in hook test skipped; lint passed; Astro checked 106 files with 0 errors, 0 warnings and 5 unused-parameter hints; production build completed. Sitemap emitted its existing missing-`site` configuration warning.                              |
| Supporting check | `git diff --check`                      | PASS — no whitespace errors before report creation.                                                                                                                                                                                                                                      |

## Pending acceptance outside reviewed coverage

Phase 4 remains unreviewed because manual Progress rows 4.4 and 4.5 are unchecked. This report cannot supply phase-4 archive coverage. Its browser/smoke evidence and any final manual-state reconciliation require a later review once that phase is complete.

## Triage resolution — 2026-10-18

F1 is fixed in the working tree based on reviewed revision `30e53d1`. The review initially returned NEEDS ATTENTION for missing planned coverage; after the targeted fix and verification, all reviewed dimensions pass and the scoped verdict is APPROVED. Reviewed phases remain 1, 2, 3.

- Changed legacy print, expected version, spool, selection mode and a newly supplied witness each produce `idempotency_conflict` after migration and the account margin change.
- Exact legacy replay after explicit release produces `reservation_request_completed`.
- Deleting a different print while its migrated legacy reservation is active releases that reservation; exact replay produces `reservation_request_completed` before missing-print checks.
- Each rejection preserves complete product rows, reservation snapshots and ledger rows. Final assertions also verify retained NULL witnesses, the distinct `released`/`deleted` ledger states, valid completion timestamps and absence of recreated reservations or the deleted print.
- The new fixture is created and reserved with the historical five-argument RPC before account-settings migration, so both terminal-state cases exercise genuinely migrated NULL request identities.
- `npm run test:migrations`: PASS, including all seven new rejection scenarios and scratch database cleanup.
- Deliberate-break check: a temporary runner weakened the compatibility migration's witness comparison from `IS DISTINCT FROM` to `<>` only in its disposable database. The new added-witness scenario failed with `expected_error_not_raised`, proving it detects NULL-unsafe replay validation. Scratch cleanup succeeded; the temporary runner was removed and repository migrations were never edited.
- `npm run verify:deploy`: PASS — native contracts, lint, Astro checks and production build passed. The final ledger-state assertion correction was additionally checked by the passing migration rerun and targeted ESLint command.
- `npx eslint scripts/migration-persistence.mjs`: PASS.
- `git diff --check`: PASS.

Triage complete: fixed F1 (1); pending findings (0). Follow-up tracking: `follow-ups/review-fixes.md`.
