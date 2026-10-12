# Implementation Review Follow-ups

## F1 — Retain the root redirect (Fix B)

- **Authorization**: The author selected B during triage on 2026-10-12.
- **Status**: Completed.
- [x] Add an explicit scope amendment to plan.md approving the root redirect and removing landing migration and landing screenshots from scope.
- [x] Record the author decision in change.md.
- [x] Correct verification.md to distinguish baseline landing HTML from the new redirect and explain sign-in/dashboard entry-view evidence.
- [x] Mark F1 FIXED via Fix B in reviews/impl-review.md.

Application code already implements the approved behavior. Progress row titles, checkboxes, and commit suffixes retain their historical values.

## F2 — Correct destructive hover evidence

- **Authorization**: The author selected “fix now” during triage on 2026-10-12.
- **Status**: Completed.
- [x] Repeat normal and hovered-state measurements on the actual built inventory component and stylesheet using a synthetic spool in a temporary browser fixture.
- [x] Wait for the 0.15s CSS transition to complete; verify enabled state, active hover, and zero remaining animations.
- [x] Convert CSS color spaces with browser sRGB canvas and compose ancestor backgrounds in the correct order.
- [x] Save normal/hover screenshots and the raw measurements in screenshots/destructive-hover-review.json.
- [x] Replace the destructive entries in browser-measurements.json and mark historical Chrome samples as superseded.
- [x] Record 7.58:1 normal and 6.43:1 hover contrast, the measurement method, and the local fixture limitation in verification.md.
- [x] Mark F2 FIXED in reviews/impl-review.md.

Both findings are resolved.

## Complete integration verification rerun

- **Authorization**: On 2026-10-12, the author requested another attempt after freeing port 4321.
- **Status**: Completed.
- [x] Start built preview on port 4321, matching the local Supabase confirmation redirect allowlist.
- [x] Run `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` to completion.
- [x] Confirm exit code 0 and final output `All auth smoke steps passed`, including stock persistence/isolation and token expiry/refresh/revocation checks.
- [x] Record the successful rerun in verification.md and update reviews/impl-review.md to APPROVED.
- [x] Stop the review-started preview to free port 4321.
