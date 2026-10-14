# Data isolation and persistence implementation plan

## Overview

Deliver rollout Phase 1 of `context/foundation/test-plan.md`: protect risks #1 (cross-account/anonymous access) and #2 (loss or unintended alteration of acknowledged spool/print data). Extend existing restricted-role database and HTTP integration coverage, add the applicable populated migration upgrade, and finish with verified §6 cookbook patterns.

Phase 1 implementation, automated verification, and the author's manual review are complete. The authoritative step-by-step status is recorded in `## Progress` below.

## Current State Analysis

The existing pgTAP suites use two owners and real restricted roles; the baseline passed 158 assertions on 2026-10-14. Existing HTTP smoke exercises real auth, CRUD, direct REST, foreign IDs, duplicate records, relogin and print concurrency. Reuse those scenarios and their fixtures.

Remaining gaps are anonymous spool SQL writes, anonymous HTTP mutations/direct REST, incomplete victim-side assertions, full saved-value comparisons after relogin/deletion, and populated migration preservation. SQL suites roll back their fixtures; existing migration evidence uses a clean rebuild. Neither is an independent committed upgrade oracle. Detailed evidence is in `research.md`.

## Desired End State

The database and HTTP gates exercise two independently authenticated owners and anonymous access. Anonymous callers cannot read or mutate product records; foreign guessed IDs cannot expose, change or delete another owner's records. Owner-side rereads prove denied attempts had no effect, while positive controls prove legitimate owner access still works.

Explicit create/edit expectations match acknowledgements, separate API and direct REST reads, and fresh-session rereads. Deleting a selected ID removes that record while retaining the exact values of same-owner duplicates and the other owner's records. A disposable in-place spool-to-prints upgrade retains committed spool data, including identity, ownership and timestamps.

§6 records the verified locations, commands, assertion boundaries, reused coverage and remaining limits. Rollout Phase 1 advances to complete after its verification and phase closeout; later rollout phases remain unchanged.

### Key Discoveries

- Anonymous spool SQL coverage checks SELECT only; print SQL already checks CRUD (`supabase/tests/spools.test.sql:30`, `supabase/tests/prints.test.sql:32`).
- Print B-to-A mutations lack an A-side oracle (`supabase/tests/prints.test.sql:672`).
- Print relogin/deletion check counts and IDs without comparing complete survivor values (`scripts/print-smoke.mjs:569`, `:607`).
- Real grants/RLS protect direct writes independently of app authentication (`supabase/migrations/20261010000000_create_spools.sql:78`, `supabase/migrations/20261012000000_create_prints.sql:104`).
- The known migration inventory has one applicable populated upgrade: spool baseline → additive print migration. There is no existing print-data upgrade to simulate.

## What We're NOT Doing

- Appearance/snapshot tests, generated-code tests, reservations or settlement tests.
- A new unit/browser runner or mocked ownership/persistence proof.
- Replacing useful existing SQL, HTTP, field-validation or concurrency coverage.
- New feature behavior, schema changes, hosted deployment, or resets of a populated local/remote database.
- Broadening into rollout risks #3–#6; their existing tests remain intact.
- Claiming backup recovery, server restarts, or unimplemented future print upgrades are covered.

## Implementation Approach

Follow cost × signal: expand real-role SQL only where its assertions are missing; strengthen existing HTTP scenarios for acknowledged committed data and fresh auth sessions; run the actual migration files against a separate populated test database. No production changes are planned. If a new test exposes a production defect, document the failing behavior and assess it against this plan before changing the product contract.

Use native Node, existing pgTAP/Supabase tooling and repository smoke utilities. Infrastructure privileges create fixtures and apply DDL; protection assertions use native `anon`/`authenticated` roles or ordinary user tokens with the local anon/publishable key. Keep all writes inside test fixtures and clean them up by owner and ID.

## Critical Implementation Details

### Committed state and fresh sessions

Do not use JWT switching in a rollback transaction as persistence evidence. HTTP reads must be separately issued requests; fresh-session checks must sign out and establish a new session, not clone a cookie jar. Keep expected records from acknowledged legitimate writes and update them when the existing print race selects its winner. Compare API/REST timestamps as instants rather than assuming identical serialization.

### Safe upgrade lifecycle

Use a generated scratch database in the existing local Supabase container, with the native auth schema restored from a schema-only dump. Local `supabase_admin` is needed for native auth ownership/ACL restoration and scratch lifecycle; use `postgres` for migration DDL and restricted roles for product writes/oracles. Never reset the source database or copy its user/product data. Drop only the unique database this invocation created, including on failure.

Create the scratch database explicitly with `OWNER postgres` and verify that `postgres` has CREATE permission on its `public` schema before applying repository migrations.

### Preview and fault checks

The existing port 4321 process is a stale development server. Stop that repository-local dev process in an orderly way, then build and launch production preview on `http://localhost:4321`. This origin is required by `supabase/config.toml:154`, the `.SiteURL` confirmation template and the smoke's confirmation-origin check; changing only `BASE_URL` to another port would fail auth prerequisites. The deliberate migration fault must run in the disposable database; never apply a broken migration to the main stack. Keep the fault unstaged and restore the migration file unconditionally.

## Phase 1: Close grounded isolation and persistence gaps

### Overview

Add the missing protection oracles to the existing suites, verify a populated upgrade, wire it into the database CI job, then document the verified patterns in §6. This is the single implementation phase for rollout Phase 1.

### Changes Required

#### 1. Restricted-role SQL gaps

**Files:** `supabase/tests/spools.test.sql`, `supabase/tests/prints.test.sql`

**Intent:** Prove the anonymous spool mutation boundary and verify print victims after foreign attempts. Preserve existing passing coverage rather than duplicating its fixtures.

**Contract:** Add anonymous INSERT/UPDATE/DELETE permission-denial assertions beside spool SELECT. For prints, reread the original A record as A after B's update/delete attempts and compare ID, name, material, colour, grams and version with its known prior state. Use affected-row assertions when useful, retaining victim-side rereads as the decisive oracle. Keep assertion roles restricted and the suites transactional.

#### 2. Anonymous and foreign HTTP access

**Files:** `scripts/spool-smoke.mjs`, `scripts/print-smoke.mjs`, `scripts/smoke-utils.mjs`, `scripts/smoke.mjs`

**Intent:** Exercise supported mutation entry points as anonymous callers and prove denied foreign/anonymous requests leave the owner's data intact. Use the current confirmed A/B account fixtures.

**Contract:** For each product collection, retain anonymous GET/page coverage and add valid anonymous create/update/delete requests, including known fixture IDs. Expect the app's private JSON `401/unauthenticated` contract. Add direct REST anonymous CRUD with no user bearer token; assert authorization denial, not a malformed-token failure. Extend the REST helper to intentionally omit `Authorization` when no user token is supplied. Retain anon/publishable-key validation.

After denied app/REST attempts, reread complete victim values as their legitimate owner before any permitted edits. Add B's owned spool as a positive control, prove A cannot read/mutate it, and retain it through A's deletion checks; reuse existing print B coverage, retaining its record long enough to serve as an unrelated-data control. Each scenario tracks created IDs by owner and cleans them up with that owner's ordinary session, including on failure.

Reserve a bounded cleanup window within the existing 300-second overall limit. Cleanup requests use a separate deadline signal that remains usable after the scenario deadline. If an owner's cookie jar is empty after signout, sign in again with that owner's existing credentials within the cleanup window, then delete only that owner's tracked IDs. Preserve the original scenario failure and report any cleanup failure alongside it. Verify cleanup with an induced scenario timeout and an induced failure after signout before fresh signin; record the results and any remaining fixtures in verification.md.

#### 3. Complete committed-value and targeted-deletion oracles

**Files:** `scripts/spool-smoke.mjs`, `scripts/print-smoke.mjs`, `scripts/smoke-utils.mjs`

**Intent:** Detect acknowledged writes that are lost or altered across independent reads or fresh sessions, and mutations that inadvertently affect another record.

**Contract:** Assert explicit requested/canonical values on create/edit, then retain acknowledged snapshots keyed by ID. Compare editable fields, IDs, creation/update timestamps and print versions through separate API and restricted direct REST reads. Assert REST ownership; compare timestamp instants. Reconcile collection snapshots without relying on list ordering.

After logout and new login, compare the full expected records, including unchanged duplicates and legitimate edits. After deleting one ID, independently assert its absence and exact surviving records for both owners, using a same-owner duplicate as a control. Verify duplicate create acknowledgements before any deliberate edit distinguishes the records. Update expected snapshots only on successful legitimate writes; retain the existing competing-print winner and validation/session assertions. API/REST persisted values are the primary oracle; preserve current SSR checks without adding appearance assertions.

#### 4. Populated migration-upgrade integration

**Files:** `scripts/migration-persistence.mjs` (new), `package.json`, `.github/workflows/ci.yml`

**Intent:** Prove the existing additive print migration preserves committed spool data and make that protection part of the existing database gate.

**Contract:** Add `npm run test:migrations` using native Node and local Docker/PostgreSQL tools. Derive the local Supabase database container from `supabase/config.toml`; generate a unique scratch database name internally and refuse collisions. Create the scratch database explicitly with `OWNER postgres` and verify that `postgres` has CREATE permission on its `public` schema before applying repository migrations. Restore the native auth schema only, apply `20261010000000_create_spools.sql`, bootstrap two auth identities, and commit product writes as `authenticated` with native JWT subjects. Include duplicate A spools, a committed correction to zero, and B's spool.

Read and validate complete baseline rows in independent restricted connections. Apply the actual `20261012000000_create_prints.sql` transactionally to that same populated database, then use fresh restricted connections to compare the full baseline rows, including generated colour keys, IDs, owners and timestamps. Confirm the print table was added. Assert roles used for protection do not bypass RLS. Fail when the migration inventory differs from the known pair until the scenario is extended. Report print-upgrade preservation as not applicable for this inventory.

Bound subprocess execution, fail on SQL/restore errors, and ensure cleanup cannot target the source database. Add the command to the existing smoke CI job after Supabase starts. Keep it outside `verify:deploy`, which is the native gate and does not start Docker. Avoid credential output and new dependencies.

#### 5. Verification evidence and cookbook completion — final implementation step

**Files:** `context/changes/testing-data-isolation-and-persistence/verification.md` (new), `context/foundation/test-plan.md`, this plan's `## Progress`, `change.md`

**Intent:** Leave evidence and reusable verified patterns so later phases can add tests without repeating this discovery.

**Contract:** Record actual gate results, the deliberate fault/restoration, fixture cleanup and remaining limits. After test verification, replace §6.1 and §6.2 placeholders and add the Phase 1 entry in §6.5: canonical test locations, runnable commands, restricted-role/real-HTTP boundaries, reuse decisions, snapshot/deletion pattern and the populated-upgrade lifecycle. Explicitly distinguish transaction rollback, fresh login, clean rebuild and populated upgrade evidence.

Preserve §1–§5 strategy and §7 exclusions; outside §6 advance only Phase 1's Status/Change-folder cells in §3. Retain Phase 2/3 placeholders. Complete §6 before phase closeout, and advance rollout Phase 1 to `complete` only when its required checks and closeout are finished. Execution state belongs solely in `## Progress`; preserve phase descriptions and change identity. Do not include unrelated user edits in a commit.

### Success Criteria

#### Automated Verification

- Restricted-role database coverage passes: `npx supabase test db`.
- Committed spool fixtures survive the applicable populated upgrade and the scratch database is cleaned up: `npm run test:migrations`.
- Native repository gates pass: `npm run verify:deploy`.
- Built-preview HTTP smoke proves anonymous/two-owner isolation, complete independent/fresh-session rereads and selected-ID deletion: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` after `npm run preview -- --host 127.0.0.1 --port 4321`.
- Deliberate-break check goes red: temporarily alter the actual print migration to change seeded spool grams, run `npm run test:migrations`, then unconditionally restore the unstaged migration fault and confirm the correct runner passes.
- Verification evidence and §6.1, §6.2 and Phase 1's §6.5 cookbook entry describe the verified commands, patterns and limits; Phase 2/3 scope and strategy remain intact.

#### Manual Verification

- Review the implementation/evidence and cookbook: confirm restricted assertion identities, exact survivor-value checks, disposable upgrade cleanup, CI wiring and no claims about unavailable print upgrades; approve phase closeout.

**Implementation note:** Begin in a fresh context per the author's latest instruction. Run the skill's gate sequence and explicit-path staging; keep deliberate faults unstaged and restore them on failure. Obtain the required human review/commit confirmation after the concrete implementation and evidence are ready. No browser appearance checks are required.

## Testing Strategy

### Existing native contracts

Run existing auth/spool/print/hooks contracts through `verify:deploy`; do not add generated-code or implementation-mirroring unit tests. Preserve the existing concurrency and field-validation tests.

### Database integration

Extend real-role pgTAP for missing access assertions. Use committed, separately connected owner reads in the disposable upgrade runner for populated preservation. Both are necessary because the transactional suites prove a different boundary.

### HTTP integration

Reuse the current verified auth accounts, production-preview request helper and direct REST client. No mocked Supabase responses. Explicit request expectations prove correct acknowledgement; retained acknowledgement snapshots prove subsequent preservation. Include legitimate owner operations as positive controls and compare victims/survivors after negative or targeted writes.

### Manual Testing Steps

Review the evidence and diff after automated gates. Check privilege boundaries, scratch cleanup and the new cookbook patterns; confirm phase closeout. The affected risks do not require a new UI acceptance or appearance exercise.

## Performance Considerations

Retain the smoke's existing 300-second total limit and bounded requests (`scripts/smoke.mjs:13`, `:34`). Reserve cleanup time inside that total limit and distinguish the scenario deadline from the cleanup deadline; exhausting the scenario budget must still allow bounded owner reauthentication and fixture deletion. Reuse current accounts instead of adding email-confirmation cycles. The upgrade runner reuses the local database container rather than starting a second stack; set bounded subprocess timeouts and retain the existing CI job timeout unless measured results justify changing it.

## Migration Notes

No production migration is added or rewritten. Existing migration files are test inputs. Source data and the source database remain untouched by the upgrade runner. A temporary deliberate fault is never committed or applied to the main database. Future migrations must extend the recognized upgrade scenario rather than silently inheriting a preservation claim.

## References

- [Research](research.md) — actual paths, reusable coverage, baseline and runtime limits.
- [Change intent](change.md) — risks and exclusions.
- `context/foundation/test-plan.md` — §2 risks, §3 rollout, §6 cookbook, §7 exclusions.
- `context/foundation/lessons.md` — commit messages describe intent without file lists.
- `scripts/smoke.mjs`, `scripts/smoke-utils.mjs`, `scripts/spool-smoke.mjs`, `scripts/print-smoke.mjs` — existing HTTP integration.
- `supabase/tests/spools.test.sql`, `supabase/tests/prints.test.sql` — existing restricted-role SQL.
- `supabase/migrations/20261010000000_create_spools.sql`, `supabase/migrations/20261012000000_create_prints.sql`, `supabase/config.toml` — upgrade inputs and local container identity.
- `package.json`, `.github/workflows/ci.yml` — gate wiring.

## Progress

> Completed steps retain their implementation commit identifiers for traceability.

### Phase 1: Close grounded isolation and persistence gaps

#### Automated

- [x] 1.1 Restricted-role database coverage passes: `npx supabase test db`.
- [x] 1.2 Committed spool fixtures survive the applicable populated upgrade and the scratch database is cleaned up: `npm run test:migrations`.
- [x] 1.3 Native repository gates pass: `npm run verify:deploy`.
- [x] 1.4 Built-preview HTTP smoke proves anonymous/two-owner isolation, complete independent/fresh-session rereads and selected-ID deletion: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` after `npm run preview -- --host 127.0.0.1 --port 4321`.
- [x] 1.5 Deliberate-break check goes red: temporarily alter the actual print migration to change seeded spool grams, run `npm run test:migrations`, then unconditionally restore the unstaged migration fault and confirm the correct runner passes.
- [x] 1.6 Verification evidence and §6.1, §6.2 and Phase 1's §6.5 cookbook entry describe the verified commands, patterns and limits; Phase 2/3 scope and strategy remain intact.

#### Manual

- [x] 1.7 Review the implementation/evidence and cookbook: confirm restricted assertion identities, exact survivor-value checks, disposable upgrade cleanup, CI wiring and no claims about unavailable print upgrades; approve phase closeout.
