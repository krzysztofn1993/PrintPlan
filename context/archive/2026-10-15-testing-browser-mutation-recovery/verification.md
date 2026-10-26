# Verification

## Current evidence

Local verification was completed on 2026-10-15. The latest review run passed
`npm run test:e2e` (14/14), `npm run verify:deploy`, and the local
Supabase/Mailpit smoke. The evidence table distinguishes these fresh local runs
from the deliberate regression checks recorded during implementation. Remote CI
remains unobserved.

| Evidence | Status | Notes |
| --- | --- | --- |
| `npm run test:e2e` against the Playwright-owned preview | Pass | Chromium 14/14 passed in 24.4 seconds during the 2026-10-15 review; implementation runs also passed 14/14 in 23.5 and 23.1 seconds. Setup signed in through the UI; each case used a fresh session; persisted writes were read through authenticated APIs; per-test fixture cleanup and generated-account teardown completed. |
| `npm run verify:deploy` | Pass | The 2026-10-15 review passed: hooks 15 passed/1 skipped, auth 22/22, spool contracts 15/15, print contracts 19/19; ESLint, Astro diagnostics (73 files, 0 errors/warnings/hints), and production build passed. |
| Local-stack smoke | Pass | `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` passed during the 2026-10-15 review against a production preview and local Supabase/Mailpit, including stock/print persistence, ownership/version checks, token expiry, refresh rotation and revoked-refresh handling. |
| Deliberate regression checks | Pass | The implementation run detected four temporary breaks with their targeted browser tests: removed stock uncertain-submit guard (button became enabled), cleared stock pending state (Edit became enabled during a held write), cleared the print uncertainty guard after a failed refresh (Add print became enabled), and removed edit-form retry consent (the generic retry test timed out waiting for the missing confirmation dialog). These temporary edits were not repeated during the 2026-10-15 review. |
| CI workflow inspection | Pass | The local Supabase/Mailpit job installs Chromium and runs `npm run test:e2e` after local credentials are written and before the existing build/preview/smoke sequence. The Supabase cleanup remains under `if: always()`; remote CI remains unobserved. |
| Occupied preview port | Pass | With a listener bound to `127.0.0.1:4322`, `node scripts/assert-e2e-port-available.mjs 4322` exited 1 and reported that the port was already in use. The test runner invokes this guard before building its preview. |
| `git diff --check` | Pass | Both `git diff --cached --check` and `git diff --check` completed without whitespace errors. |
| Remote CI execution | Unobserved | The workflow is configured; no remote run has been observed. |
| Author review and rollout Phase 3 closeout | Confirmed | The author confirmed acceptance on 2026-10-15 after review of the browser recovery results, persisted-state assertions, discard-consent cases, pending/uncertain write protection and stock/print differences. |

The suite injects simulated acknowledgement failures only at browser HTTP
boundaries. Forward-then-mask scenarios forward real mutation requests and
verify persisted records through separate authenticated app API reads. This
demonstrates local client recovery with real persistence, not a hosted provider
outage. Remote CI remains unobserved.
