<!-- PLAN-REVIEW-REPORT -->

> **Historical snapshot:** this plan review records the pre-course-alignment plan state. Its F5 recommendation to remove the unused Promptfoo path was superseded when the plan was revised to make Promptfoo the actual matrix engine. Current implementation status and remaining verification gaps are in [impl-review.md](impl-review.md) and [verification.md](../verification.md).

# Plan Review: Code Reviewer Evaluations Implementation Plan

- **Plan**: [plan.md](../plan.md)
- **Mode**: Deep
- **Date**: 2026-11-01
- **Verdict**: SOUND after plan amendments
- **Initial findings**: 1 critical, 4 warnings
- **Triage**: 5 fixed in plan; 0 pending decisions

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

## Grounding

Grounding: 8/8 paths verified, key symbols verified, plan and brief consistent. Both models use the same fixture JSON and the trusted `reviewChange()` path, which loads the production prompt and applies the production schema and request settings. The holdout manifest covers cases 07–18 × two models × three repetitions = 72 requests. The saved run estimate is $0.270941 against a $4.50 approval cap and $3.9312 conservative reserve. The checked-in approval remains disabled. No additional provider calls were made during this review.

Verified paths include `context/changes/code-review-evals/{plan.md,plan-brief.md,verification.md}`, `packages/ai-reviewer/evals/{runner.mjs,policy.mjs,assertions.mjs,report.mjs,promptfooconfig.mjs,provider.mjs}`, `packages/ai-reviewer/src/{core/review.mjs,providers/openai.mjs}`, and `.github/workflows/reviewer-evals.yml`.

## Findings

### F1 — Phase 1 success criterion was tracked under Phase 4

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick, local correction
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Manual Verification; Progress
- **Detail**: Phase 1 required acceptance of the twelve holdout oracles, while its Progress subsection tracked only acceptance of the six development outcomes. The holdout decision was recorded under Phase 4 as 4.4a.
- **Fix**: Removed the duplicate twelve-oracle criterion from Phase 1 and retained Phase 4's 4.4a record.
- **Decision**: FIXED — applied to [plan.md](../plan.md).

### F2 — Verdict metrics did not assess unsupported summary allegations

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — affects conclusions about false alarms
- **Dimension**: Blind Spots
- **Location**: Phase 2 Metrics and exports; Phase 4 holdout results
- **Detail**: The combined confusion matrix pools both models and repeated calls. Its 36 negative predictions cover six unique safe fixtures repeated across models and repetitions; its three false negatives are one Luna case-09 scenario repeated three times. Assertions check verdicts on safe cases and required anchors on defect cases, so unsupported claims in summaries can go uncounted.
- **Fix**: Add per-model confusion counts, distinct-case outcomes, and explicit repetition denominators. Define verdict-level false positives separately from unsupported summary allegations; add a human audit of all 72 saved summaries without additional provider calls.
- **Decision**: FIXED IN PLAN — reporting work is tracked in 2.6 and 4.8; the manual audit is pending as 4.9.

### F3 — Timing contract promised metrics the runner did not record

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — requires a clear measurement scope
- **Dimension**: Plan Completeness
- **Location**: Phase 2 Metrics and exports; Performance Considerations
- **Detail**: The authorized custom runner records production-envelope reviewer duration. It does not record provider latency or total evaluation-run elapsed time; provider latency existed only in the unused promptfoo adapter. Existing p95 values are descriptive and do not establish an SLA.
- **Fix**: Keep reviewer duration as the per-request measure, add total evaluation-run elapsed time, and exclude workflow queue/install/publication time from model timing comparisons. Do not claim a separate provider-latency measurement.
- **Decision**: FIXED IN PLAN — implementation and timing tests are pending as 2.9.

### F4 — An active comparison approval could be replayed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — affects the effective spending limit
- **Dimension**: Blind Spots
- **Location**: Spending authorization; runner and policy
- **Detail**: Each `runEvaluation()` invocation resets its request and cost counters. The policy validates the approval manifest and expiry but has no durable consumed-approval record. The completed run stayed below $4.50, and its temporary approval was removed; the checked-in policy remains disabled.
- **Fix**: Bind each comparison approval to one invocation, atomically persist consumption before the first request, and reject reuse after process restart or workflow rerun. Require fresh approval for a retry or rerun.
- **Decision**: FIXED IN PLAN — single-use enforcement and replay tests are pending as 2.7.

### F5 — Promptfoo was installed but not used by the authorized runner

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — straightforward dependency and code cleanup
- **Dimension**: Lean Execution
- **Location**: Implementation Approach; Phase 2
- **Detail**: Local compare/gate scripts and the trusted workflow invoke `runner.mjs` directly. The promptfoo adapter/config are unused, and the configured adapter omits authorization data required by its `callApi()` path.
- **Fix**: Keep the custom runner as the sole execution path and remove the promptfoo dependency, configuration, adapter, and adapter-only tests.
- **Decision**: FIXED IN PLAN — cleanup is pending as 2.8.

## Review Scope

The plan and brief were amended during triage. Progress now records the Phase 1/Phase 4 alignment and adds pending follow-up steps for per-model reporting, summary audit, single-use approvals, promptfoo cleanup, and total evaluation timing. No application code was changed and no tests or paid model calls were run.
