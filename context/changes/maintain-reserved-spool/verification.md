# Verification: Maintain a Reserved Spool

This record captures the completed automated evidence for all three phases, the author's manual verification and accepted scope limitation, and hosted behavior that was not observed.

## Phase 1 and 2 commits

| Phase | Commit |
| --- | --- |
| 1 — Correct stock with current reservation guidance | `02ca054fa91721bd28cba5969a9abd250ea326ff` |
| 2 — Explain confirmed and uncertain spool deletion | `a4e2a8e455a61ab5ffacea17467d2afc9f474562` |

## Completed automated checks

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

## Phase 3 automated gates

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
- An optional Phase 1 `git diff --cached --check` reported trailing spaces on the research metadata lines. They are Markdown hard breaks used to keep the metadata lines separate; this was not a plan gate and the required verification suite passed.

## Retained recovery limitation

After a deletion commits but its response is lost or unreadable, a successful stock refresh can reconcile current inventory only. It cannot recover the original cancellation list or its historical details. The UI does not claim otherwise, and refresh does not repeat the deletion. Durable deletion receipts and cancellation-history recovery remain outside this approved change. The author accepted this limitation on 2026-10-20; it is not a failed in-scope feature.
