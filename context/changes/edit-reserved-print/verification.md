# Edit reserved print — Phase 4 verification

Run date: 2026-10-23

## Automated gates

| Gate                                   | Result               | Evidence                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 Controlled reservation concurrency | Passed               | `npm run test:reservations:concurrency` passed all 46 interleavings.                                                                                                                                                                                                                                                      |
| 4.2 Database contracts                 | Passed               | `npx supabase test db` passed all 546 tests across six SQL files.                                                                                                                                                                                                                                                         |
| 4.2 Populated migration acceptance     | Passed               | `npm run test:migrations` passed the populated settlement and compatibility checks, historical rename replay, evidence backfill, terminal request handling, and row preservation. The harness assertion was corrected to expect `NULL` on legacy requests and preserve the fresh print C reservation's 84 g witness.      |
| 4.3 Browser acceptance                 | Passed               | `E2E_PORT=4322 npm run test:e2e` passed all 67 Chromium tests on the built preview. Coverage includes reserved editing, exact recovery, stale cancellation, paired collection-read failure cases, and Data Table checks at desktop and phone widths.                                                                                  |
| 4.4 Authenticated HTTP acceptance      | Passed               | `BASE_URL=http://127.0.0.1:4322 npm run smoke` passed against the built preview, local Supabase, and Mailpit, including reserved-edit persistence and session-expiry coverage.                                                                                                                                            |
| 4.5 Deploy verification                | Passed               | `npm run verify:deploy` passed native contracts, lint, Astro diagnostics, and production build with 0 errors and 0 warnings. Astro emitted six nonblocking hints in `scripts/reservation-concurrency.mjs`.                                                                                                                |
| Stale-cancellation message follow-up   | Passed automatically | E2E confirms stale cancellation leaves the current reservation open with an inline warning. The full 67-test Chromium run passed after the Data Table update.                                                                                                                                                           |
| Shared table presentation follow-up    | Passed               | `E2E_PORT=4322 npm run test:e2e` was rerun after moving Planned Prints and Filament Stock to the shared `CollectionTable` presentation; all 67 Chromium tests passed. E2E row helpers now use the table's accessible row structure.                                                                                      |

## Author-run manual checks

The author tested reserved editing, no-fit feedback, stale cancellation and recovery in Chrome, Firefox and a phone viewport. The reservation behavior and database values were correct. The author reported two presentation issues: the stale-cancellation feedback disappeared from the print row and was replaced by a green message at the top, and action buttons were unevenly aligned across rows. The author later provided screenshots for the selected table layout.

The stale-cancellation flow now keeps the current reservation panel open with a warning beside it and clears the green success message. The author selected option 2, Data Table, from `reviews/row-layout-options.html`. A shared `CollectionTable` now presents both Planned Prints and Filament Stock with aligned wide-screen columns and labeled compact rows on phones. The author confirmed the final table layouts and action button fit in both views on desktop and phone (2026-10-23). Manual check 4.6 is complete.

The author also confirmed the saved reservation data in the database behaved correctly. Manual persistence check 4.7 is complete.

## Environment notes

Local Supabase and Mailpit were available. Port 4321 was already occupied by the existing Astro dev server; use `E2E_PORT=4322` for the browser suite and port 4322 for the separate preview used by smoke acceptance.
