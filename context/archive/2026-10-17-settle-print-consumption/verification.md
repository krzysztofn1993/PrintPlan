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

## Implementation review follow-up — F2

Verified locally on 2026-10-18 after completing the missing recovery and database cases:

- `npm run verify:deploy` passed with native contracts, lint, type checks and build; Astro reported 0 errors, 0 warnings and the same 5 hints.
- `npx supabase test db` passed all 376 assertions, including retained-key identity/version/reservation conflicts with unchanged complete fixture state, positive exact-fit cancellation and direct-RPC null/nonfinite/maximum numeric boundaries.
- `npm run test:reservations:concurrency` passed all 26 observed-lock interleavings, including settlement against a replacement reservation and a replacement attempt after settlement. Fixture and database-session cleanup passed.
- `E2E_PORT=4322 npm run test:e2e` passed all 32 Chromium tests (44.6s), including F1 deletion/review regressions and F2 null-result recovery. The existing development server on port 4321 remained running.

The corrected F2 scenario separates a simulated failed acknowledgement from forwarding the captured original request. While that command remains queued, real receipt GETs return null to the browser twice, including after closing the panel and refreshing the list. The test checks that the draft remains frozen and collection changes remain blocked; then it forwards the original request using the browser context's authenticated API client, observes the real commit, and verifies that an identical retry returns the same receipt without another deduction. This models a proxy/acknowledgement fault; it does not claim to reproduce a hosted incident.
