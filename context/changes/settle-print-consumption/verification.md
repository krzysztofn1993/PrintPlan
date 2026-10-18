# Settlement Verification

## Automated checks

Run locally on 2026-10-18 after rebasing the branch onto `origin/master`:

- `npm run verify:deploy` — passed native contracts, lint, Astro diagnostics and production build. `astro check` reported five existing hints in `scripts/reservation-concurrency.mjs`; it reported no errors.
- `npx supabase test db` — passed all 354 pgTAP assertions across prints, reservations, settlements and spools.
- `npm run test:reservations:concurrency` — passed all 24 observed-lock interleavings, including settlement races and independent-owner progress.
- `npm run test:migrations` — passed populated upgrade preservation and settlement against a reservation preserved by the upgrade; scratch database cleanup passed.
- `npm run test:e2e` — passed all 31 Chromium tests, including setup/teardown and settlement recovery. The first run exposed a stale print-page heading in the shared E2E helper and ambiguous assertions where the completed row and receipt both showed the same label. The helper now waits for the current `Prints` heading and settlement assertions use their labelled result/stock regions. The focused settlement suite then passed 9/9 and the complete suite passed 31/31.
- `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` — passed against the separately built local preview with local Supabase and Mailpit. This includes anonymous/foreign-owner denials, positive and zero-gram settlement, cancellation-prefix and exceeded-estimate feedback, same-key replay/new-key conflict, completed-print edit rejection without persistence changes, fresh-login persistence, and receipt retention after deletion. The existing bounded JWT-expiry/refresh checks also passed.
- Deliberate-break check — temporarily changing the browser command to submit one extra gram made the focused zero-gram scenario fail because the saved result was no longer confirmed as the requested settlement. The production source was restored, then the full Chromium suite passed again (31/31).

The E2E response faults were simulated at the browser HTTP boundary; mutations and independent persistence reads used the local application and database. Generated smoke and browser fixtures were cleaned up. No hosted outage, remote CI run, or production behavior is claimed.

## Manual checks

Confirmed by the author on 2026-10-18:

- In current Chrome and Firefox and on a phone, the settlement form, completed rows, cancellation feedback and stock review remain readable and usable without clipped controls.
- Ordinary, 0 g and exceeded-estimate settlement work; results remain reviewable after refresh and a fresh login; deleting a completed print does not refund stock.
- Keyboard input and submission work, settlement confirms once, result feedback is readable, and focus returns to the row's review control.
