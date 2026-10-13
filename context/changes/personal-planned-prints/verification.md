---
change_id: personal-planned-prints
title: Personal planned prints verification
updated: 2026-10-12
---

# Verification: Personal planned prints

## Revision and environment

- Revision under verification: `c5d6bde` plus the Phase 4 working-tree changes; closing commit pending.
- Runtime: Node 24.21.0, as pinned by `.nvmrc`.
- Local database: disposable repository-local Supabase stack.
- Hosted CI, hosted database, and deployment: not run in this verification pass.

## Automated evidence

| Command                                                                           | Result | Evidence                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx supabase db reset --local`                                                   | Passed | Reapplied the stock and prints migrations to the repository-local stack.                                                                                                           |
| `npx supabase test db`                                                            | Passed | 158 database tests across print and spool suites.                                                                                                                                  |
| `npm ci`                                                                          | Passed | Installed 658 packages on Node 24.21.0.                                                                                                                                            |
| `npm run verify:deploy`                                                           | Passed | Auth (13), stock (14), and print (18) contracts; Astro sync; lint; Astro check (60 files, no diagnostics); production build.                                                       |
| `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` | Passed | Built-preview auth, stock, and print flows completed within the existing run limit. Print concurrency returned exactly one HTTP 200 and one HTTP 409; a reread matched the winner. |

The smoke includes authenticated print persistence, app and direct REST owner isolation, direct REST version increments, stale-version rejection, and two simultaneous writes using the same expected version. It must report exactly one HTTP 200 and one HTTP 409 and confirm that the saved row matches the winning response.

## Manual evidence

- 4.4 The author confirmed manual checks in current Chrome and Firefox on 2026-10-12: adding and deleting prints, persistence after logout and relogin, and isolation from another account.
- 4.5 Phone-view emulation at 390px and 320px and desktop keyboard checks: the author confirmed the prior Brave responsive emulation and desktop keyboard review on 2026-10-12; see the Phase 4.5 Progress row.
- Screenshots: none captured.

## Remaining coverage

- Hosted CI and remote deployment checks are not claimed as passed.
- The manual review was reported by the author; screenshots were not captured.
