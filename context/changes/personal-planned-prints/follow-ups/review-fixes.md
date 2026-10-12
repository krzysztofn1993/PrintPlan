# Implementation Review Fixes: Personal Planned Prints

## F2 — Confirm discarding edits on generic refresh retry

- **Status**: FIXED
- **Approved**: 2026-10-12 — author requested the displayed fix during triage.
- **Change**: The generic list-error “Try again” handler in `src/components/prints/PrintList.tsx` calls `refreshList()` so the existing unsaved-input confirmation applies. The explicitly confirmed conflict action retains its separate refresh path.
- **Validation**: `npm run lint`, `npm run build`, and `git diff --check` passed (exit 0) on 2026-10-12. Build retained the existing sitemap warning about missing `site` configuration.
- **Manual check**: After a failed list read, open an edit form and enter unsaved values. Click “Try again”; verify the discard prompt appears, cancellation retains the inputs, and confirmation permits the refresh.
- **Manual acceptance**: On 2026-10-12, the author confirmed that the corrected F2 interaction behaves as described. No browser version, viewport, or screenshots were supplied for this follow-up check.
