# CI Code Review Implementation Plan

## Overview

Run the six-criterion PR reviewer through GitHub-hosted Actions runners and the OpenAI Responses API. Package all reviewer code, prompts, schemas, tests, and the reusable composite action in `packages/ai-reviewer/`. The target is a public repository on GitHub Free after removing 10x course materials from every published branch/tag history. API usage is billed separately from ChatGPT Business.

This plan authorizes no implementation, paid inference, history rewriting, pushes, repository visibility changes, or account configuration during review. The original local Linux runner and Business-login design has been superseded by the decisions below.

## Plan-review decisions

| Finding | Accepted decision                                                                                                                                                     | State                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| F1      | Public repository on GitHub Free; preserve project history after removing course materials from all refs intended for publication. Retain ignored local course files. | Fixed in plan; operator acceptance pending |
| F2      | Direct OpenAI API, GitHub-hosted runners, text input, strict JSON output, no model tools. Remove Codex CLI, persistent login, and local service setup.                | Fixed in plan                              |
| F3      | Open a pending check before fallible preparation. Completion also handles preparation failures, including retries of the same SHA.                                    | Fixed in plan                              |
| F4      | Require PR branches to be up to date before merging. Owner branch updates by rebase/merge and push trigger CI/review automatically.                                   | Fixed in plan                              |
| F5      | Use the author's selected modular `packages/ai-reviewer/` package and extend the existing Node ESLint override to its `.mjs` files.                                   | Fixed in plan                              |

The author reports USD 21 available for testing. Confirm these are usable API funds and check expiration/model access before spending them. The model remains an explicit deployment input, not an automatic selection based on this budget.

## Current State Analysis

- Existing `ci` and `smoke` jobs are GitHub-hosted: `.github/workflows/ci.yml:10`, `:34`. `package.json:27` defines `verify:deploy`; application, database, browser, and smoke coverage remains independent of model review.
- `.nvmrc` pins Node 24.21.0. Existing scripts are ESM `.mjs`; native Node test fixtures and injected process/API boundaries are established project patterns.
- The root package has no npm workspaces. Introduce a standalone nested package with its own lockfile; do not convert the application to a workspace or install its dependencies during inference.
- `eslint.config.js:74` gives Node scripts a non-typechecked override for `scripts/**/*.mjs` and `.codex/hooks/**/*.mjs`. New package modules need the same override to avoid the application TypeScript project-service error.
- The six criteria and binding `verdict` come from the locally available `.agents/prompts/m5l3-requirements.md`; the eight JSON field names are defined by `.agents/config-templates/m5l2-review-schema.ts.template`. These are authoring references, not runtime dependencies or materials to publish. Preserve the contract using independently authored English prompts and code; do not copy the course tooling into the public package.
- Course workflow/action templates are examples, not installed automation. No executable reviewer has been demonstrated in this checkout. `research.md` records the earlier private/local/Business investigation; this plan supersedes those deployment choices.
- Course files are currently tracked under `.agents/`, including skills, prompts, templates, and installer metadata. `.agents/.10x-cli-manifest.json` helps inventory them; do not assume every course skill has a `10x-` prefix or remove unrelated local tools indiscriminately.
- Existing uncommitted `AGENTS.md` and `README.md` edits predate this change. Preserve them; any necessary publication cleanup must be separately identified and reviewed.

## Desired End State

Eligible owner-authored, same-repository PRs targeting `master`, including drafts, receive review on `opened`, `synchronize`, `reopened`, or addition of `ai-cr:review` by the configured owner. Other actors/authors, bots, forks, and unrelated labels do not schedule inference or mutate the review gate.

One bot-owned comment shows the reviewed head/base, run link, six scores and verdict or an operational error. Valid code reviews set exactly one of `ai-cr:passed` and `ai-cr:failed`; operational failures clear both where GitHub is reachable. Only `verdict` gates the code review; no average-score threshold is introduced.

Each eligible request opens a new `AI Code Review` execution on the exact head SHA before input preparation. Only validated `pass` plus successful publication finishes green. Code rejection or handled operational failure finishes red; outages and hard cancellation may prevent updates and must never fabricate a new success. Live acceptance must verify that a pending same-SHA retry prevents an earlier pass from satisfying the current requirement.

The public repository requires this exact check from GitHub Actions, enforces an up-to-date PR branch, and applies protection to the author/admin. Updating and pushing the owner's branch triggers replacement CI/review without a retry label. Required-check configuration happens only after bootstrap and live acceptance succeed.

## What We're NOT Doing

- A local/self-hosted runner, Linux service, VM, Codex CLI, Business authentication, auth cache, or subscription-token fallback.
- Additional providers, automatic model replacement, native hosted Codex GitHub review, a provider framework, runtime plugin discovery, or a tool-execution agent loop.
- Source fixes, commits or pushes from review runs, automatic PR approval, systematic plan-by-plan implementation review, or executing tests through the model.
- Other authors/bots/forks, `workflow_dispatch`, comment commands, bypass labels, base-push fan-out, a watchdog, or automatic paid inference retries.
- Publishing an npm package, a root workspace migration, or a cross-run billing/budget service.

## Implementation Approach

### Package layout and dependencies

```text
.github/workflows/review.yml
packages/ai-reviewer/
  package.json
  package-lock.json
  README.md
  action.yml
  prompts/code-review/
    system.md
    criteria.md
  src/
    cli/prepare.mjs
    cli/review.mjs
    cli/publish.mjs
    config.mjs
    core/review.mjs
    input/diff.mjs
    contracts/review.schema.json
    contracts/validate.mjs
    prompts/load.mjs
    providers/openai.mjs
    tools/policy.mjs
    github/client.mjs
    github/prepare.mjs
    github/publish.mjs
    reporting/comment.mjs
  test/
    contracts.test.mjs
    package.test.mjs
    adapter.test.mjs
    config.test.mjs
    workflow.test.mjs
    github.test.mjs
    fixtures/
```

Use ESM `.mjs`, `type: module`, `private: true`, the root `.nvmrc` runtime, and a package-local lockfile with pinned direct dependencies. Native `fetch` handles OpenAI/GitHub HTTP; a single pinned JSON Schema validator handles result validation. No TypeScript transpilation, generated `dist`, application imports, or app dependency installation is needed for the reviewer. Use explicit relative module imports and resolve bundled prompts/schema relative to module URLs, not process working directories.

The package is modular by responsibility, with direct function calls and injected HTTP clients for tests. `core/` coordinates text review; it does not import GitHub or Actions environment state. `providers/openai.mjs` is one concrete transport. `github/` owns event/check/comment/label operations; `reporting/` renders presentation. Thin `cli/` entry points read only their required configuration and write envelopes or Actions outputs.

`prompts/` contains editable Markdown, loaded through a fixed `code-review` prompt identifier. Record a digest/revision in operational metadata and reject unknown identifiers or path traversal. Prompt changes must preserve the eight-field response contract. `tools/policy.mjs` centralizes the empty tools policy and rejection of unexpected tool outputs. It provides a clear future extension point, but this change exposes no tool and executes no model-returned command. Add real tools later only with explicit permissions, budgets, and tests; do not build a registry or plugin framework now.

`action.yml` is a reusable composite wrapper around `src/cli/review.mjs`; it accepts trusted context/input paths and a model identifier, and receives `OPENAI_API_KEY` only through the inference step environment. It reports the envelope path and nullable validated verdict/review path. Workflow YAML remains in `.github/workflows/`; helpers do not live under `.github/scripts/`.

### Installation and quality gates

Install with `npm ci --ignore-scripts --prefix packages/ai-reviewer`. Add package scripts `test`, `test:contracts`, `test:adapter`, `test:workflow`, and `test:github` using explicit native test-file lists. Root `test:ai-review` delegates to `npm --prefix packages/ai-reviewer test`; ordinary hosted CI installs the nested package before invoking it. No root `workspaces` field or root application dependency on the reviewer is needed.

Extend the existing Node override in `eslint.config.js` with `packages/ai-reviewer/**/*.mjs`, adding only required Node globals. Reuse the repository's lint/format configuration. The package README documents independent install/test/CLI usage, prompt editing, tools policy, and public-repository operation. Root application `verify:deploy` remains a separate acceptance gate.

### Trusted orchestration and GitHub permissions

Use three GitHub-hosted jobs: `prepare`, `review`, and `publish`. Keep them because inference must not receive a GitHub write credential. `prepare` and `publish` request `contents: read`, `pull-requests: write`, and `checks: write`; `review` uses `permissions: {}`. No PAT, persistent `gh auth login`, `issues: write`, `contents: write`, `statuses: write`, or `actions: write` is required for the selected endpoints.

Load helper/package code and `.nvmrc` from the event's immutable trusted base with checkout credential persistence disabled. Fetch head objects as data, compute `merge-base(baseSha, headSha)`, and generate diff data with external drivers and text conversion disabled. Do not check out/execute the PR head, load PR configuration/hooks, or install a PR-controlled package in the review workflow. Existing application CI executes its own verification independently.

After eligibility, a minimal trusted step opens the pending custom check before package installation, diff generation, or artifact work. Persist head/check/run identity immediately; only then consume the retry label. Preparation creates a versioned artifact containing the trusted package with its installed dependencies and bounded review data. Inference downloads only that run/attempt's artifact and invokes its composite action from the prepared workspace. This keeps source provenance explicit even when the head changes package files.

Treat logs/artifacts as publicly accessible after publication. Export only bounded public PR data, trusted package assets, context metadata, safe error codes, and validated review/envelope data; never credentials, raw provider streams, or auth files. Use exact run/attempt names and seven-day retention. The package has no dependency on ignored local course files.

### Check lifecycle, concurrency, and failures

Only eligible requests share PR concurrency; unrelated label events cannot cancel review or create a successful replacement. Serialize all PR publication mutations, including pending-state initialization, and check live head/base/latest eligible run identity immediately before mutations. Older runs may finish their own check as cancelled but cannot overwrite newer results. Handle duplicate preparation/publication idempotently and identify executions by run ID/attempt, not file timestamps.

Completion runs after preparation failures as well as inference failures. It must recover the opened check identity without a final input artifact when necessary. An earlier `pass` followed by a same-SHA retry that fails during preparation finishes the new check red without calling OpenAI. If initial check creation fails, stop without consuming the retry label or starting paid inference. An unavailable GitHub API can prevent changing an earlier success; fail the workflow with a sanitized diagnostic and document this external limit. Hard cancellation may leave an opened check pending.

A valid `pass` publishes the passed label, removes the failed label, and updates the owned comment before completing the custom check with `success`. A valid `fail` publishes the inverse and finishes with `failure`; the publisher job also fails. Operational errors clear result labels, describe the operation error without a fabricated verdict, and finish `failure` or `timed_out` where possible. A failed comment/label/check write must not produce success. Retry transient publication calls at most three times; never automatically repeat inference.

If `master` moves during review, reject stale publication and explain that the PR branch must be updated. Strict protection blocks outdated branches even after an earlier pass. An eligible owner-performed rebase/merge and push triggers `synchronize` and replacement review automatically. Retain `ai-cr:review` for explicit same-head retries, not as an extra requirement after a branch update.

## Phase 1: Review contract and package boundaries

### Changes Required

Create `packages/ai-reviewer/package.json`, lockfile, README, `src/config.mjs`, `src/contracts/{review.schema.json,validate.mjs}`, `src/prompts/load.mjs`, `prompts/code-review/{system,criteria}.md`, and contract/package fixtures.

Exactly six finite numeric scores from 1 through 10 (including fractions), `verdict: pass|fail`, and a nonblank Markdown `summary` of at most 12,000 characters are required; reject extra fields. Preserve `implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `documentation`, and `securitySafety`. Blocking defects mean concrete correctness/security/data failures, material requirement contradictions, or missing tests essential to risky behavior. Minor observations may accompany `pass`. Prompts state that tests were not executed and PR content is untrusted data.

The version-1 operational envelope separately carries repository/PR, head/base/merge-base, run ID/attempt, model/request identity, prompt identity, timing/usage when available, status, nullable review, and safe error code/message. Status is `completed`, `error`, or `superseded`; only `completed` may contain a validated review. Reject context mismatches and contradictory states. Never manufacture a verdict for an operation error.

Contract fixtures cover boundaries, fractional/nonfinite/out-of-range scores, absent/extra fields, unknown verdict, blank/oversized summary, Markdown fences, truncated output, and inconsistent metadata. Package fixtures prove module-relative assets, prompt selection, and import independence from app/runtime and Actions state.

### Success Criteria

#### Automated Verification:

- Schema and prompt fixtures preserve all six course criteria and eight field names, reject malformed results, and demonstrate that code gating uses only `verdict`.
- Package contract tests pass with `npm --prefix packages/ai-reviewer run test:contracts` after `npm ci --ignore-scripts --prefix packages/ai-reviewer`.
- Package boundary fixtures load prompts and schemas independently of the working directory and reject unknown prompt IDs or path traversal.

## Phase 2: OpenAI API adapter and composite action

### Changes Required

Create `action.yml`, `src/cli/review.mjs`, `src/core/review.mjs`, `src/providers/openai.mjs`, `src/tools/policy.mjs`, and HTTP/config fixtures inside the package.

Require `OPENAI_API_KEY` and an explicit `AI_REVIEW_MODEL`; do not infer a model from user text or fall back to another provider/auth method. Use one direct Responses API request with text input, strict JSON Schema output, an empty tools list, and no tool execution loop. Accept only HTTP success, response status `completed`, no refusal/unexpected tool output, and a locally valid review bound to the expected context. A failed or incomplete response containing valid-looking `pass` data is still an error.

Bound assembled title/body/diff to 256 KiB and 200 changed paths; reject rather than silently truncate. Binary-only/unreviewable input fails; mixed diffs disclose unreviewed paths. Bound billable output with an explicit maximum of 8,000 output tokens and bound the extracted final object to 64 KiB. Use a 10-minute abortable HTTP deadline within a 20-minute inference job. Exhausted output/reasoning allowance is an incomplete-response error, never approval. Do not log prompts, raw errors/responses, credentials, or authorization headers.

Fake HTTP fixtures cover request payload/tools policy, credential separation, valid pass/fail, 401/403/429/5xx/network errors, refused/incomplete/empty responses, unexpected tool calls, malformed/oversized output, stale-file isolation, and aborted requests. Verify one request per accepted review, including on transport failures; do not let SDK defaults retry if an SDK is introduced. The action writes a safe error envelope where possible and exports it through always-run artifact handling.

### Success Criteria

#### Automated Verification:

- Injection fixtures demonstrate that PR text is passed as data and that no PR script, hook, executable configuration, or shell tool runs.
- HTTP adapter tests pass with `npm --prefix packages/ai-reviewer run test:adapter`, including abortable deadlines, refusals, incomplete responses, and malformed or oversized output.
- Configuration and adapter fixtures require an explicit model and key, make no real network calls, disable inference retries, and expose no model tools or credential values.

## Phase 3: Workflow, publication, and merge check

### Changes Required

Create `.github/workflows/review.yml` and package modules under `src/cli/`, `src/input/`, `src/github/`, and `src/reporting/`; test them with fake GitHub responses and parsed workflow fixtures.

Use `pull_request` to `master` with `opened`, `synchronize`, `reopened`, and `labeled`; only `ai-cr:review` qualifies as a label event. Require configured owner, same-repository head, owner PR author and event actor, with case-insensitive login comparison. Review drafts. Missing configuration fails explicitly. Do not introduce path filters or credential-bearing `pull_request_target` execution.

Implement the trusted pending-check-first preparation, hosted inference, and unconditional eligible completion contracts above. Native job names must differ from `AI Code Review`; skipped native jobs must not approve the custom gate. Test same-head retries failing before input artifacts exist and recovery of check identity after preparation errors.

Find the existing comment by `<!-- printplan-ai-code-review:v1 -->`, repository/PR scope, bot owner, and trusted check/run provenance. Paginate lookup, ignore human marker copies, and update the same owned comment. Display reviewed head/base, run URL, operation state, scores/verdict when available, and static-review limitations. Test create/update, duplicate invocation, pagination, spoofed markers, API failures, and pass/fail/operational transitions.

Freshness tests cover changed head/base, two quick commits, retries on one SHA, and overlapping pending/publication operations. The moved-base recovery is branch update and `synchronize`, without a required label. All new third-party Actions are pinned to reviewed full commit SHAs.

The retained Progress criterion 3.3 concerns handled failures where GitHub can be reached; API outages have the documented limitation above.

### Success Criteria

#### Automated Verification:

- API fixtures prove one owned comment, mutually exclusive course result labels, red outcomes for all operational failures, and no stale or duplicate publication over a newer review.
- Workflow and publication tests pass with `npm --prefix packages/ai-reviewer run test:workflow` and `npm --prefix packages/ai-reviewer run test:github`.
- Event fixtures prove owner-only scheduling, automatic synchronize runs and retry-label consumption, without API inference or gate mutation on unrelated labels or ineligible requests.
- Permission and provenance assertions prove trusted-base package execution on hosted runners, no PR-controlled code execution in the review workflow, and no GitHub write credential in inference.
- A prior pass followed by a same-SHA retry and preparation failure leaves the new check red when GitHub is reachable, even without an input artifact.
- Freshness fixtures reject outdated head/base/run results and prove that branch updates schedule replacement review without a retry label.

## Phase 4: Public repository preparation and API setup

### Changes Required

Write the setup/history/rollback runbook in `packages/ai-reviewer/README.md`. This phase is operator acceptance, not an unattended rewrite of the current checkout.

Inventory course-owned skills, supporting prompts/templates, manifest metadata, historical path names, copies, and every branch/tag intended for publication. Keep a private backup and local usable copies. In a separate working copy, remove the selected course materials from history and the current tracked tree while retaining project history; add narrow `.gitignore` rules preventing reintroduction. Do not remove unrelated tools. The reviewer must be installable without any ignored `.agents/` content. Check generated/public files for copied course implementation text, not just the original paths.

Verify rewritten refs and content before publication, preserve unrelated uncommitted work, and coordinate the rewritten commit IDs for any other clones. Address old remote branches/tags or PR refs that could expose original course blobs; where the hosting interface cannot remove them, treat their removal/hosting remediation as a publication blocker rather than claiming that a branch rewrite alone purged the repository. Present the concrete inventory and rewrite evidence before the author changes visibility. No history rewrite, force-push, or visibility change occurs during this review.

Create a project-scoped OpenAI API key, enable API billing/usable credits, and store it as GitHub secret `OPENAI_API_KEY`. Set `AI_REVIEW_OWNER` and `AI_REVIEW_MODEL`; pre-create `ai-cr:review`, `ai-cr:passed`, and `ai-cr:failed`. Verify Actions policy and repository write access. No Codex login, local runner, systemd, or personal GitHub token is needed. Verify provider/model access with the first small owner-PR acceptance request rather than a separate credential-inspection tool.

Document key rotation/revocation and insufficient/expired credits. Keep model choice explicit and review usage after the first calls. The USD 21 budget is reported, not inspected. Illustrative rates checked on 2026-10-29 for GPT-6.1 Sol Standard short context are USD 2/M input and USD 10/M output tokens: 20,000 input plus 4,000 total billable output tokens costs about USD 0.08. Actual model, reasoning/output usage, context tier, and pricing determine costs; this example does not select a model or guarantee 260 reviews.

### Success Criteria

#### Manual Verification:

- The author verifies a private backup and a sanitized rewrite preserving project history, removes 10x materials from all refs intended for publication, and retains ignored local copies.
- The author approves the verified publication inventory and makes the sanitized repository public on GitHub Free; no unsanitized branch or tag remains published.
- The author configures a project OpenAI API key as `OPENAI_API_KEY`, selects `AI_REVIEW_MODEL`, sets `AI_REVIEW_OWNER`, pre-creates the three labels, and verifies usable API funds and model access during the first acceptance review.

## Phase 5: Integrated verification and live acceptance

### Changes Required

Update root `package.json`, `.github/workflows/ci.yml`, and `eslint.config.js` to install/test the independent reviewer package and lint its Node modules. Root `test:ai-review` delegates to the package's offline test suite; retain existing app CI/smoke behavior. Offline tests must use fake HTTP and no live credentials.

Merge the trusted workflow/package to `master` before expecting it to review a test PR. Verify cleanup/publication and API configuration before enabling required checks. Record sanitized evidence in this change's `verification.md`: reviewed SHAs, run URLs, comment ID, check conclusions, model/prompt identity, usage, and approximate costs. Test failures with fake responses first; use controlled reversible fixtures/settings for live checks without exposing or destroying the real key.

Enable the exact `AI Code Review` requirement from GitHub Actions alongside the existing requirements, apply protection to the owner/admin, and require branches to be up to date. Verify head/merge-SHA check selection and same-SHA retry behavior in GitHub, not only fake API fixtures. Do not introduce a native job with the same check name. The first access/model check is the first acceptance review; it is not a separate background inference.

Rollback removes the AI-review requirement before disabling its workflow and revokes the dedicated API key as appropriate. Preserve existing app requirements, unrelated credentials, and the private pre-rewrite backup. Hard cancellation and API outages can leave pending checks or an unchanged old comment; verify fresh-request recovery without inventing success.

The surviving Progress titles are retained verbatim. In 5.7, "invalid response" includes refusal/incomplete HTTP responses and unexpected tool output. Superseded baseline criteria were retired, not marked complete; replacement acceptance uses new IDs.

### Success Criteria

#### Automated Verification:

- `npm run verify:deploy` passes with the project's existing build environment configured, and the existing integration workflow remains valid with its original `smoke` coverage.
- Touched Markdown/JSON/YAML files pass the repository formatter check, workflow fixtures validate routing/permissions, and only the agreed CI-review files appear in the implementation diff.
- `npm run test:ai-review` passes from clean root/package installs and runs the package offline suites without provider credentials, paid inference, or GitHub mutation.

#### Manual Verification:

- A new owner-authored PR to `master` receives one bot comment, scores and `pass`, the correct head-SHA check, and `ai-cr:passed`; a draft PR follows the same rule.
- A later commit updates the same comment ID; an evident blocking defect produces `fail`, `ai-cr:failed`, and a red check, and removing the defect allows a later green review.
- Adding `ai-cr:review` reruns the current SHA, consumes the label, and updates the same comment; adding an unrelated label after a rejection does not run Codex or turn the required check green.
- Controlled authentication failure, timeout, invalid response, and publication failure are visibly distinguishable from a code rejection, clear obsolete course result labels where the API is available, and never report success.
- After enabling branch protection, the author confirms that an ordinary merge is blocked by both a rejected review and an operational failure, and that an eligible valid pass can satisfy the review requirement.
- Two quick commits or same-SHA retries cannot publish an older result over the latest review; ineligible requests do not reach the hosted inference job.
- A moved master blocks merging an outdated PR, and an owner-performed rebase or merge followed by push automatically reruns CI and review without adding a retry label.
- Forced cancellation or unavailable hosted execution leaves no newly successful review; the author verifies recovery through a fresh eligible request and understands API-outage limitations.
- The first live reviews record model, prompt identity, token usage, and approximate cost, confirming that the selected limits fit the available API test budget.

## Testing Strategy

Use package-local Node native tests with injected HTTP, filesystem fixtures, temporary directories, and parsed workflow assertions. The combined path is trusted preparation → fake OpenAI response → shared validation → fake GitHub publication. Cover one maintained comment, labels/check transitions, malicious PR data, separate credentials, preparation failures, same-SHA retries, stale publication, strict base-update recovery, and cancellation. Test the real public/model trust boundaries; do not duplicate implementation details in assertions.

## Performance Considerations

One paid API request per accepted eligible event, no automatic inference retry. Cap assembled input at 256 KiB/200 changed paths, output at 8,000 billable output tokens/64 KiB final object/12,000 summary characters, HTTP at 10 minutes and inference job at 20 minutes. Retry only transient publication calls, at most three attempts. These bound a request, not the total number of user-triggered reviews. Check usage against the reported API budget after initial live calls.

## Migration Notes

There is no application/database migration or root workspace conversion. Provisioning a local runner and Business login has been removed. Preserve the existing app lockfile and keep reviewer dependencies separate. Publication requires verified cleanup of all intended refs, not just `.gitignore` or a current-tree deletion. Git history rewriting changes commit IDs; preserve a private original backup and assess retained historical SHA links without rewriting archived project records silently.

PR merge conflicts can suppress `pull_request` workflows until resolved. Only eligible owner branch updates automatically rerun review; bots/collaborators remain outside this change. Roadmap inspection found no matching Change ID; leave it unchanged.

Progress migration: surviving IDs/titles and checkbox state are preserved. Retired original IDs are 1.1, 2.1, 2.2, 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.8, 5.9; none was completed. New package/API/operator criteria use fresh IDs above each phase's prior maximum. Gaps are intentional.

## References

- [Original research, historical local/Business baseline](research.md); [existing CI](../../../.github/workflows/ci.yml), [package manifest](../../../package.json), [Node version](../../../.nvmrc), [ESLint](../../../eslint.config.js), [lessons](../../foundation/lessons.md).
- Local authoring evidence: `.agents/prompts/m5l3-requirements.md` and `.agents/config-templates/m5l2-review-schema.ts.template`; course content is excluded from publication/runtime.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [API pricing](https://developers.openai.com/api/docs/pricing).
- [GitHub PR events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request), [status checks](https://docs.github.com/en/pull-requests/reference/status-checks), [strict branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [local action paths](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsuses).
- [Checks API](https://docs.github.com/en/rest/checks/runs), [issue-comment permissions](https://docs.github.com/en/rest/issues/comments#update-an-issue-comment), [label permissions](https://docs.github.com/en/rest/issues/labels#add-labels-to-an-issue), [Node workflows](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs).
- [npm clean installation](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [package manifests](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Review contract and package boundaries

#### Automated

- [x] 1.2 Schema and prompt fixtures preserve all six course criteria and eight field names, reject malformed results, and demonstrate that code gating uses only `verdict`. — a6d8278
- [x] 1.3 Package contract tests pass with `npm --prefix packages/ai-reviewer run test:contracts` after `npm ci --ignore-scripts --prefix packages/ai-reviewer`. — a6d8278
- [x] 1.4 Package boundary fixtures load prompts and schemas independently of the working directory and reject unknown prompt IDs or path traversal. — a6d8278

### Phase 2: OpenAI API adapter and composite action

#### Automated

- [x] 2.3 Injection fixtures demonstrate that PR text is passed as data and that no PR script, hook, executable configuration, or shell tool runs. — 4d7b72a
- [x] 2.4 HTTP adapter tests pass with `npm --prefix packages/ai-reviewer run test:adapter`, including abortable deadlines, refusals, incomplete responses, and malformed or oversized output. — 4d7b72a
- [x] 2.5 Configuration and adapter fixtures require an explicit model and key, make no real network calls, disable inference retries, and expose no model tools or credential values. — 4d7b72a

### Phase 3: Workflow, publication, and merge check

#### Automated

- [x] 3.3 API fixtures prove one owned comment, mutually exclusive course result labels, red outcomes for all operational failures, and no stale or duplicate publication over a newer review. — 916638c
- [x] 3.5 Workflow and publication tests pass with `npm --prefix packages/ai-reviewer run test:workflow` and `npm --prefix packages/ai-reviewer run test:github`. — 916638c
- [x] 3.6 Event fixtures prove owner-only scheduling, automatic synchronize runs and retry-label consumption, without API inference or gate mutation on unrelated labels or ineligible requests. — 916638c
- [x] 3.7 Permission and provenance assertions prove trusted-base package execution on hosted runners, no PR-controlled code execution in the review workflow, and no GitHub write credential in inference. — 916638c
- [x] 3.8 A prior pass followed by a same-SHA retry and preparation failure leaves the new check red when GitHub is reachable, even without an input artifact. — 916638c
- [x] 3.9 Freshness fixtures reject outdated head/base/run results and prove that branch updates schedule replacement review without a retry label. — 916638c

### Phase 4: Public repository preparation and API setup

#### Manual

- [ ] 4.6 The author verifies a private backup and a sanitized rewrite preserving project history, removes 10x materials from all refs intended for publication, and retains ignored local copies.
- [ ] 4.7 The author approves the verified publication inventory and makes the sanitized repository public on GitHub Free; no unsanitized branch or tag remains published.
- [ ] 4.8 The author configures a project OpenAI API key as `OPENAI_API_KEY`, selects `AI_REVIEW_MODEL`, sets `AI_REVIEW_OWNER`, pre-creates the three labels, and verifies usable API funds and model access during the first acceptance review.

### Phase 5: Integrated verification and live acceptance

#### Automated

- [x] 5.2 `npm run verify:deploy` passes with the project's existing build environment configured, and the existing integration workflow remains valid with its original `smoke` coverage. — 7c3ca68
- [x] 5.3 Touched Markdown/JSON/YAML files pass the repository formatter check, workflow fixtures validate routing/permissions, and only the agreed CI-review files appear in the implementation diff. — 7c3ca68
- [x] 5.11 `npm run test:ai-review` passes from clean root/package installs and runs the package offline suites without provider credentials, paid inference, or GitHub mutation. — 7c3ca68

#### Manual

- [ ] 5.4 A new owner-authored PR to `master` receives one bot comment, scores and `pass`, the correct head-SHA check, and `ai-cr:passed`; a draft PR follows the same rule.
- [ ] 5.5 A later commit updates the same comment ID; an evident blocking defect produces `fail`, `ai-cr:failed`, and a red check, and removing the defect allows a later green review.
- [ ] 5.6 Adding `ai-cr:review` reruns the current SHA, consumes the label, and updates the same comment; adding an unrelated label after a rejection does not run Codex or turn the required check green.
- [ ] 5.7 Controlled authentication failure, timeout, invalid response, and publication failure are visibly distinguishable from a code rejection, clear obsolete course result labels where the API is available, and never report success.
- [ ] 5.10 After enabling branch protection, the author confirms that an ordinary merge is blocked by both a rejected review and an operational failure, and that an eligible valid pass can satisfy the review requirement.
- [ ] 5.12 Two quick commits or same-SHA retries cannot publish an older result over the latest review; ineligible requests do not reach the hosted inference job.
- [ ] 5.13 A moved master blocks merging an outdated PR, and an owner-performed rebase or merge followed by push automatically reruns CI and review without adding a retry label.
- [ ] 5.14 Forced cancellation or unavailable hosted execution leaves no newly successful review; the author verifies recovery through a fresh eligible request and understands API-outage limitations.
- [ ] 5.15 The first live reviews record model, prompt identity, token usage, and approximate cost, confirming that the selected limits fit the available API test budget.
