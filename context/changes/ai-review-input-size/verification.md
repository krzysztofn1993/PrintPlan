# AI Review Input Size Verification

Date: 2026-11-01. Implementation revision inspected: `8aba0df9a747d7e68a35b778a0fdcd24d6b3a8ca`, with Phase 2 documentation changes in the working tree. Node: `v24.21.0`, matching `.nvmrc`.

## Evidence scope

Phase 1 Progress records completed adapter and workflow acceptance at `8aba0df`. The earlier [research](research.md) and [merged PR size audit](merged-pr-sizes.md) retain historical measurements; those measurements are not new hosted execution evidence. This phase does not repeat the audit.

## Fresh automated verification

The implementation coordinator executed the following gates against the revision and working tree described above.

| Command                  | Result                                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:ai-review` | PASS: 52 tests passed; zero failed, cancelled, or skipped. Includes the byte-boundary and real-Git move fixtures described below.             |
| `npm run verify:deploy`  | PASS: 99 native tests passed, one hook integration test skipped, zero failures. Astro sync, ESLint, Astro check, and production build passed. |

The reviewer suite preloads `packages/ai-reviewer/test/offline.mjs`, which blocks native `fetch` and removes provider/GitHub write credentials from test processes. Provider and GitHub HTTP fixtures inject fake clients. No paid inference or hosted publication was performed.

The deployment gate reported six unused-parameter hints in `scripts/reservation-concurrency.mjs`; Astro check summarized zero errors and zero warnings across 137 files. The build completed with the sitemap integration's missing-`site` configuration warning. The skipped hook test was `real tools: deliberate lint errors fail, then repairs pass through both hooks`. No gate failed. Database acceptance, browser recovery, HTTP smoke checks, and hosted execution are outside these two automated criteria and were not run.

Phase 2 changed documentation only, so no new deliberate-break check was required. The complete reviewer suite exercised the existing Phase 1 regressions without modifying production code or tests.

## Contract coverage inspected

- `src/config.mjs` and `src/core/review.mjs` retain the 1,048,576-byte assembled UTF-8 JSON ceiling, rejection above it before provider invocation, the separate 200-path guard, and no truncation. The serialized fields are title, body, diff, paths, and `unreviewedPaths`; the separate system prompt is outside the measurement.
- `test/adapter.test.mjs` covers exact-ceiling acceptance and one-byte-over rejection before HTTP, including multibyte text and JSON escaping. Passing outcomes must come from the fresh suite result above.
- `test/workflow.test.mjs` uses real temporary Git repositories. Its archive fixture proves the expanded no-renames patch exceeds the configured ceiling while the collected exact-content rename patch stays below it, retains both old/new inventories including tabs/newlines in filenames, includes edited-move deletion/addition text, and discloses binary old/new paths. A binary-only move is rejected. The Git isolation fixture checks disabled executable diff drivers/text conversion, immutable SHA validation, and reading head objects while retaining the base checkout.
- `src/input/diff.mjs` compacts patches with `--find-renames=100%` while path and numstat collection retain `--no-renames -z`. Each Git subprocess keeps its independent 1 MiB output bound; collection failure cannot establish approval.

Source paths above are relative to `packages/ai-reviewer/`.

## Documentation review

The package [README](../../../packages/ai-reviewer/README.md) now states the exact serialized-byte boundary, measurement fields, system-prompt exclusion, and absence of a model-capacity guarantee. Its existing 200-path rule, no-truncation policy, exact-versus-edited move behavior, and binary disclosure remain documented. The trusted-base prerequisite explicitly applies to these reviewer fixes.

The author confirmed successful manual review of the README and this evidence on 2026-11-01, after the automated results were recorded. Progress item 2.3 is complete. This confirmation covers the documented policy and evidence; hosted adoption remains unverified.

## Hosted adoption and limitations

Hosted adoption is outside this plan's scope and unverified by this phase. `.github/workflows/review.yml` obtains reviewer scripts from the event's immutable base SHA. The corrected reviewer must be integrated into that base, the affected PR branch refreshed, and a fresh eligible run requested. A head-only change or retry against the old base does not establish adoption.

Offline results demonstrate local contracts only. They do not prove model context capacity, hosted deployment, live permissions, publication, or branch-protection behavior. This phase records no live run URL, provider usage, or cost.
