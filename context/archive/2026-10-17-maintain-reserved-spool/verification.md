# Verification: Maintain a Reserved Spool

This record captures the completed automated evidence for all three phases, the author's manual verification and accepted scope limitation, and hosted behavior that was not observed.

## Phase commits and epilogue

| Phase | Commit |
| --- | --- |
| 1 — Correct stock with current reservation guidance | `66049475238baaa1d7c9151c9de8fb7cdeb410b5` |
| 2 — Explain confirmed and uncertain spool deletion | `2199dd7a4e36dfc2324df39484215d8a0754545a` |
| 3 — Verify the bounded S-06 outcome and record evidence | `6b83c63f71c60269f420697037664585adc12111` |
| Final SHA write-back and implemented status | `180dcb129b0f71fa81088e1703c8c6650767a3d0` |
| Earlier closeout, superseded by the final SHA write-back | `d173c8a2a0bc23622b6c9dffacb7017f2bf3ac83` |

## Post-rebase follow-up commits

| Intent | Commit |
| --- | --- |
| Clarify the completed verification record | `16149faa64d1bcf31e87aa541946723480372440` |
| Add spacing between correction recovery actions | `d9b17d61e810ae15c5ec68647385c772cd1ef54b` |
| Record manual browser verification | `1b3bab7253ce6e3a23ab6258763a1787ed4d47b5` |
| Record acceptance of the recovery limitation | `a037730708327b2a3a09d092820eb33959f5355e` |
| Final SHA write-back and implemented status | `180dcb129b0f71fa81088e1703c8c6650767a3d0` |

The pre-rebase evidence is retained below as historical context. The post-rebase runs dated 2026-10-20 cover the current branch after rebasing onto `origin/master` (`d14a8a6`), the spacing correction, and manual acceptance. Manual checks 3.4 and 3.5 were confirmed on the current branch.

## Post-rebase automated verification (2026-10-20)

All browser, database, and smoke integration checks used a temporary Supabase project on ports 56321–56327, created from this checkout's migrations. The existing shared Supabase project was not reset or modified. The temporary project and the smoke preview were stopped afterward.

| Plan rows | Command | Outcome |
| --- | --- | --- |
| 1.1, 1.3 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` | **PASS** — 18/18 Playwright tests, including setup and teardown (16 Chromium scenarios). Covered guardrail boundaries, stale reservation totals, draft retention/restoration, failed refresh, disappeared targets, and keyboard access. |
| 1.2 | `npm run test:spools && npm run test:reservations` | **PASS** — spool 15/15; reservation 9/9. |
| 2.1 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts tests/e2e/spool-recovery.spec.ts` | **PASS** — 23/23 Playwright tests, including setup and teardown (21 Chromium scenarios). Covered readable multi-reservation deletion feedback and committed deletion with a masked response. |
| 2.2 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npx supabase test db` | **PASS** — 452 pgTAP tests across 5 files. |
| 2.2 | `cd /tmp/printplan-maintain-reserved-verify && node /root/work/maintain-reserved-spool/scripts/reservation-concurrency.mjs` | **PASS** — all 30 database interleavings verified; sessions and account fixtures were cleaned up. The script ran from the isolated project directory so it selected the isolated database container. |
| 3.1 | `npm run verify:deploy` | **PASS** — exit 0; hooks 16 passed/1 skipped, lint passed, Astro check covered 106 files with 0 errors and 0 warnings (5 unused-parameter hints in the concurrency script), and the production build passed. |
| 3.2 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e` | **PASS** — full configured Playwright suite 50/50 in 1.4 minutes against the isolated database. Its build-and-preview server stopped before smoke preview started. |
| 3.3 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:56324 npm run smoke` | **PASS** — the authenticated smoke flow completed, including stock, planned prints, reservations, settings, settlements, ownership, token expiry/refresh, and signout. Before it, `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npm run build` passed and `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npm run preview -- --host 127.0.0.1 --port 4321` started the separate smoke preview. |
| Post-check cleanup | `npm run build` | **PASS** — rebuilt after restoring the original local environment files; the development server was restarted on `0.0.0.0:4321`. |

## Earlier phase-specific evidence (before final rebase)

| Phase | Command | Outcome |
| --- | --- | --- |
| 1 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts` | **PASS** — 16/16 tests in 27.9 s against an isolated local Supabase project matching this checkout. Covered correction boundaries, stale totals, draft retention/restoration, refresh failure, disappeared target, and keyboard behavior. |
| 1 | `npm run test:spools` | **PASS** — 15/15. |
| 1 | `npm run test:reservations` | **PASS** — 8/8. |
| 1 | `npm run verify:deploy` | **PASS** — hooks: 15 passed, 1 skipped; auth: 22/22; spools: 15/15; prints: 20/20; reservations: 8/8; lint passed; Astro check covered 86 files with 0 errors and 0 warnings, plus one existing unused-`f` hint at `scripts/reservation-concurrency.mjs:442`; production build passed. |
| 2 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts tests/e2e/spool-recovery.spec.ts` | **PASS** — 22/22 tests in 34.6 s against the isolated local project. Covered complete multi-reservation cancellation feedback and committed deletion with a masked response. |
| 2 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npx supabase test db` | **PASS** — 274 tests across 3 pgTAP files. |
| 2 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npm run test:reservations:concurrency` | **PASS** — all 9 interleavings verified; fixtures cleaned up. |
| 2 | `npm run verify:deploy` | **PASS** — same native suite totals as Phase 1; lint passed; Astro check had 0 errors and 0 warnings plus the same existing unused-`f` hint; production build passed. |

The Phase 1 browser cases verified 87 g is rejected with an 88 g reservation and 88 g is accepted. In the stale-total case, a 100 g draft was retained after reservations increased from 88 g to 143 g; after explicitly releasing the 55 g reservation and refreshing, the deliberate 100 g correction succeeded with 88 g reserved and 12 g available. The matching-label case verified that refreshing after Black became reserved retained the Red/100 g draft; the explicit **Use saved material and colour** action restored the saved labels without a request or write and retained 100 g, followed by a deliberate successful save.

The Phase 2 readable deletion case verified both exact reservation identities, print descriptions and released quantities. Fresh authenticated reads showed both prints survived unreserved and unrelated spool stock was unchanged. The lost-response case forwarded the real reserved deletion before masking its response, observed one browser deletion POST, kept mutations guarded after a failed stock refresh, and later reconciled current stock without claiming a recovered cancellation history. Both prints survived unreserved and unrelated stock remained unchanged.

## Earlier Phase 3 evidence (before final rebase)

| Plan row | Command | Status |
| --- | --- | --- |
| 3.1 | `npm run verify:deploy` | **PASS** — hooks: 15 passed, 1 skipped; auth: 22/22; spools: 15/15; prints: 20/20; reservations: 8/8; lint passed; Astro check covered 86 files with 0 errors and 0 warnings, plus the existing unused-`f` hint at `scripts/reservation-concurrency.mjs:442`; production build passed. |
| 3.2 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify E2E_PORT=4326 npm run test:e2e` | **PASS** — full configured suite: 30/30 tests in 45.7 s against the isolated local project. A first attempt failed; details are recorded under failures below. |
| 3.3 | `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:56324 npm run smoke` | **PASS** — authenticated smoke checks completed, including stock, planned prints, reservations, ownership, token expiry/refresh, and signout. Before smoke, `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npm run build` passed and `SUPABASE_WORKDIR=/tmp/printplan-maintain-reserved-verify npm run preview -- --host 127.0.0.1 --port 4321` started the separate production preview. The Playwright preview had already shut down. The isolated Mailpit port was 56324 because the shared local stack remained running on 54324; the smoke preview was stopped after the command completed. |

## Manual checks and hosted behavior

| Plan row | Check | Status |
| --- | --- | --- |
| 3.4 | Current Chrome and Firefox plus a phone viewport/device: follow rejection, refresh and cancellation guidance; confirm draft retention, keyboard reachability and readable cancellation details. | **PASS — author confirmed manually on 2026-10-20.** Trials 1 and 2 passed; cancellation details and keyboard controls were confirmed in current Chrome, Firefox and on a phone. The author confirmed the added spacing between **Refresh reservation amounts** and **Manage reservations in planned prints**. Exact browser versions, device model and viewport were not supplied. |
| 3.5 | Author accepts that lost-response recovery shows current data only and cannot restore the original cancellation list. | **PASS — accepted by the author on 2026-10-20.** |
| — | Hosted behavior | **Unobserved.** No hosted environment was tested. |

## Failures and adaptations

- The first browser run against the shared local database failed because that database had schema drift: `supabase migration list` showed applied migration `20261017000000`, which is absent from this checkout, and reservation preview calls returned `reservation_preview_required`. Tests were rerun against a separate branch-matched local Supabase/Mailpit project on ports 56321–56324. Shared database state was not reset or changed.
- A Phase 1 keyboard case initially timed out before the Astro island hydrated. The test was updated with a hydration-ready wait and focus assertion; the branch-matched rerun passed 16/16.
- Phase 1 deliberate-break evidence: an initial attempt from the main checkout was blocked before testing by conflicting Supabase credential files and yielded no behavior conclusion. In an isolated worktree, temporarily disabling `useSavedLabels` made the focused test fail at the expected `PLA` versus retained `Red` assertion. The source was restored.
- Phase 2 deliberate-break evidence: temporarily changing the recovery link to `/dashboard/spools` made the focused lost-delete test fail at the expected `/dashboard/prints` href assertion. The source was restored.
- The first Phase 3 full browser-suite attempt failed in the isolated verification worktree: the Phase 2 deliberate-break link was still present there, so the reserved-delete test observed `/dashboard/spools` instead of `/dashboard/prints`; the best-fit reservation test also timed out before finding its `Reserve 88 g` option. The isolated worktree was resynced from the current approved source, and the subsequent full-suite run passed 30/30; the best-fit failure did not reproduce.
- On the first post-rebase focused browser attempt, authentication setup stopped before feature scenarios because `.env` and `.dev.vars` pointed to different local Supabase instances. The original `.env` was moved aside temporarily, the same test command passed on retry, and the original file was restored. No shared database was changed.
- An optional Phase 1 `git diff --cached --check` reported trailing spaces on the research metadata lines. They are Markdown hard breaks used to keep the metadata lines separate; this was not a plan gate and the required verification suite passed.

## Retained recovery limitation

After a deletion commits but its response is lost or unreadable, a successful stock refresh can reconcile current inventory only. It cannot recover the original cancellation list or its historical details. The UI does not claim otherwise, and refresh does not repeat the deletion. Durable deletion receipts and cancellation-history recovery remain outside this approved change. The author accepted this limitation on 2026-10-20; it is not a failed in-scope feature.
