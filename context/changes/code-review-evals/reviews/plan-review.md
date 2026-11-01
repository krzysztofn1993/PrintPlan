<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Code Reviewer Evaluations Implementation Plan

- **Plan**: [plan.md](../plan.md)
- **Mode**: Deep
- **Date**: 2026-11-01
- **Verdict**: SOUND after triage (initially REVISE)
- **Findings**: 0 critical, 1 warning, 0 observations; 1 fixed, 0 pending

## Verdicts

| Dimension             | Initial verdict | After triage |
| --------------------- | --------------- | ------------ |
| End-State Alignment   | WARNING         | PASS         |
| Lean Execution        | PASS            | PASS         |
| Architectural Fitness | PASS            | PASS         |
| Blind Spots           | PASS            | PASS         |
| Plan Completeness     | PASS            | PASS         |

## Grounding

Grounding: 5/5 existing modification paths verified, 6/6 symbols verified, brief and plan consistent. All 20 phase success criteria match their Progress entries; there is exactly one Progress section and no execution checkboxes outside it. New eval paths are explicitly planned additions.

Verified existing modification paths: `AGENTS.md`, `package.json`, `.github/workflows/ci.yml`, `packages/ai-reviewer/test/workflow.test.mjs`, and `packages/ai-reviewer/test/github.test.mjs`.

Verified symbols: `reviewChange()`, `assembleInput()`, `loadPrompt()`, `parseReview()`, `validateReview()`, and `trustedCheck()`.

Deep verification confirmed private-package prompt staging, production request settings, schema and usage handling, stock/allocation witnesses, and the need for separate eval check provenance helpers. No additional production importer requires a signature change.

## Findings

### F1 — Recurring authorization blocks future prompt versions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Approval and execution policy
- **Detail**: The original approval contract bound prompt identity for both comparison and recurring gate runs. Production `loadPrompt()` hashes the literal ordered prompt text (`packages/ai-reviewer/src/prompts/load.mjs:16`), so every candidate prompt change has a different digest. Exact matching against the recurring approval would require a new approval for every prompt PR, conflicting with automatic evaluation under recurring spending authorization. The plan did not distinguish these identity rules.
- **Fix**: Separate exact comparison approval from recurring gate policy. Both modes bind trusted execution identities, model IDs, repetitions, request count, per-run USD allowance, approval identity, and expiry. Comparison approval also binds the exact prompt digest. Recurring approval instead binds eligible events, fixed candidate prompt paths, and explicit prompt-size/input-token allowances. Trusted preparation records each candidate digest in its execution manifest without changing the approved policy. Add offline tests admitting two distinct candidate digests under one recurring approval, rejecting candidates outside its bounds, and rejecting changed digests under exact comparison approval.
  - Strength: Supports future candidate prompts within explicitly approved spending and execution boundaries.
  - Tradeoff: Requires distinct validation rules for comparison and recurring gate approvals.
  - Confidence: HIGH — the conflict follows directly from the original contract and existing prompt hashing.
  - Blind spot: The policy implementation does not exist yet; the planned offline tests must verify these rules.
- **Decision**: FIXED — user approved the proposed change during triage on 2026-11-01; applied to the Phase 2 policy contract.

## Triage Summary

- Fixed: F1.
- Skipped: none.
- Accepted: none.
- Dismissed: none.
- Verdict after fixes: REVISE → SOUND.

Only planning and review documents were changed. No implementation, paid request, workflow dispatch, or branch-protection change was performed.
