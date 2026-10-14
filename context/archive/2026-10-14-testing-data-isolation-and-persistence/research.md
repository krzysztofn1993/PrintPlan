---
date: 2026-10-14T13:37:15+02:00
researcher: Codex
git_commit: 91890c8e518ff199db59979f90060274ca6cb6b0
branch: master
repository: PrintPlan
topic: "Rollout Phase 1: data isolation and persistence"
tags: [research, testing, ownership, persistence, migrations]
status: complete
last_updated: 2026-10-14
last_updated_by: Codex
last_updated_note: "Preview origin grounded in native email template and smoke origin check"
---

# Research: Data isolation and persistence

## Research Question

For risks #1 and #2 in `context/foundation/test-plan.md`, which real application/database paths are already protected, which gaps remain, and which tests give the cheapest useful signal? Cover anonymous and two-owner access, guessed IDs, direct REST, acknowledged values across independent reads and fresh sessions, targeted deletion, and applicable populated upgrades. Exclude appearance, generated code, reservations and settlement.

## Summary

Extend the existing pgTAP suites and authenticated HTTP smoke. Their real-role ownership tests and committed CRUD flows provide a useful base; a replacement runner or browser suite is unnecessary for these risks. The inspected gaps are anonymous spool SQL mutations, anonymous product HTTP mutations/direct REST, victim-side value comparisons after foreign attempts, full saved-value comparisons after relogin and deletion, and a populated upgrade scenario.

The migration inventory at this revision contains `20261010000000_create_spools.sql` and `20261012000000_create_prints.sql`. The applicable upgrade preserves committed spools while adding prints. Neither migration upgrades an existing print table; print-upgrade preservation is not applicable to this inventory. Sources: `supabase/migrations/20261010000000_create_spools.sql:14`, `supabase/migrations/20261012000000_create_prints.sql:14`.

Baseline verification on 2026-10-14: `npx supabase test db` passed **158 assertions across the two existing SQL suites**. This proves the current assertions pass, not that the gaps below are already protected. HTTP smoke and a populated upgrade were not run during research.

## Detailed Findings

### Identity and independent boundaries

`src/middleware.ts:27` validates the caller with `supabase.auth.getUser()` and places the result in `locals.user`. Protected dashboard handling at `:49` redirects missing identities. The six product API handlers inspected under `src/pages/api/{spools,prints}/` check authentication before their supported reads/writes. Authenticated access alone does not establish ownership: the service methods filter owner IDs, while grants and RLS independently govern direct database/REST access.

`src/lib/spools.ts:45` and `src/lib/prints.ts:52` filter collection reads by `user_id`; update/delete methods filter both owner and record ID. Print update additionally conditions on version (`src/lib/prints.ts:155`). Real restricted-role tests are therefore necessary alongside HTTP tests; mocked service clients cannot establish RLS protection.

For the inspected product tables, migrations enable RLS, revoke public/anonymous access, grant editable columns to `authenticated`, and define operation-specific ownership predicates using native `auth.uid()`: `supabase/migrations/20261010000000_create_spools.sql:78` and `supabase/migrations/20261012000000_create_prints.sql:104`.

### Restricted-role SQL coverage

Both suites use privileged fixture setup followed by `anon`/`authenticated` assertions with JWT subjects (`supabase/tests/spools.test.sql:8`, `:30`, `:40`; `supabase/tests/prints.test.sql:8`, `:32`, `:64`). Retain that boundary. Fixture privileges are not an authorization oracle.

- Spools deny anonymous SELECT (`spools.test.sql:32`) but lack anonymous INSERT/UPDATE/DELETE assertions. Prints already deny these operations (`prints.test.sql:34`–`:61`); reuse that pattern.
- Spools already verify B's guessed-ID update/delete through A's unchanged grams and retained ID (`spools.test.sql:468`–`:500`). Preserve those assertions.
- Prints attempt foreign mutations in both directions (`prints.test.sql:646`, `:672`). The B-to-A path checks invisibility while acting as B, but never switches back to A to verify the victim. An invisible row is consistent with both safe denial and unauthorized deletion. Add A's retained ID, editable values and version after those attempts. B's grams check at `:690` already protects the other direction; strengthen values where needed rather than duplicating scenarios.
- Existing duplicate insertion checks (`spools.test.sql:179`, `prints.test.sql:121`) establish separate records. Targeted deletion among identical records is more cheaply proved through returned HTTP IDs and complete survivor rereads.

The suites begin a transaction and end in rollback (`spools.test.sql:1`, `:505`; `prints.test.sql:1`, `:711`). JWT switching tests isolation inside that transaction; it does not prove committed state survives a separate connection or a fresh authentication session.

### HTTP and direct REST coverage

Reuse `scripts/smoke.mjs:731` and `:742`, which pass the existing confirmed A/B accounts and independent cookie jars into the spool and print scenarios. `scripts/smoke-utils.mjs:73` requires local Supabase with an anon/publishable key and rejects privileged keys. Its direct REST helper at `:163` currently always emits `Authorization: Bearer <token>`; anonymous checks must intentionally omit the user bearer instead of passing `undefined` as a token.

Existing spool coverage includes duplicates, B's foreign app mutations, direct REST foreign access, independent rereads, targeted deletion and logout/relogin (`scripts/spool-smoke.mjs:329`, `:433`, `:493`, `:504`, `:531`, `:546`). Print coverage includes B's own CRUD, foreign app/REST paths, updates, competing writes, relogin and deletion (`scripts/print-smoke.mjs:146`, `:275`, `:297`, `:338`, `:500`, `:569`, `:607`). Keep these tests and their concurrency/validation assertions.

Grounded HTTP gaps:

- Anonymous scenarios test collection GET and dashboard redirects (`spool-smoke.mjs:303`, `print-smoke.mjs:112`); they do not attempt valid create/update/delete requests against known owner IDs, or anonymous direct REST CRUD.
- Spool REST's post-denial check verifies the retained owner, without asserting the original grams/labels (`spool-smoke.mjs:208`). Print REST starts its own update without first verifying that the foreign attempts left the complete victim unchanged (`print-smoke.mjs:453`). Add exact owner rereads before legitimate edits.
- The spool scenario has no owned B spool. Reuse its two-account fixtures to add a B record, prove B can reread it and A cannot access it, and retain it through A's mutation/deletion checks. Avoid a separate account-creation harness.
- Print relogin currently verifies count and a primary ID (`print-smoke.mjs:595`), rather than the acknowledged name, labels, grams, version and timestamps. Print deletion similarly checks count and absence (`:609`) rather than exact survivor values.
- Spool relogin verifies ID/grams (`spool-smoke.mjs:565`), but complete labels/timestamps and independent REST agreement remain unasserted. Existing API/SSR rereads are useful, but stronger committed-value oracles should use separately issued API/REST requests and a newly established session.

Use explicit request expectations on creation/edit and retained acknowledged records for later equality comparisons. Sort collections by ID for set comparisons. For API versus REST timestamps, compare instants because their serialization may differ. Update expected snapshots only after acknowledged legitimate writes, including the existing print race winner. A failed/denied mutation must not change the expected snapshot. Compare survivors across both owners, including duplicate records, after deletion.

### Populated migration upgrade

The print migration adds a table and its policies/triggers without a spool data transformation. Existing archived verification reports `db reset` followed by SQL tests (`context/archive/2026-10-12-personal-planned-prints/verification.md:20`). That rebuild result supports migration-chain validity; it does not establish preservation of pre-existing committed fixtures.

Use a uniquely named disposable database inside the running local Supabase PostgreSQL container. Restore a schema-only dump of native `auth`, apply the actual spool migration, commit owner-created fixtures, reopen restricted connections for baseline reads, apply the actual prints migration to that same database, and reopen restricted connections for complete preservation comparisons. Retain normalized fields, generated colour keys, IDs, owners and timestamps. Seed duplicate A spools and a B spool, including a committed stock correction, so both ownership and existing editable state are represented.

Read-only runtime observations from the research worker on the running local cluster:

- `template1` contains no native `auth` schema.
- The inspected native `auth` schema-only dump uses built-in UUID generation and has no observed `extensions`/`vault` dependency.
- Native `anon` and `authenticated` roles report neither superuser nor RLS-bypass privileges.
- A local socket connection as `supabase_admin` works; use it for scratch database creation, native auth ownership/ACL restoration and cleanup. Use `postgres` for repository DDL and restricted roles for product writes and preservation assertions.

These observations establish a feasible implementation approach; scratch restoration and the complete upgrade have not yet been executed. Derive the local container from `supabase/config.toml:5`, use generated database names, refuse collisions, and clean up only a database created by this invocation. Do not expose a remote URL/reset option. Fail on an unrecognized migration inventory until the upgrade scenario is extended; avoid silently claiming future migrations are covered.

### Gate and environment evidence

`package.json` provides the native contract/lint/type/build gate through `verify:deploy` and existing HTTP integration through `smoke`. `.github/workflows/ci.yml:43` starts local Supabase and `:50` runs SQL tests; add the populated-upgrade command to this existing database job rather than introducing another stack. Keep it outside the native-only gate, which does not provision Docker.

Observed runtime versions: Node **24.21.0**, matching `.nvmrc`; installed Supabase CLI **2.117.0**. Current Context7 documentation was fetched for `/supabase/cli`; installed `npx supabase test db --help` confirms local/custom database and scoped-path support. Official references: [database tests](https://github.com/supabase/cli/blob/develop/apps/cli/docs/supabase/test/db.md), [CLI reference](https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md), [migration application](https://github.com/supabase/cli/blob/develop/apps/cli-go/pkg/migration/apply.go). The documented transactional test runner reinforces the distinction between rollback fixtures and committed upgrade evidence.

Local Supabase, Mailpit and restricted configuration are available. The existing process on port 4321 is an Astro development server returning HTTP 500 for a missing generated Vite module. This is not a product finding or a reason to change application code. Implementation should stop that stale local dev process in an orderly way, build, and start a production preview on the configured origin `http://localhost:4321`; do not reuse a stale dev response as smoke evidence.

Preview-origin follow-up: the preliminary free-port suggestion is superseded by the configured auth contract. `supabase/config.toml:154` fixes `site_url` to port 4321; `supabase/templates/confirmation.html:3` builds the delivered link from `.SiteURL`, and `scripts/smoke.mjs:370` requires the link origin to match `BASE_URL`. Changing only the preview port would fail confirmation-link verification. Reuse the configured port rather than changing auth setup for this phase.

## Code References

- `src/middleware.ts:27` — authenticated identity boundary.
- `src/lib/spools.ts:45`, `src/lib/prints.ts:52` — owner-filtered database reads.
- `src/pages/api/spools/index.ts:18`, `src/pages/api/prints/index.ts:21` — product API authentication.
- `supabase/migrations/20261010000000_create_spools.sql:78` — spool grants/RLS.
- `supabase/migrations/20261012000000_create_prints.sql:104` — print grants/RLS.
- `supabase/tests/spools.test.sql:30`, `supabase/tests/prints.test.sql:672` — narrow SQL gaps.
- `scripts/smoke-utils.mjs:73`, `:163` — restricted local REST boundary.
- `scripts/spool-smoke.mjs:531`, `scripts/print-smoke.mjs:569` — deletion/session persistence oracles to strengthen.
- `.github/workflows/ci.yml:43`, `package.json:18` — existing verification entry points.

## Architecture Insights

Use database integration for grants/RLS and a disposable populated upgrade; use existing HTTP integration for committed CRUD, independent reads and newly established auth sessions. No new browser or unit runner is needed for the inspected gaps. Keep privileged access confined to infrastructure/fixture setup and use real restricted identities for the protection assertions.

## Historical Context

The stock/print implementations established real-role SQL and two-account HTTP tests. Preserve their coverage rather than treating historical assertion counts as proof of completeness. The print archive's rebuild pass remains supported as a rebuild claim; interpreting it as populated upgrade preservation would exceed that evidence.

## Related Research

The active task and exclusions come from `context/foundation/test-plan.md`, particularly §2–§3 and §7. `context/foundation/lessons.md` requires intent-focused commit messages without changed-file lists.

## Open Questions

No unresolved product or test-layer decisions. Runtime scratch restoration, new negative assertions, HTTP smoke and fault detection are implementation gates, not research passes. The author confirmed one implementation phase and then requested starting that phase in a fresh context; this session saves research and planning only.
