---
change_id: ci-code-review
title: Run PR reviews with a modular Node package and the OpenAI API
status: archived
created: 2026-10-29
updated: 2026-11-01
archived_at: 2026-11-01T06:47:08Z
---

## Intent and Accepted Scope

Run the six-criterion PR reviewer through GitHub Actions, publish one maintained PR comment and result labels, and enforce a custom check on the reviewed head.

Plan-review triage on 2026-10-29 replaced the original private/local-Linux/Codex-Business design with:

- A public repository on GitHub Free, retaining project history after removing 10x course materials from all refs intended for publication. Retain usable local copies and ignore them going forward.
- A modular standalone Node package in `packages/ai-reviewer/`, with separate prompts, contracts, core logic, OpenAI transport, tools policy, GitHub integration, reporting, CLI entry points, and package-local tests.
- GitHub-hosted runners and direct OpenAI API billing, using `OPENAI_API_KEY` and an explicitly configured model. No local runner, Codex login, tool-execution loop, or automatic paid inference retries.
- Pending-first review checks, including same-SHA retries and preparation failures; only valid pass plus successful publication finishes green.
- Strict up-to-date branch protection applied to the author/admin; owner rebase/merge and push automatically reruns CI/review.
- Package `.mjs` coverage in the existing Node ESLint override. No root workspace migration.

All five review findings are addressed. The author confirmed publication cleanup and API access/funds; hosted acceptance established review publication, eligibility, freshness, recovery, and protected merge behavior. The author accepted the remaining Manual outcomes on 2026-10-31.

The original API test budget was USD 21. The author reported USD 0.07 spent and USD 20.93 remaining at the recorded cost checkpoint; later live requests and token usage are documented separately in `verification.md`.

Implementation and acceptance are complete: all five phases and all 27 Progress criteria are checked. Per-phase automated evidence, subsequent operator setup, deployed corrections, hosted tests, and final author confirmation are recorded in `verification.md`. Criterion 5.7 uses explicitly accepted combined automated/hosted evidence; 5.14 uses the unavailable-workflow and recovery variant. The change completed implementation review and is now archived. The full implementation review is recorded in `reviews/impl-review.md`; its metadata warning was fixed locally during author-requested triage on 2026-11-01, with no pending findings. Documentation closeout does not merge or delete disposable acceptance PRs or historical duplicate comments.
