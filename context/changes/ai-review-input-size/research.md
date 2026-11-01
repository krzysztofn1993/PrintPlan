---
date: 2026-11-01T07:56:50+01:00
researcher: Codex
git_commit: d6767e311d6918b325cf7c48bab8cee382f3906d
branch: master
repository: PrintPlan
topic: "AI review input limit and archive PR rename inflation"
tags: [research, codebase, ai-reviewer, ci, git-diff]
status: complete
last_updated: 2026-11-01
last_updated_by: Codex
last_updated_note: Raised input ceiling to 1 MiB with exact rename detection
---

# Research: AI review input limit and archive PR rename inflation

## Research Question

Why did the archive PR fail at 256 KiB, how many lines changed, and can the limit be raised or the failure avoided while retaining review coverage?

## Summary

The immediate issue is rename inflation in the project's reviewer. Its patch collector explicitly disables rename detection, causing moved documentation to appear as full deletion and addition. The byte ceiling is a local policy rather than an error imposed by GitHub or the model API on this run. See [collection](../../../packages/ai-reviewer/src/input/diff.mjs:49), [limit](../../../packages/ai-reviewer/src/config.mjs:2), and the reproduction below.

For the inspected PR #47 head/base pair, GitHub reports 12 renamed files with 3 added and 3 deleted lines. The reviewer instead produces 1,264 additions and 1,264 deletions, and 371,199 bytes of assembled input, exceeding its 262,144-byte ceiling. These counts apply to the recorded PR refs and title/body, not the local archive commit alone. Sources: [PR #47](https://github.com/krzysztofn1993/PrintPlan/pull/47), GitHub API file records, and the exact-ref reproduction below.

Recommendation: recognize exact-content renames in the patch while retaining the current old/new path inventory and binary classification. This reduces the measured input to 11,909 bytes for this PR, without excluding archived documentation. Raising the input ceiling is a separate option for genuinely larger reviews. At initial research time neither change had been implemented; the follow-up below supersedes that implementation status.

## Detailed Findings

### Limit ownership and historical rationale

At initial research time, `LIMITS.inputBytes` was frozen at `256 * 1024`; the assembly rejects UTF-8 JSON strictly above that ceiling. The measured object contains title, body, patch, paths, and unreviewed paths, including JSON escaping. The separately loaded system prompt is outside this measurement. This is a byte limit, not a line count. See [config](../../../packages/ai-reviewer/src/config.mjs:1) and [assembly](../../../packages/ai-reviewer/src/core/review.mjs:26).

The archived plan explicitly required bounded input without silent truncation, placing it among cost and runtime controls. Its exact numerical choice is not derived in those inspected passages. This historical policy is supported; its practical interaction with archive moves is the newly demonstrated problem. See [plan:152](../../archive/2026-10-29-ci-code-review/plan.md:152), [plan:255](../../archive/2026-10-29-ci-code-review/plan.md:255), and [brief:70](../../archive/2026-10-29-ci-code-review/plan-brief.md:70).

The inspected configuration reader exposes API key and model, and the composite action exposes context/input/model/output, without a size override. Increasing the ceiling therefore requires a code/configuration change. Git collection separately caps each subprocess output at 1 MiB. Raising the input ceiling does not remove that independent bound. See [config reader](../../../packages/ai-reviewer/src/config.mjs:10), [action](../../../packages/ai-reviewer/action.yml:1), and [Git buffer](../../../packages/ai-reviewer/src/input/diff.mjs:10).

### Observed hosted failure and reproduction

Inspected [run 41282438367](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41282438367): preparation failed in `Build bounded input`; inference was skipped. The custom check reported `REVIEW_UNAVAILABLE`. The hosted log sanitizes the exception rather than exposing `INPUT_SIZE`; that precise error was established by invoking the actual collector locally against the same PR refs. This failure happened before model inference.

The reproduction used:

```text
base / merge-base: f70d244ffe215e330ed02519a4b5002ba07821a0
head:              39bcdfd5bc5073eb25c9b30a5a89ab1ffffc22ea
metadata:          gh pr view 47 --json title,body,baseRefOid,headRefOid
```

Reviewer files and the workflow at the local research commit match the inspected base, verified with `git diff <base> HEAD -- packages/ai-reviewer .github/workflows/review.yml`.

For these refs and metadata, with the collector's sanitized Git configuration and existing no-renames path inventory:

- Current `--no-renames` patch: 24 path entries, 1,264 added and 1,264 deleted lines, 2,672 patch lines including headers/context, 365,964 raw patch bytes, 371,199 assembled JSON bytes. Calling `collectDiff` returned `INPUT_SIZE`.
- Patch-only `--find-renames`: 12 logical changed files, 3 added and 3 deleted lines, 70 patch lines, 5,872 raw patch bytes, 8,403 assembled JSON bytes. The unchanged path inventory still contains 24 entries.
- Patch-only `--find-renames=100%`: 13 logical changed files, 27 added and 27 deleted lines, 110 patch lines, 9,338 raw patch bytes, 11,909 assembled JSON bytes. The unchanged path inventory still contains 24 entries.

These are prose-only measurements, reproduced using `git diff --shortstat`, patch UTF-8 byte lengths, and `Buffer.byteLength(JSON.stringify({title,body,diff,paths,unreviewedPaths}))`. No structured facts companion was requested. The input field order matches [assembly](../../../packages/ai-reviewer/src/core/review.mjs:26); collection flags and merge-base selection match [collector](../../../packages/ai-reviewer/src/input/diff.mjs:4).

The GitHub file listing identifies 11 moves at 100% similarity and the edited `change.md` at 84% similarity in the local rename summary. Exact-content detection therefore leaves that edited document represented as deletion/addition, while compacting the unchanged documents. The API identifies these same 12 records as renamed. Source commands: `gh api repos/krzysztofn1993/PrintPlan/pulls/47/files --paginate` and `git diff --find-renames --summary <base> <head>`.

This explains why the PR looks small in GitHub yet exceeds the reviewer's input guard. Earlier larger PRs have not been measured here; visual size and changed-line totals alone do not establish whether this serialized-input guard would accept them.

### Options and deployment constraints

1. **Prefer exact-content rename detection for the patch.** Replace the patch command's explicit no-renames behavior with controlled exact-content detection, retaining the current full old/new path inventory and binary classification. Review sees path moves and retains full content for modified files. Git documents `--no-renames` as disabling detection and `-M100%` as exact-rename detection: [official Git documentation](https://github.com/git/htmldocs/blob/gh-pages/diff-options.adoc), fetched with Context7.
2. **Consider similarity detection if desired.** This also compacts renamed-and-edited files while preserving changed hunks. If detection is enabled for numstat as well, update its NUL-record parser: renamed records include separate old/new paths. Blind replacement of flags in the existing parser is unsafe. See [parser](../../../packages/ai-reviewer/src/input/diff.mjs:35) and [Git numstat format](https://github.com/git/htmldocs/blob/gh-pages/git-diff-index.html).
3. **Raise or configure the bounded ceiling for genuinely larger reviews.** A 512 KiB ceiling would accept the measured 371,199-byte current input for this PR, but leaves rename inflation intact. Keep configuration trusted and validated; account for the separate Git buffer and selected model's token capacity. This research does not prescribe a new universal ceiling or estimate API charges.
4. **Chunk reviews for recurring large diffs.** This would require explicit coverage accounting and aggregate failure handling, changing the current bounded request design. It is more involved than resolving the measured rename issue.

Do not silently truncate the patch, exclude archive directories wholesale, or treat an oversized input as successful review: those approaches weaken the retained bounded-input/full-coverage contract. See [historical plan](../../archive/2026-10-29-ci-code-review/plan.md:152).

Preparation checks out the immutable PR base and executes its reviewer, then copies that package for inference. A fix added solely to PR #47's head will therefore not change the reviewer used for that run. The correction must reach the trusted base, followed by updating the archive branch to that base and triggering a fresh eligible run. See [workflow checkout](../../../.github/workflows/review.yml:33), [execution](../../../.github/workflows/review.yml:57), and [package artifact](../../../.github/workflows/review.yml:61). No protection or hosted state was changed during research.

## Code References and Verification Scope

- [Collector](../../../packages/ai-reviewer/src/input/diff.mjs:4): immutable refs, merge-base, path/stat/patch collection.
- [Assembly](../../../packages/ai-reviewer/src/core/review.mjs:7): validity checks and serialized byte ceiling.
- [Existing boundary coverage](../../../packages/ai-reviewer/test/adapter.test.mjs:219): rejection before HTTP and exact ceiling acceptance.
- [Existing Git isolation coverage](../../../packages/ai-reviewer/test/workflow.test.mjs:107): hooks/drivers and binary disclosure.

Implementation verification should cover a large identical move, a moved-and-edited file, binary moves, unusual filenames, and retained Git isolation. Research ran the collector reproduction; no builds, full test suites, paid model calls, or implementation changes were needed.

## Architecture Insights

Trusted-base execution intentionally prevents a PR from changing the reviewer judging that PR. The archive problem can be addressed inside patch representation without weakening that boundary or removing the byte guard.

## Historical Context and Related Research

The archived CI review plan defines the bounded-input policy, while its [earlier research](../../archive/2026-10-29-ci-code-review/research.md) predates the final API design. The archived folder was treated as read-only; this follow-up uses a new active change.

## Open Questions

The cause and archive-specific mitigation are established. Choosing a larger ceiling, similarity matching, or chunking remains an implementation decision. No historical claim about other PR sizes or selected-model capacity is made here.

## Follow-up: implementation and merged PR audit

The author subsequently authorized recognizing moved files and auditing merged PR sizes. The patch collector now uses `--find-renames=100%` for the patch, retaining the original no-renames path listing and binary classification. This implements the conservative recommendation above; the input ceiling is unchanged. See [collector](../../../packages/ai-reviewer/src/input/diff.mjs:49). The original PR #47 refs now pass the actual collector with 11,909 assembled bytes and 24 old/new path entries.

The added real-Git regression covers a moved text file whose expanded patch exceeds the configured input ceiling, tabs/newlines in filenames, a renamed-and-edited document, binary disclosure, and binary-only move rejection. All 51 reviewer tests, root lint, and root build passed. See [regression](../../../packages/ai-reviewer/test/workflow.test.mjs:145). The build retains its existing missing-site sitemap warning.

All 33 merged PRs returned by the GitHub query were measured against their recorded refs, without missing objects or fallback. [Complete measurements and source refs](merged-pr-sizes.md) preserve the audit. These comparisons use current PR metadata and the reviewer counting method retrospectively; they do not establish historical model requests or the reviewer configuration at the original merge.

Within that audited set, PR #10 is largest by both bytes and GitHub changed lines: 2,584,037 raw patch bytes, 2,700,194 assembled input bytes, 51,087 additions, zero deletions, and 232 files. Excluding that bootstrap PR, #28 is largest by bytes at 519,891 raw patch bytes and 536,436 assembled input bytes; #33 is largest by GitHub changed-line total at 6,583 additions plus 557 deletions, totaling 7,140. Exact rename detection does not change those three PR measurements. See the audit rows for [#10](https://github.com/krzysztofn1993/PrintPlan/pull/10), [#28](https://github.com/krzysztofn1993/PrintPlan/pull/28), and [#33](https://github.com/krzysztofn1993/PrintPlan/pull/33).

Applying the 262,144-byte ceiling retrospectively, ten audited PR inputs exceed it without rename detection and nine exceed it with exact rename detection. PR #35 drops from 267,531 to 18,551 bytes. This confirms larger historical changes and shows that correcting renames does not eliminate the separate policy question of supporting large feature PRs. The byte threshold was not increased by this implementation. See [audit](merged-pr-sizes.md).

The changes remain local. Trusted-base deployment constraints described above still apply: merging this reviewer fix into the base and refreshing the archive branch are needed before hosted review uses it.

## Follow-up: accepted input ceiling

The author accepted a 1 MiB assembled input ceiling alongside the exact-content rename handling. The configuration now accepts up to 1,048,576 UTF-8 JSON bytes and rejects larger inputs without truncation; the 200-path ceiling is retained. The Git subprocess buffer remains 1 MiB: the assembled JSON includes the patch plus escaping and metadata, so an accepted assembled input also bounds the raw patch below that buffer. See [configuration](../../../packages/ai-reviewer/src/config.mjs:1) and [assembly](../../../packages/ai-reviewer/src/core/review.mjs:26). The earlier unchanged-limit statements describe the preceding implementation stage and are superseded by this decision.

The rename regression fixture now scales with the configured ceiling. Existing adapter tests exercise exact-ceiling acceptance and oversize rejection before HTTP. This local change still requires reaching the trusted base before hosted PR runs use it.
