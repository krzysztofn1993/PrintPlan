# Fork eligibility with unavailable configuration

## Hosted observation — PR #44, 2026-10-31

External author `krzychna` opened PR #44 from `krzychna/PrintPlan`, head `d06f8a57b7bec8c6b4e831f95f68bf2afa38d5ab`, against trusted base `8cbd8035e36c29be3f051996289a8002936d5f58`. Initially, GitHub required workflow approval. After the owner's approval, run `41215452844`, attempt 2, ran preparation and publication, both of which failed. Inference was skipped; no custom review check, comment, or result label was created.

The approved run's logs show empty `AI_REVIEW_OWNER` and `AI_REVIEW_MODEL`. The workflow's `vars.AI_REVIEW_OWNER == ''` diagnostic fallback enclosed the same-repository and bot exclusions, so an unavailable owner variable enabled jobs for this fork. The CLI then threw `OWNER_REQUIRED` before reaching the fork exclusion, producing unnecessary red jobs. No model invocation or review-gate mutation occurred.

## Correction

- Move the same-repository and non-bot conditions outside the missing-owner fallback in both preparation and always-run publication job guards. Forks and bots are excluded independently of configuration availability.
- In `eligible()`, exclude out-of-scope events before validating owner configuration. Direct CLI calls for forks with absent variables return without constructing a GitHub client, touching artifacts, or making HTTP requests.
- Preserve the configuration diagnostic for same-repository, otherwise in-scope events: missing owner still throws `OWNER_REQUIRED` and cannot schedule inference.
- Preserve workflow events, required-check behavior, trusted-base checkout, credential isolation, and token permissions. No fork credentials or write permissions are enabled.

## Verification

- Before the fix, a regression evaluating the actual YAML guards reproduced `prepare: fork, owner=missing` as allowed instead of skipped. A CLI regression reproduced `OWNER_REQUIRED` for a fork with no configuration. Both failed against the old implementation.
- After the fix, the guard test covers fork/bot/unrelated-label exclusion with configured or absent owner variables, plus eligible events and explicit retries. It evaluates only the fixed boolean-expression subset used by these guards; it is not a general GitHub Actions expression implementation.
- CLI tests verify preparation/input/publication return without HTTP, credentials, output files, or review artifacts for the fork, while same-repository missing configuration still fails closed.
- `npm run test:ai-review`: PASS, 48 tests.
- `npm run verify:deploy`: PASS, including native contracts, lint, Astro diagnostics, and production build.
- Formatting and whitespace checks: PASS.
- No remote mutation or additional provider request was initiated during the correction.

## Deployment and acceptance

The host merged the fix through owner-authored PR #45 as master commit `99d17808b65558685af13f359d63fada34279fab` at `2026-10-31T20:01:50Z`. The author then updated PR #44's fork branch with that master and approved the new workflow run. The original old-base event was not used as the acceptance run.

Hosted outcome: run `41237084465` for new head `bc43373d2691d4330954c7aa599a7edddae6a3b9` completed as `skipped`. Preparation, inference, and publication were all skipped, with no custom `AI Code Review` check, review comment, result labels, or provider request. Together with the existing overlapping-commit evidence, this supplies the remaining hosted condition of 5.12. The author subsequently confirmed 5.12 in the consolidated acceptance on 2026-10-31. The disposable external fixture PR was not merged.

Documentation fetched through Context7 confirms [unset configuration variables return an empty string](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables). The empty fork-run values above are observed evidence, not an assumption that every fork context has identical configuration behavior.
