# Test Stack

## Browser recovery

- **Runner:** `@playwright/test` 1.64.1, pinned by `package-lock.json`; Chromium is the only configured browser.
- **Command:** `npm run test:e2e` runs `playwright test` against `tests/e2e/` with one worker.
- **Owned preview:** `playwright.config.ts` checks that the selected port is free, then runs `npm run build && npm run preview -- --host 127.0.0.1 --port <port>`. The default port is 4321; set `E2E_PORT` to override it. Playwright refuses to reuse an existing server and stops its preview after the suite.
- **Browser installation:** `npx playwright install chromium` locally; CI uses `npx playwright install --with-deps chromium`.
- **Authentication:** The setup project validates that app credentials and `supabase status -o env` point to the same local Supabase instance. It creates one confirmed, generated account with a private provisioning key, signs in through the real UI, and saves browser state under ignored `playwright/.auth/`. Each test context obtains a fresh session through the app sign-in endpoint. Privileged access is limited to account creation and teardown deletion.
- **Fixtures:** Tests create, read and delete spools and prints through authenticated app APIs. Unique labels and returned IDs are written to a private fixture ledger. Per-test cleanup rereads records, deletes survivors, confirms already-deleted IDs are absent, and fails on cleanup errors. The teardown project deletes the generated account. Provisioning never resets the database.
- **Diagnostics:** Screenshots are captured only on failure; traces are recorded on the first retry. The HTML report is written to ignored `playwright-report/`; results and auth artifacts are ignored and are not uploaded by CI.
- **CI:** The local Supabase/Mailpit job installs Chromium and runs the browser suite after local credentials are configured, before its existing smoke preview starts. The browser suite is separate from `verify:deploy` and requires local Supabase.
- **Evidence boundary:** Browser HTTP interception simulates failed or unreadable acknowledgements. Forward-then-mask scenarios verify persisted writes through a separate real API read; they do not demonstrate provider outages. Remote CI remains unobserved until a workflow run is inspected.
