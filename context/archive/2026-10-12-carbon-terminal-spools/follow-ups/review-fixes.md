# Implementation Review Fixes

Source: `context/changes/carbon-terminal-spools/reviews/impl-review.md`.

## F1 — Dashboard primary action loses readable text on hover

- **Status**: FIXED on 2026-10-13, authorized by the author during triage.
- **Change**: Added `background: var(--primary)` to `.carbon-dashboard-link-primary:hover` in `src/styles/global.css`.
- **Verification**: `npm run lint` and `npm run build` passed. Chromium confirmed the rebuilt primary action retains its primary background on hover, with approximately 6.07:1 text contrast after brightness(0.92).
- **Evidence**: `../reviews/impl-review-dashboard-hover.json` preserves measurements before and after the fix.

## F2 — Planned Prints hover review lacks retained evidence

- **Status**: FIXED on 2026-10-13, authorized by the author during triage.
- **Change**: Added five Planned Prints hover screenshots, browser measurements and a linked matrix entry plus explanatory notes in `verification.md`.
- **Verification**: Google Chrome 155.0.8059.39 at 1440 × 1000 reviewed Add, Refresh, Edit, Delete and Confirm deletion after transitions settled. All enabled controls visibly change on hover and remain readable; text contrast ranges from 5.83:1 to 9.26:1. No page errors, API requests or horizontal overflow occurred.
- **Evidence**: `../reviews/phase-3/prints.hover-review.json` and its five named screenshots.
- **Cleanup**: Actual built PrintList mounted using a temporary browser response with in-memory synthetic records; no backend data persisted. The temporary capture script was removed after capture.
