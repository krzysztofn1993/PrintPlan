<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Code Reviewer Evaluations

> Historical snapshot: this review predates the follow-up fixes and manual evidence recorded below. Current status is in the follow-up section and [verification.md](../verification.md).

- **Plan**: [plan.md](../plan.md)
- **Scope**: Current working tree, including uncommitted changes; plan items 2.6–2.10 and 4.8; course evidence for lessons 22–24 and the 10xChampion submission.
- **Reviewed phases**: 1–4 implementation state and evidence state.
- **Date**: 2026-11-01
- **Verdict**: NEEDS ATTENTION — 2.6, 2.8, 2.9, and 4.8 are implemented and evidenced; the 2.7 process-restart proof and the 2.10 deadline edge remain open; course evidence remains pending.
- **Findings**: 0 critical, 6 warnings, 1 observation.

## Verdicts

| Dimension           | Verdict                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Plan adherence      | WARNING; the 2.7 ledger exists, but the exact restart/zero-fetch verification criterion is not proven.          |
| Scope discipline    | PASS; no provider calls, hosted workflow dispatches, approval activation, or branch-protection changes.         |
| Safety and quality  | WARNING; offline gates pass, but the production SDK error path has an uncovered deadline edge.                  |
| Architecture        | PASS against the updated plan; runner/provider adaptations still need course-reviewer acceptance.               |
| Pattern consistency | PASS; shared reviewer contract, deterministic assertions, and sanitized reporting are retained.                 |
| Success criteria    | WARNING until 2.7 and 2.10 are verified, and 4.9, the SDK demonstration, and Champion screenshots are supplied. |

## Completed implementation and evidence

- **2.6 — implemented and recorded.** Reports include per-model confusion counts, denominators, and distinct-fixture outcomes. Holdout results: Luna TP/TN/FP/FN = 15/18/0/3 and 5/6 distinct defect cases hit; Sol = 18/18/0/0 and 6/6 hit. Repetitions are identified as response trials.
- **Verdict versus text assertions — separated.** The seven failed historical assertions are three wrong verdicts (Luna case-09 repetitions 1–3) plus four verdict-matching text-anchor misses (Luna case-07 rep 1 and case-11 rep 3; Sol case-07 reps 1 and 3). Neither category scores unsupported allegations; that requires 4.9.
- **2.7 — implementation present; verification proof incomplete.** A local comparison approval is atomically consumed in a durable filesystem ledger before Promptfoo starts. The test reuses the ledger twice in one process-like test and does not spawn a new process or assert zero fetches after restart, as the detailed plan criterion requires. Hosted one-shot comparisons remain fail-closed because the local ledger does not protect isolated workflow attempts. The checked-in approval is disabled.
- **2.8 — implemented.** The trusted runner invokes the pinned Promptfoo CLI and custom provider as the matrix engine; deterministic assertions and the safe report boundary remain. The saved 72-row replay completed with 65 assertions passing, 7 failing, zero provider attempts, and `inferencePerformed: false`. Promptfoo's nonzero matrix result represents the seven reproduced assertion misses; the replay wrapper exits successfully after saving the artifact.
- **2.9 — implemented.** Total evaluation elapsed time is reported separately from per-reviewer duration and covered by tests.
- **2.10 — SDK integration present; deadline contract incomplete.** Vercel AI SDK 7 `ToolLoopAgent` with the OpenAI Responses provider replaces the direct transport. Offline tests cover request construction, status/output validation, usage, stalled main response, and sanitized metadata. The error handler can still await cloned-response metadata outside the deadline race; current tests do not cover an early SDK error with a stalled cloned body. No live SDK call was made.
- **4.8 — evidence recorded.** Per-model confusion and distinct-case results are derived from the saved 72-response matrix in [verification.md](../verification.md); no new model call was used.
- The implementation changes are uncommitted. Plan item 2.7 remains unchecked pending the restart/zero-fetch test. No Manual checkbox was changed by this review.

## Findings

### F1 — Human audit of 72 summaries remains open (4.9)

- **Severity**: ⚠️ WARNING
- **Dimension**: Success criteria
- **Location**: [plan.md](../plan.md:429), [verification.md](../verification.md:113)
- **Detail**: No human audit of unsupported or unrelated allegations has been recorded. The four anchor misses are not that audit, and deterministic anchors cannot establish semantic support. The replay report records 0/72 summaries reviewed.
- **Smallest next step**: Read the existing 72 summaries against their accepted oracles and record unsupported allegations separately from verdict misses and anchor misses. Make no provider calls. Keep 4.9 unchecked until the author completes it.

### F2 — Live SDK communication proof remains pending (2.11)

- **Severity**: ⚠️ WARNING
- **Dimension**: Course evidence / success criteria
- **Location**: [kurs_23.md](/home/ubuntu/10x/kurs_23.md:48), [plan.md](../plan.md:394)
- **Detail**: The SDK is integrated and the offline adapter tests pass, but a fake fetch does not prove communication with a model. The saved 72-call authorization predates the SDK and does not authorize another request.
- **Smallest next step**: If this proof is needed for the submission, obtain separate budget approval, run one synthetic-diff review through the SDK, and retain only sanitized output and usage. Keep 2.11 unchecked until then.

### F3 — 10xChampion screenshots are absent (2.12)

- **Severity**: ⚠️ WARNING
- **Dimension**: Course evidence / success criteria
- **Location**: [kurs_22.md](/home/ubuntu/10x/kurs_22.md:277), [archived run evidence](../../../archive/2026-10-29-ci-code-review/verification.md:92)
- **Detail**: The archived evidence records successful run `41175988320`, check `124463575649`, and the PR #39 review comment. No screenshots were found for the pipeline/job, job logs, or LLM review comment.
- **Smallest next step**: Capture those three views from the existing run and PR; this requires no model run. Keep 2.12 unchecked until the author supplies them.

### F4 — Historical matrix provenance differs from the integrated course path

- **Severity**: ⚠️ WARNING
- **Dimension**: Course evidence
- **Location**: [kurs_24.md](/home/ubuntu/10x/kurs_24.md:572), [verification.md](../verification.md:170)
- **Detail**: The historical 72-response matrix compares two models on twelve cases and records pass/fail assertions, estimated cost, and reviewer duration, but it ran through the earlier custom runner and direct HTTP transport. Current code uses Promptfoo for the matrix and Vercel AI SDK 7 for production review. The Promptfoo replay proves offline integration only; it does not turn historical responses into fresh Promptfoo/SDK inference evidence.
- **Smallest next step**: Present both provenance facts and the replay report to the course reviewers. A new paid matrix is outside the current authorization; this review does not decide whether the adapted path is acceptable.

### F5 — Custom runner remains the trusted boundary around Promptfoo

- **Severity**: 👁 OBSERVATION
- **Dimension**: Course alignment / architecture
- **Location**: [runner.mjs](../../../../packages/ai-reviewer/evals/runner.mjs:79), [kurs_24.md](/home/ubuntu/10x/kurs_24.md:572)
- **Detail**: Promptfoo is now the actual matrix engine, but `runner.mjs` still performs approval, budget, invocation, and report duties. This separation is intentional in the plan and tested offline. The historical result came from the custom runner directly. Whether the course expects Promptfoo to own more of the workflow, or accepts this controlled wrapper, is for the instructors to decide.
- **Smallest next step**: Include the implementation and historical-run distinction in the submission; request an instructor decision only if acceptance remains unclear. No code change is indicated by the current project plan.

### F6 — Local approval replay is not tested across a process restart

- **Severity**: ⚠️ WARNING
- **Dimension**: Plan adherence / verification coverage
- **Location**: [policy.test.mjs](../../../../packages/ai-reviewer/evals/test/policy.test.mjs:131), [plan.md](../plan.md:191)
- **Detail**: The ledger implementation uses exclusive file creation and fsync, and the runner consumes a comparison approval before spawning Promptfoo. The current test calls the consume function twice in the same process against a temporary directory. It does not prove that a new process rejects the same approval or that the integrated replay path makes zero provider fetches after restart, as the plan's automated success criterion requires. This is a verification gap; the inspected code path appears fail-closed.
- **Smallest next step**: Add an offline child-process test that consumes the approval once, starts a second process with the same ledger and approval, and verifies rejection before the fake provider is called. Keep automated item 2.7 unchecked until this evidence exists.

### F7 — SDK error handling can wait beyond the configured deadline

- **Severity**: ⚠️ WARNING
- **Dimension**: Safety and quality / plan adherence
- **Location**: [openai.mjs](../../../../packages/ai-reviewer/src/providers/openai.mjs)
- **Detail**: `requestReview()` races its main operation against the deadline, but its outer `catch` awaits `responseBodyMetadataPromise` after that race rejects. If the SDK rejects before the cloned response stream finishes and the abort timer has not yet fired, this wait is no longer bounded by the race; a stalled stream can extend the call past `deadlineMs`. Existing tests cover a stalled main response and a delayed successful body, not an early provider error with a stalled metadata clone. This conflicts with the 2.10 deadline contract.
- **Smallest next step**: Remove the unbounded await or bound it by the same deadline while preserving sanitized error behavior. Add an offline test where the SDK fails early and the cloned error body stalls; assert the call resolves as a deadline error within the configured limit. Keep 2.10 unchecked until fixed and verified.

## Verification performed

- `npm run test:ai-review`: PASS, 52/52.
- `npm run test:ai-review-evals`: PASS, 31/31, including Promptfoo no-network replay and offline fake compare/gate execution.
- `npm run lint`: PASS.
- `npm run build`: PASS; Astro skips sitemap generation because `site` is not configured.
- `git diff --check`: PASS.
- No paid provider calls or hosted workflow dispatches were made; no Manual checkbox was changed.

## Follow-up verification (2026-11-01)

- **2.7 resolved:** The policy test now starts separate processes against the same durable ledger. The replay process is rejected with `APPROVAL_CONSUMED` before the fake provider fetch; the test also confirms the processes have different PIDs.
- **2.10 resolved:** Cloned error-response metadata is bounded by the request deadline. The new stalled-clone test returns `DEADLINE_EXCEEDED` and confirms one provider attempt.
- **2.11 complete:** After separate author approval, one SDK-backed synthetic-diff request completed. Sanitized output and usage are in [sdk-smoke.json](sdk-smoke.json); the author confirmed the result.
- **2.12 complete:** The existing successful PR #39 pipeline, reviewer job/log, and review comment were captured in the adjacent screenshots.
- **Still pending:** The human audit of all 72 saved summaries under 4.9. No additional provider requests are needed or authorized for this audit.

The follow-up implementation gates passed: `npm run test:ai-review` (53/53), `npm run test:ai-review-evals` (31/31), `npm run lint`, and `npm run build`. The historical report above is retained as a record of the state at the original review, not the current verdict.
