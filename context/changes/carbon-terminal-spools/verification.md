# Carbon Terminal Phase 3 Review

**Date:** 2026-10-13
**Status:** Evidence captured and accepted by the author on 2026-10-13.

## Capture setup

- Reviewed the built local preview with Chrome 155.0.8059.39 and Firefox 157.0.
- Captured Dashboard, Filament stock and Planned prints at 1440px, 390px and 320px in both browsers.
- Captured empty stock and print states in Chrome at all three widths.
- Used a disposable local account and synthetic records, including a long account email, long unbroken labels, named and unnamed prints, and full record IDs. The local account and records were removed after capture; no review fixture or demo data was added to the app.
- Removed the temporary local capture script after review.
- Initial list loading is N/A: the routes load the collections on the server and render their initial records into the client islands. The review separately captured client-side Saving, Deleting and Refreshing states.
- Measured `document.documentElement.scrollWidth > window.innerWidth` on all three routes in both browsers at all three viewports. Every measurement was `false`.

## Automated verification

- `npm run lint` and `npm run build` passed after the guidance update.
- The four-file stock scan returned zero candidate matches.
- `npm run verify:deploy` passed, including the auth, stock and print contract suites, Astro sync/check, lint and build.
- The expanded scan across all three dashboard routes, Topbar, DashboardShell and stock/print collection and form components returned zero candidate matches.

## Route and viewport screenshots

| Route          | Chrome                                                                                                                                                                   | Firefox                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard      | [1440px](reviews/phase-3/dashboard.chrome.desktop.png), [390px](reviews/phase-3/dashboard.chrome.phone-390.png), [320px](reviews/phase-3/dashboard.chrome.phone-320.png) | [1440px](reviews/phase-3/dashboard.firefox.desktop.png), [390px](reviews/phase-3/dashboard.firefox.phone-390.png), [320px](reviews/phase-3/dashboard.firefox.phone-320.png) |
| Filament stock | [1440px](reviews/phase-3/spools.chrome.desktop.png), [390px](reviews/phase-3/spools.chrome.phone-390.png), [320px](reviews/phase-3/spools.chrome.phone-320.png)          | [1440px](reviews/phase-3/spools.firefox.desktop.png), [390px](reviews/phase-3/spools.firefox.phone-390.png), [320px](reviews/phase-3/spools.firefox.phone-320.png)          |
| Planned prints | [1440px](reviews/phase-3/prints.chrome.desktop.png), [390px](reviews/phase-3/prints.chrome.phone-390.png), [320px](reviews/phase-3/prints.chrome.phone-320.png)          | [1440px](reviews/phase-3/prints.firefox.desktop.png), [390px](reviews/phase-3/prints.firefox.phone-390.png), [320px](reviews/phase-3/prints.firefox.phone-320.png)          |

Empty collection captures: [stock, 1440px](reviews/phase-3/spools.empty.chrome.desktop.png), [390px](reviews/phase-3/spools.empty.chrome.phone-390.png), [320px](reviews/phase-3/spools.empty.chrome.phone-320.png); [prints, 1440px](reviews/phase-3/prints.empty.chrome.desktop.png), [390px](reviews/phase-3/prints.empty.chrome.phone-390.png), [320px](reviews/phase-3/prints.empty.chrome.phone-320.png).

## Interaction and feedback states

| View           | State                                                               | Evidence                                                                                                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock          | Hover and focus-visible                                             | [Hover](reviews/phase-3/spools.hover.chrome.desktop.png), [focus-visible](reviews/phase-3/spools.focus-visible.chrome.desktop.png)                                                                                                                                |
| Stock          | Field errors and retryable error                                    | [Field errors](reviews/phase-3/spools.field-errors.chrome.desktop.png), [controlled 503 response](reviews/phase-3/spools.error-retry.chrome.desktop.png)                                                                                                          |
| Stock          | Saving and successful feedback                                      | [Saving](reviews/phase-3/spools.saving.chrome.desktop.png), [saved](reviews/phase-3/spools.saved-success.chrome.desktop.png)                                                                                                                                      |
| Stock          | Delete warning, pending and successful feedback                     | [Confirmation](reviews/phase-3/spools.delete-confirmation.chrome.desktop.png), [Deleting](reviews/phase-3/spools.deleting.chrome.desktop.png), [deleted](reviews/phase-3/spools.deleted-success.chrome.desktop.png)                                               |
| Stock          | Uncertain save outcome and refresh recovery link                    | [Uncertain outcome](reviews/phase-3/spools.uncertain-outcome.chrome.desktop.png)                                                                                                                                                                                  |
| Planned prints | Field errors and refresh pending                                    | [Field errors](reviews/phase-3/prints.field-errors.chrome.desktop.png), [Refreshing](reviews/phase-3/prints.refreshing.chrome.desktop.png)                                                                                                                        |
| Planned prints | Delete warning, pending and successful feedback                     | [Confirmation](reviews/phase-3/prints.delete-confirmation.chrome.desktop.png), [Deleting](reviews/phase-3/prints.deleting.chrome.desktop.png), [deleted](reviews/phase-3/prints.deleted-success.chrome.desktop.png)                                               |
| Planned prints | Saving and successful feedback                                      | [Saving](reviews/phase-3/prints.saving.chrome.desktop.png), [saved](reviews/phase-3/prints.saved-success.chrome.desktop.png)                                                                                                                                      |
| Planned prints | Conflict with retained user input                                   | [Conflict](reviews/phase-3/prints.conflict-retained-inputs.chrome.desktop.png)                                                                                                                                                                                    |
| Planned prints | Refresh discard confirmation                                        | [Cancelled confirmation](reviews/phase-3/prints.refresh-discard-cancelled.chrome.desktop.png); the native confirmation text was recorded as “Refreshing the list will discard unsaved form entries. Continue?”                                                    |
| Planned prints | Uncertain outcome, failed refresh with retained list, then recovery | [Uncertain outcome](reviews/phase-3/prints.uncertain-outcome.chrome.desktop.png), [failed refresh](reviews/phase-3/prints.refresh-failure-retains-state.chrome.desktop.png), [successful recovery](reviews/phase-3/prints.uncertain-recovered.chrome.desktop.png) |

The Saving, Deleting and Refreshing captures show disabled controls while the request is held. The warning, error and success captures retain their separate semantic treatments. The conflict capture confirms the unsaved field value remains present after the stale write is rejected.

## Author review

The author reviewed the Phase 3 presentation and replied “wygląda spoko” on 2026-10-13, confirming final visual acceptance.

Phase 1 typography evidence remains available: [desktop](reviews/phase-1-typography-desktop.png) and [mobile](reviews/phase-1-typography-mobile.png).
