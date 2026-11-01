# Code Reviewer Evaluations Implementation Plan

## Overview

Add a small promptfoo regression suite for the existing static code reviewer. Compare two or three explicitly approved models on the same three controlled diffs, repeat every case three times, and report evaluation pass/fail, known-defect detection, false alarms, schema compliance, time, and estimated USD cost.

After the initial comparison, use one selected model in a separate required PR check that evaluates the proposed prompt from the PR. This document authorizes planning only: implementation, paid requests, workflow dispatch, and branch-protection changes have not been performed.

## Current State Analysis

The baseline research is [research.md](research.md), supplemented by source inspection at `0613aa5922d6ec08cb51c3c1ed9db903b37b6794`. Its manual-only workflow and 24-case corpus were proposals; the planning decisions below supersede those parts.

- The production reviewer calls OpenAI Responses through `reviewChange()` and returns a validated envelope. It already records request identity, aggregate token usage, prompt digest, and reviewer timing (`packages/ai-reviewer/src/core/review.mjs:60`).
- `loadPrompt()` reads the two bundled Markdown files and hashes their ordered contents (`packages/ai-reviewer/src/prompts/load.mjs:5`). The request preserves `store:false`, no tools, strict structured output, and an 8,000-token output cap (`packages/ai-reviewer/src/providers/openai.mjs:39`).
- The response has six numeric scores, `verdict`, and Markdown `summary`; scores do not determine the verdict (`packages/ai-reviewer/src/contracts/review.schema.json:1`). The current evidence policy already excludes speculative findings, unrelated pre-existing defects, and missing tests alone.
- The production workflow executes the captured PR base package, including its prompt (`.github/workflows/review.yml:35`). It does not evaluate the proposed prompt from the head branch. Existing hosted evidence shows that `AI Code Review` already blocks merge on rejection or operational error; this is distinct from testing reviewer quality (`context/archive/2026-10-29-ci-code-review/verification.md:283`). Live protection settings have not been re-read in this planning session.
- The native reviewer tests are intentionally offline (`packages/ai-reviewer/test/offline.mjs:1`); normal CI invokes them (`.github/workflows/ci.yml:18`). There is no promptfoo suite in the inspected configuration.
- Research could not read the live `AI_REVIEW_MODEL` variable because of HTTP 403. Historical `gpt-5.4-mini` usage is evidence of that recorded run, not today's setting or account access.

## Desired End State

There are exactly three checked-in, labeled review cases: correct code, an obvious introduced defect, and a harder introduced defect. Every compared model receives identical model-visible data and production request settings, with three fresh repetitions per case. For two models the comparison contains 18 requests; for three it contains 27. The ongoing gate uses one selected model and nine requests.

The initial report provides enough evidence for a human to verify whether the reviewer found the known defects and invented additional allegations. Subsequent runs apply deterministic assertions automatically. A valid reviewer `fail` on a defective case is an evaluation success; an API error has no code verdict and cannot pass an evaluation.

The required `AI Reviewer Evals` check tests the two prompt files from the captured PR head using trusted runner code and fixtures. All nine expected results must pass. An unchanged prompt produces a documented success without provider calls. A changed prompt without valid spending authorization remains non-successful and makes zero provider calls.

### Key Discoveries:

- Prompt replacement needs no production API change: stage a private copy of the trusted reviewer package and replace only the two fixed Markdown prompt files before calling its existing `reviewChange()` and `loadPrompt()`.
- Production check helpers encode their own workflow name, event, and check identity (`packages/ai-reviewer/src/github/prepare.mjs:1`, `:85`). Their provenance rules are patterns to follow, not functions to reuse unchanged for eval publication.
- The historical disposable stock helper provides a concrete arithmetic seed: commit `c4df8a5f314141c8b354f0f1673a8931542ac341`, file `scripts/ai-review-acceptance.mjs`, returns addition where subtraction is required. The current invariant is independently visible in `src/lib/spool-dto.ts:27`.
- Reserved-print recalculation excludes the current reservation in both manual and fallback capacity checks (`supabase/migrations/20261022000000_recalculate_reserved_print.sql:283`, `:302`). Removing only the manual exclusion may be rescued by fallback and is therefore an insufficient fixture mutation.

## What We're NOT Doing

- Changing the production reviewer prompt, its six criteria, response schema, request settings, review comment, labels, or existing required check.
- Inserting defects into application source or database migrations. Defective code is frozen fixture data only.
- Building the research proposal's 24-case corpus, a held-out statistical benchmark, a homepage case, or comprehensive reviewer accuracy claims.
- Adding a model judge, implicit grader requests, or manual assessment of every routine successful run.
- Executing PR-head scripts, dependencies, workflow configuration, assertions, or providers with the OpenAI secret.
- Evaluating executable runner/corpus changes from a PR with privileged credentials; those changes receive offline checks and trusted-master validation after merge.
- Treating score averages as evaluation accuracy, keyword matches as proof of semantic correctness, unknown costs as zero, or estimated cost as a billing receipt.
- Automatically substituting unavailable models, silently retrying model requests, automatically changing the production model, or enabling paid runs during implementation without the agreed approval.
- Imposing a new latency SLA. Time is measured and compared; the inherited request deadline remains the operational limit.

## Implementation Approach

Place an isolated ESM eval package under `packages/ai-reviewer/evals/`. Keep fixtures, deterministic assertions, provider adapter, report generation, and spending policy separate from the production package. Pin a compatible promptfoo release and its dependencies in the eval lockfile; use Node from `.nvmrc`.

The custom provider calls the trusted production entrypoint rather than recreating its OpenAI request. It sends only the case's title, body, diff, paths, and unreviewedPaths. Expected labels remain in the local assertion context and never enter the model input. It maps the validated result and safe telemetry to promptfoo's provider contract.

For candidate-prompt testing, fetch the captured PR head as Git objects and extract exactly `packages/ai-reviewer/prompts/code-review/system.md` and `criteria.md` as bounded regular blobs. Overlay their text in a disposable trusted reviewer bundle. All executable modules, dependencies, schema, case labels, pricing, and approval policy come from the captured trusted base.

Use a separate trusted `pull_request_target` workflow with prepare, inference, and publication jobs, plus a manual comparison entrypoint. Restrict paid PR evaluation to the repository owner's eligible same-repository PRs, matching the existing ownership intent. Forks, bots, or other ineligible actors never receive inference credentials; changed-prompt PRs in those categories remain blocked with an explanation. Unchanged-prompt PRs can complete without inference.

## Critical Implementation Details

### Bootstrap order

The first PR introducing the eval runner cannot be tested by a trusted-base runner that does not yet exist on `master`. Merge the offline-tested infrastructure under existing checks first. After it reaches trusted `master`, complete approved live acceptance on disposable PRs and only then add the new required check. Subsequent PRs may change prompt text and eval code together, but privileged inference evaluates candidate prompt text against the base runner and corpus, not candidate executable eval code.

### Check identity and freshness

The natural workflow check for `pull_request_target` is insufficient as a PR-head gate. Publish the distinct custom `AI Reviewer Evals` check explicitly on the captured head SHA. Bind success to PR/head/base, workflow run and attempt, prompt digest, runner revision, corpus/schema hashes, selected model, repetitions, and spending-policy identity; recheck live refs before paid work and before success publication.

### Spending authorization

Models and numeric USD limits are deliberately a later approval prerequisite, as agreed with the author. Implement fail-closed configuration now: no valid approved manifest means no provider calls. Comparison authorization binds a concrete model/case/prompt/repetition manifest and request count; recurring gate authorization separately states the selected model and a per-run limit, so approval of one comparison does not implicitly authorize recurring spend.

Preflight must reserve a conservative uncached allowance for all scheduled input and the full 8,000-token output cap before admitting a run. Use verified model token accounting with a documented safety margin; unsupported accounting, missing prices, or an estimate above the approved limit refuses the run. This is an application spending guard based on estimates, not a provider-enforced absolute billing ceiling. Unknown-cost failures stop further inference and retain the reserved allowance; timeout retries and reruns are separate spending events.

## Phase 1: Controlled cases and quality assertions

### Overview

Freeze a reproducible three-case corpus with independently justified labels and checks that distinguish finding the intended defect from merely saying `fail`.

### Changes Required:

#### 1. Case inputs and reference findings

**Files**: `packages/ai-reviewer/evals/cases/`, `packages/ai-reviewer/evals/README.md`.

**Intent**: Give every model the same small, meaningful challenge with enough visible context to prove the expected behavior. Keep ground truth independently reviewable.

**Contract**: Exactly three neutral case IDs with separate model input and oracle metadata. Input follows `assembleInput()` without extra fields. Oracle metadata records source revision, expected verdict, changed location, mechanism, trigger, expected/incorrect behavior, reproduction, and unacceptable allegations. Expected labels and assertion patterns are never serialized into model-visible data.

| Case      | Controlled change                                                                                                                                                                                                                                             | Expected review and witness                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case-01` | Introduce the guarded stock helper with subtraction, finite/nonnegative validation, and reserved-stock bounds.                                                                                                                                                | `pass`; 150 recorded minus 88 reserved is 62; visible guards invalidate speculative negative-stock allegations.                                                                                                                                                      |
| `case-02` | Use the same helper scaffold but add recorded and reserved grams.                                                                                                                                                                                             | `fail`; identify the changed arithmetic and inflated availability: 238 instead of 62.                                                                                                                                                                                |
| `case-03` | Introduce a self-contained JS allocation helper derived from the reserved-print SQL behavior, with a controlled diff removing own-reservation exclusions in both manual and fallback capacity checks. Show downstream release and visible eligibility checks. | `fail`; one matching spool has 300 g, another print holds 209 g, current hold is 88 g, new hold is 84 g. Correct capacity is 91 g, so retain and resize; mutated capacity is 3 g, so the reservation is incorrectly released. No alternative spool masks the defect. |

The third fixture is explicitly a controlled JS translation of the cited SQL behavior, not a claim to execute or modify that migration. Freeze before/after source with each diff so native tests can prove its witness without a database or model API. Diff titles and descriptions are neutral; oracle numbers and bug labels do not leak through fixture IDs or test scaffolding in the model input.

#### 2. Deterministic quality assertions

**Files**: `packages/ai-reviewer/evals/assertions.mjs`, `packages/ai-reviewer/evals/test/cases.test.mjs`, `packages/ai-reviewer/evals/test/assertions.test.mjs`.

**Intent**: Catch schema violations, wrong verdicts, and failures to mention the actual known defect while tolerating ordinary changes in wording.

**Contract**: Reuse `parseReview()`/`validateReview()` for exactly the existing eight fields. Check expected verdict independently from a conjunction of known-finding anchors: changed location, defect mechanism, and consequence. Use explicit bounded alternative expressions rather than exact summary snapshots. Test canned correct findings, unrelated `fail` findings, generic `fail`, always-pass, always-fail, missing fields, extra fields, nonfinite/out-of-range scores, blank/oversized summaries, and malformed JSON. Preserve a separate initial human finding checklist for evidence, trigger, expected/actual result, reproduction, attribution, visible safeguards, and additional false allegations. No automated assertion claims complete semantic verification.

### Success Criteria:

#### Automated Verification:

- Corpus validation passes: exactly three nonempty reviewable diffs with valid hunks, frozen before/after witnesses, path agreement, and no oracle fields in assembled model input.
- Fixture witnesses pass offline: correct arithmetic returns 62, addition returns 238, and own-hold double counting changes retention into erroneous release in the documented scenario.
- Assertion tests pass offline: schema errors, wrong verdicts, generic or unrelated failures, and known-finding omissions fail; acceptable wording variants pass.

#### Manual Verification:

- The author accepts the three reference findings and can compare future answers against their concise expected-result descriptions.

## Phase 2: Production adapter, spending guard, and reports

### Overview

Add a runnable promptfoo harness with deterministic offline verification, fresh repetitions, and transparent cost/time reporting.

### Changes Required:

#### 1. Isolated package and provider

**Files**: `packages/ai-reviewer/evals/package.json`, `package-lock.json`, `promptfooconfig.mjs`, `provider.mjs`, `runner.mjs`, `test/provider.test.mjs`; root `package.json`.

**Intent**: Reuse the real review contract for both local comparison and Actions without adding promptfoo to production inference dependencies.

**Contract**: Pin promptfoo after verifying compatibility with Node 24.21.0. Provide eval-package `test`, `preflight`, `compare`, and `gate` commands; root `test:ai-review-evals` runs only the offline suite. Provider instances have explicit unique model IDs and call trusted `reviewChange()` with deterministic eval context. Return serialized validated review as `output`, safe operational failures as `error`, usage as prompt/completion/total token counters, estimated USD as `cost` when known, and allowlisted metadata. No provider or grader defaults, prompt suggestions, or additional inference calls. Normal tests use injected HTTP and the existing offline-guard pattern.

#### 2. Approval and execution policy

**Files**: `packages/ai-reviewer/evals/policy.mjs`, `approval.schema.json`, `pricing.json`, `test/policy.test.mjs`.

**Intent**: Make both the initial paid comparison and later recurring gate conditional on deliberate, reviewable spending authorization.

**Contract**: Comparison policy allows exactly two or three approved explicit models; gate policy names one selected model. Both approval modes bind mode, model IDs, trusted runner/corpus/schema/pricing identities, repetitions of three, request count, numeric per-run USD allowance, approval identity, and expiry. Comparison approval additionally binds the exact prompt digest. Recurring gate approval instead binds eligible events, the two fixed candidate prompt paths, and explicit prompt-size and input-token allowances; it authorizes future candidate prompt digests within those bounds. Trusted preparation records the actual candidate digest in each execution manifest without changing the approved policy. Gate policy additionally records explicit recurring-run authorization. Offline policy tests must admit two distinct candidate prompt digests under the same recurring approval, reject candidates outside its approved bounds, and reject a changed prompt digest under an exact comparison approval. Initial checked-in policy is disabled with no approved numeric budget or default paid model. Future policy values come from author approval, never candidate PR inputs.

Keep concurrency at one, promptfoo cache disabled, no implicit request retries, fixed case/repetition order across models, production model defaults, and inherited output/deadline limits. Before every provider call enforce the manifest and reserved allowance. Stop on operational error or unknown usage/cost; mark unexecuted matrix cells as not run and fail the incomplete evaluation. Quality assertion failures remain in the report and may continue within the reserved manifest. An approved run cannot make more than 18/27 comparison calls or nine gate calls; access failures consume a scheduled attempt and do not trigger extra probes or substitutions.

#### 3. Metrics and exports

**Files**: `packages/ai-reviewer/evals/report.mjs`, `test/report.test.mjs`, `README.md`, `.gitignore`.

**Intent**: Make results easy to compare and explain failures without exposing credentials or confusing reviewer verdict with evaluation outcome.

**Contract**: Export sanitized JSON and HTML plus an Actions summary, with one row per case/model/repetition. Include expected and actual verdict, schema/known-finding assertions, eval pass/fail/error/not-run, six code scores, summary, request ID, safe error, tokens, reviewer duration, provider-call latency, and uncached USD estimate. Include total workflow duration separately in Actions. Record trusted runner SHA, candidate head/base and prompt digest, corpus/schema/config/pricing hashes, timestamps, limits, and approval identity.

Aggregate contract-valid completed results into TP/TN/FP/FN, known-defect hits, false-rejection rate, false-acceptance rate, and recall with counts/denominators. Separately show operational errors, not-run cells, and end-to-end pass count over the full planned matrix. For each model show median/p95 latency and sample size, estimated known cost, unknown-cost counts, reserved allowance, and approved limit. Do not divide by zero or treat missing usage as free. Cost is `(inputTokens * inputRate + outputTokens * outputRate) / 1,000,000`, using dated Standard uncached rates; do not add total tokens again. Small-sample percentiles and rates are descriptive. HTML and summaries treat model output as untrusted text, never executable markup or commands. Disable sharing, telemetry, and local response caching; ignore generated reports and promptfoo state in Git.

### Success Criteria:

#### Automated Verification:

- `npm run test:ai-review-evals` passes without credentials or network, including real trusted-reviewer request assembly, provider mappings, sanitized errors, and candidate-prompt digest coverage.
- Budget tests prove zero fetch calls for missing/expired/mismatched authorization, unknown rates/token accounting, excess cost, excess requests, or attempts to override trusted models/cases; failures stop further paid work.
- Fake-response comparisons produce exactly 18 or 27 planned cells and gate runs nine; cache, retries, concurrency, settings, and no-judge behavior match policy.
- Report tests verify confusion matrices, denominators, pass/fail distinction, timing units, uncached price arithmetic, missing-usage handling, partial runs, and safe JSON/HTML exports.
- `npm run test:ai-review`, `npm run lint`, and `npm run build` pass with production reviewer behavior unchanged.

## Phase 3: Trusted GitHub Actions and bootstrap

### Overview

Integrate explicit manual comparison and candidate-prompt PR evaluation while preserving the existing reviewer gate and offline CI.

### Changes Required:

#### 1. Workflow and candidate preparation

**Files**: `.github/workflows/reviewer-evals.yml`, `packages/ai-reviewer/evals/github/prepare.mjs`, `test/workflow.test.mjs`, `test/github.test.mjs`, `.github/workflows/ci.yml`.

**Intent**: Evaluate head-branch prompt text without executing head-branch code with credentials, and prevent an absent/skipped check from trapping unrelated PRs.

**Contract**: Use trusted `pull_request_target` on opened/synchronize/reopened PR events targeting `master`, without YAML path filters, plus `workflow_dispatch` on trusted `master` for comparison and explicit reruns. Manual PR reruns resolve fresh PR refs from a numeric PR identity; no arbitrary provider, file path, model list, or executable ref inputs. Capture exact trusted base/head/run/attempt identities. Install reviewer and isolated eval dependencies with locked installs before exposing the API key. Pin action revisions consistently with the production review workflow.

Read the two fixed head prompt paths only as regular Git blobs; reject missing/deleted files, symlinks, submodules, invalid UTF-8, empty text, and combined prompt text above 64 KiB. Stage the trusted package privately and overlay those two files only; no PR-head checkout, package manifests, imports, assertions, or dependency caches. Hash the same ordered prompt contents as production. Use base corpus/schema/policy even if the same PR proposes edits to them. CI runs the candidate offline eval suite without `OPENAI_API_KEY`; production native tests stay offline.

#### 2. Independent check lifecycle and artifact provenance

**Files**: `packages/ai-reviewer/evals/github/checks.mjs`, `github/publish.mjs`, workflow and GitHub tests.

**Intent**: Make evaluation results an enforceable, distinct check on the right PR commit, including missing artifacts and interrupted executions.

**Contract**: Prepare opens `AI Reviewer Evals` on the captured head before fallible steps. Prepare/publication have only needed read/check-write permissions and no OpenAI secret. Inference has `permissions: {}` and receives `OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}` only at its eval step; it has no GitHub write credential. Artifact names bind run and attempt, and publication validates context and matrix completeness. Validate provenance against the eval workflow's event/path rather than broadening production `trustedCheck()`.

Unchanged ordered prompt contents succeed without paid calls, with an explicit not-applicable summary. Changed prompts require eligibility, enabled approved gate policy, and all nine successful evaluations. Missing approval, API/timeout/refusal/schema error, not-run cell, absent artifact, invalid provenance, or assertion failure is non-successful. A known-defect review returning valid `fail` is expected and does not fail the check by itself. Re-read PR head/base before inference and publication; stale work is cancelled and cannot approve a newer execution. Serialize eval mutations per PR and paid inference repository-wide to avoid duplicate overlapping spend. A new head or attempt never reuses old success. Preserve the eval exit code while uploading allowlisted reports with `if: always()` and seven-day retention; publication failure must not advertise success.

#### 3. Bootstrap runbook

**Files**: eval `README.md`, `context/changes/code-review-evals/verification.md` during implementation, `AGENTS.md`.

**Intent**: Explain installation order and the difference between reviewing application code and testing reviewer behavior.

**Contract**: Document offline tests, no-key preflight, manual comparison, candidate prompt extraction, recurring spend policy, initial human checklist, and future prompt-change workflow. Record that Phase 3 lands on `master` before hosted activation; the first infrastructure PR relies on existing required checks. No branch-protection mutation or paid workflow dispatch occurs in this phase. Infrastructure-only changes are validated offline in their PR and through trusted-master acceptance after merge.

### Success Criteria:

#### Automated Verification:

- Workflow contract tests prove trusted-base execution, fixed-path blob extraction, rejection of symlink/deleted/oversized prompts, isolated secret/token permissions, locked installs, and no head-code execution.
- Check lifecycle tests cover unchanged prompt with zero calls, changed prompt with nine expected results, unauthorized owner/fork/bot with no secret use, missing approval/artifacts, invalid provenance, stale head/base, duplicate delivery, and newer attempts.
- Offline integration tests show a candidate prompt changes request text/digest, candidate runner/assertion/corpus/policy edits do not execute in privileged inference, and reports persist on failed evals without changing the production check.
- Candidate offline eval tests and existing reviewer tests pass through CI; `npm run lint` and `npm run build` pass.

#### Manual Verification:

- The author verifies the bootstrap infrastructure is on trusted `master`, paid policy is disabled, and the runbook identifies the later spending and branch-protection activation steps.

## Phase 4: Approved comparison and regression-gate activation

### Overview

Complete the first paid comparison only after approval, inspect finding quality, choose the ongoing gate model, and demonstrate merge blocking before requiring the new check.

### Changes Required:

#### 1. Preflight and explicit approval

**Files**: eval approval/pricing configuration; `context/changes/code-review-evals/verification.md` and `reviews/` evidence.

**Intent**: Present a concrete, bounded experiment for the author to approve before any provider request.

**Contract**: Recheck nonsecret production model identity using an authorized variable read or trusted envelope without reading the key. Refresh model availability documentation and Standard rates. The research pair `gpt-5.4-mini` / `gpt-5.4` is historical candidate guidance, not approved configuration or a promise of access. Recommend two compatible explicit snapshots where available; add a third only with explicit author selection. Produce no-key preflight for the exact frozen corpus, prompt, settings, three repetitions, 18/27 requests, input accounting, maximum output allowance, reserve, timeout, and price date. Present proposed IDs and USD ceiling; pause until the author explicitly approves the manifest. Account access is established only through the approved scheduled calls; unavailable models fail safely without substitution.

#### 2. Initial comparison and human validation

**Files**: comparison reports, reference-finding checklist, selection/approval evidence.

**Intent**: Select a model based on observed quality, repeatability, time, and cost rather than the six scores assigned to code.

**Contract**: Run the approved comparison via the existing repository secret. Human review checks each initial response against its oracle: real changed location, mechanism, trigger, expected/actual result, reproducible steps, PR attribution, visible safeguards, and any additional false allegations. Grouping identical responses may simplify inspection but every outcome remains accounted for. Document whether deterministic finding assertions agree with that assessment. Assertion changes require offline verification and a newly approved experiment rather than retroactively turning an old run green. If no model passes all nine results, do not activate the gate or weaken assertions to select a winner. Present qualifying models with time/cost evidence and obtain the author's selection of one gate model plus explicit recurring per-run spending authorization.

#### 3. Hosted gate acceptance and branch protection

**Files**: hosted check/run evidence, eval runbook, approval policy; existing repository protection configuration through the operator.

**Intent**: Prove that a harmful prompt change is blocked, a valid prompt can pass, and unrelated PRs incur no evaluation spend.

**Contract**: On disposable eligible PRs after bootstrap, test an unchanged prompt, a candidate prompt instructing unconditional `pass`, and a corrected prompt. Unchanged completes without inference; unconditional pass fails both defective cases; corrected must meet all nine assertions. Also exercise stale-head rejection and safe operational failure using offline/injected evidence where possible; live faults or reruns require budget coverage. Publish on exact head SHAs and verify distinct prompt digests. Record any hosted test calls separately from the 18/27-call comparison and obtain approval before exceeding its authorization. Preflight each acceptance run under a separate approved allowance; do not hide it in comparison totals.

Read existing protection settings, present the exact additive configuration, and obtain the author's activation approval before applying it or handing it to an authorized operator. Add required `AI Reviewer Evals` pinned to the verified GitHub Actions app while preserving `ci`, `smoke`, `AI Code Review`, strictness, and enforcement. Confirm a failed eval blocks merge after other checks succeed and a valid current-head result removes this additional blocker. Keep a documented emergency disable/restore path that requires an explicit authorized protection/policy change, never an automatic green bypass. No actual merge is needed for the blocking acceptance test.

### Success Criteria:

#### Automated Verification:

- The approved comparison exports the complete 18/27-cell matrix or a clearly failed partial matrix, with per-case assertions, tokens, duration, estimated cost, unknown costs, and manifest identity.
- Hosted candidate-prompt runs attach `AI Reviewer Evals` to the captured current head: unconditional-pass prompt fails, corrected prompt passes all nine results, and unchanged prompt makes zero inference calls.
- Post-activation readback or operator-provided evidence confirms the new required context while preserving all existing protection requirements.

#### Manual Verification:

- Before paid requests, the author explicitly approves model IDs, the concrete comparison manifest and numeric USD allowance; hosted acceptance runs have their own approved allowances.
- The author accepts the initial reference-based assessment of known-bug detection and false alarms, selects a qualifying gate model, and authorizes its recurring per-run spending policy.
- The author approves the protection change and confirms observed blocked/eligible merge behavior, report readability, bootstrap completion, and the documented stop/restore procedure.

## Testing Strategy

### Unit Tests:

Use native Node tests with injected HTTP and the offline guard. Verify frozen before/after behavior, oracle separation, response parsing, known-finding anchor combinations, budget reservation, usage/cost arithmetic, incomplete matrices, and safe rendering. No test command invokes a real grader or provider by default.

### Integration Tests:

Exercise the real trusted `reviewChange()` pipeline through a fake Responses boundary, candidate Markdown overlay, promptfoo provider result mapping, nine-cell gate, and JSON/HTML generation. Use fake GitHub responses for exact-head checks, event eligibility, artifact provenance, stale refs, and publication failures. Check that a valid model rejection of a defective diff counts as an eval pass. Include malicious candidate JS/config and symlink fixtures to demonstrate data-only extraction.

### Manual Testing Steps:

1. Approve the concise three-case oracle descriptions, including 150/88 arithmetic and the 300/209/88/84 allocation witness.
2. Inspect and approve the no-key comparison estimate with exact model IDs and numeric allowance.
3. After the approved run, compare initial summaries to the reference checklist; review false alarms separately from missed defects and API failures.
4. Select one qualifying model and approve a recurring gate policy. Approve hosted acceptance allowances before their calls.
5. After trusted bootstrap, inspect failing/corrected/unchanged prompt PRs and exact-head checks; then approve and verify additive branch protection.

## Performance Considerations

Keep inference sequential, three fresh repetitions, no automatic retries, and the production 10-minute request deadline. Give the workflow enough time for its full approved request count plus bounded setup/reporting; a comparison has at most 27 calls and a gate nine. Do not inherit the production single-review 20-minute workflow timeout for the entire comparison. A shorter explicit approved run deadline can stop with not-run cells and a failed matrix. Report reviewer duration, provider latency, and workflow elapsed separately; three repetitions do not establish a statistical latency SLA.

## Migration Notes

No application or database migration is needed. Land the runner and disabled policy first; obtain spending approval, run comparison/acceptance, then enable the new required context. Keep existing protection intact during bootstrap. Changes to trusted corpus, adapter, schema, pricing, or runner invalidate incompatible experiment identities and require a fresh preflight; changes to recurring spending policy require explicit approval. A future prompt PR cannot weaken trusted assertions or raise its own allowance.

## References

- Baseline: [research.md](research.md); task identity: [change.md](change.md).
- Prompt, criteria, schema: `packages/ai-reviewer/prompts/code-review/{system,criteria}.md`, `src/contracts/review.schema.json`.
- Core and request: `packages/ai-reviewer/src/core/review.mjs:60`, `src/providers/openai.mjs:39`, `src/prompts/load.mjs:5`.
- Workflow/provenance patterns: `.github/workflows/review.yml:35`, `packages/ai-reviewer/src/github/prepare.mjs:85`, `src/github/publish.mjs:44`.
- Stock invariant: `src/lib/spool-dto.ts:27`; controlled historical helper: commit `c4df8a5f314141c8b354f0f1673a8931542ac341`, `scripts/ai-review-acceptance.mjs`.
- Allocation behavior: `supabase/migrations/20261022000000_recalculate_reserved_print.sql:283`, `:302`, `:326`; witness acceptance: `supabase/tests/edit-reserved-prints.test.sql:75`.
- Existing gate evidence: `context/archive/2026-10-29-ci-code-review/verification.md:283`; accepted prompt policy: its `reviews/reviewer-prompt-validation.md`.
- Current documentation retrieved through Context7 during planning: [custom provider](https://www.promptfoo.dev/docs/providers/custom-api/), [CLI](https://www.promptfoo.dev/docs/usage/command-line/), [configuration](https://www.promptfoo.dev/docs/configuration/reference/).
- Trusted PR workflow and path-filter behavior verified through Context7: [GitHub events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [secure pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), [skipped workflow checks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## Progress

> Convention: pending/done checkboxes belong only here. Append the closing commit SHA when implementation lands; retain step titles.

### Phase 1: Controlled cases and quality assertions

#### Automated

- [x] 1.1 Corpus validation passes: exactly three nonempty reviewable diffs with valid hunks, frozen before/after witnesses, path agreement, and no oracle fields in assembled model input. — f9eeef9
- [x] 1.2 Fixture witnesses pass offline: correct arithmetic returns 62, addition returns 238, and own-hold double counting changes retention into erroneous release in the documented scenario. — f9eeef9
- [x] 1.3 Assertion tests pass offline: schema errors, wrong verdicts, generic or unrelated failures, and known-finding omissions fail; acceptable wording variants pass. — f9eeef9

#### Manual

- [ ] 1.4 The author accepts the three reference findings and can compare future answers against their concise expected-result descriptions.

### Phase 2: Production adapter, spending guard, and reports

#### Automated

- [x] 2.1 `npm run test:ai-review-evals` passes without credentials or network, including real trusted-reviewer request assembly, provider mappings, sanitized errors, and candidate-prompt digest coverage. — 2ba002e
- [x] 2.2 Budget tests prove zero fetch calls for missing/expired/mismatched authorization, unknown rates/token accounting, excess cost, excess requests, or attempts to override trusted models/cases; failures stop further paid work. — 2ba002e
- [x] 2.3 Fake-response comparisons produce exactly 18 or 27 planned cells and gate runs nine; cache, retries, concurrency, settings, and no-judge behavior match policy. — 2ba002e
- [x] 2.4 Report tests verify confusion matrices, denominators, pass/fail distinction, timing units, uncached price arithmetic, missing-usage handling, partial runs, and safe JSON/HTML exports. — 2ba002e
- [x] 2.5 `npm run test:ai-review`, `npm run lint`, and `npm run build` pass with production reviewer behavior unchanged. — 2ba002e

### Phase 3: Trusted GitHub Actions and bootstrap

#### Automated

- [x] 3.1 Workflow contract tests prove trusted-base execution, fixed-path blob extraction, rejection of symlink/deleted/oversized prompts, isolated secret/token permissions, locked installs, and no head-code execution. — 4f68f47
- [x] 3.2 Check lifecycle tests cover unchanged prompt with zero calls, changed prompt with nine expected results, unauthorized owner/fork/bot with no secret use, missing approval/artifacts, invalid provenance, stale head/base, duplicate delivery, and newer attempts. — 4f68f47
- [x] 3.3 Offline integration tests show a candidate prompt changes request text/digest, candidate runner/assertion/corpus/policy edits do not execute in privileged inference, and reports persist on failed evals without changing the production check. — 4f68f47
- [x] 3.4 Candidate offline eval tests and existing reviewer tests pass through CI; `npm run lint` and `npm run build` pass. — 4f68f47

#### Manual

- [ ] 3.5 The author verifies the bootstrap infrastructure is on trusted `master`, paid policy is disabled, and the runbook identifies the later spending and branch-protection activation steps.

### Phase 4: Approved comparison and regression-gate activation

#### Automated

- [ ] 4.1 The approved comparison exports the complete 18/27-cell matrix or a clearly failed partial matrix, with per-case assertions, tokens, duration, estimated cost, unknown costs, and manifest identity.
- [ ] 4.2 Hosted candidate-prompt runs attach `AI Reviewer Evals` to the captured current head: unconditional-pass prompt fails, corrected prompt passes all nine results, and unchanged prompt makes zero inference calls.
- [ ] 4.3 Post-activation readback or operator-provided evidence confirms the new required context while preserving all existing protection requirements.

#### Manual

- [ ] 4.4 Before paid requests, the author explicitly approves model IDs, the concrete comparison manifest and numeric USD allowance; hosted acceptance runs have their own approved allowances.
- [ ] 4.5 The author accepts the initial reference-based assessment of known-bug detection and false alarms, selects a qualifying gate model, and authorizes its recurring per-run spending policy.
- [ ] 4.6 The author approves the protection change and confirms observed blocked/eligible merge behavior, report readability, bootstrap completion, and the documented stop/restore procedure.
