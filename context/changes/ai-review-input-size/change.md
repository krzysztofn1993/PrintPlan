---
change_id: ai-review-input-size
title: Investigate AI review input limits and archive rename inflation
status: impl_reviewed
created: 2026-11-01
updated: 2026-11-01
archived_at: null
---

## Notes

Research why the archive PR exceeds the reviewer's 256 KiB input limit, measure its actual line changes, and identify options for larger reviews without weakening review coverage. The author subsequently authorized exact-content rename detection and a 1 MiB input ceiling; these are implemented locally.

The author subsequently requested an exact 1.5 MiB limit (1_572_864 bytes), superseding the earlier 1 MiB limit for both serialized UTF-8 JSON input and the Git process buffer. Inputs above the limit remain rejected without truncation; all other limits and transport behavior remain unchanged.
