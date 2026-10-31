---
change_id: ci-code-review
title: Run PR reviews with a modular Node package and the OpenAI API
status: implemented
created: 2026-10-29
updated: 2026-10-31
archived_at: null
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

All five review findings are addressed in the reconciled plan. Publication cleanup, API access/model/funds, and live branch-protection behavior remain deployment acceptance requirements, not completed implementation.

The author reports USD 21 available for testing; verify that these are usable API funds and record actual usage after initial calls.

The automated plan scope is implemented and verified. Per-phase gate evidence is recorded in `verification.md`, and the canonical Progress section records completed Automated rows and commits. Paid inference, history rewriting, pushes, repository visibility changes, and Manual acceptance have not been performed.
