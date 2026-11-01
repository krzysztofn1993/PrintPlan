<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Code Reviewer Evaluations

- **Plan**: [plan.md](../plan.md)
- **Scope**: Full plan; all completed phases.
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-01
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Manual dispatch can execute code from a non-master ref with the API key

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: [.github/workflows/reviewer-evals.yml](../../../../.github/workflows/reviewer-evals.yml:43)
- **Detail**: The `workflow_dispatch` event accepts a selected branch or tag. GitHub documents that `GITHUB_SHA` is the last commit on `GITHUB_REF`, and the API/CLI can dispatch against a non-default ref ([workflow_dispatch reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow#running-a-workflow)). The prepare checkout falls back to `github.sha` at line 43, and the inference checkout does the same at line 138. For comparison mode, the workflow then runs the checked-out eval package with `OPENAI_API_KEY` available at lines 155–166. There is no guard requiring `github.ref == 'refs/heads/master'`. The author says they are the only person using this repository and accessing the key, so unauthorized third-party access is not the current threat; the remaining concern is accidentally dispatching from the wrong branch. The plan still requires the manual entrypoint to use trusted code, and the workflow test does not check the dispatch ref.
- **Fix**: Reject manual dispatches unless the ref is `refs/heads/master` before checkout or any token/secret use; explicitly check out trusted `master` for comparisons and trusted PR base code for PR reruns, then add an offline test for a non-master ref.
  - **Strength**: Restores the trusted-code boundary required by the plan.
  - **Tradeoff**: Dispatches from other refs must be restarted from `master`.
  - **Confidence**: HIGH — workflow expressions use the selected ref and no trusted-ref guard exists.
  - **Blind spot**: I did not dispatch the workflow or access its secrets.
- **Decision**: ACCEPTED — The author is the only repository user with access to the key and accepts the accidental wrong-ref risk for this solo setup. No code change was requested.

### F2 — An opened check can remain in progress indefinitely

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: [.github/workflows/reviewer-evals.yml](../../../../.github/workflows/reviewer-evals.yml:212)
- **Detail**: The workflow opens an `AI Reviewer Evals` check before fetch and preparation at lines 67–82. The `publish` job runs only if preparation succeeded and marked the PR eligible. If preparation fails after opening the check, or the PR is ineligible, publication is skipped and the check is never completed. Ineligible PRs are left with the “Trusted preparation is in progress” status instead of the explanation required by the plan.
- **Fix**: Add an always-running finalizer that completes opened checks as failure after preparation errors, as a blocked failure with an explanation for ineligible PRs, and as cancelled when the preparation job is cancelled.
  - **Strength**: Every opened check reaches a terminal, understandable result and ineligible cases remain blocked if this check later becomes required.
  - **Tradeoff**: Adds a small GitHub Checks API update path to the preparation job.
  - **Confidence**: HIGH — the finalizer runs after any earlier step failure and requires a known check ID.
  - **Blind spot**: A GitHub API outage could still prevent the update after retries.
- **Decision**: FIXED — Added the finalizer after artifact upload and an offline workflow contract test. The eval suite passed 31/31 and lint passed. No hosted workflow was dispatched.

### F3 — Approval digest omits the production SDK dependency manifests

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: [runner.mjs](../../../../packages/ai-reviewer/evals/runner.mjs:14)
- **Detail**: `runnerIdentityFiles` hashes the eval package manifest and lockfile, plus production reviewer source files, but omits `packages/ai-reviewer/package.json` and `packages/ai-reviewer/package-lock.json`. Those files select the `ai` and `@ai-sdk/openai` runtime dependencies. Updating them can change the transport used for inference without changing the `runnerDigest` bound to an approval. The checked-in approval is disabled, so this is a future approval identity gap rather than a current paid-run bypass.
- **Fix**: Include the production reviewer manifest and lockfile in `runnerIdentityFiles`, and add a test proving that changing either changes the runner digest.
  - **Strength**: Approval identities cover the pinned SDK dependency set.
  - **Tradeoff**: Dependency changes require a fresh approval digest.
  - **Confidence**: HIGH — both files are absent from the digest input list.
  - **Blind spot**: Existing request and budget limits still apply.
- **Decision**: FIXED — Added both production dependency manifests to the digest and an offline test that changes each file and verifies the digest changes. `npm run test:ai-review-evals` passed 32/32 and lint passed.

### F4 — Historical six-case metrics link to the 72-case holdout report

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: [verification.md](../verification.md:55)
- **Detail**: The “Observed comparison report” section records the historical 36-response run and links to `packages/ai-reviewer/evals/reports/report.json`. The available report at that path has a 72-response manifest for cases 07–18; it does not support the adjacent 36-response historical figures. Generated reports are ignored by Git, and no separate 36-response report is retained in the change. The documented figures may be correct, but this link does not let another reviewer verify them.
- **Fix**: Point to a retained historical artifact if one exists; otherwise label the figures as transcribed historical evidence and remove the misleading source link.
  - **Strength**: Makes the evidence boundary clear without implying a second model run.
  - **Tradeoff**: The original raw matrix may not be recoverable.
  - **Confidence**: MEDIUM — the current local report is definitively the holdout report; no separate historical report was found in the tracked change.
  - **Blind spot**: The author may have an external copy of the original report.
- **Decision**: FIXED — Clarified that the 36-response figures are transcribed from historical run notes and removed the misleading link to the 72-response holdout report. No model calls were made.

## Verification performed

- `npm run test:ai-review-evals`: PASS, 31/31. One test intentionally invoked invalid Git tree data and printed `fatal: not a tree object`; the containing test passed.
- `npm run test:ai-review`: PASS, 53/53.
- `npm run lint`: PASS.
- `npm run build`: PASS. Astro skipped sitemap generation because `site` is not configured.
- After F2 was fixed, `npm run test:ai-review-evals`: PASS, 31/31; `npm run lint`: PASS.
- After F3 was fixed, `npm run test:ai-review-evals`: PASS, 32/32; `npm run lint`: PASS.
- `git diff --check`: PASS.
- Manual progress items are complete as recorded. Phase 3.5 is marked not applicable because no hosted evaluation was requested; no hosted run, new model call, recurring approval, or branch-protection change was made.

The file-scope comparison covered the change history from the reviewed plan through the current head. I found no confirmed unplanned changed paths; fixture, workflow, reviewer-package, and evidence changes map to the planned phases.
