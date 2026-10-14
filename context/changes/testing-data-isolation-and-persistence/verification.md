# Verification: Data isolation and persistence

Date: 2026-10-14

## Automated gates

- `npx supabase test db` — **PASS**, 162 pgTAP assertions across the spool and print suites. The new print victim oracle records A's actual state after the existing legitimate edits (null name, canonical PETG and multicolour label, maximum grams, version 7) before B's foreign attempts.
- `npm run test:migrations` — **PASS**. The runner committed duplicate A spools, a zero-gram correction and B's spool, then compared all three rows through fresh restricted connections after applying the actual print migration. It confirmed `public.prints` exists and printed `PASS scratch database cleaned up`. The first run exposed the need to restore native auth ownership as `supabase_admin`; the corrected run passed.
- `npm run verify:deploy` — **PASS** on the final code: native contract suites, lint, Astro check (63 files, zero errors, warnings or hints) and production build.
- Built-preview smoke — **PASS** with `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`. Anonymous and two-owner isolation, direct REST boundaries, acknowledged values, duplicate survivors, fresh-login rereads, targeted deletion and existing token expiry/revocation checks passed.

The first preview smoke run caught an initialization-order error in the new overall/cleanup deadline. After fixing it, the smoke passed; it was repeated after the cleanup-probe correction and passed again.

## Deliberate migration fault

Appended a worktree-only update to the actual print migration that increased every seeded spool's grams by one. `npm run test:migrations` went red at the committed zero-correction assertion, and the scratch database was removed. The migration was unconditionally restored; `git diff --quiet -- supabase/migrations/20261012000000_create_prints.sql` confirmed no fault remained. A subsequent unmodified migration run passed and cleaned its scratch database.

## Cleanup failure probes

Each opt-in run intentionally exits with its injected scenario failure after exercising the cleanup `finally` path. Both owners' tracked records were removed:

| Probe                | Injected condition                              | Cleanup result                                                        |
| -------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `spool-timeout`      | Scenario deadline expires                       | A and B's tracked spool records removed                               |
| `spool-post-signout` | A fails after sign-out and before fresh sign-in | A signs in again for cleanup; A and B's tracked spool records removed |
| `print-timeout`      | Scenario deadline expires                       | A and B's tracked print records removed                               |
| `print-post-signout` | A fails after sign-out and before fresh sign-in | A signs in again for cleanup; A and B's tracked print records removed |

The first timeout-probe attempt exposed that `AbortSignal.timeout()` alone does not keep Node's event loop alive. Node exited with an unsettled top-level await before entering cleanup. The probe now holds a short referenced timer, confirms the scenario signal expired, and then raises the expected failure so `finally` runs. The two tagged spool rows left by that first broken harness run were removed from the local database using their cleanup labels and recent smoke-account ownership. All four corrected probes then exercised owner-scoped cleanup. A final local database query found **zero** tagged spool or print probe records.

## Boundaries and remaining limits

The populated-upgrade runner derives its container from `supabase/config.toml`, creates a unique scratch database with owner `postgres`, restores only native `auth` schema as `supabase_admin`, applies repository migrations as `postgres`, commits product rows as `authenticated`, and reads through fresh restricted sessions. It refuses a database-name collision and an unrecognized migration inventory. CI invokes it after local Supabase starts; it is intentionally outside `verify:deploy`.

This proves preservation for the only applicable upgrade in the current inventory: spool baseline to additive print migration. No existing print-data migration is present, so print-upgrade preservation is not applicable. Transactional SQL tests, fresh HTTP login, clean rebuild evidence, and populated-upgrade evidence prove different things. These checks do not claim backup recovery, process-restart durability or future migration coverage. Reservation and settlement behavior remains outside Phase 1.

The project owner reviewed these results, the implementation and the cookbook, and approved phase closeout on 2026-10-14.
