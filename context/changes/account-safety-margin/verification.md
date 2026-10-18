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

## Outstanding manual checks

- [ ] 4.4 Settings and reservation flows are usable with keyboard navigation in current Chrome and Firefox and on a phone, with readable feedback and no horizontal overflow.
- [ ] 4.5 The author verifies that saving 5% preserves an existing 88 g reservation and that a new 80 g reservation uses 84 g when enough eligible material is available.
