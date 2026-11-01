---
date: 2026-11-01T09:07:54+01:00
researcher: Codex
git_commit: ccfb348e56ad7c5ec577234b5aeb692180b830a3
branch: master
repository: PrintPlan
topic: "Static reviewer evaluations with promptfoo"
tags: [research, codebase, ai-reviewer, promptfoo, github-actions]
status: partial
last_updated: 2026-11-01
last_updated_by: Codex
last_updated_note: Research saved; live model variable lookup denied by GitHub permissions
---

# Research: Static reviewer evaluations with promptfoo

## Research Question

Identify the current reviewer provider/model without reading or displaying API key values. Investigate adding promptfoo to compare available models while retaining the existing prompt, criteria, and response schema. Establish how to reuse the repository secret and measure quality, time, and cost. Research only, with current documentation verified through Context7.

## Summary

The provider is **OpenAI**, called directly through the Responses API. The workflow passes repository secret `OPENAI_API_KEY` and repository variable `AI_REVIEW_MODEL`; the code requires an explicit model and has no default. See [provider](../../../packages/ai-reviewer/src/providers/openai.mjs:39), [configuration](../../../packages/ai-reviewer/src/config.mjs:10), and [workflow](../../../.github/workflows/review.yml:90).

The last recorded recovery acceptance used **`gpt-5.4-mini`**. However, reading the current nonsecret variable using `gh variable get AI_REVIEW_MODEL` returned HTTP 403, `Resource not accessible by personal access token`. Therefore this research cannot certify its current remote value. The historical model identification is supported by [verification](../../archive/2026-10-29-ci-code-review/verification.md:319), not a successful settings lookup today. This specific gap makes the research partial; the integration findings below are established independently.

Recommended initial comparison: `gpt-5.4-mini` versus `gpt-5.4`, subject to account access. Both official model cards list Responses and structured outputs. Public documentation does not establish that this repository's key can access either candidate today. A promptfoo custom JavaScript provider wrapping the existing `reviewChange()` preserves production behavior more directly than recreating its request in configuration. Run it through a separate manual Actions workflow with the existing secret, without using PR publication helpers or changing the required review gate. See [core entrypoint](../../../packages/ai-reviewer/src/core/review.mjs:60), [custom provider docs](https://www.promptfoo.dev/docs/providers/custom-api/), [Mini model](https://developers.openai.com/api/docs/models/gpt-5.4-mini), and [GPT-5.4 model](https://developers.openai.com/api/docs/models/gpt-5.4).

No key values, environment credential files, or raw workflow logs were inspected. No provider requests, paid evals, application builds, workflow changes, or remote writes were performed. Changes made by this research are its documentation artifacts.

## Detailed Findings

### Existing reviewer and workflow

The PR workflow targets `master` for opened, synchronize, reopened, and labeled events. YAML filters same-repository, nonbot activity and configured owner; preparation adds runtime eligibility checks. Preparation and publication execute the captured PR base SHA with persisted checkout credentials disabled. The head is fetched as Git objects for diff collection, rather than executed. Inference consumes the trusted package artifact. See [workflow](../../../.github/workflows/review.yml:1), [runtime eligibility](../../../packages/ai-reviewer/src/github/prepare.mjs:4), and [diff collection](../../../packages/ai-reviewer/src/input/diff.mjs:3).

For the inspected workflow, preparation/publication have GitHub write permissions, while inference has `permissions: {}` and receives the OpenAI secret at its action step. Input and output artifacts use run/attempt identities and seven-day retention. Publication is bound to PR/workflow provenance, so the manual eval should not call its preparation/publication CLI or reuse its comment, labels, or required-check identity. See [inference/artifacts](../../../.github/workflows/review.yml:75), [publication](../../../.github/workflows/review.yml:106), and [provenance](../../../packages/ai-reviewer/src/github/prepare.mjs:73).

Normal CI installs the reviewer and runs its native tests independently. Those package scripts preload an offline guard that blocks fetch and deletes credential environment variables. They test protocol contracts with fixtures, rather than model quality. Keep paid evaluations as a separate explicit command and workflow. See [CI](../../../.github/workflows/ci.yml:18), [package scripts](../../../packages/ai-reviewer/package.json:10), [offline guard](../../../packages/ai-reviewer/test/offline.mjs:1), and [synthetic review fixture](../../../packages/ai-reviewer/test/fixtures/review.mjs:1). No promptfoo dependency or invocation appears in the inspected root/package manifests or the two inspected workflows.

### Reuse the exact prompt and response contract

`loadPrompt()` loads `system.md` and `criteria.md` and hashes their ordered contents. The provider uses the concatenation `system + "\n\n" + criteria` as the system message. `assembleInput()` serializes title, body, diff, paths, and unreviewedPaths as user data. Reuse these exports rather than copying instructions into a second maintained prompt. See [loader](../../../packages/ai-reviewer/src/prompts/load.mjs:5), [assembly](../../../packages/ai-reviewer/src/core/review.mjs:7), and [request](../../../packages/ai-reviewer/src/providers/openai.mjs:43).

The existing schema requires exactly eight fields: six numeric dimensions bounded from 1 through 10, verdict `pass|fail`, and nonblank Markdown summary bounded at 12,000 characters. Runtime schema validation does not establish the truth of findings. Reuse exported `reviewSchema`, `validateReview()`, and `parseReview()`; retain the distinction between valid reviewer verdict `fail` and an operational error without a code verdict. See [schema](../../../packages/ai-reviewer/src/contracts/review.schema.json:3), [validator](../../../packages/ai-reviewer/src/contracts/validate.mjs:6), and [error envelope](../../../packages/ai-reviewer/src/core/review.mjs:81).

For the inspected production request, retain `store:false`, empty tools, strict JSON Schema output, the 8,000-token output limit, and production failure handling. Current assembly limits are 1 MiB and 200 changed paths; the request deadline is ten minutes. These are local limits, not proof that a given input fits a model's token context. No retry loop appears in the inspected provider request path. See [limits](../../../packages/ai-reviewer/src/config.mjs:1), [tools](../../../packages/ai-reviewer/src/tools/policy.mjs:1), and [provider](../../../packages/ai-reviewer/src/providers/openai.mjs:33).

### Promptfoo integration options

**Preferred: custom ESM provider.** A future eval package can define a provider class exposing `id()` and `callApi(prompt, context, options)`. Each configured instance supplies an explicit model. The wrapper takes the checked-in case input, calls `reviewChange()` with a valid deterministic evaluation context, and returns serialized `envelope.review` on completion. That context is an eval fixture satisfying `validateContext()`, not a claim that an actual PR/run was reviewed. Provider IDs/labels must distinguish models in results. Return `envelope.error` as a safe provider error for an operational failure, and preserve available usage even on failure. Record model, case ID, prompt digest, schema/corpus hashes, commit, request ID, timings, and pricing identity as allowlisted metadata. Do not expose the request headers, API key, or process environment. These are proposed adapter responsibilities, not existing files. [Promptfoo provider interface](https://www.promptfoo.dev/docs/providers/custom-api/) documents `output`, `error`, `tokenUsage`, `cost`, and `metadata`; [production entrypoint](../../../packages/ai-reviewer/src/core/review.mjs:60) provides the underlying behavior.

Map `inputTokens` to `tokenUsage.prompt`, `outputTokens` to `tokenUsage.completion`, and `totalTokens` to `tokenUsage.total`. Preserve missing usage as unknown. The custom provider must calculate/return `cost` if promptfoo cost assertions are to work; an arbitrary custom provider does not gain accurate pricing automatically. See [custom provider response](https://www.promptfoo.dev/docs/providers/custom-api/) and [cost assertion](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/#cost).

**Alternative: built-in provider.** Explicit IDs such as `openai:responses:gpt-5.4-mini` select Responses. Promptfoo supports external `response_format` files and schema output, but equivalence would require matching production prompt assembly, request options, response/error validation, limits, and telemetry. Do not switch silently to a shorthand/default endpoint or default model. See [OpenAI provider docs](https://www.promptfoo.dev/docs/providers/openai/). The custom wrapper avoids maintaining a second implementation of those policies.

Suggested future placement: an isolated `packages/ai-reviewer/evals/` directory/package for config, provider, assertions, and curated fixtures. Pin the selected promptfoo release in a lockfile and verify its Node engine against the repository's [.nvmrc](../../../.nvmrc:1) before implementation. No installation was performed during research.

### Candidate models and cost assumptions

The recommended initial set contains two documented candidates:

- `gpt-5.4-mini`: baseline from the latest saved acceptance. Its official card lists USD 0.75 input, USD 0.075 cached input, and USD 4.50 output per million tokens. Responses and structured outputs are supported. [Model card](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
- `gpt-5.4`: higher-price comparator to test whether additional review quality justifies cost. Its official card lists USD 2.50 input, USD 0.25 cached input, and USD 15 output per million tokens. Responses and structured outputs are supported. [Model card](https://developers.openai.com/api/docs/models/gpt-5.4).

These are Standard text-rate assumptions checked during this research, not Fast, Batch, regional, or long-context quotes. The pricing documentation distinguishes service modes; the different Fast prices returned by Context7 do not contradict the Standard card rates. Save the chosen mode and price date with an eval report. [Pricing](https://developers.openai.com/api/docs/pricing).

`gpt-5.4-nano` was considered as a cheaper third candidate, but its current card marks it deprecated. `gpt-5-mini` is also marked deprecated. Their status does not prove immediate unavailability, but they are not recommended as new baseline choices here. Start with the documented pair instead of treating the requirement to compare two or three models as a requirement to include a deprecated third. [Nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano), [GPT-5 Mini](https://developers.openai.com/api/docs/models/gpt-5-mini).

For reproducibility, consider pinned snapshots `gpt-5.4-mini-2026-03-17` and `gpt-5.4-2026-03-05`, listed on the cards. First record the actual production variable: changing an alias to a snapshot should be explicit in the comparison. Snapshot pinning does not guarantee deterministic outputs. Account access, current credit, and model permissions remain unverified without a live request.

### Dataset and quality measurement

Proposed pilot: 24 human-labeled cases, balanced between 12 introduced-defect cases and 12 expected-pass cases. This is a sampling proposal, not existing coverage or a statistically sufficient accuracy claim. Seed the corpus from the recorded arithmetic defect and correction, then curate the exact title/body/diff/path inputs and expected findings; historical model verdicts are not ground truth. [Historical examples](../../archive/2026-10-29-ci-code-review/reviews/reviewer-prompt-validation.md:31).

Include introduced correctness/security/data-integrity defects, visible safeguards, unchanged pre-existing defects, missing context, missing tests alone, harmless style/documentation changes, binary disclosure, exact renames, and instruction injection in title/body/diff. Expected-pass cases should include real changes that are safe, not just empty diffs, which production rejects. Keep a held-out subset for the final comparison. Ensure defect and corrected pairs share enough context to assess causality. Existing [policy](../../../packages/ai-reviewer/prompts/code-review/system.md:14) and [checklist](../../../packages/ai-reviewer/prompts/code-review/criteria.md:33) define the rubric.

Measure separately:

- Contract validity, operational success/error rate, and expected-verdict agreement. Use shared validation and deterministic JavaScript assertions. Valid JSON alone is not quality. Promptfoo supports custom assertions; see [assertions](https://www.promptfoo.dev/docs/configuration/expected-outputs/).
- Defect recall `TP/(TP+FN)`, blocking precision `TP/(TP+FP)`, false-rejection rate `FP/(FP+TN)`, and false-acceptance rate `FN/(TP+FN)`, where a positive means an expected blocking defect. Report denominators, errors, and per-category results; undefined denominators remain undefined. Compute the confusion matrix for valid completed reviews and also report end-to-end success including operational errors, rather than silently dropping those cases.
- Finding-level correctness and completeness: actual changed location, hard evidence, triggering scenario, expected/incorrect behavior, confirming steps, and PR attribution. Human review should assess whether the claimed defect is real and whether visible safeguards refute it. A keyword check cannot prove this rubric.
- Prompt-injection resistance, honest disclosure that no tests ran, separation of missing context from defects, and separation of scores from verdict. The six returned scores describe the reviewed code; a high average is not the reviewer's accuracy score. [Verdict rules](../../../packages/ai-reviewer/prompts/code-review/system.md:14), [criteria](../../../packages/ai-reviewer/prompts/code-review/criteria.md:25).

Start with deterministic checks and blinded human assessment of findings. An optional model judge should use an explicit fixed judge model/rubric, be calibrated against human labels, and have separately recorded usage/cost; avoid promptfoo's implicit grader defaults. Changing the reviewed response schema to add findings is unnecessary for this research proposal: finding annotations can live beside expected-case metadata, while the model continues returning the current schema.

### Time, cost, and repeatability

The production envelope records start/end timestamps after prompt loading and around assembly, inference, validation, and error handling. Their difference excludes prompt file loading, Actions queue/install, and publication. Report it as reviewer duration; report promptfoo provider-call latency separately and total workflow elapsed time separately. Aggregate median/p95 and per-case timings with sample counts; a small pilot's p95 is descriptive. See [timing boundaries](../../../packages/ai-reviewer/src/core/review.mjs:62).

Disable promptfoo's response cache for fresh quality repetitions, latency, and spend measurement. Its latency assertion requires cache-disabled evaluation. This does not disable OpenAI server-side prompt caching. Keep concurrency, retry policy, case order strategy, output cap, and model settings fixed and recorded. Preserve production defaults initially; benchmark explicit reasoning changes as a different experiment. [Caching](https://github.com/promptfoo/promptfoo/blob/main/site/docs/configuration/caching.md), [latency and cost](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/).

Production usage currently retains aggregate input/output/total tokens, without cached-input breakdown or USD. For a first wrapper, calculate an **uncached estimate** `(inputTokens * inputRate + outputTokens * outputRate) / 1_000_000`. Do not add total tokens to those components, and do not infer billable output from the visible summary length. Missing usage is unknown, not zero. See [usage extraction](../../../packages/ai-reviewer/src/providers/openai.mjs:65) and [allowed envelope usage](../../../packages/ai-reviewer/src/contracts/validate.mjs:92).

An accurate cache-aware estimate requires capturing documented token detail fields through an allowlisted eval-only fetch observer, or a separately planned telemetry change. Avoid casually adding fields to the production envelope: its validator restricts usage keys. Reconcile estimates against provider usage/billing when available; report unknown costs for failures without usage. Promptfoo's `cost` assertion tests cost returned by the provider after inference; it is not a pre-spend hard budget stop. [Cost metric](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/#cost).

Illustrative **uncached Standard-rate estimate**, not measured spend: assuming 15,000 input and 500 output tokens per request, Mini costs USD 0.0135 and GPT-5.4 costs USD 0.045. For the proposed 24-case corpus, two models, one prompt, and three fresh repetitions, this means 144 inference requests and USD 4.212 total, excluding judge calls, retries, errors, and Actions charges. Inputs, output lengths, rates, and service mode are assumptions; the production output cap allows a materially larger bill. Rates come from the model cards above. Budget planning must use maximum output allowance plus preflight input-token estimates, not this typical-length example.

Before a paid run, fix a case/model/repetition allowlist and request count, validate input sizes, estimate token budgets, set timeout/concurrency, and reserve for in-flight requests and unknown-cost failures. Cumulative post-call cost checks alone cannot guarantee a hard monetary ceiling. Report actual usage, estimates, and unresolved billing separately.

### Running with the existing repository secret

A new manual `workflow_dispatch` workflow can reuse `env: OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}` on the eval step, exactly as the current reviewer does. It does not require copying or retrieving the stored key. GitHub documents passing secrets through the `secrets` context to step environment variables; fork and Dependabot events have restrictions. [GitHub secret documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [existing wiring](../../../.github/workflows/review.yml:96).

Proposed workflow: accept manual dispatch on trusted `master`, guard the selected ref, check out its captured trusted SHA with persisted credentials disabled, install locked eval/reviewer dependencies before exposing the secret, and run curated local config/providers/assertions. Give checkout `contents: read`; avoid PR/check write permissions. Do not allow dispatch inputs to select arbitrary executable provider paths or untrusted branches. Upload explicit sanitized JSON/HTML reports with `if: always()` and bounded retention. Keep reporting separate from production review publication. This preserves the inspected trusted-code design rather than executing PR code with the secret.

Illustrative future invocation after the eval config/provider exists and promptfoo is installed in the eval package:

```sh
npx --no-install promptfoo eval -c promptfooconfig.yaml --no-cache --repeat 3 --max-concurrency 1 --no-share -o results.json results.html
```

The command is a documented CLI shape, not something runnable in the current repository: those eval files/dependencies have not been added. JSON and HTML exports enable per-case inspection and comparison. Preserve a nonzero eval exit status while still uploading reports. Keep keys in the environment rather than CLI arguments; reports should retain case content and safe metrics but exclude credentials. Use `--no-share` for local/Actions reports without a share URL. [CLI/export options](https://www.promptfoo.dev/docs/usage/command-line/).

A repository secret does not become a local shell credential. Local evals would require separately supplied local credentials; the Actions route can use the existing secret without exporting it. No Promptfoo Cloud account/key is required for the proposed local CLI/report workflow.

## Documentation Verification

Used the `find-docs` workflow through Context7. Selected official/high-reputation matches and inspected these command results; no credentials or repository code were submitted in queries:

- `npx ctx7@latest library promptfoo "Evaluate multiple OpenRouter models with shared chat prompt and JSON response schema"` resolved `/promptfoo/promptfoo`. The exploratory OpenRouter wording preceded local provider confirmation; findings use OpenAI, not OpenRouter.
- `npx ctx7@latest docs /promptfoo/promptfoo "OpenAI Responses API provider openai:responses model configuration json_schema response_format apiKey environment variable custom JavaScript prompt function"` verified structured outputs and external response-format support.
- `npx ctx7@latest docs /promptfoo/promptfoo "Custom JavaScript provider callApi ProviderResponse tokenUsage cost cached latency assertions is-json javascript latency cost eval --no-cache --repeat --output GitHub Actions OPENAI_API_KEY"` verified the custom provider response and fresh-run caching/latency constraints. Broader CLI details were checked on the linked official CLI page rather than issuing additional Context7 calls.
- `npx ctx7@latest library OpenAI "Models supporting Responses API structured outputs JSON schema for code review cost pricing"` resolved `/websites/developers_openai_api`.
- `npx ctx7@latest docs /websites/developers_openai_api "gpt-5.4-mini gpt-5.4-nano gpt-5.4 Responses structured outputs model pricing input cached output tokens"` returned pricing and caching documentation. Official model pages were additionally opened to verify support, pricing conditions, snapshots, and deprecation status.
- `npx ctx7@latest library "GitHub Actions" "workflow_dispatch use repository secrets env secrets not retrievable fork workflows"` resolved `/websites/github_en_actions`.
- `npx ctx7@latest docs /websites/github_en_actions "Using existing repository secrets in workflow_dispatch step env secrets context cannot retrieve stored secret value fork limitations"` verified step-level secret wiring. The linked GitHub page supplied event restrictions.

Context7 calls succeeded without quota errors. Documentation verification does not prove account-level access or measured performance.

## Architecture Insights and Code References

The production reviewer separates trusted package/input preparation, inference, and privileged publication. Evals should reuse the inference contract while remaining outside publication and the PR gate. Key anchors: [workflow](../../../.github/workflows/review.yml:33), [core](../../../packages/ai-reviewer/src/core/review.mjs:60), [prompt loader](../../../packages/ai-reviewer/src/prompts/load.mjs:5), [schema/validation](../../../packages/ai-reviewer/src/contracts/validate.mjs:6), [provider](../../../packages/ai-reviewer/src/providers/openai.mjs:39), and [offline tests](../../../packages/ai-reviewer/test/offline.mjs:1).

## Historical Context and Related Research

The accepted [prompt policy](../../archive/2026-10-29-ci-code-review/reviews/reviewer-prompt-validation.md:3) explicitly supersedes the earlier rule permitting missing tests alone to block. Current prompt files retain that accepted evidence requirement. The historical acceptance reports support arithmetic defect/correction seed cases, but do not establish general accuracy or current remote settings. The historical restored-model claim remains supported as a statement about that recorded run, despite today's variable lookup being denied.

The [input-size research](../ai-review-input-size/research.md) records exact rename handling and the accepted larger input bound. Current [collector](../../../packages/ai-reviewer/src/input/diff.mjs:49) and [config](../../../packages/ai-reviewer/src/config.mjs:1) corroborate those implementation claims. This matters when selecting representative larger/rename eval cases. Archived material was inspected read-only.

## Open Questions and Handoff

- Confirm the live nonsecret `AI_REVIEW_MODEL` setting with an identity permitted to read Actions variables, or inspect the model field of a fresh trusted reviewer envelope. The failed lookup here does not establish a blank or missing variable. No key read is needed.
- During a separately authorized live phase, establish access to the explicit candidate model IDs, current billing availability, and account limits. Treat unavailable candidates as unavailable rather than silently substituting models.
- Curate case labels and expected findings under the current rubric, choose a held-out subset, and agree acceptable false-rejection/false-acceptance and operational-error rates. Proposed corpus size, repetitions, and candidate set are recommendations, not approved implementation scope.
- Pin and validate a promptfoo release; decide whether uncached estimates suffice initially or cache-aware eval telemetry is required. Select the actual budget and latency thresholds before paid execution.

Research verification consisted of source inspection, documentation retrieval, and the unsuccessful nonsecret variable lookup. Application tests/builds and paid calls were not needed to answer the integration questions. No plan or implementation was created.
