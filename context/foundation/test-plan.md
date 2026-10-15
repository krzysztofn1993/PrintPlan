# Test Plan

> PrintPlan test coverage and rollout evidence. Update the strategy when product risks change.
>
> Last updated: 2026-10-15

## 1. Strategy

1. **Cost × signal.** The cheapest test giving real regression signal wins. Reuse existing coverage; add only grounded gaps. Avoid unnecessary e2e or AI visual review.
2. **User concerns are first-class evidence.** Data loss and cross-account access are the author's priorities, with the same weight as document and churn evidence.
3. **Verify the scenario in the implementation.** The risk list guides investigation; inspect the current behavior and existing coverage before choosing a test boundary.

Approved 2026-10-14 against master `778a01e`. Accounts, stock and planned prints are implemented; reservations and settlement remain planned ([roadmap](roadmap.md)). No incidents reported. Likelihood uses churn as a proxy, not a claim of defects.

**Interview evidence (English paraphrases):**

| Question                   | Answer                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- |
| Q1: Main worries           | Losing filament/print data; access from another user's account.                 |
| Q2: Prior incidents        | None.                                                                           |
| Q3: Low-confidence changes | Too early to identify an area.                                                  |
| Q4: Other test gaps        | None beyond Q1.                                                                 |
| Q5: Exclusions             | Exact UI appearance, generated code, unimplemented reservations and settlement. |

**Hot-spot scope:** `src/`, `supabase/`, `scripts/`; 25 commits over 2026-09-14–2026-10-14. Exclude generated database types, fixtures, snapshots and locks; docs/archive/build output are outside scope. Directory counts are distinct commits; nested counts overlap.

- Files: `src/styles/global.css` (7), `src/components/Topbar.astro` (6), `scripts/smoke.mjs` (6), `src/pages/dashboard.astro` (5), `scripts/spool-smoke.mjs` (4).
- Directories: `src/components/` (10), `src/pages/` (10), `src/lib/` (10), `src/styles/` (7), `src/pages/api/` (6).

## 2. Risk Map

Evidence identifies scenarios; research locates failure paths. Impact: High = access/data loss; Medium = recoverable degradation; Low = cosmetic. Likelihood: High = frequent change/prior incidents; Medium = occasional change; Low = stable. Existing tests may already protect a risk.

| #   | Risk (failure scenario)                                                                                                   | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Another account or an anonymous caller accesses or mutates someone else's spools or prints.                               | High   | High       | Interview Q1; [PRD](prd.md) FR-001, Access Control; `src/pages/api/` — 6 commits/30d.                                                                                                                                                     |
| 2   | Acknowledged data disappears after rereads, relogin or applicable migration upgrades; deletion changes unrelated records. | High   | High       | Interview Q1; [PRD](prd.md) NFR persistence; [stock plan](../archive/2026-10-10-personal-filament-stock/plan.md) Desired End State; [print plan](../archive/2026-10-12-personal-planned-prints/plan.md) Desired End State, Phase 1.       |
| 3   | A stale or competing print edit overwrites a newer committed record.                                                      | High   | High       | [Print plan](../archive/2026-10-12-personal-planned-prints/plan.md) concurrent-edits contract; [verification](../archive/2026-10-12-personal-planned-prints/verification.md) concurrent-write evidence; `src/pages/api/` — 6 commits/30d. |
| 4   | Invalid quantities or altered labels misrepresent persisted stock or print requirements.                                  | High   | Medium     | [Stock plan](../archive/2026-10-10-personal-filament-stock/plan.md) Agreed product contract; [print plan](../archive/2026-10-12-personal-planned-prints/plan.md) Agreed product contract.                                                 |
| 5   | Session expiry, revocation or auth failure loses valid access or falsely reports success.                                 | High   | Medium     | [PRD](prd.md) FR-001, Access Control; [account-access plan](../archive/2026-10-09-verified-account-access/plan.md) Desired End State.                                                                                                     |
| 6   | Failed, conflicting or uncertain operations discard unsaved fields or allow unsafe repeat writes.                         | Medium | High       | [Print plan](../archive/2026-10-12-personal-planned-prints/plan.md) concurrent-edits contract; [Carbon collections plan](../archive/2026-10-12-carbon-terminal-spools/plan.md) Desired End State; `src/components/` — 10 commits/30d.     |

### Risk Response Guidance

| Risk | What would prove protection                                                                                   | Must challenge                                     | Implementation evidence to inspect                                                        | Likely cheapest layer                       | Anti-pattern to avoid                                          |
| ---- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------- |
| #1   | Two owners and anonymous access cannot read/mutate foreign records, including direct REST.                    | Login implies ownership.                           | Identity, restricted roles, grants/RLS, app/direct entry points, existing negative tests.  | SQL + HTTP integration.                     | Privileged-role assertions; mocked ownership.                  |
| #2   | Independent sessions retain committed values; deletion affects one ID; applicable upgrades preserve fixtures. | HTTP 200 or clean rebuild proves persistence.      | Committed state, independent reads, duplicate IDs, migration baselines, existing coverage. | SQL + HTTP integration.                     | UI state as oracle; reset as upgrade proof.                    |
| #3   | One same-version edit wins; loser conflicts; reread matches winner.                                           | Sequential saves prove atomicity.                  | Version rules, direct writes, affected rows, persisted values, concurrent smoke.           | SQL + HTTP integration.                     | Mock concurrency; status-only assertions.                      |
| #4   | Reject invalid grams; retain agreed Unicode/multicolour examples.                                             | Client validation protects every write.            | Independent field rules, create/edit boundaries, database normalization, fixtures.         | Node contracts + SQL integration.           | Expected values copied from production.                        |
| #5   | Valid refresh retains access; revoked sessions fail; outages preserve usable cookies and report failure.      | Initial login proves refresh and failure handling. | Token expiry, revocation, cookie/error boundary, existing smoke.                           | HTTP smoke + boundary contracts.            | Happy-path-only login; arbitrary sleeps.                       |
| #6   | Retain inputs; require discard consent; uncertainty clears only after a successful fresh read.                | HTTP smoke proves hydrated form recovery.          | Rendered transitions, request boundary, recovery and consent, accepted review decisions.   | Focused browser tests, subject to research. | Visual snapshots; mocked internal state; reopening skipped F1. |

## 3. Phased Rollout

Status vocabulary: `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`. Only Status and Change-folder cells advance outside a refresh. Phase 1's approved identifier is reserved for the queued `/10x-new` handoff; that command creates the folder.

| #   | Phase name                     | Goal (one line)                                                                                      | Risks covered | Test types                                              | Status       | Change folder                                                      |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------- | ------------ | ------------------------------------------------------------------ |
| 1   | Data isolation and persistence | Prove owner-only access and persistence through independent reads, sessions and applicable upgrades. | #1, #2        | restricted-role database integration + HTTP integration | complete     | context/archive/2026-10-14-testing-data-isolation-and-persistence/ |
| 2   | Mutation and session contracts | Prevent stale overwrites, invalid stored values and false authentication outcomes.                   | #3, #4, #5    | Node contracts + database/HTTP integration              | complete     | context/changes/testing-mutation-and-session-contracts/            |
| 3   | Browser mutation recovery      | Preserve entered data and safe recovery in hydrated forms after failures.                            | #6            | focused browser integration/e2e + scoped CI gate        | complete     | context/changes/testing-browser-mutation-recovery/                 |

Order: protect the author's priorities first, reuse cheaper contract/integration layers next, then cover browser-only behavior. Each change's final sub-phase fills §6 with verified patterns.

## 4. Stack

**Test-base profile:** `sparse` by file count: 3 native Node test files and 2 pgTAP SQL files; runner configured through [package scripts](../../package.json). [Archived verification](../archive/2026-10-12-personal-planned-prints/verification.md) records 45 Node and 158 SQL tests plus HTTP smoke. Historical passes were not rerun here; file count does not establish coverage gaps.

| Layer            | Tool                    | Version                    | Notes                                                      |
| ---------------- | ----------------------- | -------------------------- | ---------------------------------------------------------- |
| Contracts        | Native Node test runner | 24.21.0 pinned             | Existing; no extra unit runner.                            |
| Database         | pgTAP via Supabase CLI  | CLI manifest range ^2.23.4 | Existing local stack and restricted roles.                 |
| HTTP integration | Repository smoke        | repository-owned           | Built preview, local Supabase/Mailpit.                     |
| Browser recovery | Playwright candidate    | not installed              | Phase 3; research verifies additional signal before setup. |

App manifest ranges: Astro ^7.3.2, React ^19.2.6, Supabase SSR ^0.12.7/js ^2.99.1, Cloudflare adapter ^14.3.1; installed versions were not reverified.

**Stack grounding tools (current session):**

- Docs: Context7 MCP not available in current session; CLI checked official [Node runner](https://nodejs.org/docs/latest-v24.x/api/test.json), [Supabase database testing](https://github.com/supabase/cli/blob/develop/apps/cli/docs/supabase/test/db.md), and [Playwright request interception](https://github.com/microsoft/playwright/blob/main/docs/src/api/class-page.md). Research checks installed-version compatibility; checked: 2026-10-14.
- Search: Exa/web available; unused because official docs resolved through Context7; checked: 2026-10-14.
- Runtime/browser: Browser/Playwright MCP not available in current session; candidate local runner for Phase 3 only; checked: 2026-10-14.
- Provider/platform: Repository-specific GitHub/Cloudflare/Supabase MCP not available in current session; local git/config evidence used; checked: 2026-10-14.

## 5. Quality Gates

Existing gates come from [package scripts](../../package.json) and [CI](../../.github/workflows/ci.yml). New tests join the existing appropriate gate.

| Gate                                  | Where                       | Required?                       | Catches                                                                       |
| ------------------------------------- | --------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `npm run verify:deploy`               | local + CI-equivalent steps | existing                        | Node contracts, lint, types, build; expanded in Phases 1–2 as needed          |
| `supabase test db`                    | local + CI smoke job        | existing                        | Ownership, persisted values and database constraints; expanded in Phases 1–2  |
| `npm run smoke` against built preview | local + CI                  | existing                        | Real authentication, persistence and competing writes; expanded in Phases 1–2 |
| Focused browser recovery suite        | local + CI                  | planned, required after Phase 3 | Hydrated form input retention, discard consent and uncertainty recovery       |

## 6. Cookbook Patterns

### 6.1 Owner-isolation tests

Use both pgTAP and the built-preview smoke because they cover separate boundaries:

- `supabase/tests/spools.test.sql` and `supabase/tests/prints.test.sql` run with `npx supabase test db`. Create fixtures with database setup privileges, then make access assertions as `anon` or `authenticated` with native JWT subjects. Keep the suites transactional; rollback proves policy behavior within a test, not committed persistence.
- `scripts/spool-smoke.mjs` and `scripts/print-smoke.mjs` run through `npm run smoke` against a production preview, local Supabase and Mailpit. Use the confirmed A/B accounts and their separate cookie jars. Test anonymous app requests and direct REST requests with the anon/publishable key and no user bearer token; expect the authorization contract, not a malformed-token error.
- After a denied foreign or anonymous write, reread the complete victim record as its owner before making any permitted edit. Retain positive controls for both owners. Use returned IDs for guessed-ID attempts and verify the original owner cannot see, change or delete the foreign record.

Keep service-role or administrator access out of protection assertions. The existing two-owner, guessed-ID, print version/concurrency and field-validation cases remain useful and should be extended rather than replaced. This rollout does not cover reservation or settlement ownership rules that have not been implemented.

### 6.2 Persistence and targeted mutation tests

Retain the canonical values acknowledged by successful create and edit requests in snapshots keyed by record ID. Compare all editable fields, IDs, ownership where exposed, creation/update timestamps and print versions through separately issued API and restricted REST reads. Compare timestamps as instants and collections by ID, never by list order. After sign-out and a new login, compare the full expected collection again. After deleting one selected duplicate, assert that ID is absent and every same-owner and other-owner survivor still equals its expected snapshot.

Use `npm run test:migrations` for committed populated-upgrade evidence. It creates a generated scratch database inside the running local Supabase PostgreSQL container, restores native `auth` schema, applies the repository spool migration, commits fixtures as `authenticated`, reads them on fresh restricted connections, applies the actual print migration, and compares complete spool rows. The scratch database is removed on success and failure. The recognized inventory currently has no earlier print table, so print-upgrade preservation is not applicable; the runner refuses an unrecognized inventory until the scenario is extended.

Keep the evidence types distinct: transactional pgTAP rollback tests cover SQL policies; a fresh application login covers persisted HTTP values; a clean rebuild proves the migration chain builds from empty state; only the populated scratch upgrade proves existing committed spool rows survived this applicable upgrade. None of these claims backup recovery or survival across a server restart.

### 6.3 Mutation, field and session contracts

Reuse `scripts/print-contracts.test.mjs`, `supabase/tests/prints.test.sql` and the competing-write scenario in `scripts/print-smoke.mjs`. A real race sends two same-version edits, requires one success and one conflict, checks the committed version and rereads the winner. Sequential or mocked updates do not prove atomicity. Retain the actual-expiry refresh/revocation scenario in `scripts/smoke.mjs`: read JWT expiry, wait beyond it within the existing bound, prove token rotation and repeated identity, then reject a revoked expired session.

For numeric rules, use independent literal oracles from the accepted stock/print contracts: maximum 2147483647 g, minimum 1 g except stock edits may be zero. Extend both create/edit modes in native Node tests. In `supabase/tests/spools.test.sql`, run invalid owned updates as `authenticated` for negative, fractional, over-limit, non-finite and null values; compare the complete row against a pre-write snapshot after each rejection. Reread accepted maximum/zero edits. Transactional rollback proves database constraints, not durable persistence.

Text fixtures in both Node suites and both SQL suites preserve U+200B, U+2060, U+180E and decomposed e + U+0301. Include a composed spelling and a mixed listed-whitespace run next to a preserved character. SQL compares UTF-8 bytes after inserts and updates so collation equality cannot hide changed composition. Keep the existing multicolour order, ICU casing and 80/81-code-point examples.

For session failures, `scripts/auth-contracts.test.mjs` executes the production `createAuthMiddleware` factory with the installed SSR client. Inject client construction and cookie parsing; control HTTP only at the provider fetch boundary. Use safely expired cookies for token-refresh outages, valid cookies for user-lookup outages, and a fresh client/request with retained cookies to prove recovery. Assert final 503 versus sign-in redirect, retry/privacy headers, no cookie deletions, successful refresh-cookie emission on downstream redirects and early failures, credential-POST bypass, request-local isolation and unexpected causes. Keep missing/invalid-session and 429 controls. These deterministic tests do not claim real provider downtime or browser recovery.

Commands: `npm run test:auth`, `npm run test:spools`, `npm run test:prints`, `npx supabase test db`, `npm run verify:deploy`, and the existing built-preview `npm run smoke`. No additional runner or dependency is required.

### 6.4 Browser recovery tests

Run `npm run test:e2e` for the focused Chromium suite in `tests/e2e/`. Playwright builds and owns a production preview on port 4321 by default; set `E2E_PORT` to use another port. The suite requires local Supabase credentials in `.env` or `.dev.vars` and stays outside `verify:deploy`. See [test-stack.md](test-stack.md) for runner, preview, authentication and diagnostic details.

- `auth.setup.ts` validates the app and provisioning targets are the same local Supabase instance, creates a confirmed generated account, signs in through the real UI and saves private storage state. Each test context gets a fresh app session through the sign-in endpoint. Teardown deletes the generated account.
- `fixtures.ts` creates and reads records through authenticated app APIs, uses unique labels, records returned IDs in an ignored fixture ledger, and checks cleanup through fresh collection reads. Cleanup deletes remaining IDs and confirms deliberately deleted IDs are absent; any cleanup failure fails the suite. Provisioning does not reset the database.
- `spool-recovery.spec.ts` covers real server validation and canonical label persistence, held 503 retry/pending controls, a committed save with an unreadable acknowledgement, and a committed delete with an unreadable acknowledgement. Stock preserves uncertainty in the active form and provides navigation to a fresh SSR read; tests do not require print-style discard consent or a collection-wide guard after cancel/reopen.
- `print-recovery.spec.ts` covers invalid quantity feedback, a real stale-version conflict and explicit consent, a held committed create masked as a readable 503 with pending coordination and failed/successful list reads, network rejection, unreadable success and readable 500 acknowledgements, uncertain deletion, and generic retry consent after a genuine version advance. Prints retain a collection-level guard through cancel/reopen and failed reads.
- Faults are injected at browser HTTP boundaries with request forwarding where persistence is part of the scenario. Tests use real sessions, routes, DTO parsing and database writes; independent authenticated API reads are the persistence oracle. No React state mocks, status-only claims, arbitrary sleeps, or visual snapshots are used.
- The print refresh/write overlap reviewed as F1 remains excluded. Pending coordination starts from a held write; the suite does not test submission during a list read. Fault injection demonstrates client recovery behavior, not a hosted provider outage.

### 6.5 Per-rollout-phase notes

#### Phase 1 — Data isolation and persistence

- **Status:** complete; implementation, automated verification and manual closeout are finished.
- **Canonical tests:** `supabase/tests/spools.test.sql`, `supabase/tests/prints.test.sql`; `scripts/spool-smoke.mjs`, `scripts/print-smoke.mjs`, `scripts/smoke-utils.mjs`, `scripts/smoke.mjs`; populated-upgrade scenario in `scripts/migration-persistence.mjs`.
- **Commands:** `npx supabase test db`; `npm run test:migrations`; `npm run verify:deploy`; and `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` after `npm run preview -- --host 127.0.0.1 --port 4321`. CI runs the migration check in the existing smoke job after Supabase starts; it remains outside `verify:deploy`.
- **Assertion boundary:** SQL policies use `anon`/`authenticated` roles and native JWT subjects. HTTP uses real confirmed accounts, requests and restricted direct REST credentials; no mocked ownership oracle. Privileged access is limited to disposable database setup/cleanup.
- **Reuse and persistence pattern:** retain existing two-owner, guessed-ID, duplicate, validation and print-concurrency coverage. Compare acknowledged snapshots by ID through independent API/REST requests and a fresh login. Verify the deleted ID is absent and compare exact survivors for both owners.
- **Upgrade and limits:** the populated spool-to-prints upgrade preserves IDs, owners, normalized/generated colour values, grams and timestamps, then confirms the prints table exists and removes its scratch database. No print-data upgrade exists in the current inventory. Transaction rollback, fresh login, clean rebuild and populated upgrade remain separate evidence claims. See [Phase 1 verification](../archive/2026-10-14-testing-data-isolation-and-persistence/verification.md).

#### Phase 2 — Mutation and session contracts

- **Status:** complete; automated verification and author closeout passed; see [the active plan](../changes/testing-mutation-and-session-contracts/plan.md).
- **Canonical tests:** existing Node auth/spool/print suites and both pgTAP suites. The production middleware body is exposed through `src/lib/auth-middleware.ts`; `src/middleware.ts` wires the original adapter into it.
- **Reuse:** preserve the existing live competing-print edits, actual token expiry, rotation and revoked-session checks. Add only missing numeric edit, byte-preservation and middleware outage signals; see §6.3.
- **Evidence and limits:** [verification](../changes/testing-mutation-and-session-contracts/verification.md) records actual local outcomes and deliberate breaks. No remote CI, hosted outage or Phase 3 browser recovery is implied.

#### Phase 3 — Browser mutation recovery

- **Status:** complete; browser runner, local account lifecycle, recovery scenarios, automated verification and author manual closeout are complete. See [Phase 3 verification](../changes/testing-browser-mutation-recovery/verification.md).
- **Canonical tests:** `tests/e2e/spool-recovery.spec.ts` and `tests/e2e/print-recovery.spec.ts`; authentication and fixture lifecycle live in `tests/e2e/auth.setup.ts`, `tests/e2e/auth.teardown.ts`, `tests/e2e/fixtures.ts` and `tests/e2e/helpers/local-account.ts`.
- **Fixture lifecycle:** setup provisions one confirmed local-only account, performs UI sign-in and stores ignored state. Every independent test gets a fresh session through the application endpoint. Fixture records use authenticated application APIs and unique labels; the ledger tracks returned IDs for checked per-test cleanup. Teardown removes the generated account. The populated local database is never reset.
- **Fault boundary:** Playwright page routes hold, forward or alter browser-facing HTTP responses. Real server validation, stale version checks, successful writes and reads remain active. Committed-but-unconfirmed scenarios forward the mutation, mask only its acknowledgement, and inspect persisted values through an independent API read.
- **Stock and print differences:** Stock uncertainty remains tied to the active form and recovers through navigation to an SSR reread. Print uncertainty guards the collection across cancel/reopen and failed refreshes; print refresh actions require consent before discarding drafts. The skipped print F1 read/write overlap is still excluded.
- **Commands and CI:** `npm run test:e2e` owns its build and preview; `E2E_PORT` defaults to 4321. CI installs Chromium and runs this suite in the local Supabase/Mailpit job before the existing smoke preview. `verify:deploy` remains independent of Supabase.
- **Evidence and limits:** [Phase 3 verification](../changes/testing-browser-mutation-recovery/verification.md) must distinguish real local persistence, simulated acknowledgement failures, deliberate production breaks and unobserved remote CI. Remote CI is not claimed until a workflow run is inspected.

## 7. What We Deliberately Don't Test

- **Exact UI appearance/colours** — no visual snapshot/diff or AI vision budget. Behavioral browser tests remain in scope. Revisit if visual regressions become a priority. Source: interview Q5.
- **Generated source code** — no implementation-mirroring tests for generated artifacts. Existing type checks remain. Revisit if custom generator behavior becomes a product risk. Source: interview Q5.
- **Unimplemented reservations and settlement** — no tests against invented safeguards or future flows. Revisit when those roadmap slices are implemented. Source: interview Q5.
- **Previously skipped print refresh/write overlap F1** — retain the author's accepted decision; Phase 3 must not silently reopen it. Source: [archived review](../archive/2026-10-12-personal-planned-prints/reviews/impl-review.md), F1 triage.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-14.
- Stack versions last verified: 2026-10-14 against manifest/`.nvmrc`; installed versions not reverified.
- AI-native tool references last verified: 2026-10-14; none selected.

Run `/10x-test-plan --refresh` when a new top-3 risk emerges, tooling guidance is older than three months, the stack/runner changes, or §7 exclusions no longer match the author's priorities. Research corrections to §2 require the skill's explicit backport decision and never add code anchors.
