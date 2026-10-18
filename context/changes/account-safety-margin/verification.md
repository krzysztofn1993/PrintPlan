# Account Safety Margin Verification

## Source revision

Phase 4 verification ran on the worktree based on `1bf9a73cc63947ecece0bf3eb907d403cdcbe1db` (the Phase 3 commit). The final Phase 4 commit SHA is recorded in the plan's Progress rows.

## Automated results

`npm run test:e2e` passed: 36 tests passed. The smoke passed with `BASE_URL=http://127.0.0.1:4322 npm run smoke` and reported `All auth smoke steps passed`. It proved account isolation, fresh-login persistence, an unchanged existing 88 g reservation and stock contribution after saving 5%, 84 g best-fit and manual reservations for new 80 g prints, witnessed direct RPC acceptance, witness-less direct RPC rejection, and the existing refresh/revocation checks.

The first smoke run exposed the configured-origin mismatch: local Supabase uses `auth.site_url` at `http://localhost:4321`, while the preview ran at `http://127.0.0.1:4322`. The smoke now accepts the validated local Auth origin and replays only the callback path and query through `BASE_URL`. An intermediate run ended with process status 129 during a wait, and a later retry was blocked after the host poweroff stopped Docker. After the environment recovered with Docker and local Supabase active, the complete smoke run passed.

The final Phase 4.3 gates passed:

- `npm run verify:deploy`: PASS. Hooks, auth, spools, prints, reservations and settings contracts passed; lint passed; Astro check reported 0 errors, 0 warnings and one existing unused-parameter hint; build passed.
- `npx supabase test db`: PASS. Four pgTAP files and 350 tests passed.
- `npm run test:reservations:concurrency`: PASS. All 13 interleavings passed and fixtures were cleaned.
- `npm run test:migrations`: PASS. The populated S-04 upgrade preserved product rows, the 88 g legacy snapshot and replay semantics; the scratch database was cleaned.

The deliberate-break check changed the settings save acknowledgement in the worktree from the expected `Safety margin saved at 0%` to a broken acknowledgement. The scoped `settings display saved values, validate boundaries, save explicitly, and persist after reload` browser test failed on that exact mismatch. The production component was then restored with `git checkout`; it has no diff and is not part of the Phase 4 staged set.

The SQL test `supabase/tests/account-settings.test.sql` passed as part of the four-file, 350-test `npx supabase test db` run. It asserts that an 80 g reservation confirmed after saving 9% stores a 9% margin while reserving 88 g.

## Browser recovery coverage

The browser suite covers saved-value display, invalid and boundary input, pending-save disabling, explicit save and reload, version conflict with retained draft, and a committed settings write whose acknowledgement is unreadable followed by a failed and successful authoritative read. Cross-tab cases cover 10%→5% changed-amount recovery in best-fit and manual modes, ineligible manual-choice replacement, 10%→9% same-amount confirmation, change-away-and-back, delayed obsolete preview rejection, and failed fresh-preview recovery. `tests/e2e/reservation-recovery.spec.ts` also proves that saving 5% leaves an existing 88 g reservation and its stock contribution unchanged. Report these as passing only after `npm run test:e2e` completes.

## Runtime prerequisites

Use the repository-pinned Node version from `.nvmrc`. Start local Supabase with the repository migrations applied and Mailpit available at `http://127.0.0.1:54324`. Configure `SUPABASE_URL` and the local anon or publishable `SUPABASE_KEY` in the environment, `.dev.vars`, or `.env`. `npm run test:e2e` owns its Chromium preview; `npm run smoke` targets the production preview at `BASE_URL` (default `http://localhost:4321`). Confirmation links may use the configured local Supabase `auth.site_url` origin; the smoke validates their callback and replays only the path and query through `BASE_URL`. The smoke restores the generated Account A setting with a fresh settings version and deletes only its own tracked prints and spools.

## Integration verification on `origin/master`

The branch was rebased onto `261fc502fae1cccf5c8548f05ed414335024dadd`, which adds print settlement migrations and flows. Migration `20261019000000_preserve_margin_with_settlements.sql` restores the saved account margin in settlement-aware preview and reservation RPCs, and removes the obsolete five-argument overload while keeping the witnessed reservation contract. The overload drop uses `IF EXISTS` so the migration also applies when a local database has recorded settlement before account settings.

The populated migration check now applies the complete sequence in a disposable database. It verifies that settlement preserves earlier product rows and active reservation snapshots, that legacy reservation requests retain their original fields with a `NULL` witness, and that settings changes, fresh witnessed reservations, legacy replay, and settled-print guards continue to work.

The local Supabase database already contained the settlement migration but not the earlier account-settings migration. `npx supabase migration up --local` correctly refused to insert that earlier migration; `npx supabase migration up --local --include-all` applied the additive account-settings and compatibility migrations without resetting the database. A first attempt exposed that the compatibility migration assumed the old reservation overload existed. After making that drop conditional, the migration applied and the test suite passed. No local product rows were reset.

Final integration gates passed:

- `npm run verify:deploy`: PASS. Hooks and native contracts passed; lint passed; Astro check reported 0 errors, 0 warnings and five unused-parameter hints; build passed.
- `npx supabase test db`: PASS. Five pgTAP files and 452 tests passed against local Supabase.
- `npm run test:reservations:concurrency`: PASS. All 30 observed-lock interleavings passed and cleaned their fixtures.
- `npm run test:migrations`: PASS. Fresh and populated database scenarios passed, including the saved-margin/settlement upgrade, and the scratch database was removed.
- `npm run test:e2e`: PASS on the complete rerun, 44 tests passed. The first complete run had one failure at the manual fallback test's immediate collection read; the same test passed in isolation and the full suite then passed without changing its assertions.
- `BASE_URL=http://127.0.0.1:4322 npm run smoke`: PASS. The first run reached settlement smoke and exposed its old witness-less reserve payload. Settlement smoke now reads a fresh preview and sends `expectedReservationGrams`; the full smoke then passed, including account settings, settlement, token expiry, refresh, and revocation checks.
- `git diff --check`: PASS.

The final repository-wide lint gate passed, including `scripts/account-settings-smoke.mjs`. Local preview and Supabase were stopped after verification; the Supabase volume was retained.

## Outstanding manual checks

- [ ] 4.4 Settings and reservation flows are usable with keyboard navigation in current Chrome and Firefox and on a phone, with readable feedback and no horizontal overflow.
- [ ] 4.5 The author verifies that saving 5% preserves an existing 88 g reservation and that a new 80 g reservation uses 84 g when enough eligible material is available.
