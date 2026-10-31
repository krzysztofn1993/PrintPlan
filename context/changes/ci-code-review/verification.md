# Automated implementation verification

The original automated implementation run used offline fixtures only. Subsequent operator setup and live acceptance observations are recorded in the dated sections below. This report distinguishes observed behavior from remaining acceptance checks.

## Phase 1

- Commit: `685d0f8`.
- Clean package install and contract/package tests: PASS (7 tests).
- Deliberate break: inverted the verdict comparison; the verdict-only gate test failed; restored from staging.
- `npm run verify:deploy`: PASS after fixing Node lint imports.
- Prettier check of package and touched context/config: PASS.
- Sequencing adaptation: brought the planned package Node ESLint override forward from Phase 5 to keep per-phase repository gates green. Existing script globals were preserved; reviewer modules use explicit Node imports.
- Initial repository baseline `npm run verify:deploy`: PASS.

## Phase 2

- Commit: `9aa5a58`.

- Adapter/configuration fixtures: PASS (10 tests, injected fake HTTP only).
- Combined package suite: PASS (17 tests).
- Deliberate break: removed completed-response status guard; incomplete-response fixture went red; restored from staging.
- Prettier check: PASS.
- `npm run verify:deploy`: PASS after documenting the intentionally stalled Promise fixture.

## Phase 3

- Commit: `69be0fe`.

- Workflow fixtures: PASS (4 tests).
- GitHub API fixtures: PASS (14 tests).
- Combined package suite: PASS (35 tests).
- Deliberate break: removed live head/base guard; two stale-publication tests failed; restored from staging.
- Package/workflow/context formatting: PASS.
- `npm run verify:deploy`: PASS, including the provenance adaptation.
- Preparation and publication share a job concurrency lock with queued completion; inference has no GitHub write credential. Third-party workflow Actions use full commit SHAs.
- Provenance adaptation: only numeric public workflow-run metadata GETs omit authentication, preserving the planned GitHub token permissions; every other route retains authentication. This relies on the planned public deployment and fails closed on private/API-rate-limited responses. Official endpoint: https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run . Documented workflow-path `@ref` suffix is accepted with exact filename matching.
- Live queue behavior, API access, and branch-protection acceptance remain Manual verification.

## Phase 5

- Clean root install: PASS (`HUSKY=0 npm ci`); Husky installation was disabled only for this invocation to prevent its Git configuration write. Repository Git configuration SHA-256 remained unchanged.
- Clean standalone install: PASS (`npm ci --ignore-scripts --prefix packages/ai-reviewer`).
- `npm run test:ai-review`: PASS (38 tests), with provider/GitHub credentials unset; every suite preloads the offline HTTP guard.
- `npm run verify:deploy`: PASS (native contracts, lint, Astro diagnostics and production build).
- Deliberate break: removed the nested reviewer install from CI; the integration fixture failed; restored from staging.
- Touched Markdown/JSON/YAML formatter check and implementation path allowlist: PASS; original root lockfile unchanged.
- Original CI smoke job compared structurally with baseline `e7e1b15`: identical. Live smoke/database/browser execution is not claimed by this offline change.
- Setup/history/publication/API/key-rotation/acceptance/rollback runbook is documented in the package README; no operator steps were executed.

## Manual evidence pending

All Manual Progress rows remain formally pending. This was the state at the end of the offline implementation; the live observations below supersede the original absence of hosted evidence. Individual rows cover multiple conditions, so one successful live review does not complete the full acceptance checklist.

## Rebase onto sanitized master — 2026-10-31

Rebased only this change's six commits onto `6c2166a`, following the remote history cleanup. `git range-diff` reports identical patches for all six commits. Active phase references above and in Progress now use the rebased commit IDs; archived project references were left unchanged.

| Original commit | Rebased commit |
| --------------- | -------------- |
| `455a118`       | `e7e1b15`      |
| `a6d8278`       | `685d0f8`      |
| `4d7b72a`       | `9aa5a58`      |
| `916638c`       | `69be0fe`      |
| `7c3ca68`       | `b9b7d10`      |
| `1397743`       | `60e7f29`      |

The private pre-rebase bundle and local tooling copy are outside this repository at `/root/work/PrintPlan-private-before-rebase-20261031/`. No push was performed.

Post-rebase verification: `npm run test:ai-review` passed (38 tests); `npm run verify:deploy` passed; formatting passed. All 175 paths removed by the upstream cleanup are absent from this branch's reachable history. The retained smoke job matches the rebased baseline structurally. Local `master` equals `origin/master`.

## Local VM import verification — 2026-10-31

- Imported all seven commits through `9a99717` from VM `printplan`, `/root/work/PrintPlan`, branch `ci-code-review`. Source tracked and untracked status was clean; no pending files required transfer. The source worktree was left unchanged.
- Base is current `origin/master` at `6c2166a`; no further rebase or SHA remapping was needed. None of the 175 paths removed by upstream cleanup appears in the imported branch's reachable history. Only the selected branch was bundled.
- Preserved the destination's old local master and unrelated roadmap edit; verification used an isolated worktree. Existing application sources, tests, root lockfile, and the full smoke job remain unchanged.
- Node `24.21.0`: `HUSKY=0 npm ci`, standalone `npm ci --ignore-scripts --prefix packages/ai-reviewer`, `npm run test:ai-review` (38 tests), `npm run verify:deploy`, and Prettier checking every changed file all passed. No live API inference was invoked. Database/browser/HTTP smoke execution was not performed.
- Non-blocking output: root install reported 30 dependency vulnerabilities; Astro reported six existing unused-parameter hints and the missing sitemap `site` option.
- GitHub account is `krzysztofn1993`, matching the intended owner. Reading `AI_REVIEW_OWNER` returned HTTP 404; configuration and live acceptance remain separate operator steps. Merge this infrastructure into master before opening the subsequent controlled test PR.

## Current acceptance checkpoint — 2026-10-31

Current stage: Phase 5, live acceptance. All 15 Automated Progress rows are checked. The change remains `implemented`, not archived; Manual rows 4.6, 4.7, and 4.8 are confirmed by the author, and the remaining nine Manual rows await full verification and author confirmation.

### Confirmed observations

- On 2026-10-31, the author confirmed that the API key is dedicated to this project and usable API funds remain available for further tests. Together with the recorded successful PR #39 review and operator setup, this completes criterion 4.8. No credential value was requested or recorded.
- On 2026-10-31, after clarification that criterion 4.7 concerns acceptance of public publication, the author confirmed that the repository was already published. Combined with the preceding confirmation that published branch and tag histories were sanitized, this completes criterion 4.7.
- On 2026-10-31, the author explicitly confirmed criterion 4.6: a complete private backup, removal of 10x materials from the history of all published branches and tags, and retention of local copies. Progress row 4.6 is checked on that basis; this confirmation is not a new independent history audit.
- The author reported completion of publication cleanup. Repository visibility was observed as public. The earlier local rebase scan proved the 175 removed paths absent from the selected branch history; this is not an independent audit of every published or hosting-retained ref.
- Infrastructure [PR #36](https://github.com/krzysztofn1993/PrintPlan/pull/36) and check-URL correction [PR #38](https://github.com/krzysztofn1993/PrintPlan/pull/38) were merged. Corrected trusted base: `18b7d179cfd5c552588bde0aa214107e6d7630a4`.
- The first live attempt, [PR #37](https://github.com/krzysztofn1993/PrintPlan/pull/37), returned a valid `pass` from `gpt-5-nano`, but publication failed because GitHub normalized the check URL. The correction and its 39-test offline verification are described in [the regression report](reviews/check-url-regression.md).
- A new owner PR, [#39](https://github.com/krzysztofn1993/PrintPlan/pull/39), completed the entire review path successfully. Reviewed head: `99c3cc018448c55d6d7a0f97212be50c8e5e4cdf`; reviewed base: `18b7d179cfd5c552588bde0aa214107e6d7630a4`.
- [AI workflow run 41175988320](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41175988320), attempt 1: `success`.
- Custom `AI Code Review` check `124463575649`: `completed`, conclusion `success`, on the exact reviewed head SHA.
- Exactly one owned [bot comment](https://github.com/krzysztofn1993/PrintPlan/pull/39#issuecomment-6539999989), ID `6539999989`, showed six scores and verdict `pass`. The PR carried `ai-cr:passed`.
- [Application CI run 41175988303](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41175988303): `success`.
- The saved envelope for run `41174189641` (PR #37) reported model `gpt-5-nano`, prompt digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`, 571 input tokens and 1,569 output tokens (2,140 total). At Standard rates of USD 0.05/M input and USD 0.40/M output, the uncached estimate is USD 0.00065615; this is an estimate, not a provider billing receipt. Successful PR #39 artifact evidence is retained below.

### Draft acceptance attempt — PR #40, 2026-10-31

- Temporary owner draft [PR #40](https://github.com/krzysztofn1993/PrintPlan/pull/40) contains the correct standalone stock fixture and tests. Local native tests, ESLint, and Prettier passed before transfer to the host agent.
- [Review run 41184712754](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41184712754), attempt 1, failed with `INCOMPLETE_RESPONSE`. The downloaded output artifact confirms status `error`, no review verdict, and no request ID or token usage retained. The provider adapter rejects non-completed responses before extracting usage or incomplete-response details; the artifact cannot establish why the response was incomplete or its cost.
- Reviewed head: `b60c4d4917740b740f809f4bc0aaf68345b2ebc8`; base: `10421c8a4713d4e6035db128f082f0e3795b4455`; merge base: `18b7d179cfd5c552588bde0aa214107e6d7630a4`. Model: `gpt-5-nano`; prompt digest: `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`.
- Preparation succeeded. The exact-head custom `AI Code Review` check `124489205217` completed with `failure`. Exactly one [owned bot comment](https://github.com/krzysztofn1993/PrintPlan/pull/40#issuecomment-6541157337), ID `6541157337`, reports an operational error without a code verdict. No result labels were present. Application `ci` succeeded; `smoke` was still running at inspection.
- This demonstrates an observed hosted incomplete-response failure that does not approve code. It does not complete the draft-pass criterion 5.4 or the full controlled-failure matrix 5.7. No retry or configuration mutation was performed during this inspection.

### Resumed acceptance inspection — 2026-10-31

- PR #40 remains open and draft at head `b60c4d4917740b740f809f4bc0aaf68345b2ebc8`, with no labels. Its application `ci` and `smoke` checks both completed successfully. The review remains the original operational failure; no draft pass has been observed.
- Downloaded `review-output-v1-41175988320-1` from successful PR #39 run `41175988320`. Its envelope reports `completed`, verdict `pass`, model `gpt-5-nano`, prompt ID `code-review`, digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`, request ID `resp_0f04e32bff4969bc016ae58817fc1087d0b3469701ae7470e4`, and usage of 582 input / 1,552 output / 2,134 total tokens. Started `2026-10-31T06:17:59.265Z`; completed `2026-10-31T06:18:09.583Z`. Current pricing and provider billing were not checked during this inspection; cost and overall budget reconciliation remain pending under 5.15.
- PR #40 still has the single owned comment ID `6541157337`, reporting `INCOMPLETE_RESPONSE` with no verdict. Attempting to add `ai-cr:review` through `gh pr edit` failed with `Resource not accessible by personal access token (addLabelsToLabelable)`. The label was not added and no new inference was requested by this attempt. The next retry requires the author to add the label or provide an environment with the required repository permission.
- Reading master branch protection also returned HTTP 403 (`Resource not accessible by personal access token`). This does not establish whether protection is enabled; 5.10 remains unverified. No repository settings were changed, and no Manual Progress row was checked during this inspection.

### Same-head label retry — PR #40, 2026-10-31

- After the author added `ai-cr:review`, [run 41185350759](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41185350759), attempt 1, reviewed the unchanged head `b60c4d4917740b740f809f4bc0aaf68345b2ebc8`, base `10421c8a4713d4e6035db128f082f0e3795b4455`, and merge base `18b7d179cfd5c552588bde0aa214107e6d7630a4`. The PR remained draft.
- Preparation consumed the retry label and opened new check `124491085436`; its `in_progress` state was observed before inference completed. The provider returned a valid `fail`. Publication updated the existing owned comment `6541157337`, without creating a second comment, applied `ai-cr:failed`, and completed the exact-head custom check with `failure`. The workflow also completed with `failure`, as required for a code rejection.
- Saved output artifact `review-output-v1-41185350759-1`: status `completed`, model `gpt-5-nano`, prompt ID `code-review`, digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`, request ID `resp_04e1a062aa42420c016ae5a8d9989087d1bc5626b8a2cf9049`, 1,344 input / 4,769 output / 6,113 total tokens. Started `2026-10-31T08:37:44.824Z`; completed `2026-10-31T08:38:07.817Z`. Billing was not inspected.
- The rejection is a false positive, not evidence of detecting the planned controlled defect. Its central blocking claim says `assert.equal` is unavailable from `node:assert/strict`. On the repository runtime Node `v24.21.0`, direct execution proves `typeof assert.equal === "function"` and `assert.equal === assert.strictEqual`; an equality assertion passes. Both exact-head acceptance tests, downloaded into an isolated temporary directory, also pass (`node --test`, 2/2). Other stated risks speculate about an older CI runtime or future application imports rather than demonstrate a current defect.
- This verifies same-head label consumption, replacement check creation, same-comment update, and failed-verdict publication. It does not complete 5.4 (draft pass), 5.5 (deliberate defect then correction), or all of 5.6 (unrelated-label inactivity still pending). Manual checkboxes remain unchanged pending author confirmation and the remaining conditions. Do not enable required-check protection on the strength of this false-positive rejection.

### Stronger-model comparison — PR #40, 2026-10-31

- Following the author's model-variable change and retry label, [run 41185691939](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41185691939), attempt 1, completed successfully. PR #40 remained draft with unchanged head `b60c4d4917740b740f809f4bc0aaf68345b2ebc8`, base `10421c8a4713d4e6035db128f082f0e3795b4455`, and merge base `18b7d179cfd5c552588bde0aa214107e6d7630a4`.
- Artifact `review-output-v1-41185691939-1` confirms model `gpt-5.4-mini`, status `completed`, verdict `pass`, request ID `resp_03c641c8bb369187016ae5aa0fa00887d1bc53148c91f75fff`, prompt ID `code-review`, and unchanged digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`. Usage: 1,344 input / 181 output / 1,525 total tokens. Started `2026-10-31T08:42:55.408Z`; completed `2026-10-31T08:42:57.123Z`.
- The model correctly described input validation, overbooking rejection, and subtraction, and found no blocking defect. It did not repeat the nano model's false assertion about `assert.equal`. This single comparison supports the current acceptance case; it does not establish general model reliability or detection of the planned deliberate defect.
- Custom check `124492080312` completed with `success` on the unchanged head. Exactly one owned comment remains, ID `6541157337`, updated with six scores and `pass`. The retry label was consumed, `ai-cr:failed` removed, and `ai-cr:passed` applied.
- At the official [GPT-5.4 Mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini) Standard rates checked during model selection (USD 0.75/M input and USD 4.50/M output tokens), the uncached token estimate is USD 0.0018225. This is a calculated estimate, not a billing receipt or verification of the remaining project balance.
- Ordinary PR #39 and draft PR #40 now both have observed successful review publication, providing the remaining hosted evidence for 5.4. The Manual Progress row remains pending author confirmation. Criteria 5.5 and the remaining conditions of 5.6 still require their respective tests.

### Deliberate arithmetic defect — PR #40, 2026-10-31

- The author pushed head `deac7cd9bcc0e2a374b5fa69c790ccf9b63b0c78`, changing the fixture return expression from subtraction to addition while retaining the subtraction contract and tests. [Run 41185956948](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41185956948), attempt 1, automatically reviewed that head against base `10421c8a4713d4e6035db128f082f0e3795b4455` and merge base `18b7d179cfd5c552588bde0aa214107e6d7630a4`.
- Artifact `review-output-v1-41185956948-1` confirms `gpt-5.4-mini`, status `completed`, verdict `fail`, request ID `resp_0a67f9772dd94049016ae5aafaad5487d29d63d5e2954f7646`, and unchanged prompt digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`. Usage: 1,344 input / 185 output / 1,529 total tokens; started `2026-10-31T08:46:49.836Z`, completed `2026-10-31T08:46:52.402Z`. At the previously checked Standard rates, the uncached estimate is USD 0.0018405, not a billing receipt.
- The model identified the exact defect: `availableGrams(150, 88)` produces 238 instead of 62. Custom check `124492838594` completed with `failure` on the new head, the workflow failed, and `ai-cr:failed` replaced `ai-cr:passed`. This establishes controlled-defect detection; the subsequent correction/pass remains pending.
- **Acceptance regression:** publication created comment `6541321187` instead of updating existing comment `6541157337`. Both bot comments remain on PR #40, including the older pass. The one-maintained-comment requirement and criterion 5.5 are not satisfied.
- Read-only diagnosis: the old run `41185691939` still reports top-level `head_sha` as `b60c4d4917740b740f809f4bc0aaf68345b2ebc8`, but its nested `pull_requests[0].head.sha` now reports current head `deac7cd9bcc0e2a374b5fa69c790ccf9b63b0c78`. The old check's `head_sha` and `external_id` retain the original reviewed head. `trustedCheck()` requires the nested head SHA to equal the recorded identity, so `ownedComment()` rejects valid earlier-head comment provenance. The existing fake cross-commit fixture does not reproduce this mutable GitHub metadata. Correct this provenance check with a regression test before claiming comment continuity; preserve repository, PR, workflow, application, and execution validation.
- No remote mutation or additional paid inference was performed during this inspection. No Manual Progress row was checked.

### Arithmetic correction and publication failure — PR #40, 2026-10-31

- The author restored subtraction in head `7248ee7f07d194a5fdc0def052e139523d496955`. [Run 41186233676](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41186233676), attempt 1, automatically reviewed it against base `10421c8a4713d4e6035db128f082f0e3795b4455` and merge base `18b7d179cfd5c552588bde0aa214107e6d7630a4`.
- Artifact `review-output-v1-41186233676-1` confirms `gpt-5.4-mini`, status `completed`, verdict `pass`, request ID `resp_075d605138d02c74016ae5abfb2c7c87d1b4517c9b18dc5f40`, and unchanged prompt digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`. Usage: 1,344 input / 165 output / 1,509 total tokens; started `2026-10-31T08:51:06.169Z`, completed `2026-10-31T08:51:09.099Z`. At the previously checked Standard rates, the uncached estimate is USD 0.0017505, not a billing receipt.
- The model accepted the corrected validation/subtraction logic and found no blocking issue. The model-level controlled sequence is now pass → deliberate defect/fail → correction/pass. However, publication failed: custom check `124493645332` completed with `failure`, summary `PUBLICATION_FAILED: no successful review was published.`, and the workflow failed. No result labels remained. Only the two earlier bot comments were present; no current-head result was published.
- The failing publisher log shows only process exit code 1; it does not identify the underlying failed API request. Do not attribute this failure to the earlier comment-provenance defect or an API rate limit without further evidence. This demonstrates fail-closed publication behavior, but does not complete the controlled failure matrix in 5.7 or the successful correction/publication requirement in 5.5.
- Investigate publication and correct the confirmed cross-commit comment regression before requesting another paid review. No retry or remote mutation was performed during this inspection. Manual Progress remains unchanged.

### Local publication correction — 2026-10-31

- Corrected historical comment provenance to use top-level workflow `head_sha` and PR association, reproducing GitHub's mutable nested PR refs in the fake API. Added invocation-scoped run metadata caching, direct provenance-check lookup, rate-limit classification, and sanitized publication diagnostics. Details and deployment limits: [publication regression report](reviews/publication-regression.md).
- Before the source fix, the realistic cross-commit fixture failed with two comments instead of one. The complete reviewer suite now passes 44 tests; `npm run verify:deploy` also passes. No Manual Progress row was checked.
- A read-only real-data lookup recognizes original PR #40 comment `6541157337` for the corrected current head. A saved-envelope replay using live reads and intercepted writes selects that comment for PATCH and simulates successful publication without a new comment POST. No GitHub write or provider call was performed. This does not establish hosted acceptance of the fix or explain the exact original publication failure.
- The correction remains local and uncommitted. Merge to trusted master and run a fresh eligible event before verifying hosted recovery. Existing duplicate comments remain untouched.

### Host deployment preparation — 2026-10-31

- Imported only the publication correction and its change documentation from VM `printplan`, `/root/work/PrintPlan`, source HEAD `7521f12c499f6dc13df88ba41a4ae04b7003a6f7`, onto current `origin/master` at `10421c8a4713d4e6035db128f082f0e3795b4455`.
- Preserved all dated acceptance observations above. Source `plan.md` checkbox edits were deliberately excluded: this deployment does not mark any Manual criteria complete, and the host plan retains its existing pending rows. Earlier statements that rows were checked describe the source VM state.
- Source changes remain intact on the VM. No secrets, local tooling, dependency symlinks, or 10x materials were transferred. PR #40 and its branch remain unchanged.
- Hosted acceptance of this correction remains the responsibility of the coordinating agent after merge. The exact cause of the prior `PUBLICATION_FAILED` remains unconfirmed.
- Host verification on Node `24.21.0`: `npm run test:ai-review` passed all 44 offline tests; `npm run verify:deploy` passed; Prettier passed for every imported or edited file. Existing Astro unused-parameter hints and the sitemap configuration warning remain non-blocking.

### Remaining acceptance

- Obtain author confirmation of the observed ordinary and draft PR passes (5.4).
- Add a controlled correctness defect, verify `fail`, then fix it and verify `pass`; confirm later commits update the same comment ID (5.5).
- Verify retry-label consumption, same-comment update and unrelated-label inactivity (5.6).
- Verify controlled operational failures and cleanup on hosted execution (5.7).
- Enable and test required-check protection, including owner/admin enforcement and actual merge blocking (5.10).
- Verify concurrent commits/retries and freshness on hosted execution (5.12).
- Verify moved-base protection and owner branch-update recovery without a retry label (5.13).
- Verify cancellation/outage recovery (5.14).
- Retain complete live model/prompt/usage/cost evidence and compare with the author's budget (5.15).

Recommended next acceptance test: a deliberately incorrect function in a disposable PR, followed by its correction. This checks detection of a blocking defect rather than only successful infrastructure execution. Do not enable required-check protection until the relevant acceptance cases succeed. New commits/retry labels can incur another paid review; this checkpoint update itself only read existing GitHub results and made no remote mutations or provider calls.
