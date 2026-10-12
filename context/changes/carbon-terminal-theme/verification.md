# Carbon Terminal Theme — Phase 3 Verification

## Revision and environment

- Source revision: worktree based on `366bec4`, with the Phase 3 changes in this worktree.
- Runtime: Node `24.21.0`.
- Preview: built Astro preview at `http://localhost:4321`, using the configured local Supabase and Mailpit services.
- Browsers: Google Chrome `155.0.8059.39`; Firefox `157.0`.
- Viewports: desktop `1440 × 1000`; narrow layouts `390 × 844` and `320 × 844`.

The root route redirects anonymous visitors to sign-in and signed-in visitors to the dashboard. There is no separate landing page; the authenticated dashboard is the first-view capture.

## Automated results

| Check | Result |
| --- | --- |
| `npm run test:auth` | Passed: 13 tests |
| `npm run test:spools` | Passed: 14 tests |
| `npx astro sync` | Passed |
| `npm run lint` | Passed |
| `npx astro check` | Passed: 0 errors, warnings, or hints |
| `npm run build` | Passed |
| `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` | Passed all auth, confirmation, stock persistence, owner-isolation, session-refresh, and sign-out checks |

The smoke check was adjusted to match the existing route contract: an anonymous request to `/` redirects to `/auth/signin`, then the sign-in page returns HTML. The app's route behavior did not change.

## Browser coverage and screenshots

Playwright exercised the built preview using a synthetic test account. Request interception produced pending and uncertain create/delete responses without changing those records in the backend. The run reported no page errors or horizontal overflow at the tested widths.

- First view and authentication: [dashboard](screenshots/dashboard-desktop.png), [sign-up](screenshots/auth-signup-desktop.png), [validation](screenshots/auth-signup-validation.png), [password hint](screenshots/auth-signup-password-hint.png), [confirmation pending](screenshots/auth-confirmation-pending.png), [sign-in error](screenshots/auth-signin-error-desktop.png).
- Stock at desktop: [empty list](screenshots/stock-list-empty-desktop.png), [populated list with a long label](screenshots/stock-list-populated-desktop.png), [form](screenshots/stock-form-desktop.png), [form error](screenshots/stock-form-error-desktop.png), [form pending](screenshots/stock-form-pending-desktop.png), [form uncertain result](screenshots/stock-form-uncertain-desktop.png), [delete confirmation](screenshots/stock-delete-confirmation-desktop.png), [delete pending](screenshots/stock-delete-pending-desktop.png), [delete uncertain result](screenshots/stock-delete-uncertain-desktop.png), [delete success](screenshots/stock-delete-success-desktop.png), [empty after delete](screenshots/stock-list-empty-after-delete-desktop.png).
- Narrow layouts: [Chrome stock at 390px](screenshots/stock-list-390.png), [Chrome form at 390px](screenshots/stock-form-390.png), [Chrome stock at 320px](screenshots/stock-list-320.png), [Chrome form at 320px](screenshots/stock-form-320.png), [Firefox stock at 390px](screenshots/firefox-stock-390.png), [Firefox stock at 320px](screenshots/firefox-stock-320.png).
- Other browser and outage captures: [Firefox desktop stock](screenshots/firefox-stock-desktop.png), [Firefox sign-in](screenshots/firefox-auth-signin.png), [outage with dashboard link](screenshots/outage-link.png), [outage with sign-out](screenshots/outage-signout.png), [outage with reload](screenshots/outage-reload.png).
- Full automated color and keyboard measurements: [browser-measurements.json](screenshots/browser-measurements.json).

Chrome keyboard checks confirmed focus returns to the delete control after cancel, moves to the first field when create/edit opens, returns to the opener after cancel, and moves to the delete confirmation control when the dialog opens. The focused stock field retained a visible focus indicator.

## Measured contrast

Ratios below use rendered colors in Chrome. Text values meet the 4.5:1 normal-text threshold; the stock field border and focus indicator exceed the 3:1 non-text threshold.

| Element | Foreground on background | Ratio |
| --- | --- | ---: |
| Primary button text | `rgb(23, 12, 11)` on `rgb(255, 112, 88)` | 7.05:1 |
| Muted explanatory text | `rgb(135, 148, 151)` on `rgb(20, 25, 27)` | 5.67:1 |
| Stock field text | `rgb(240, 243, 241)` on `rgb(9, 12, 13)` | 17.57:1 |
| Stock field border against its surface | `rgb(97, 107, 110)` on `rgb(9, 12, 13)` | 3.59:1 |
| Delete warning text | `rgb(235, 193, 115)` on `rgb(33, 27, 17)` | 10.09:1 |
| Destructive button text | `rgb(23, 12, 11)` on `rgb(255, 121, 127)` | 7.58:1 |
| Authentication error text | `rgb(255, 157, 161)` on `rgb(39, 23, 25)` | 8.66:1 |
| Authentication link | `rgb(255, 174, 154)` on `rgb(20, 25, 27)` | 9.94:1 |
| Keyboard focus ring | `rgb(255, 112, 88)` on `rgb(20, 25, 27)` | 6.51:1 |

The final inspection found the earlier translucent focus ring and field border too low in contrast. Their opacity was raised to full for focus and to 70% for the field and outline-button borders; the values above measure the corrected result.

## Author review

On 2026-10-12, the author confirmed the desktop and narrow-width review, keyboard behavior and contrast, the listed authentication/stock/outage states, and acceptance of the final appearance and this record.

The dashboard's “Manage filament stock” control is an anchor link to `/dashboard/spools`, so Enter follows it. Space activates buttons; on a focused link it retains its browser behavior instead of navigating. This is the native keyboard behavior for the element's role, and no custom Space handler was added.
