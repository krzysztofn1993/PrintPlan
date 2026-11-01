# Code Reviewer Evaluations — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Test whether our reviewer accepts correct code and detects two known introduced defects before accepting prompt changes. Compare two or three models on identical diffs and report pass/fail, time, and estimated cost.

## Starting Point

The existing OpenAI reviewer has a shared prompt, six scoring criteria, and an eight-field JSON schema. Its required `AI Code Review` check already gates application PRs, but executes the prompt from the PR base; it does not test proposed prompt changes against known answers.

## Desired End State

Promptfoo evaluates three frozen cases three times per model. A separate required `AI Reviewer Evals` check tests prompt text from the PR with one selected model and blocks merge when any of its nine evaluations fails. Initial human inspection verifies whether findings match the known bugs; routine runs use automatic assertions.

## Key Decisions Made

| Decision           | Choice                                                                                                       | Why                                                                    | Source          |
| ------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------- |
| Corpus             | Exactly three controlled diffs: correct, obvious defect, harder defect.                                      | Small, understandable regression coverage based on project behavior.   | Plan            |
| Concrete cases     | Guarded subtraction; incorrect addition; double counting the current reservation during allocation.          | Each has a reproducible expected result.                               | Research + Plan |
| Fidelity           | Wrap existing `reviewChange()`; preserve prompt, six criteria, schema, and request settings.                 | Avoid a second reviewer implementation.                                | Research + Plan |
| Repetitions        | Three fresh runs per case/model; concurrency one, no automatic retries.                                      | Expose basic instability with bounded request counts.                  | Plan            |
| Finding assessment | Deterministic assertions plus initial reference-based human inspection; no model judge.                      | Check the actual known finding without extra grader cost.              | Plan            |
| PR gate            | One selected model; all nine results must pass; test candidate prompt from PR.                               | Automate regression blocking at lower recurring cost.                  | Plan            |
| Trust              | Base runner/corpus/policy; only the two head prompt Markdown files are candidate data.                       | Candidate code cannot weaken tests or execute with the secret.         | Research + Plan |
| Cost               | Dated uncached USD estimates, explicit unknowns, conservative preflight allowance.                           | Existing usage lacks cache detail; estimates are not billing receipts. | Research + Plan |
| Paid approval      | Approve exact models and numeric limit after fixture preflight; recurring gate needs explicit authorization. | No paid requests before a concrete experiment is approved.             | Plan            |

## Scope

**In scope:** frozen cases/oracles; deterministic assertions; isolated pinned promptfoo package; safe reports; existing repository secret; trusted manual comparison and required candidate-prompt check; bootstrap and activation runbook.

**Out of scope:** production prompt/schema changes; application defects or migrations; 24-case benchmark; model judge; candidate executable eval code with secrets; automatic production-model switching; exact billing or broad accuracy claims.

## Architecture / Approach

A trusted runner stages the production reviewer package and overlays only the two prompt Markdown blobs from the captured PR head. It runs trusted cases through the unchanged review entrypoint and maps results into promptfoo. Prepare and publish manage a separate head-SHA check; inference alone receives `OPENAI_API_KEY`, without GitHub write permissions. No prompt change means success with zero model calls; changed prompts without approval remain blocked without spend.

## Phases at a Glance

| Phase                        | What it delivers                                                                      | Key risk                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Cases and assertions      | Three neutral inputs, independent labels, executable witnesses, finding checks.       | Generic rejection or invented allegations mistaken for detection.                |
| 2. Adapter and reports       | Production parity, spending guard, three repetitions, safe JSON/HTML metrics.         | Unknown costs or incomplete runs hidden as successes.                            |
| 3. Actions and bootstrap     | Trusted candidate-prompt workflow, separate exact-head check, offline CI and runbook. | Executing head code or enabling a required check too early.                      |
| 4. Comparison and activation | Approved paid comparison, human inspection, one gate model, verified protection.      | Model access, repeatability, budget, or operator permissions prevent activation. |

**Prerequisites:** Node 24.21.0; existing OpenAI repository secret; trusted-master bootstrap before hosted evals; author approval of model IDs and numeric USD allowances before paid work; authorized protection operator for activation.
**Estimated effort:** Roughly 3–5 implementation sessions plus author review and hosted acceptance; API execution and approval waiting time are additional.

## Open Risks & Assumptions

- The first infrastructure PR uses existing checks. Only after its runner reaches trusted `master` can hosted eval acceptance and new required-check activation occur.
- Initial comparison: 18 requests for two models, 27 for three. Later gate: nine per changed-prompt run. Hosted activation tests and reruns need separate approved allowances.
- Exact model IDs and numeric limits are intentionally deferred to the mandatory approval step; disabled policy makes zero requests until then. Historical research candidates do not establish live access or the current production setting.
- Three cases and tolerant finding checks provide narrow regression protection. Human inspection is needed initially and for ambiguous failures or corpus changes; automatic matches do not prove every allegation is true.
- Estimated-cost guards cannot guarantee provider billing totals. Unknown-cost failures stop inference; recurring authorization explicitly defines a per-run allowance.

## Success Criteria (Summary)

- Every model receives the same three cases and settings; the report distinguishes schema compliance, expected verdict, known findings, false rejections, operational errors, time, and estimated cost.
- The selected model passes all nine evaluations; an unconditional-pass prompt fails the two defective cases. Prompt text comes from the current PR head while test execution remains trusted.
- Paid work requires prior approval; the new check blocks failed prompt changes after verified activation and preserves existing required checks.

## References

- [Research](research.md), [full plan and verification criteria](plan.md), [change identity](change.md).
- Production core: `packages/ai-reviewer/src/core/review.mjs:60`; prompt loading: `src/prompts/load.mjs:5`; trusted checkout: `.github/workflows/review.yml:35`.
- Fixture grounding: `src/lib/spool-dto.ts:27`; `supabase/migrations/20261022000000_recalculate_reserved_print.sql:283`; `supabase/tests/edit-reserved-prints.test.sql:75`.
