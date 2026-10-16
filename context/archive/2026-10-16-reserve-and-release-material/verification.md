# Reserve and Release Material Verification

Date: 2026-10-16
Source revision: `98d2767` (`feat/reserve-and-release-material`)
Runtime: Node `v24.21.0`, Supabase CLI `v2.117.0`, Chromium through the repository Playwright setup.

## Automated Results

| Command                                                                           | Result                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify:deploy`                                                           | PASS: native hook, auth, spool, print and reservation contracts; ESLint; Astro check (86 files, no diagnostics); production build.                                                                                                                                                                                                |
| `npx supabase test db`                                                            | PASS: 250 pgTAP tests across prints, reservations and spools.                                                                                                                                                                                                                                                                         |
| `npm run test:reservations:concurrency`                                           | PASS: independent-owner progress and same-owner blocking/fresh-state validation.                                                                                                                                                                                                                                                      |
| `npm run test:migrations`                                                         | PASS: populated spool and print rows preserved after the reservation migration; scratch database cleaned up.                                                                                                                                                                                                                          |
| `E2E_PORT=4326 npm run test:e2e -- tests/e2e/reservation-recovery.spec.ts`        | PASS: all 7 tests, including failed then successful refresh and stale release after replacement.                                                                                                                                                                                                                                      |
| `E2E_PORT=4326 npm run test:e2e`                                                  | PASS: all 19 browser tests, including reservation, print recovery and spool recovery.                                                                                                                                                                                                                                                |
| `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` | PASS: full authenticated production-preview smoke, including persisted reservations, replay, isolation and existing stock/print workflows.                                                                                                                                                                                       |

The deliberate-break check changed the release RPC reservation ID temporarily; the reservation contract test failed on the mismatched RPC argument as expected. The source file was restored and is clean.

The initial smoke attempt used port 4324 and failed because local Auth redirected confirmations to `localhost:4321`. Running the production preview on the configured `localhost:4321` origin resolved the mismatch and the full smoke passed. Before that, stopping the dev server and clearing the stale Vite SSR cache resolved the missing Cloudflare entrypoint error.

## CI and Remote Evidence

CI now invokes reservation native contracts, database tests, reservation concurrency, populated migration verification, browser recovery and authenticated smoke. No remote CI workflow run was inspected in this phase.

## Manual Verification

Author confirmed that the best-fit and manual reservation workflow, insufficient-stock feedback, cancellation, edit guards, deletion feedback, persistence after navigation and logout/login work in desktop Brave, Firefox and a phone browser. No screenshots were attached. Brave is accepted in place of Chrome for the desktop check.
