# CI Code Review — Plan Brief

> Full plan: [plan.md](plan.md)
> Historical research: [research.md](research.md)

## Outcome

Review the owner's PRs to `master` with a modular Node package in `packages/ai-reviewer/`, GitHub-hosted Actions runners, and the direct OpenAI Responses API. Maintain one PR comment, course score/verdict labels, and a custom `AI Code Review` check on the reviewed head. API costs are separate from ChatGPT Business.

The target is a public repository on GitHub Free. Preserve project history after removing 10x course materials from every ref intended for publication; retain ignored local course files. Verify cleanup before changing visibility. This review performs no implementation, paid inference, history rewrite, push, or visibility change.

## Accepted Decisions

| Area           | Decision                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package        | Standalone ESM Node package with its own manifest, lockfile, README, composite action, prompts, schemas, source modules, fixtures, and tests. No root workspace conversion.                              |
| Boundaries     | Separate `core`, `input`, `contracts`, `prompts`, `providers`, `tools`, `github`, `reporting`, and thin `cli` entry points. Native fetch and one schema validator; no generic provider/plugin framework. |
| Prompts        | Editable `prompts/code-review/*.md`; fixed identifier, module-relative loading, revision/digest in operation metadata. No copied course tooling or PR-selected prompt paths.                             |
| Tools          | Central policy module sends no tools and rejects unexpected tool output. Future tools require an explicit follow-up change; no tool execution loop now.                                                  |
| Runner/auth    | All jobs are hosted by GitHub; project key in `OPENAI_API_KEY`, step-scoped to inference. No Codex CLI, Business login, cache, or Linux service.                                                         |
| Contract       | Six scores plus `verdict` and `summary`; only validated verdict controls code rejection. Operation errors have a separate envelope.                                                                      |
| Eligibility    | Owner-authored same-repository PR and owner actor; automatic opened/synchronize/reopened and explicit `ai-cr:review` label; drafts included.                                                             |
| Gate lifecycle | Open pending check before preparation. Completion handles preparation/inference failures, including same-SHA retries. Only validated pass plus publication succeeds.                                     |
| Freshness      | Serialize publication and reject old head/base/run results. Require an up-to-date PR branch, including for owner/admin. Rebase/merge and push reruns CI/review automatically.                            |
| Retry/cost     | One paid inference request per accepted event; no automatic provider retries or model fallback. Label retry remains available for the same head.                                                         |
| Quality        | Package-local native tests and root lint/format. Extend the existing Node override with `packages/ai-reviewer/**/*.mjs`.                                                                                 |

## Package Layout

```text
packages/ai-reviewer/
  package.json
  package-lock.json
  README.md
  action.yml
  prompts/code-review/
  src/
    cli/
    config.mjs
    core/
    input/
    contracts/
    prompts/
    providers/
    tools/
    github/
    reporting/
  test/
    fixtures/
```

Only the workflow stays under `.github/workflows/review.yml`. The package does not depend on application modules or local `.agents/` files.

## Commands and Phases

Install the package with `npm ci --ignore-scripts --prefix packages/ai-reviewer`. Root `npm run test:ai-review` delegates to `npm --prefix packages/ai-reviewer test`; package scripts select the contract, adapter, workflow, and GitHub suites. Use the root `.nvmrc` runtime and module-relative prompt/schema paths.

| Phase | Deliverable                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | Package boundaries, English prompts, eight-field schema, envelope validator, contract/package tests.                      |
| 2     | Tool-free OpenAI HTTP adapter, reusable composite action, abortable timeout, API/config tests.                            |
| 3     | Hosted preparation/inference/publication, pending-first checks, one comment, labels, freshness, workflow/GitHub fixtures. |
| 4     | Operator runbook, private history backup and verified course-material cleanup, public visibility, API/key/model settings. |
| 5     | Hosted offline CI/lint integration, small live acceptance PRs, actual merge protection, usage evidence, rollback.         |

All five original findings are addressed in the plan. Surviving Progress IDs/titles remain unchanged; retired local-runner/CLI/path criteria were not marked complete and their replacements have new IDs. The canonical Progress records implementation work only; all entries remain pending.

## Limits and Acceptance

Bound input to 256 KiB and 200 paths, output to 8,000 billable output tokens and a 64-KiB final object, summary to 12,000 characters, HTTP to ten minutes, inference job to twenty minutes. Refusal, incomplete/failed response, invalid JSON, or publication failure cannot create a successful review.

The author reports USD 21 for tests. Confirm usable API funds, model access, and expiry; the plan's USD 0.08 example is illustrative, not a production model choice or guaranteed count. Record actual usage after initial calls.

Remaining deployment prerequisites are operational: verified public-history cleanup, API key and explicit model, owner variable and labels, trusted package merged to master, live comment/check behavior, and strict branch protection applied to the author. GitHub API outages can prevent status/comment changes; hard cancellation may leave a check pending. Neither is a valid code verdict. PR merge conflicts can suppress workflows until resolved.

## References

- [Full plan and canonical Progress](plan.md), [original research](research.md).
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [API pricing](https://developers.openai.com/api/docs/pricing).
- [GitHub strict protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches), [npm clean installation](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
