<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Landing Page Implementation Plan

- **Plan**: context/changes/landing-page/plan.md
- **Mode**: Deep
- **Date**: 2026-11-02
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations
- **Triage**: Complete; F1 fixed with author approval. No unresolved findings.

## Verdicts

| Dimension             | Review verdict | After triage |
| --------------------- | -------------- | ------------ |
| End-State Alignment   | PASS           | PASS         |
| Lean Execution        | PASS           | PASS         |
| Architectural Fitness | PASS           | PASS         |
| Blind Spots           | WARNING        | PASS         |
| Plan Completeness     | PASS           | PASS         |

## Grounding

Grounding: 9/9 existing paths verified, 4/4 referenced symbols verified, brief-to-plan consistency verified. All 13 phase success criteria exactly match their Progress rows. Exactly one Progress section exists at the bottom of the plan; no checkboxes occur outside it. Explicitly planned new files are creation targets, not missing-source findings.

Inspected the root route, authentication endpoints and middleware, Layout, Carbon styles, stock presentation, HTTP smoke, auth contracts, browser setup, fixtures and local-account lifecycle. One read-only verification subagent checked risky claims, affected callers and existing patterns, including the desktop/mobile preview assets. No additional material blast-radius or pattern findings were identified.

## Findings

### F1 — A fresh session does not isolate global sign-out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Browser acceptance for the public entry
- **Detail**: The original plan required a fresh login in an isolated context for sign-out checks, implying that this would protect the shared setup session. However, `src/lib/auth-errors.ts:55` calls `signOut({ scope: "global" })`, and `scripts/auth-contracts.test.mjs:393` explicitly verifies global sign-out. Independent sessions for the same account therefore do not isolate refresh-session revocation. Later tests reusing setup storage state could lose authentication. Existing recovery fixtures already authenticate freshly for each context (`tests/e2e/fixtures.ts:133`).
- **Fix**: Require a fresh login in an isolated context for every authenticated landing test, forbid setup storage-state reuse, and explicitly preserve global sign-out behavior.
- **Decision**: FIXED — the author approved "fix in plan"; the Phase 3 contract was updated. Progress titles and checkboxes were preserved.

Approved replacement:

> Establish a fresh login session in an isolated browser context for every authenticated landing test; do not reuse the setup storage state. Sign-out uses global scope and revokes other refresh sessions for the same account, including independently established sessions. Preserve the existing global sign-out behavior.

## Triage Summary

- Fixed: F1.
- Skipped, accepted or dismissed: none.
- Outstanding findings: none.
- Final verdict: SOUND.

## Verification Limits

This was a static plan and code review, not implementation acceptance. No application test suite, build or runtime browser acceptance was executed during this review. Prototype evidence remains distinct from the implementation evidence required by the plan. All implementation Progress rows remain pending.
