# Mutation and session contract verification

Branch: `testing-mutation-and-session-contracts` from `af2743c61cbc233bf86ecfe6e8d7a9ff08891745`. Date: 2026-10-15. Runtime: Node v24.21.0, installed dependencies, existing local Supabase and Mailpit.

## Scope

Research used two read-only workers for mutation and session evidence; implementation ran in the primary context. Production changes move the existing middleware body into a factory and retain its original client/cookie adapter. No schema, dependency, provider configuration or UI behavior was changed.

New checks cover numeric stock edits, byte-preserved Unicode labels, actual middleware outage/identity decisions, cookie/header finalization and recovery with a fresh request. Existing live concurrency, persistence, token expiry and revocation checks remain in use.

## Automated results

| Check                     | Result                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:spools`     | PASS — 15 tests                                                                                                                                                                           |
| `npm run test:prints`     | PASS — 19 tests                                                                                                                                                                           |
| `npx supabase test db`    | PASS — 219 tests across two transactional suites                                                                                                                                          |
| `npm run test:migrations` | PASS — committed restricted baseline, populated spool upgrade, fresh restricted reads and scratch cleanup                                                                                 |
| `npm run verify:deploy`   | PASS before and after deliberate breaks — auth 22, spools 15, prints 19; hooks 15 passed with 1 existing opt-in skip; lint, Astro check (64 files, zero errors/warnings) and build passed |
| Built-preview HTTP smoke  | PASS — private data scenarios, real competing edits, actual-expiry token rotation, repeat-request identity, revoked refresh rejection and logout denial                                   |
| Deliberate-break checks   | PASS — four meaningful regressions detected, production bytes restored, targeted checks and full native gate green afterward                                                              |

The database suites use native `anon`/`authenticated` roles and JWT subjects. Owned invalid stock edits compare the complete row against a pre-write snapshot. Unicode SQL assertions compare UTF-8 bytes after insert and update. Expected quantities and strings come from archived accepted contracts, not production constants or normalization functions. A focused read-only review found that updating the original Unicode fixtures to their existing values could pass without a write; the final tests seed separate edit rows with different plain values, require six affected rows, compare the resulting bytes and require print version 2.

## Reproduction

1. Use Node from `.nvmrc` and installed dependencies (`npm ci` for a clean installation).
2. Keep the existing local Supabase/Mailpit stack running and preserve ignored `.env`/`.dev.vars`. Build and preview require the local URL and anon/publishable key; never print those values. No reset or provider shutdown is required.
3. Run `npm run verify:deploy`, `npx supabase test db`, and `npm run test:migrations`.
4. Start `npm run preview -- --host 127.0.0.1 --port 4321`, then run `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.
5. Stop only the preview process started for this verification.

## Deliberate-break evidence

Four worktree-only production mutations each made its targeted new test fail:

1. Bypass the middleware outage branch: the user-lookup 503 test received a sign-in redirect and failed.
2. Change stock creation minimum to zero: the literal create/edit boundary test failed.
3. Apply NFC composition in stock label normalization: the decomposed-colour preservation test failed.
4. Apply NFC composition in print text normalization: the decomposed-name/colour preservation test failed.

Each mutation was restored unconditionally with `git checkout -- <file>` in a Python `finally` block; restored bytes were compared against the original staged bytes. Targeted numeric/Unicode tests passed after restoration. A full `verify:deploy` rerun passed after the break checks. No deliberate regression was staged or committed.

## Limits and manual closeout

- Controlled provider fetch exercises the installed SDK and production middleware factory. It is not a real provider outage or Cloudflare hosting check.
- Live smoke checks true concurrent writes and actual JWT expiry; Node query fixtures do not establish concurrency.
- Transactional SQL does not establish committed persistence; the existing populated-upgrade and HTTP fresh-login scenarios provide separate evidence.
- No remote CI run, hosted verification, browser mutation recovery or visual acceptance was performed. Build retained the existing sitemap warning about a missing `site` option; it is unrelated to these contracts.
- The author confirmed review of the tests, cookbook and evidence and approved both closeout commits on 2026-10-15. Rollout Phase 2 is complete; rollout Phase 3 is not started.

The preview started for this verification was PID 101073 and was stopped after smoke success. Existing Supabase containers and pre-existing processes were left running. Logs were kept outside the repository under `/tmp/printplan-phase2-*.log`; no credentials were included in the change artifacts.
