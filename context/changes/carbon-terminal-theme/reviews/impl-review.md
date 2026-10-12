<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Carbon Terminal Theme Implementation Plan

- **Plan**: context/changes/carbon-terminal-theme/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-12
- **Revision**: dcad71e; implementation diff 41e27b6..dcad71e
- **Progress**: 14/14 complete; current phase 3; change status before review: implemented
- **Verdict**: APPROVED
- **Initial verdict**: NEEDS ATTENTION — superseded after F1/F2 triage and the complete smoke rerun on 2026-10-12
- **Findings**: 0 critical, 1 warning, 1 observation

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

### F1 — Landing page replaced with an undocumented redirect

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence; Scope Discipline
- **Location**: src/pages/index.ts:3
- **Detail**: Phase 2 requires retaining the landing structure, messages, CTA destinations, hero and feature cards. The scope guardrails exclude changes to page information architecture. Commit 366bec4 instead deletes src/components/Welcome.astro and src/pages/index.astro and introduces a session-dependent redirect to sign-in/dashboard. At baseline 41e27b6, the root rendered Layout and Welcome; the unchanged middleware protected dashboard paths only. scripts/smoke.mjs:458 now asserts the new redirect. verification.md:25 incorrectly describes it as the existing route contract and says route behavior did not change. Dashboard captures replace the required landing evidence. No scope amendment appears in the saved plan or change notes. This is a functional scope deviation, not a demonstrated security or data safety defect.
- **Fix A ⭐ Recommended**: Restore the landing route and component, apply the planned Carbon styling, restore the original root smoke expectation, and capture landing acceptance evidence.
  - Strength: Delivers the saved plan and preserves the original entry page and CTA destinations.
  - Tradeoff: Requires restoring and styling a view, rerunning affected checks, and taking screenshots.
  - Confidence: HIGH — baseline files and the phase contract clearly establish the expected behavior.
  - Blind spot: Earlier approval outside the repository may have authorized removing the landing page.
- **Fix B**: If the redirect is intentional and approved, record an explicit scope amendment, explain the route change accurately in verification.md, and reconcile landing acceptance coverage with that amendment.
  - Strength: Preserves the current implementation while making the changed product behavior reviewable.
  - Tradeoff: Changes the approved scope and drops the planned landing deliverable; requires an explicit author decision.
  - Confidence: MED — technically coherent, but approval is not evidenced by the repository artifacts.
  - Blind spot: Whether the author intends this entry flow.
- **Decision**: FIXED via Fix B — on 2026-10-12 the author explicitly selected B, approving the root redirect and removal of the separate landing page. Added the approved scope amendment to plan.md, recorded authorization in change.md, and corrected verification.md's route history and entry-view coverage. Application code and smoke expectations already implement the selected behavior.

### F2 — Destructive hover measurement does not establish final hover contrast

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/carbon-terminal-theme/screenshots/browser-measurements.json:91
- **Detail**: The final destructive hover entry records the same solid rgb(255, 121, 127) background and 7.58 ratio as the normal state. src/components/ui/button.tsx:15 applies hover:bg-destructive/90, which changes the composed background when hover is active and the transition settles. The earlier chrome-measurements.json entry uses an oklab background and reports 1.09 without an issue, so it is also insufficient evidence. Source colors suggest readable hover text; this finding concerns measurement evidence, not a proven contrast failure.
- **Fix**: Recapture the enabled destructive button after hover and transition completion, measure the composed colors with color-space support, and update the measurement record and verification summary.
- **Decision**: FIXED — on 2026-10-12 the author selected “fix now”. Repeated normal/hover measurements on the actual built inventory component in a temporary browser fixture, waited for transition completion, and corrected background composition. Hover was active with zero remaining animations; text rgb(23, 12, 11) on composed rgb(233, 112, 116) yields 6.43:1. Updated measurement records, marked the older Chrome values superseded, added both screenshots and destructive-hover-review.json, and documented the method and fixture limitation in verification.md. No production style change was needed.

## Automated verification rerun

Commands shared by phases were run once on the final revision, rather than repeated for each phase. Node matched .nvmrc: 24.21.0; existing installed dependencies were used. No tests were added and no production files were edited.

| Command | Result and observed output |
|---------|----------------------------|
| npm run test:auth | PASS — 13 tests, 0 failures |
| npm run test:spools | PASS — 14 tests, 0 failures |
| npx astro sync | PASS — types generated |
| npm run lint | PASS — exit 0 |
| npx astro check | PASS — 48 files; 0 errors, warnings, hints |
| npm run build | PASS — server build complete; existing sitemap warning about missing site option |
| Source palette audit | PASS — zero bg-cosmic references; remaining blue/purple utilities occur only in explicitly excluded unused LibBadge.astro |
| BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke | BLOCKED — initial prerequisite failed because port 4321 belongs to an existing dev server returning HTTP 500 for a missing Vite optimized dependency; this request did not reach the built preview |
| BASE_URL=http://localhost:4322 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke | PARTIAL / BLOCKED — built preview passed initial response, Mailpit, anonymous protection, signup validation, invalid confirmation, pending signup, and pre-confirmation login checks; stopped at “Mailpit receives account A confirmation — The delivered email did not contain an app confirmation link” |
| BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke — final rerun after port was freed | PASS — exit 0; all auth, stock, persistence, owner-isolation, session-expiry/refresh/rotation, revoked-session rejection, and signout checks; final output “All auth smoke steps passed” |

During the initial attempt, preview automatically selected 4322 because 4321 was occupied. supabase/config.toml:154–156 allows confirmation redirects only on localhost:4321, explaining the alternate-port integration limitation. After the author freed 4321, a new built preview on that port completed the entire smoke run with exit code 0. The final rerun resolves the earlier integration limitation; its results are recorded in verification.md. Review-started preview processes were stopped afterward. Temporary smoke signup data may remain in local test services under the existing smoke behavior.

## Manual evidence and scope reconciliation

- All eight Manual Progress rows are checked. verification.md records author acceptance, browser versions, 1440px desktop and 390px/320px layouts, stock keyboard focus transitions, contrast pairs, and representative screenshots. This review inspected that evidence; it did not repeat the human browser acceptance.
- F1 prevents accepting landing migration and landing visual evidence as delivered under the saved plan. The claim that root behavior was unchanged is contradicted by the diff.
- F2 limits the hover contrast evidence. Normal-state text and field/focus measurements otherwise support the documented appearance.
- No domain glossary or lessons file exists. No additional recurring-rule violation was identified.
- Phase 1 matches the supplied palette/font/radius mappings, fixed initial dark mode, shared controls, navigation and banner contracts.
- Phase 2 retains auth branches, stock IDs, labels, quantities, state guards and focus logic, and standalone outage HTTP/retry behavior. SpoolForm.tsx did not need a direct diff: its existing semantic classes inherit the new tokens and shared controls.
- Phase 3 adds screenshot and verification artifacts and makes permitted focus and border contrast corrections. The unplanned root smoke change is included in F1.
- Parallel plan-drift and safety/pattern reviews found no additional substantive architecture, pattern, production security, reliability, performance, or data safety defects.

## Triage update — 2026-10-12

- F1 is resolved through the author-approved scope amendment (Fix B). Plan Adherence and Scope Discipline are PASS against the amended scope.
- F2 is resolved through the repeated browser measurement and evidence correction. Both findings are FIXED.
- After the author freed port 4321, the complete smoke rerun passed with exit code 0. All verdict dimensions now PASS and the current verdict is APPROVED; the initial verdict and findings are retained as review history.
- Completed follow-up work is recorded in `follow-ups/review-fixes.md`. No production code changed; the focused browser measurement was run for F2. Native checks were not repeated because their production inputs did not change.

## Resume triage

All findings triaged: F1 FIXED via Fix B; F2 FIXED through corrected browser measurement and evidence. Complete smoke rerun PASS; current review verdict APPROVED.
