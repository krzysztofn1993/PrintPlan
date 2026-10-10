<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Verified Account Access Implementation Plan

- **Plan**: context/changes/verified-account-access/plan.md
- **Scope**: Full plan (4 of 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation
- **Git range**: ba02314352096f9ccec1957743c1cebf27eb3c58..6ddd8399a29a9e78b9ab77ba701a901b6c51f765
- **Canonical progress**: 16/16 checked items; change status was implemented before this review.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unsupported confirmation type is absent from smoke

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:535
- **Detail**: Phase 3's negative-response contract explicitly requires an unsupported confirmation type. The smoke checks missing type, missing token, malformed token and consumed links, but never sends a non-email type such as recovery. The production guard exists at src/pages/auth/confirm.ts:19. A supplemental review request with type=recovery returned HTTP 302 to /auth/confirm-email?status=invalid without Set-Cookie. This is a missing regression case, with no observed authentication bypass.
- **Fix**: Add an isolated smoke case with a nonempty token_hash and type=recovery; assert the exact invalid-link redirect, no auth cookies, and denied dashboard access.
- **Decision**: FIXED — approved by the author during triage on 2026-10-10; added the isolated unsupported-type smoke case at scripts/smoke.mjs:540.

### F2 — Cache cleanup command is outside the documented plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: package.json:9
- **Detail**: Phase 3 also added npm run clean:cache and scripts/clean-app-cache.mjs. The opt-in script removes generated .astro, dist and node_modules/.vite directories, then the command synchronizes Astro. Commit 0f6c24b mentions the addition, but the plan and verification runbook do not document its scope or intended use. No production data deletion or architectural violation was found.
- **Fix**: Document the command, its generated-directory cleanup scope, and the need to restart the dev server or rebuild in a plan addendum and the local runbook.
- **Decision**: DISMISSED — the author clarified during triage on 2026-10-10 that this is their own command and does not need documentation.

## Scope and implementation evidence

Two parallel reviews checked planned behavior and safety/pattern compliance across the 33 changed files. The feature-specific commit range starts at a81264b's parent; the undated plan filename did not provide a reliable date-derived range. No lessons register or domain glossary exists in this checkout.

| Phase | Evidence and result |
|-------|---------------------|
| 1 | Request-local Supabase client and typed locals; staged cookie overlay/checkpoint/restore; finalization of early and route responses; validated getUser identity; dashboard path-segment guard; shared client/server validation; neutral error codes; explicit outage responses; SDK regression tests. Matches the plan. |
| 2 | Local confirmation enabled, native English template, port 4321 URLs, 120-second local JWT lifetime, parameter cardinality/type validation, fixed callback destination, pending/ready/invalid/default result states. Matches the plan. |
| 3 | Isolated jars, delivered Mailpit tokens, strict redirects/body assertions, malformed forms, independent password login, actual JWT expiry, rotated tokens, revoked-session denial, deletion and SDK cache-header assertions, bounded requests/waits. Matches except F1; F2 records the extra helper. |
| 4 | Auth contracts in CI, Mailpit retained, filtered private credential setup, explicit origins, bounded readiness, integration timeout and always-run cleanup. Runbook distinguishes local evidence, browser confirmation and unobserved remote Actions. Matches the plan. |

Additional changed files were investigated: signin.astro and signup.astro supply the planned form-error presentation; the Node patch pin in .nvmrc is justified by existing locked dependency engine requirements and documented in verification.md. The roadmap's in-progress state follows the toolkit lifecycle, where archive advances it to done. Change identity/research/plan/verification documents are normal artifacts. The unchanged .env.example remains placeholder-only, satisfying the plan without an edit. No dependency lockfile change, hosted deployment, product schema, resend feature, or new browser framework was introduced.

No substantive safety, reliability, performance, architecture or pattern finding was established. Failed signout retains earlier refresh writes and discards subsequent deletion mutations; successful signout retains deletions. Authorization continues to use server-validated identity.

## Automated verification

All commands below were rerun on 2026-10-10 with Node v22.22.3 through npm exec --yes --package=node@22.22.3 -- followed by the listed command. Identical commands appearing in several phases were executed once for the reviewed final tree.

| Command or check | Result | Sanitized output |
|------------------|--------|------------------|
| npm ci | PASS | 658 packages added; no engine warnings. Existing audit output: 11 advisories (2 moderate, 9 high); install-script notices for esbuild/workerd. |
| npm run test:auth | PASS | 13 tests, 13 passed, 0 failed, 0 skipped. Includes installed-SDK signout network/503 rollback and prior-refresh preservation. |
| npm run lint | PASS | Exit 0. |
| npx astro sync | PASS | Types generated. |
| npx astro check | PASS | 36 files; 0 errors, 0 warnings, 0 hints. |
| npm run build | PASS | Cloudflare server build completed. Existing sitemap warning: site is unset. |
| Preview and Mailpit readiness | PASS | Both returned HTTP 200; process inspection identified Astro production preview on port 4321. |
| BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke | PASS | All auth smoke steps passed, including delivered confirmation, independent login, real expiry, refresh rotation, revoked-session deletion and final logout denial. |
| Supplemental unsupported-type request | PASS | type=recovery returned HTTP 302 to the exact invalid-link destination, without cookies. This does not add the missing regression to the committed suite. |
| Supplemental dashboard-other request | PASS | HTTP 404 without an auth redirect or cookies. |

The smoke used the already-running production preview and local Supabase/Mailpit. Build was rerun separately; this review did not restart the existing preview. Ignored credential files were preserved, and the backend/mailbox was not stopped or purged. No remote Actions run was inspected. Audit advisories and the sitemap warning are already recorded in verification.md and were not attributed to this change without supporting evidence.

## Manual acceptance and limitations

All six manual Progress rows are checked. Phase 1's direct validation/anonymous denial and Phase 2's email/session/replay behaviors are supported by the implementation and fresh HTTP smoke. Phase 2's direct-visit neutral copy is present in confirm-email.astro.

The verification document explicitly records the author's confirmation on 2026-10-10 for Chrome, Firefox, mobile, JavaScript-disabled signup and controlled-outage/recovery behavior (verification.md:122–132). Those browser and live-outage checks were not repeated during this review; they are accepted as recorded human evidence, rather than inferred from HTTP smoke. Exact browser versions, mobile device/viewport and fixture labels remain unspecified, as the document acknowledges. The auth-contract rerun independently covers retryable failed-signout semantics and preservation of prior refresh cookies.

Hosted email/template/URL verification remains F-02. No manual checkbox was changed by this review, and production code was not edited. During interactive triage, F1 was fixed and F2 was dismissed with the author's clarification. No pending decisions remain.

## Triage verification

- **F1, 2026-10-10**: Added type=recovery coverage with a fresh cookie jar, exact invalid-link redirect, no auth cookies and denied dashboard access. npm run lint and the full BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke rerun passed with Node v22.22.3, including the new unsupported-type step, actual-expiry refresh, revoked-session rejection and final logout denial.

## Triage summary

- **Fixed**: F1 (1).
- **Dismissed**: F2 (1) — author-owned command; documentation not required.
- **Pending**: none.
- **Outstanding review fixes**: none.
- **Final verdict**: APPROVED. The original review verdicts and findings above are retained as the historical review result; their decisions record the completed triage.
