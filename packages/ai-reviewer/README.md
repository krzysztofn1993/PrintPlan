# PrintPlan AI reviewer

Independent ESM package for static PR review. Requires the Node version in the repository's `.nvmrc`; no application install, generated output, ignored course files, or Actions environment is needed for contract tests.

```sh
npm ci --ignore-scripts --prefix packages/ai-reviewer
npm --prefix packages/ai-reviewer run test:contracts
```

The bundled `code-review` Markdown prompts are resolved relative to the loader module. Edit them while preserving the six criteria and eight-field schema. A SHA-256 digest identifies the exact prompt contents. Unknown identifiers and paths are rejected. Local validation rejects extra fields, nonfinite scores, malformed summaries, and contradictory operational envelopes. Only a validated review's `verdict` gates code; scores never supply an implicit threshold.

The review instructions require each blocking finding to identify hard evidence, a changed-code location, a triggering scenario, expected and incorrect results, an executable confirming test or reproducible steps, and attribution to the PR. The reviewer describes that test without executing it. A final validation checklist distinguishes demonstrated defects from concerns, missing context, missing coverage alone, or unrelated pre-existing behavior. These are model instructions; the existing runtime JSON validator checks structure and numeric bounds, not whether the evidence is true. Evaluate prompt changes against both known correct and deliberately incorrect code before relying on their verdicts.

`src/config.mjs` requires explicit `OPENAI_API_KEY` and `AI_REVIEW_MODEL` settings. Credentials are transport inputs and must never appear in review envelopes or logs. The reviewer exposes no tools and executes no PR instructions. Operational errors carry a safe diagnostic and no review verdict. Live GitHub/API setup and publication acceptance remain operator tasks; contract fixtures make no network requests.

The offline adapter suite uses injected fake HTTP only:

```sh
npm --prefix packages/ai-reviewer run test:adapter
```

For configured hosted inference, `src/cli/review.mjs` accepts three positional paths: trusted context JSON, bounded input JSON, and a new operational-envelope JSON path. Input is `{title, body, diff, paths, unreviewedPaths}`; context is the immutable version-1 contract. The composite action accepts `context`, `input`, `model`, and `output`, with the API key supplied only in the inference step environment. It exports `envelope`, `verdict`, and `review`; the latter two are empty on operational failure. The caller must upload the envelope with always-run handling even after CLI failure. Invalid context or inaccessible storage can prevent envelope creation; completion must recover through trusted preparation metadata.

Input rejects more than 200 changed paths, binary-only/empty diffs, and assembled UTF-8 JSON above 256 KiB without truncation. Mixed diffs explicitly list omitted paths in `unreviewedPaths` for static-review disclosure. One Responses API request uses an explicit model, strict JSON Schema, no tools, at most 8,000 output tokens, a 64 KiB final object, and a ten-minute abortable deadline. Refusals, incomplete responses, unexpected tool output, transport errors, and invalid reviews never become code approval. There are no inference retries. Response bodies, prompts, authorization headers, and raw exceptions are not logged or exported.

The hosted workflow has separate preparation, inference, and publication jobs. Both mutation jobs share a per-PR concurrency group with a bounded queue and cancellation disabled; inference holds no mutation lock or GitHub write permission. All scripts and `.nvmrc` come from the event's immutable base SHA. The PR head is fetched only as Git objects; diff generation disables external drivers, text conversion, hooks, and global Git configuration. Artifacts use versioned run/attempt names and seven-day retention.

Pending checks are opened and identified before package installation or diff generation, and before consuming the retry label. Completion reconstructs identity from the event and trusted check metadata when artifacts are absent. Operational completion can run without the JSON validator being installed. Duplicate delivery of a completed execution does not schedule another provider call. Comments require bot ownership, repository/PR scope, check provenance, and the corresponding `review.yml` PR run; human marker copies and unrelated bot workflows are ignored. Run provenance is fetched anonymously only from the exact numeric `GET /actions/runs/{run_id}` endpoint, using GitHub’s public-resource exception rather than adding `Actions: read` to the write token. All other requests retain authentication. Private deployments and anonymous API rate-limit failures are outside this public deployment contract and fail closed.

Historical comment provenance binds the check's reviewed head to the workflow run's top-level `head_sha` and verifies the associated PR number. Nested `pull_requests[].head.sha` and `base.sha` can reflect the current PR even in an older run response, so they cannot identify a historical review. Each preparation/publication invocation caches run metadata, refreshing it for a later attempt when needed; live PR and check reads still run before mutations. Comment lookup fetches the check identified by the owned comment's provenance instead of repeatedly scanning every current-head check for every comment.

Publication failures report a fixed operation name and an allowlisted error code in the check summary and CLI stderr. Raw API bodies and exception messages are never included. A `429`, or a `403` with `x-ratelimit-remaining: 0`, reports `GITHUB_RATE_LIMITED` without immediate retries; a generic forbidden response remains `GITHUB_HTTP_403`. Successful model output still requires successful publication before the custom check can become green.

Freshness checks compare live head/base and newer trusted run/attempt checks immediately before publication mutations. The shared Actions mutation lock prevents preparation and publication from interleaving. Older results complete only their own check as cancelled. An unavailable GitHub API or hard cancellation can prevent cleanup and leave a check pending or an old comment unchanged; neither creates a new success. Request a fresh eligible owner run after recovery. A moved base requires updating the PR branch and pushing, which schedules `synchronize` automatically. Branch protection must enforce up-to-date branches after operator acceptance.

## Offline integration

From a checkout with the repository's Node version installed:

```sh
npm ci
npm ci --ignore-scripts --prefix packages/ai-reviewer
npm run test:ai-review
npm run verify:deploy
```

The reviewer remains a standalone nested package with its own lockfile. Root CI installs it independently and runs its explicit native test suites; the existing database, browser, and HTTP smoke job remains separate. Every reviewer test command preloads `test/offline.mjs`, which blocks accidental native `fetch` calls and removes provider/GitHub write credentials from the test process. HTTP fixtures explicitly inject fake clients. No provider credentials, live inference, model access, or GitHub write access are needed for these tests. The application deployment gate still uses its existing build environment. The offline suite demonstrates local contracts; it does not establish hosted permissions, check selection, model availability, billing, or branch-protection behavior.

## Operator runbook: publication preparation

These are pending operator tasks, not actions performed by the implementation or its offline tests. Keep the current checkout intact. History work belongs in a separate working copy only after a private backup and the publication inventory have been reviewed.

1. Preserve a private backup of the original repository, including every branch/tag and unrelated uncommitted work, and verify it can be restored. Retain usable private local copies of course tools. Record which refs will be published, their original tips, and who owns other clones that will need new commit IDs.
2. Inventory course-owned skills, supporting prompts, configuration templates, installer/manifest metadata, historical path names, renamed paths, and copies. Existing `.agents/.10x-cli-manifest.json` is an inventory aid, not a complete historical list. Inspect content as well as names; not every course tool has a `10x-` prefix, and unrelated tools must be preserved. Record a concrete path/content/ref inventory and evidence for the author's approval rather than assuming that deleting `.agents/` is sufficient.
3. In the separate working copy, remove only the selected course material from the current tree and all history reachable from every ref intended for publication, while retaining project history. Keep local usable copies outside the rewritten tracked tree and add narrowly scoped ignore rules against reintroduction. Verify that the reviewer installs and tests without ignored course files. Inspect generated/public files for copied implementation text, not just the original material paths.
4. Verify every rewritten publication branch and tag, renamed historical paths, and selected content signatures. Preserve the original-to-rewritten tip mapping privately and coordinate changed commit IDs with other clones. Archived project SHA links are historical evidence; assess them explicitly instead of silently rewriting their records.
5. Inventory old remote branches, tags, PR refs, and hosting caches/retained objects that could still expose original course blobs. Where normal repository controls cannot remove them, seek hosting remediation and treat unresolved exposure as a publication blocker. A branch rewrite alone is not evidence of a full purge.
6. Present the backup, concrete inventory, rewrite mapping, ref/content scan evidence, and remaining hosting limitations to the author before any push or visibility change. Only after approval should the author publish the sanitized refs and make the repository public on GitHub Free. No unsanitized branch or tag may remain published. Keep the private pre-rewrite backup private throughout.

This package does not perform a history rewrite, force-push, ref deletion, visibility change, or ignore-rule installation. Those operations require the operator's separate execution and acceptance. Do not provision a local runner, systemd service, Codex login, subscription authentication, or personal GitHub token for this hosted API design.

## Operator runbook: API and repository setup

After the publication cleanup is verified, the author must:

- Create a dedicated project-scoped OpenAI API key, enable API billing/usable credits, and store the key as repository secret `OPENAI_API_KEY`. ChatGPT Business access does not fund API usage. Verify available funds, any expiration, and intended project/model access in the provider account. Never place the key in a file committed to Git, issue, comment, query, log, screenshot, or artifact.
- Set repository variables `AI_REVIEW_OWNER` to the owner's login and `AI_REVIEW_MODEL` to an explicitly chosen supported model identifier. There is no automatic model selection or fallback. Pre-create `ai-cr:review`, `ai-cr:passed`, and `ai-cr:failed`; the course result labels must remain mutually exclusive after a valid review.
- Verify Actions policy permits the pinned third-party Actions, hosted runners, queued job concurrency, and the workflow's explicit `contents: read`, `pull-requests: write`, and `checks: write` permissions in preparation/publication. Inference has `permissions: {}`. Verify anonymous public workflow-run metadata access for provenance; inaccessible metadata or rate limits fail closed. No PAT or persistent login is needed.
- Merge the trusted workflow/package to `master` before expecting it to review a test PR. A first PR that only introduces the reviewer cannot supply trusted-base implementation. Resolve merge conflicts before expecting `pull_request` workflows to run.
- Use the first small owner-authored PR review as the first API/model access check. Do not run a separate background inference or credential-inspection tool. Owner drafts are eligible. Confirm the model, prompt digest, limits, token usage, and approximate charge after that request before commissioning more reviews.

The author reported USD 21 for testing; this implementation has not inspected the balance or spent it. The plan's illustrative rates checked on 2026-10-29 for GPT-6.1 Sol Standard short context were USD 2/M input and USD 10/M output tokens: 20,000 input plus 4,000 total billable output tokens gives approximately USD 0.08. This historical example neither selects a model nor guarantees a number of reviews. Consult the selected model's current [API pricing](https://developers.openai.com/api/docs/pricing), context tier, actual reasoning/output usage, and project usage dashboard. Insufficient or expired credits, unavailable model access, authentication errors, and output exhaustion are operational failures with no fabricated code verdict. User-triggered retries can incur another charge; inference is never automatically retried.

For rotation, create a replacement dedicated key, update only `OPENAI_API_KEY`, verify it with a controlled eligible acceptance review, then revoke the old key. Revoke an exposed key promptly and assess provider usage without revealing credentials. On exhausted/expired funds, stop requesting paid reviews until the author resolves billing; do not substitute subscription credentials or another model automatically.

## Operator runbook: acceptance and required checks

Run offline failures first. Live acceptance uses controlled reversible fixtures/settings; never expose or destroy the real key to simulate a failure. Preserve existing app check requirements.

- Verify an owner-authored PR to `master`, including a draft, receives one owned bot comment with reviewed head/base, run URL, six scores, static-review limitations, and verdict. A valid pass publishes `ai-cr:passed` and the exact head-SHA `AI Code Review` check succeeds only after comment/labels publication.
- Add a later commit and verify the same comment ID is updated. A concrete blocking defect must produce `fail`, `ai-cr:failed`, and a red check; removing it permits a later green review. Scores alone never determine approval.
- Add `ai-cr:review` for a same-head retry, confirm its consumption and the new pending check, and verify that an earlier same-SHA success cannot satisfy the new requirement. Adding an unrelated label after rejection must not invoke inference or change the review gate.
- Exercise distinguishable authentication, timeout, refusal/incomplete/invalid output, and publication errors through controlled reversible fixtures. Where GitHub is reachable, result labels clear and the execution ends red without a verdict; failed publication never creates approval. Verify recovery with a fresh eligible request after forced cancellation or unavailable hosted execution. API outages may prevent updates and leave pending checks or an old comment unchanged; they do not manufacture a new success.
- Exercise two quick commits, overlapping preparation/publication, and same-SHA retries. An older head/base/run must not overwrite the latest result. Ineligible actors/authors, bots, forks, and unrelated labels must never reach hosted inference. When `master` moves, update the owner's PR branch by merge/rebase and push; `synchronize` must request replacement CI/review without a retry label.
- Only after cleanup, configuration, bootstrap, and live acceptance succeed, enable the exact `AI Code Review` requirement from GitHub Actions alongside existing requirements. Apply protection to the owner/admin and require branches to be up to date. Confirm GitHub's actual head-versus-merge-SHA check selection and same-SHA retry behavior: rejected review and operational failure block ordinary merge; an eligible valid pass can satisfy the requirement. Never select a native job with a similar name or assume that a skipped native job approves the custom check.

Record sanitized live evidence in `context/changes/ci-code-review/verification.md`: PR identifier, reviewed head/base/merge-base SHAs, run URL and attempt, bot comment ID, check ID/name/conclusion, result-label transition, selected model, prompt digest, request identity when available, input/output/total token usage, approximate cost, and observed merge behavior. Mark missing evidence pending. No live run URLs, charges, usage, or hosted acceptance have been established by the offline suite.

## Operator runbook: rollback

Remove the `AI Code Review` required-check rule **before** disabling its workflow so merges do not depend on an unavailable check. Preserve every existing application requirement and unrelated repository setting. Disable the review workflow only after that rule change, and revoke the dedicated API key when no longer needed; leave unrelated credentials intact. Preserve the private original backup and previously approved sanitized history. Hard cancellation and API outages may require a new eligible request to recover pending execution state; do not relabel or fabricate approval to hide an incomplete operation.
