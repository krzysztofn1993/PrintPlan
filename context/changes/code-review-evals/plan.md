# Code Reviewer Evaluations Implementation Plan

## Overview

Maintain a narrow evaluation harness for the existing static code reviewer. A trusted custom runner owns approval, budget, invocation identity, and reporting; Promptfoo executes compare/gate matrices through the shared reviewer provider. The harness contains six development cases and twelve author-accepted holdout cases and runs three fresh repetitions per case. The historical two-model comparison covers the original six development cases; a separate authorized two-model holdout comparison has completed 72 requests across cases 07–18. Prefer `gpt-6.1-sol` for a bounded, human-reviewed pilot based on the holdout results, while keeping the checked-in approval disabled and any recurring gate separate.

The candidate-prompt workflow exists but has not been run from trusted `master`, and it is not approved as a required check. The completed one-time comparison used a temporary approval that was removed afterward. No further paid request, hosted workflow dispatch, recurring approval, or branch-protection change is authorized by this plan.

## Current State Analysis

The baseline research is [research.md](research.md), supplemented by the current harness and its generated comparison report. Research proposals for manual-only scoring and a 18-case corpus were not implemented as written; current code and observed results below supersede those earlier proposals.

- The production reviewer calls OpenAI Responses through `reviewChange()` and returns a validated envelope. It already records request identity, aggregate token usage, prompt digest, and reviewer timing (`packages/ai-reviewer/src/core/review.mjs:60`).
- `loadPrompt()` reads the two bundled Markdown files and hashes their ordered contents (`packages/ai-reviewer/src/prompts/load.mjs:5`). The request preserves `store:false`, no tools, strict structured output, and an 8,000-token output cap (`packages/ai-reviewer/src/providers/openai.mjs:39`).
- The response has six numeric scores, `verdict`, and Markdown `summary`; scores do not determine the verdict (`packages/ai-reviewer/src/contracts/review.schema.json:1`). The current evidence policy already excludes speculative findings, unrelated pre-existing defects, and missing tests alone.
- The production workflow executes the captured PR base package, including its prompt (`.github/workflows/review.yml:35`). It does not evaluate the proposed prompt from the head branch. Existing hosted evidence shows that `AI Code Review` already blocks merge on rejection or operational error; this is distinct from testing reviewer quality (`context/archive/2026-10-29-ci-code-review/verification.md:283`). Live protection settings have not been re-read in this planning session.
- The native reviewer tests are intentionally offline (`packages/ai-reviewer/test/offline.mjs:1`); normal CI invokes them (`.github/workflows/ci.yml:18`). The isolated eval suite lives under `packages/ai-reviewer/evals/`; its offline tests do not make provider calls. The current compare/gate path enters through the custom runner for approval, budget, and reporting, then executes the model matrix with Promptfoo. The historical 72-response comparison predates this integration and used the custom runner with direct API calls.
- Research could not read the live `AI_REVIEW_MODEL` variable because of HTTP 403. Historical `gpt-5.4-mini` usage is evidence of that recorded run, not today's setting or account access.
- Current harness state: 18 case IDs are catalogued; cases 01–06 are development evidence and cases 07–18 are the accepted holdout. Comparison approval binds selected case IDs; this holdout run used 12 × three repetitions × two models = 72 requests. A future one-model recurring gate must include all 18 cases and schedule 54 requests. Runtime and schema ceilings are 162 comparison and 54 gate requests. `approval.json` remains disabled.
- `approval.json` remains disabled (`enabled: false`, no approved models, zero request count, and no USD limit). The completed comparison was separately authorized for one exact run; that authorization is not recurring gate approval and cannot authorize a changed corpus or runner.
- In `reports/report.json`, all 36 responses completed with known usage, no operational errors, and no `not-run` cells. Both models matched oracle verdicts in all 18 cases: 30/30 defective reviews were `fail`, and 6/6 controls were `pass`. The two-model assertion count is 34/36 (17/18 per model), but this is historical diagnostic evidence because assertions were adjusted after inspecting responses from these same six cases.
- The two assertion misses are verdict-matching, substantively relevant `fail` summaries: Luna case-02 repetition 3 says addition changes 100−20 expected 80 g to 120 g available; Sol case-03 repetition 3 describes capacity being reduced to zero and a valid 100 g reservation being released instead of retained. Their consequence wording misses the current anchor alternatives. Treat these as assertion false negatives in this sample, not automatically as reviewer misses; do not tune anchors to these already-seen summaries.
- The accepted holdout run completed 72/72 requests with known usage, no operational errors, and no `not-run` cells. Sol matched 36/36 oracle verdicts and passed 34/36 assertions; Luna matched 33/36 verdicts and passed 31/36 assertions. All three Luna verdict misses were the same case-09 scenario. Four additional assertion misses were semantically relevant findings whose wording missed deterministic anchors. These are descriptive results on a curated set, not an independent statistical benchmark.

## Desired End State

The harness catalogs six development cases and twelve accepted holdout cases, with three repetitions per model and case. The historical comparison has 36 rows for the original six cases; the completed holdout-only comparison has 72 requests for two models. A future full-corpus comparison would use 108 requests for two models (162 for three), and a one-model gate over the full corpus would require 54 requests. These counts are supported by the runner and policy; the checked-in approval remains disabled.

The report separates verdict-level detection and false-rejection results from human-scored unsupported allegations. Per-model metrics include response-cell counts and distinct fixture counts so repeated calls are not presented as independent examples. A valid reviewer `fail` on a defective case is an evaluation success; an API error has no code verdict and cannot pass an evaluation.

The candidate-prompt check uses trusted runner code and fixed fixtures to test the two prompt files from the captured PR head. Under the full 18-case corpus, a changed prompt requires all 54 model calls to pass for the selected gate model; unchanged prompts make zero provider calls. The check and its recurring spending policy remain disabled until separately reviewed and authorized. A changed prompt without valid authorization makes zero provider calls and does not succeed.

### Key Discoveries:

- Prompt replacement needs no production API change: stage a private copy of the trusted reviewer package and replace only the two fixed Markdown prompt files before calling its existing `reviewChange()` and `loadPrompt()`.
- Production check helpers encode their own workflow name, event, and check identity (`packages/ai-reviewer/src/github/prepare.mjs:1`, `:85`). Their provenance rules are patterns to follow, not functions to reuse unchanged for eval publication.
- The historical disposable stock helper provides a concrete arithmetic seed: commit `c4df8a5f314141c8b354f0f1673a8931542ac341`, file `scripts/ai-review-acceptance.mjs`, returns addition where subtraction is required. The current invariant is independently visible in `src/lib/spool-dto.ts:27`.
- Reserved-print recalculation excludes the current reservation in both manual and fallback capacity checks (`supabase/migrations/20261022000000_recalculate_reserved_print.sql:283`, `:302`). Removing only the manual exclusion may be rescued by fallback and is therefore an insufficient fixture mutation.

## What We're NOT Doing

- Changing the production reviewer prompt, its six criteria, response schema, request settings, review comment, labels, or existing required check.
- Inserting defects into application source or database migrations. Defective code is frozen fixture data only.
- Claiming that either the six-case historical report or the curated twelve-case holdout establishes broad or statistically representative reviewer quality.
- Building beyond the current 18-case catalog, adding a homepage case, or making comprehensive reviewer accuracy claims.
- Adding a model judge, implicit grader requests, or manual assessment of every routine successful run.
- Executing PR-head scripts, dependencies, workflow configuration, assertions, or providers with the OpenAI secret.
- Evaluating executable runner/corpus changes from a PR with privileged credentials; those changes receive offline checks and trusted-master validation after merge.
- Treating score averages as evaluation accuracy, keyword matches as proof of semantic correctness, unknown costs as zero, or estimated cost as a billing receipt.
- Automatically substituting unavailable models, silently retrying model requests, automatically changing the production model, or enabling paid runs during implementation without the agreed approval.
- Imposing a new latency SLA. Time is measured and compared; the inherited request deadline remains the operational limit.

## Implementation Approach

Place an isolated ESM eval package under `packages/ai-reviewer/evals/`. Keep fixtures, deterministic assertions, the trusted runner, Promptfoo configuration/provider, report generation, and spending policy separate from the production package; use Node from `.nvmrc`. The runner validates/consumes authorization and invokes Promptfoo for compare/gate execution. Add an offline replay mode that passes saved responses through Promptfoo assertions for reproducible course evidence; replay must be explicitly labeled and must not be presented as fresh model inference. Migrate the production reviewer transport to Vercel AI SDK 7's OpenAI Responses provider while preserving the established request and output contract.

For each model/case/repetition cell, the runner calls the trusted production `reviewChange()` entrypoint rather than recreating its OpenAI request. It sends only the case's title, body, diff, paths, and unreviewedPaths. Expected labels remain in the local assertion context and never enter model-visible input. Each candidate model receives the same fixture and prompt contents.

For candidate-prompt testing, fetch the captured PR head as Git objects and extract exactly `packages/ai-reviewer/prompts/code-review/system.md` and `criteria.md` as bounded regular blobs. Overlay their text in a disposable trusted reviewer bundle. All executable modules, dependencies, schema, case labels, pricing, and approval policy come from the captured trusted base.

Use a separate trusted `pull_request_target` workflow with prepare, inference, and publication jobs, plus a manual comparison entrypoint. Restrict paid PR evaluation to the repository owner's eligible same-repository PRs, matching the existing ownership intent. Forks, bots, or other ineligible actors never receive inference credentials; changed-prompt PRs in those categories remain blocked with an explanation. Unchanged-prompt PRs can complete without inference.

## Critical Implementation Details

### Bootstrap order

The first PR introducing the eval runner cannot be tested by a trusted-base runner that does not yet exist on `master`. Merge the offline-tested infrastructure under existing checks first. After it reaches trusted `master`, complete approved live acceptance on disposable PRs and only then add the new required check. Subsequent PRs may change prompt text and eval code together, but privileged inference evaluates candidate prompt text against the base runner and corpus, not candidate executable eval code.

### Check identity and freshness

The natural workflow check for `pull_request_target` is insufficient as a PR-head gate. Publish the distinct custom `AI Reviewer Evals` check explicitly on the captured head SHA. Bind success to PR/head/base, workflow run and attempt, prompt digest, runner revision, corpus/schema hashes, selected model, repetitions, and spending-policy identity; recheck live refs before paid work and before success publication.

### Spending authorization

The current one-shot comparison is historical evidence, not an open approval. Keep `approval.json` disabled. Any further comparison must bind its exact model/case/prompt/repetition manifest, digest, request count, pricing identity, numeric USD limit, and unique invocation identity. Comparison approval is single-use: atomically claim and durably record its approval ID before the first provider request, then reject replay after a process restart or new workflow attempt. A retry or rerun requires fresh author approval. Recurring gate authorization is separate, cycle-bound, and model-specific; comparison approval never implies it.

Preflight must reserve a conservative uncached allowance for all scheduled input and the full 8,000-token output cap before admitting a run. Use verified model token accounting with a documented safety margin; unsupported accounting, missing prices, or an estimate above the approved limit refuses the run. This is an application spending guard based on estimates, not a provider-enforced absolute billing ceiling. Unknown-cost failures stop further inference and retain the reserved allowance; timeout retries and reruns are separate spending events.

## Phase 1: Controlled cases and quality assertions

### Overview

Keep the original six-case corpus as development evidence and the twelve accepted holdout cases separate from the prior report. Treat all six-case model outputs as development evidence, not an independent estimate of reviewer quality. Holdout oracles and rubric were accepted before their model run; its responses are now historical evidence and must not be used to tune assertions and then presented as independent results.

### Changes Required:

#### 1. Case inputs and reference findings

**Files**: `packages/ai-reviewer/evals/cases/`, `packages/ai-reviewer/evals/README.md`.

**Intent**: Give every model the same small, meaningful challenge with enough visible context to prove the expected behavior. Keep ground truth independently reviewable.

**Contract**: Eighteen neutral case IDs with separate model input and oracle metadata. Cases 01–06 are the historical development set; cases 07–18 are accepted holdout fixtures derived from six historical change areas, each represented by one defect and one safe correction. They are controlled fixtures grounded in the referenced revisions, not verbatim historical PR diffs. Input follows `assembleInput()` without extra fields. Oracle metadata records source revision, expected verdict, changed location, mechanism, trigger, expected/incorrect behavior, reproduction, and unacceptable allegations. Expected labels and assertion patterns are never serialized into model-visible data. Cases 01–06 cover one safe control and five known defects: incorrect stock addition, reservation double-counting, unclamped settlement, duplicate settlement on replay, and reversed reservation cancellation priority. Cases 07–18 cover HTTPS cookie security, preserving unsaved print edits during a failed list-refresh retry, rename-aware diff limits, validation of both returned reservation amounts against the configured margin, accurate recovery messaging, and access to saved settlement results. Each area has one defect regression and one safe correction.

| Case      | Controlled change                                                                                                                                                                                                                                             | Expected review and witness                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `case-01` | Introduce the guarded stock helper with subtraction, finite/nonnegative validation, and reserved-stock bounds.                                                                                                                                                | `pass`; 150 recorded minus 88 reserved is 62; visible guards invalidate speculative negative-stock allegations.                                                                                                                                                      |
| `case-02` | Use the same helper scaffold but add recorded and reserved grams.                                                                                                                                                                                             | `fail`; identify the changed arithmetic and inflated availability: 238 instead of 62.                                                                                                                                                                                |
| `case-03` | Introduce a self-contained JS allocation helper derived from the reserved-print SQL behavior, with a controlled diff removing own-reservation exclusions in both manual and fallback capacity checks. Show downstream release and visible eligibility checks. | `fail`; one matching spool has 300 g, another print holds 209 g, current hold is 88 g, new hold is 84 g. Correct capacity is 91 g, so retain and resize; mutated capacity is 3 g, so the reservation is incorrectly released. No alternative spool masks the defect. |
| `case-04` | Remove the clamp from a settlement helper.                                                                                                                                                                                                                    | `fail`; settling 130 g against a 100 g estimate must not leave negative stock.                                                                                                                                                                                       |
| `case-05` | Remove the prior-receipt replay path from settlement.                                                                                                                                                                                                         | `fail`; retrying the same request must not deduct consumption a second time.                                                                                                                                                                                         |
| `case-06` | Reverse newest-first cancellation ordering.                                                                                                                                                                                                                   | `fail`; when stock is short, cancel the newer reservation and retain the older one.                                                                                                                                                                                  |

The third fixture is explicitly a controlled JS translation of the cited SQL behavior, not a claim to execute or modify that migration. Freeze before/after source with each diff so native tests can prove its witness without a database or model API. Diff titles and descriptions are neutral; oracle numbers and bug labels do not leak through fixture IDs or test scaffolding in the model input.

#### 2. Deterministic quality assertions

**Files**: `packages/ai-reviewer/evals/assertions.mjs`, `packages/ai-reviewer/evals/test/cases.test.mjs`, `packages/ai-reviewer/evals/test/assertions.test.mjs`.

**Intent**: Catch schema violations, wrong verdicts, and failures to mention the actual known defect while tolerating ordinary changes in wording.

**Contract**: Reuse `parseReview()`/`validateReview()` for exactly the existing eight fields. Check expected verdict independently from a conjunction of known-finding anchors: changed location, defect mechanism, and consequence. Use explicit bounded alternative expressions rather than exact summary snapshots. Test canned correct findings, unrelated `fail` findings, generic `fail`, always-pass, always-fail, missing fields, extra fields, nonfinite/out-of-range scores, blank/oversized summaries, and malformed JSON. Preserve a separate initial human finding checklist for evidence, trigger, expected/actual result, reproduction, attribution, visible safeguards, and additional false allegations. No automated assertion claims complete semantic verification.

For case-09/10, anchors and positive/negative examples now follow the accepted unsaved-edit semantics. Run the offline tests before freezing the final runner digest; never tune these checks from holdout model responses.

### Success Criteria:

#### Automated Verification:

- Corpus validation passes: exactly 18 nonempty reviewable diffs with valid hunks, frozen before/after witnesses, path agreement, and no oracle fields in assembled model input.
- Fixture witnesses pass offline across all 18 cases: correct arithmetic returns 62, addition returns 238, own-hold double counting releases a reservation that should be retained, unclamped settlement can produce a negative balance, retrying a receipt avoids repeat deduction, cancellation preserves the older reservation, and the generic list-refresh retry asks before discarding unsaved print edits.
- Assertion tests pass offline: schema errors, wrong verdicts, generic or unrelated failures, and known-finding omissions fail; acceptable wording variants pass.

#### Manual Verification:

- The author accepted the six reference outcomes as narrow development evidence, not an independent quality benchmark.

## Phase 2: Production adapter, spending guard, and reports

### Overview

Add a runnable custom harness with deterministic offline verification, fresh repetitions, and transparent cost/time reporting.

The current Progress rows preserve historical completed work and track the course-alignment follow-ups in 2.6–2.10. Items 2.6, 2.8, 2.9, and 4.8 have implementation and offline evidence. The 2.7 local durable ledger is implemented, but its required cross-process replay proof is missing. The 2.10 SDK integration is present, but an error-path metadata wait can outlive the request deadline and needs correction and coverage. Promptfoo is the current matrix engine.

### Changes Required:

#### 1. Isolated package and runner

**Files**: `packages/ai-reviewer/evals/package.json`, `package-lock.json`, `runner.mjs`, `test/runner.test.mjs`; root `package.json`.

**Intent**: Reuse the real review contract for local comparison and Actions through one controlled execution path.

**Contract**: Provide eval-package `test`, `preflight`, `compare`, and `gate` commands; root `test:ai-review-evals` runs only the offline suite. `runner.mjs` remains the trusted authorization, budget, invocation, and report boundary; Promptfoo is the actual matrix execution engine for `compare` and `gate`, using a local custom provider that calls trusted `reviewChange()`. Each model receives identical case fields and the same bundled or approved candidate prompt; oracle metadata stays local to deterministic Promptfoo assertions and reporting. Do not use implicit graders, prompt suggestions, retries, or extra inference calls. Normal tests inject a fake fetch through the Vercel AI SDK OpenAI provider and use the existing offline-guard pattern.

#### 2. Approval and execution policy

**Files**: `packages/ai-reviewer/evals/policy.mjs`, `approval.schema.json`, `pricing.json`, `test/policy.test.mjs`.

**Intent**: Make both the initial paid comparison and later recurring gate conditional on deliberate, reviewable spending authorization.

**Contract**: Comparison policy allows exactly two or three approved explicit models; gate policy names one selected model. Both approval modes bind mode, model IDs, trusted code/corpus/schema/pricing identities, repetitions of three, request count, numeric per-run USD allowance, approval identity, unique invocation identity, issue time, and expiry. Runtime rejects approvals whose issue-to-expiry window exceeds 24 hours. Local comparison approvals are atomically consumed before Promptfoo starts; a durable local ledger rejects reuse after process restart. A hosted one-shot comparison remains unavailable until a trusted, cross-run durable claim mechanism is implemented and separately verified; do not claim the local ledger protects isolated workflow reruns. Any retry or rerun requires fresh author approval. The code identity covers the runner, policy, assertions, report, case catalog, response contract, Promptfoo provider/configuration, GitHub evaluation code, and trusted workflow. The corpus identity covers ordered inputs, oracles, fixture witnesses, and patches. Comparison approval additionally binds the exact prompt digest. Recurring gate approval instead binds eligible events, the two fixed candidate prompt paths, and explicit prompt-size and input-token allowances; it authorizes future candidate prompt digests within those bounds. Trusted preparation records the actual candidate digest in each execution manifest without changing the approved policy. Gate policy additionally records explicit recurring-run authorization. Offline policy tests must admit two distinct candidate prompt digests under the same recurring approval, reject candidates outside its approved bounds, reject a changed prompt digest under an exact comparison approval, and reject a consumed comparison approval before any fetch. Initial checked-in policy is disabled with no approved numeric budget or default paid model. Future policy values come from author approval, never candidate PR inputs.

Keep concurrency at one, response caching disabled, no implicit request retries, fixed case/repetition order across models, production model defaults, and inherited output/deadline limits. Before every provider call enforce the manifest and reserved allowance. Stop on operational error or unknown usage/cost; mark unexecuted matrix cells as not run and fail the incomplete evaluation. Quality assertion failures remain in the report and may continue within the reserved manifest. An approved invocation cannot exceed its manifest or be replayed. Current ceilings are 162 comparison calls and 54 full-corpus gate calls; access failures consume a scheduled attempt and do not trigger extra probes or substitutions.

#### 3. Metrics and exports

**Files**: `packages/ai-reviewer/evals/report.mjs`, `test/report.test.mjs`, `README.md`, `.gitignore`.

**Intent**: Make results easy to compare and explain failures without exposing credentials or confusing reviewer verdict with evaluation outcome.

**Contract**: Export sanitized JSON and HTML plus an Actions summary, with one row per case/model/repetition. Include expected and actual verdict, schema/known-finding assertions, eval pass/fail/error/not-run, six code scores, summary, request ID, safe error, tokens, production-envelope reviewer duration, and uncached USD estimate. Record total evaluation-run elapsed time separately from per-reviewer duration; exclude queue, dependency installation, and publication time from model timing comparisons. Do not claim a separate provider-latency measurement. Record trusted runner SHA, candidate head/base and prompt digest, corpus/schema/config/pricing hashes, timestamps, limits, invocation identity, and approval identity.

Aggregate contract-valid completed results into TP/TN/FP/FN, known-defect hits, false-rejection rate, false-acceptance rate, and recall with counts/denominators separately for each model. Also report distinct fixture outcomes by case ID and class; show repetition-level counts as repeated responses, not independent fixtures. Define verdict-level false positives as `fail` on an accepted safe case. Unsupported allegations in summaries are a separate human-scored outcome: for the initial comparison, review every completed summary against its accepted oracle and record unrelated or unsupported allegations separately from verdict errors and anchor misses. Deterministic anchors are filters, not semantic proof. Separately show operational errors, not-run cells, and end-to-end pass count over the full planned matrix. For each model show median/p95 reviewer duration and sample size, total evaluation elapsed time, estimated known cost, unknown-cost counts, reserved allowance, and approved limit. Do not divide by zero or treat missing usage as free. Cost is `(inputTokens * inputRate + outputTokens * outputRate) / 1,000,000`, using dated Standard uncached rates; do not add total tokens again. Small-sample percentiles and rates are descriptive. HTML and summaries treat model output as untrusted text, never executable markup or commands. Disable sharing, telemetry, and response caching; ignore generated reports in Git.

#### 4. Use Promptfoo for the actual evaluation matrix

**Files**: `packages/ai-reviewer/evals/package.json`, `package-lock.json`, `promptfooconfig.mjs`, `provider.mjs`, `runner.mjs`, `report.mjs`, `test/provider.test.mjs`, `test/runner.test.mjs`.

**Intent**: Match the course's Promptfoo model-matrix workflow without moving approval, budget, trust, or report policy into an untrusted or implicit grader.

**Contract**: Keep the pinned Promptfoo dependency, ESM configuration, and custom provider as the actual model-matrix path. Local `compare`/`gate` and the trusted workflow enter through `runner.mjs`, which validates and consumes the exact approval before invoking Promptfoo with cache disabled, one active request at a time, three repetitions, and deterministic case/model ordering. The provider calls the shared production `reviewChange()` path through the SDK, enforces the remaining request/cost allowance for every cell, and records normalized results for the existing safe report builder. Deterministic assertions compare the returned review to local oracle metadata; no judge provider is configured. Add a no-network replay command that sends the existing saved matrix through the Promptfoo provider/assertions and records that the source is saved output, not new inference. Keep offline provider/config/runner tests and prove no model request occurs under the offline guard.

#### 5. Use an agent SDK in the production reviewer package

**Files**: `packages/ai-reviewer/package.json`, `packages/ai-reviewer/package-lock.json`, `packages/ai-reviewer/src/providers/openai.mjs`, provider and reviewer offline tests.

**Intent**: Complete the M5L2 SDK integration in the existing independent reviewer package while preserving its accepted review contract.

**Contract**: Use Vercel AI SDK 7's `ToolLoopAgent` with its OpenAI Responses provider, `Output.object`, and the existing JSON Schema. Keep the Responses endpoint, model selection, `store:false`, empty-tools policy, two-step ceiling using the helper exported by the pinned SDK version, 8,000-token output limit, request deadline, validated response envelope, and safe diagnostics. The optional diagnostic callback is the narrow eval-report seam: expose only allowlisted metadata and sanitized error details, never credentials or raw request/response bodies, and leave ordinary production callers unchanged. Inject a fake fetch through the SDK provider in offline tests. Do not make a live request during implementation; a one-request SDK communication demonstration against a synthetic diff remains a separately approved Manual item.

### Success Criteria:

#### Automated Verification:

- `npm run test:ai-review-evals` passes without credentials or network, including real trusted-reviewer request assembly, provider mappings, sanitized errors, and candidate-prompt digest coverage.
- Budget tests prove zero fetch calls for missing/expired/mismatched authorization, unknown rates/token accounting, excess cost, excess requests, or attempts to override trusted models/cases; failures stop further paid work.
- Fake-response comparisons produce 72 or 108 holdout cells and the full-corpus gate runs 54; cache, retries, concurrency, settings, and no-judge behavior match policy.
- Report tests verify confusion matrices, denominators, pass/fail distinction, timing units, uncached price arithmetic, missing-usage handling, partial runs, and safe JSON/HTML exports.
- `npm run test:ai-review`, `npm run lint`, and `npm run build` pass with the production reviewer response contract and request settings unchanged.
- Approval replay tests reject a consumed local comparison approval with zero fetch calls after process restart; no cross-run hosted comparison is enabled until its durable claim mechanism exists.
- Report tests verify per-model confusion matrices, distinct-case denominators, repetition counts, and separation between verdict errors and human-scored unsupported allegations.
- Local compare/gate and trusted workflow both enter through the policy runner and execute the matrix through Promptfoo's pinned CLI and custom provider; deterministic assertion results map to the canonical report without a judge.
- Offline replay runs the saved 72-response matrix through Promptfoo without reading an API key or contacting a model; its artifact is labeled as replay rather than live comparison.
- Timing tests verify production-envelope reviewer duration and separately recorded total evaluation-run elapsed time, with explicit units and scope.
- Fake-fetch tests prove the SDK sends the established OpenAI Responses request shape, retains `store:false` and schema validation, and exposes token usage and sanitized response metadata.

#### Manual Verification:

- Only after separate author budget approval, run one SDK-backed review of a synthetic diff and retain sanitized output and token usage. The completed 72-call approval does not authorize this request.
- Capture the existing successful PR #39 pipeline/job view, job logs, and LLM review comment for the 10xChampion submission. This reuses prior evidence and requires no new provider call.

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

Unchanged ordered prompt contents succeed without paid calls, with an explicit not-applicable summary. Changed prompts require eligibility, enabled approved gate policy, and all 54 successful evaluations under the full 18-case corpus. Missing approval, API/timeout/refusal/schema error, not-run cell, absent artifact, invalid provenance, or assertion failure is non-successful. A known-defect review returning valid `fail` is expected and does not fail the check by itself. Re-read PR head/base before inference and publication; stale work is cancelled and cannot approve a newer execution. Serialize eval mutations per PR and paid inference repository-wide to avoid duplicate overlapping spend. A new head or attempt never reuses old success. Preserve the eval exit code while uploading allowlisted reports with `if: always()` and seven-day retention; publication failure must not advertise success.

#### 3. Bootstrap runbook

**Files**: eval `README.md`, `context/changes/code-review-evals/verification.md` during implementation, `AGENTS.md`.

**Intent**: Explain installation order and the difference between reviewing application code and testing reviewer behavior.

**Contract**: Document offline tests, no-key preflight, manual comparison, candidate prompt extraction, recurring spend policy, initial human checklist, and future prompt-change workflow. Record that Phase 3 lands on `master` before hosted activation; the first infrastructure PR relies on existing required checks. No branch-protection mutation or paid workflow dispatch occurs in this phase. Infrastructure-only changes are validated offline in their PR and through trusted-master acceptance after merge.

### Success Criteria:

#### Automated Verification:

- Workflow contract tests prove trusted-base execution, fixed-path blob extraction, rejection of symlink/deleted/oversized prompts, isolated secret/token permissions, locked installs, and no head-code execution.
- Check lifecycle tests cover unchanged prompt with zero calls, changed prompt with 54 expected results, unauthorized owner/fork/bot with no secret use, missing approval/artifacts, invalid provenance, stale head/base, duplicate delivery, and newer attempts.
- Offline integration tests show a candidate prompt changes request text/digest, candidate runner/assertion/corpus/policy edits do not execute in privileged inference, and reports persist on failed evals without changing the production check.
- Candidate offline eval tests and existing reviewer tests pass through CI; `npm run lint` and `npm run build` pass.

#### Manual Verification:

- The author verifies the bootstrap infrastructure is on trusted `master`, confirms the policy remains disabled, and reviews the separate future spending and branch-protection decisions.

## Phase 4: Pilot interpretation and holdout run

### Overview

The historic six-case comparison was followed by an author-reviewed 12-case holdout comparison. On this curated holdout, `gpt-6.1-sol` matched all 36 expected verdicts while `gpt-6-luna` matched 33/36. Prefer Sol for a bounded, human-reviewed pilot; do not treat this sample as a statistical benchmark or activate a recurring gate or branch protection from these results.

These verdict results do not assess unsupported allegations in summary text. The author separately reviewed all 72 saved summaries case by case and found no unsupported or unrelated allegations; report verdict-level false positives and allegation-level false claims separately.

### Changes Required:

#### 1. Review the completed comparison

**Files**: `packages/ai-reviewer/evals/reports/report.json`; `context/changes/code-review-evals/verification.md` and `reviews/` evidence.

**Intent**: Separate observed run data from reviewer-quality conclusions and record the author's review of the original six case oracles and their historical responses.

**Contract**: Record the historical 36/36 completion, zero operational errors and not-run cells, known usage, 34/36 assertion passes, 18/18 per-model verdict agreement, confusion counts, cost, and latency exactly as reported. The author reviewed these responses iteratively; the two failed assertions are relevant findings whose consequence wording missed the anchors. Do not tune assertions to these seen responses or present this run as independent evidence. Its one-run authorization does not carry over to a different digest, corpus, or recurring policy.

#### 2. Prepare, approve, and run the 12-case holdout

**Files**: case fixtures and oracle metadata; assertion tests; runner/policy/config/check limits; `verification.md` and approval evidence.

**Intent**: Add cases that were not used while the original six-case assertions were tuned, then evaluate them only after their oracle and rubric are frozen.

**Contract**: Prepare twelve new holdout cases from six historical change areas, each with one defect regression and one safe correction. These are hand-constructed controlled fixtures grounded in the cited historical fixes, not verbatim historical PRs. The author approved the count, two models, all twelve oracle outcomes, and shared rubric before model calls. Cases 09–10 cover the product-level behavior where a generic failed-list retry could discard unsaved print edits without confirmation and the corrected confirmation path. This replaced the former GitHub fork-eligibility pair at the author's request. The case-09 finding anchors and case-09/10 offline source-pair tests were updated from the accepted rubric with positive and negative examples, then the offline suite passed 27/27 before the exact manifest was accepted. The completed holdout-only comparison used 72 calls. Its $4.50 cap was above the $3.9312 conservative reserve and within the stated $20.50 available balance; it is a local admission cap, not an invoice ceiling. The temporary approval was removed after the run; the checked-in approval remains disabled. The author-reported GitHub credential validity through 2026-11-07 was not needed for this local run. Treat all six-case results as historical. Do not tune assertions to holdout answers and present a same-sample rerun as independent evidence.

#### 3. Decide whether to plan a later recurring gate

**Files**: author decision; a later, separately approved plan and approval policy if pursued.

**Intent**: Keep one-shot corpus validation, recurring spend, and required-check activation as separate decisions.

**Contract**: Do not activate or require the check as part of this pilot. The author accepted the exact runner/corpus/prompt/schema/pricing digests for one 72-request holdout comparison, which has completed. The temporary approval is no longer present; this does not authorize another run. A later gate remains a separate decision: it would cover all 18 cases (54 calls for one model) and require a new approval bound to a specific cycle and budget. No gate model, recurring budget, hosted acceptance, or branch-protection change has been approved. Trusted `master` verification is needed only before a future hosted GitHub run, not for the local comparison or this model-selection decision.

Any future protection change requires a new reviewable proposal of current settings and exact additive check identity, followed by explicit author authorization; this document does not authorize that change. Preserve current checks and document an emergency disable/restore path if activation is later approved.

### Success Criteria:

#### Automated Verification:

- The existing report's 36 rows, completion/error/not-run counts, per-case assertions, usage, cost, timings, and manifest identity are reconciled with the saved verification note.
- The documented 6-, 12-, and 18-case request and reserve arithmetic agrees with three repetitions, two comparison models, and the current $0.0546-per-request conservative allowance.
- Offline source-pair and assertion tests for cases 09–10 distinguish a retry declined by the user (preserve unsaved edits, do not load) from a confirmed retry (load the latest print); their accepted semantic finding anchors reject unrelated or location-free defects.
- The 12-case report records all 72 completed responses, known usage, no operational errors/not-run cells, per-model oracle agreement, assertion results, cost, reviewer duration, total evaluation elapsed time, and the accepted manifest.
- The saved response matrix yields per-model confusion counts and distinct-case outcomes; repeated calls remain labeled as repeated trials.

#### Manual Verification:

- The author accepted the six original oracle outcomes and confirmed that the 36 historical responses remain development evidence, not an independent benchmark; a second read-through is unnecessary.
- The author accepted all twelve holdout oracle outcomes and the shared pass/fail rubric on 2026-11-01.
- The author approved the models, 72-request count, 24-hour approval lifetime, and $4.50 cap, then accepted the exact one-shot runner/corpus/prompt/schema/pricing manifest. The 72-request comparison completed within that cap. This does not authorize another paid run.
- Defer recurring-gate planning unless the selected reviewer or prompt workflow later presents a concrete problem. This pilot comparison does not require a gate or branch-protection change.
- A human audits all completed holdout summaries against the accepted oracles and records unsupported allegations separately from wrong verdicts and deterministic-anchor misses. This requires no additional provider calls.

## Testing Strategy

### Unit Tests:

Use native Node tests with injected HTTP and the offline guard. Verify frozen before/after behavior, oracle separation, response parsing, known-finding anchor combinations, budget reservation, usage/cost arithmetic, incomplete matrices, and safe rendering. No test command invokes a real grader or provider by default.

### Integration Tests:

Exercise the real trusted `reviewChange()` pipeline through a fake Responses boundary, candidate Markdown overlay, runner result mapping, 54-cell gate, and JSON/HTML generation. Use fake GitHub responses for exact-head checks, event eligibility, artifact provenance, stale refs, and publication failures. Check that a valid model rejection of a defective diff counts as an eval pass. Include malicious candidate JS/config and symlink fixtures to demonstrate data-only extraction.

### Manual Testing Steps:

1. The author accepted all six development oracle outcomes and all twelve holdout oracle outcomes plus the shared rubric. The historical 36 responses need no repeat review.
2. The author accepted the exact 72-request manifest; the one-shot holdout comparison completed within the $4.50 cap.
3. Prefer `gpt-6.1-sol` for a bounded human-reviewed pilot. Do not expand the case set or run another paid comparison unless later evidence exposes a concrete unresolved question.
4. Defer recurring-gate and branch-protection work. Revisit only if the selected reviewer or prompt workflow later needs an enforced CI check.
5. Review all 72 saved holdout summaries against their accepted oracles and record unsupported allegations separately from verdict-level false positives and anchor misses; do not make additional model calls.

## Performance Considerations

Keep inference sequential, three fresh repetitions, no automatic retries, and the production 10-minute request deadline. The historical two-model comparison had 36 requests. The new 12-case holdout comparison requires 72 requests for two models, or 108 for three. A full 18-case comparison requires 108 or 162; a one-model gate over all 18 cases requires 54. Do not inherit the production single-review 20-minute workflow timeout for the entire run. A shorter explicit approved run deadline can stop with not-run cells and a failed matrix. Report production-envelope reviewer duration per request and total evaluation-run elapsed time as separate measures. Workflow queue, installation, and publication time are outside the model comparison. Three repetitions do not establish a statistical latency SLA; model timing results remain descriptive.

The historical six-case run had median/p95 duration 5.069/25.955 seconds for Luna and 6.436/11.976 seconds for Sol across 18 calls per model. The 12-case holdout had 5.395/14.487 seconds for Luna and 6.196/14.056 seconds for Sol across 36 calls per model. These are descriptive, not an SLA or a guarantee for another corpus.

Cost scenarios at the current preflight reserve are separate from the observed report cost:

|                                  Total cases | Two-model requests | Observed estimated cost | Linear observed-cost projection | Conservative reserve at $0.0546/request |
| -------------------------------------------: | -----------------: | ----------------------: | ------------------------------: | --------------------------------------: |
|                                            6 |                 36 |              $0.1402725 |           $0.1402725 (observed) |                                 $1.9656 |
|                       12 holdout cases (run) |                 72 |               $0.270941 |                 about $0.280545 |                                 $3.9312 |
| 18 total cases (full comparison, two models) |                108 |                       — |                about $0.4208175 |                                 $5.8968 |

The six-case and holdout amounts are observed token-based estimates, not billing receipts. The larger observed-cost values are arithmetic extrapolations, not forecasts or billing guarantees. The reserve uses 12,000 input and 8,000 output tokens at the dated uncached rates and is a conservative admission reserve, not a charge. Actual cost can vary with prompt, case data, output length, pricing, and account behavior. The $4.50 holdout cap was above the $3.9312 reserve and below the stated $20.50 account balance. It was not a provider-enforced billing ceiling. The previous $2.50 authorization applied only to the historical 36-request run.

## Migration Notes

No application or database migration is needed. The runner and trusted workflow already exist, but the checked-in approval remains disabled and no required context is authorized. The 12-case holdout and new 18-case catalog are accepted; the one-shot holdout has completed. Comparisons are capped at 162 requests and the full-corpus gate at 54. A future 24-case corpus is outside the current schema/catalog and would require a new reviewed manifest and budget; its two-model reserve is $7.8624 for 144 requests. The offline suite passed 27/27. A future corpus, runner, schema, or pricing change invalidates prior manifest identities and needs a fresh preflight and approval. Keep current protection intact; any activation needs its own plan and explicit authorization.

## References

- Baseline: [research.md](research.md); task identity: [change.md](change.md).
- Prompt, criteria, schema: `packages/ai-reviewer/prompts/code-review/{system,criteria}.md`, `src/contracts/review.schema.json`.
- Core and request: `packages/ai-reviewer/src/core/review.mjs:60`, `src/providers/openai.mjs:39`, `src/prompts/load.mjs:5`.
- Workflow/provenance patterns: `.github/workflows/review.yml:35`, `packages/ai-reviewer/src/github/prepare.mjs:85`, `src/github/publish.mjs:44`.
- Stock invariant: `src/lib/spool-dto.ts:27`; controlled historical helper: commit `c4df8a5f314141c8b354f0f1673a8931542ac341`, `scripts/ai-review-acceptance.mjs`.
- Allocation behavior: `supabase/migrations/20261022000000_recalculate_reserved_print.sql:283`, `:302`, `:326`; witness acceptance: `supabase/tests/edit-reserved-prints.test.sql:75`.
- Existing gate evidence: `context/archive/2026-10-29-ci-code-review/verification.md:283`; accepted prompt policy: its `reviews/reviewer-prompt-validation.md`.
- Promptfoo is selected as the matrix execution engine to align with M5L3; `runner.mjs` remains the trusted authorization and reporting boundary.
- Vercel AI SDK 7 and its OpenAI Responses provider are selected to align with M5L2; acceptance of this adapted implementation remains for course reviewers.
- Trusted PR workflow and path-filter behavior verified through Context7: [GitHub events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), [secure pull_request_target](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target), [skipped workflow checks](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).

## Progress

> Convention: pending/done checkboxes belong only here. Append the closing commit SHA when implementation lands; retain step titles.

### Phase 1: Controlled cases and quality assertions

#### Automated

- [x] 1.1 (historical scope) The original six-case corpus had nonempty reviewable diffs, frozen before/after witnesses, path agreement, and oracle separation; the reported offline suite covered it. The original three-case subset landed in f9eeef9; cases 04–18 were added in follow-up commit b5e2b24.
- [x] 1.1a Validate the twelve holdout fixtures, source witnesses, hunk counts, and oracle separation with the offline suite. — 27/27, 2026-11-01; b5e2b24.
- [x] 1.2 (historical scope) The prior six-case fixture witnesses were covered by the reported offline suite.
- [x] 1.2a Add and validate the twelve new before/after witnesses. — 27/27, 2026-11-01; b5e2b24.
- [x] 1.3 (historical scope) The prior assertion suite reported 22/22 offline checks.
- [x] 1.3a Review the new holdout anchors against the shared rubric and validate positive and negative examples offline; do not tune them to future holdout answers. — 27/27, 2026-11-01; b5e2b24.

#### Manual

- [x] 1.4 The author accepted all six reference outcomes and the limits of this development corpus. — 2026-11-01; b5e2b24.

### Phase 2: Production adapter, spending guard, and reports

#### Automated

- [x] 2.1 `npm run test:ai-review-evals` passes without credentials or network, including real trusted-reviewer request assembly, provider mappings, sanitized errors, and candidate-prompt digest coverage. — 2ba002e
- [x] 2.2 Budget tests prove zero fetch calls for missing/expired/mismatched authorization, unknown rates/token accounting, excess cost, excess requests, or attempts to override trusted models/cases; failures stop further paid work. — 2ba002e
- [x] 2.3 (historical scope) Fake-response comparisons produced 36 or 54 cells under the former six-case runner. — 2ba002e
- [x] 2.3a Verify the updated 72/108 holdout comparison and 54-cell full-corpus gate offline. — 27/27, 2026-11-01.
- [x] 2.4 Report tests verify confusion matrices, denominators, pass/fail distinction, timing units, uncached price arithmetic, missing-usage handling, partial runs, and safe JSON/HTML exports. — 2ba002e
- [x] 2.5 `npm run test:ai-review`, `npm run lint`, and `npm run build` pass with production reviewer behavior unchanged. — 2ba002e
- [x] 2.6 Add per-model confusion matrices, distinct-fixture outcomes, and clear repetition denominators; test verdict errors separately from human-scored unsupported allegations. — `verification.md`; native eval suite 31/31; 7c8aae6.
- [x] 2.7 Bind local comparison approvals to one invocation and durably consume them; prove local replay is rejected before any provider request after a process restart. Hosted comparison remains fail-closed until cross-run claiming exists. — separate-process replay test confirms the second process is rejected before any provider request; 7c8aae6.
- [x] 2.8 Use Promptfoo as the actual matrix engine behind the trusted runner and add a no-network replay of saved results; retain deterministic assertions and the approval/budget/report boundary. — Promptfoo replay plus fake compare/gate tests, eval suite 31/31; 7c8aae6.
- [x] 2.9 Record total evaluation-run elapsed time separately from production-envelope reviewer duration and test the timing contract. — timing report tests, eval suite 31/31; 7c8aae6.
- [x] 2.10 Migrate the production reviewer transport to Vercel AI SDK 7 while preserving the Responses contract and request deadline; do not make a live request. — cloned error-response metadata is bounded by the deadline and covered by an offline stalled-body test; 7c8aae6.

#### Manual

- [x] 2.11 After separate budget approval, demonstrate one SDK-backed review of a synthetic diff and retain its sanitized output and usage. This is a course communication proof; it is not authorized by the saved 72-call comparison. — 7c8aae6
- [x] 2.12 Capture the existing successful PR #39 pipeline/job view, logs, and LLM review comment as 10xChampion evidence; do not start a new model run. — 7c8aae6

### Phase 3: Trusted GitHub Actions and bootstrap

#### Automated

- [x] 3.1 Workflow contract tests prove trusted-base execution, fixed-path blob extraction, rejection of symlink/deleted/oversized prompts, isolated secret/token permissions, locked installs, and no head-code execution. — 4f68f47
- [x] 3.2 (historical scope) Check lifecycle tests covered the previous six-case result contract; the prior bootstrap commit records the original nine-result version.
- [x] 3.2a Validate the updated 54-cell gate matrix and full 18-case report manifest offline. — 27/27, 2026-11-01; 22cd6fb.
- [x] 3.3 Offline integration tests show a candidate prompt changes request text/digest, candidate runner/assertion/corpus/policy edits do not execute in privileged inference, and reports persist on failed evals without changing the production check. — 4f68f47
- [x] 3.4 Candidate offline eval tests and existing reviewer tests pass through CI; `npm run lint` and `npm run build` pass. — 4f68f47

#### Manual

- [x] 3.5 Only if a hosted GitHub evaluation is later requested: create and approve a new exact manifest for that hosted run while keeping checked-in approval disabled. The author confirmed the trusted bootstrap is on `master` on 2026-11-01. The consumed local manifest cannot be reused. This is not required to adopt a model and does not require branch-protection changes. — Not applicable to this pilot; no hosted evaluation was requested, and no dispatch or branch-protection change was made.

### Phase 4: Pilot interpretation and holdout run

#### Automated

- [x] 4.1 The historical six-case report records 36/36 completed cells, 34/36 assertion passes, zero operational errors/not-run cells, known usage, cost, latency, and manifest identity.
- [x] 4.2 Request and reserve arithmetic is documented for the 6-case historical run, 12-case holdout-only comparison, and 18-case full corpus.
- [x] 4.4b Run the offline suite against the refreshed case-09/10 anchors and source-pair tests; verify positive and negative examples before freezing the runner digest. — 27/27, 2026-11-01.
- [x] 4.7 Record the completed 72-request holdout report, per-model results, observed estimated cost/latency, and manifest identities. — 2026-11-01.
- [x] 4.8 Derive and record per-model confusion metrics and distinct-case outcomes from the saved 72-response matrix, labeling repetitions as repeated trials. — `verification.md`; derived from the saved report without provider calls.

#### Manual

- [x] 4.3 The author confirms the 36 historical responses were reviewed iteratively; they did not establish a clear model winner and remain development evidence, not an independent benchmark.
- [x] 4.4 The author approved preparing twelve new cases from historical changes and approved the two tested models.
- [x] 4.4a The author accepted all twelve oracle outcomes and the shared rubric before any model calls. — 2026-11-01.
- [x] 4.5a The author approved the models, 72-request count, maximum 24-hour approval window, GitHub credential date (2026-11-07), and $4.50 one-run cap; the temporary run approval used a 12-hour window.
- [x] 4.5b The author accepted the final runner/corpus/prompt/schema/pricing digests and exact manifest; one authorized run completed. — 2026-11-01.
- [x] 4.6 Defer recurring-gate planning until a concrete future need arises. It is not required to choose a model from the holdout comparison; no recurring spend or branch-protection change is approved.
- [x] 4.9 Human-audit all 72 saved summaries for unsupported allegations and record those outcomes separately; make no additional provider calls. — 2026-11-01; all 72 reviewed case by case with the author, no unsupported allegations recorded, no additional provider calls.
