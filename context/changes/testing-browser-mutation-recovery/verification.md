# Verification

## Current evidence

Implementation artifacts are in place, but the automated verification has not
been run in this implementation turn. The primary agent will run the gates and
record their results here. No browser scenario or deliberate regression is
claimed as demonstrated yet.

| Evidence | Status | Notes |
| --- | --- | --- |
| `npm run test:e2e` against the Playwright-owned preview | Pass | Chromium 14/14 passed in 23.5 seconds initially and 14/14 in 23.1 seconds after all deliberate breaks were restored. Setup signed in through the UI; each case used a fresh session; persisted writes were read through authenticated APIs; per-test fixture cleanup and generated-account teardown completed. |
| `npm run verify:deploy` | Pass | Hooks 15/15, auth 22/22, spool contracts 15/15, print contracts 19/19; ESLint, Astro diagnostics (73 files, 0 errors/warnings/hints), and production build passed. |
| Local-stack smoke | Pass | `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` passed against a separately started production preview and local Supabase/Mailpit, including stock/print persistence, ownership/version checks, token expiry, refresh rotation and revoked-refresh handling. |
| Deliberate regression checks | Pass | Four temporary breaks were detected by their targeted browser tests: removed stock uncertain-submit guard (button became enabled), cleared stock pending state (Edit became enabled during a held write), cleared the print uncertainty guard after a failed refresh (Add print became enabled), and removed edit-form retry consent (the generic retry test timed out waiting for the missing confirmation dialog). After each check, the changed production file was restored with `git checkout` from the staged baseline; no production-source diff remains. |
| CI workflow inspection | Pass | The local Supabase/Mailpit job installs Chromium and runs `npm run test:e2e` after local credentials are written and before the existing build/preview/smoke sequence. The Supabase cleanup remains under `if: always()`; remote CI remains unobserved. |
| Occupied preview port | Pass | With a listener bound to `127.0.0.1:4322`, `node scripts/assert-e2e-port-available.mjs 4322` exited 1 and reported that the port was already in use. The test runner invokes this guard before building its preview. |
| `git diff --check` | Pass | Both `git diff --cached --check` and `git diff --check` completed without whitespace errors. |
| Remote CI execution | Unobserved | The workflow is configured; no remote run has been observed. |
| Author review and rollout Phase 3 closeout | Pending | Requires human review of the browser recovery evidence. |

The suite injects simulated acknowledgement failures only at browser HTTP
boundaries. Its scenarios are designed to forward real mutation requests before
masking selected replies and to inspect real records through authenticated app
APIs. Those outcomes remain unverified until the focused suite runs against the
local stack.
