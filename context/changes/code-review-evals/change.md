---
change_id: code-review-evals
title: Evaluate the static code reviewer
status: impl_reviewed
created: 2026-11-01
updated: 2026-11-01
archived_at: null
---

## Notes

Assess the static reviewer pilot, refine its plan from repository evidence, and record the accepted 12-case holdout run. The author accepted the twelve oracles, shared rubric, and exact 72-request manifest; the historical comparison completed under its $4.50 authorization cap. The current course-alignment implementation uses Promptfoo as the matrix engine and Vercel AI SDK 7 in the production reviewer; the saved comparison predates both integrations. Prefer `gpt-6.1-sol` for a bounded, human-reviewed pilot based on this curated set. The separate SDK-backed synthetic-diff demonstration completed under its one-request approval, and the existing PR #39 pipeline/log/comment screenshots are captured. The author reviewed all 72 saved summaries case by case and found no unsupported allegations. The checked-in approval remains disabled. No recurring gate, hosted GitHub run, or branch-protection change was enabled; no push has occurred.
