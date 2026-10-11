# Personal Filament Stock Implementation Plan

## Overview

Deliver roadmap S-01: an authenticated user can add, inspect, correct, and delete their own unreserved filament spools. Persist manually estimated stock and explain recorded, reserved, and available grams without suggesting that the estimate guarantees physical sufficiency.

This plan uses the existing research and the author's planning decisions confirmed on 2026-10-10. Complexity is MEDIUM; the author approved four substantive questions, one additional clarification about zero stock, and the four phases below. This artifact authorizes planning only; implementation follows separately.

## Current State Analysis

Account access is complete in archived F-01. The current revision matches the research baseline, `0b6adcb68d8b252c4bf57dd731b667c6ff698db2`. Middleware already verifies identity, supplies a request-scoped Supabase client, and finalizes cookie/header changes (`src/middleware.ts:7`). The dashboard is an authenticated placeholder (`src/pages/dashboard.astro:7`); no product table, migration, query, or spool interface exists in the inspected source and Supabase directories.

The stack already selects PostgreSQL migrations and per-user RLS. Existing form validation and native Node tests provide patterns; the HTTP smoke already establishes two independently authenticated accounts. No browser test runner is configured. The older AGENTS statement that there is no unit runner is superseded by `package.json:14` and `.github/workflows/ci.yml:19`.

## Desired End State

An authenticated user opens `/dashboard/spools`, sees only their inventory, adds a spool, corrects its fields or stock, and confirms deletion. Changes survive fresh requests, refresh, logout, and subsequent login. Empty inventory, invalid fields, expired authentication, missing records, and database failure have distinct feedback.

### Agreed product contract

| Area             | Contract                                                                                                                                               | Source                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Stock precision  | Whole grams; fractional values are rejected, never silently rounded.                                                                                   | Author, planning question 1                          |
| Zero stock       | Create requires at least 1 g; editing an existing spool permits 0 g.                                                                                   | Author, zero-stock clarification                     |
| Material         | Free text with suggestions such as PLA, PETG, ABS, ASA, TPU; normalized storage is UPPERCASE. Trim and collapse whitespace.                            | Author, planning question 3 and uppercase correction |
| Colour           | Free text with suggestions; retain the full normalized display name. Matching ignores case and redundant whitespace, without synonym or shade merging. | Author, planning question 4                          |
| Multicolour      | A name such as `Black / Red / Gold` is one valid colour label. Preserve its components and their order; do not reduce it to one colour.                | Author, explicit three-colour clarification          |
| Quantities shown | Reserved is 0 g in this slice; available equals recorded. A 150 g spool shows 150 g recorded / 0 g reserved / 150 g available.                         | Research; roadmap S-01 boundary                      |
| Privacy          | Verified owner identity plus database ownership enforcement, including direct authenticated data access.                                               | PRD Access Control; research                         |

Planner-selected technical bounds are 2,147,483,647 g maximum and 1–80 Unicode code points per normalized material/colour label. The gram maximum is a representation limit, not a claim about physical spool capacity. Reject values outside these limits with field feedback. Text normalization follows the explicit cross-layer contract below; punctuation is preserved. For example, `pla` becomes `PLA`, and `black   / red / gold` has the matching key `black / red / gold`. `Grey` and `Gray`, or `Black / Red / Gold` and `Gold / Red / Black`, remain distinct labels.

**Cross-layer label normalization**: Use the following explicit whitespace set in both TypeScript and SQL: U+0009–U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, and U+FEFF. Replace each run with one U+0020 space, then remove U+0020 at both ends. Do not rely on JavaScript `\s`/`trim()` or PostgreSQL `[[:space:]]` to define this set. Other characters, including punctuation and combining marks, remain unchanged; do not add NFC/NFKC normalization, transliteration, synonym matching, or colour-component reordering.

The database is authoritative for case conversion: use PostgreSQL 17 `upper` for material and `lower` for the colour key with explicit ICU root collation `"und-x-icu"`, rather than the database's default locale. Preserve the whitespace-normalized colour display name's case. Verify the collation exists during the disposable rebuild; absence is a migration prerequisite failure, not a reason to fall back to a different locale. Enforce 1–80 Unicode code points after canonical material uppercasing and after colour whitespace normalization. Count code points, not UTF-16 code units, and reject empty labels. TypeScript applies the same whitespace rules and prevalidates labels; it does not independently define stored material case or colour keys. Final material length validation belongs to the database because uppercasing can expand a label. Map named material/colour constraint failures to stable 422 field errors, retain submitted input, and render the committed database values returned by the write. This keeps application and direct REST writes under the same canonical rules without duplicating Unicode case tables.

Use the following expected cases in both database and Node contract checks. Node checks cover whitespace/code-point prevalidation and field-error/committed-value handling; actual canonical case conversion is verified against the database:

- U+FEFF followed by `Black`, U+0085 followed by `Black`, and U+00A0 followed by `Black` each normalize to colour display `Black` and key `black`.
- `Black` + U+0009 + U+0085 + `Red` normalizes to display `Black Red` and key `black red`; a label containing only the listed whitespace characters is invalid.
- Material `Straße` is stored as `STRASSE`; colour `İ` keeps its display name and has key `i` + U+0307; colour `ΟΣ` has key `ος`.
- 80 supplementary Unicode code points are within the colour limit; 81 are rejected. A material of 40 `ß` characters becomes 80 `S` characters and is valid; 41 becomes 82 and returns a material field error.
- `Black / Red / Gold` retains its complete display name and has key `black / red / gold`; reordered labels and `Grey`/`Gray` remain distinct.

Multiple spools may have identical material, colour, and stock. Each remains a separate UUID-addressed record; show a readable identifier alongside its quantities, and the full ID in edit/delete context when needed to distinguish otherwise identical entries. Do not introduce a mandatory spool name, manufacturer, diameter, price, or capacity.

### Key Discoveries:

- `/dashboard` and its descendants inherit the page guard; `/api/spools` requires its own authorization (`src/lib/auth-response.ts:3`, `src/middleware.ts:50`).
- Preserve the request client's cookie overlay and accumulated SDK headers when adding database typing (`src/lib/supabase.ts:9`, `src/middleware.ts:20`).
- Successful personalized responses need explicit cache protection; it cannot depend on session refresh occurring (`src/lib/auth-response.ts:17`; research, Auth integration).
- Current auth fields lack numeric constraints and associated accessibility errors, so use a shared stock field component rather than importing the auth component unchanged (`src/components/auth/FormField.tsx:8`).
- Local seed configuration references an absent file; make migration rebuilds reproducible without modifying auth settings (`supabase/config.toml:60`).
- The installed Astro origin check applies to form-like requests, not JSON. Keep form transport and verify cross-origin rejection against the installed version (research, Installed versus latest documentation).

## What We're NOT Doing

- Planned prints, reservations, margin calculation, best-fit selection, settlement, or reserved-spool edits. Reservation precision and tie-breaking remain S-03 decisions.
- Reservation tables or persisted reserved/available totals; both quantities are derived for this unreserved slice.
- Hosted deployment or remote database inspection/mutation; hosted verification remains F-02.
- A material/colour catalogue, colour HEX requirement, synonym inference, colour component parsing, or automatic equivalence between differently ordered multicolour labels.
- Extra spool attributes, global restyling, realtime updates, offline support, automatic mutation retries, or a new browser test framework.
- Printer integrations or print-file imports, as excluded by the PRD.

## Implementation Approach

Use an Astro SSR stock page for the first inventory read and a React island for forms and mutation feedback. Reuse `Astro.locals.user` and `Astro.locals.supabase`; the browser sends requests to the application rather than receiving privileged credentials. Ordinary form-encoded or multipart POST bodies preserve the installed origin-check coverage; stock endpoints return structured JSON so the island can keep entered fields after errors.

Keep shared normalization/validation, typed queries, and HTTP response mapping in small `src/lib/` modules. Use UUID-addressed individual spools, owner-scoped queries, explicit column privileges, and operation-specific RLS. Confirm affected rows before reporting an update or deletion as successful. Derived stock DTOs provide all three quantities without premature reservation infrastructure.

The UI supports pending and retry feedback through React; initial SSR inventory and explanations remain readable before hydration. Full mutation support without JavaScript is outside this implementation approach. Writes use normal database last-completed-write semantics for the same owner's concurrent edits; realtime conflict resolution is excluded. No reservation invariant depends on this behavior: S-03 must add atomic reservation-aware enforcement to all database-accessible mutation paths before reservations ship.

## Phase 1: Database and data contracts

### Overview

Establish reproducible private spool persistence, enforce the agreed field rules in the database, and type the existing request client.

### Changes Required:

#### 1. Spool migration

**File**: `supabase/migrations/<timestamp>_create_spools.sql` (new)

**Intent**: Store each physical spool separately and prevent invalid stock or ownership changes even when application validation is bypassed.

**Contract**: `public.spools` contains database-generated UUID `id`, `user_id` referencing `auth.users`, `material`, `colour`, derived `colour_key`, exact `recorded_grams`, and database-managed `created_at`/`updated_at`; all these fields are non-null. Stock is finite, integral, and in 0–2,147,483,647 g; INSERT additionally requires greater than zero, UPDATE allows zero. Use exact numeric storage without a scale coercion that rounds before validation. Database normalization enforces the cross-layer label contract, including its explicit whitespace set, ICU root case conversion, and named field constraints for final normalized lengths. Enable RLS, revoke anonymous access, grant authenticated SELECT/DELETE and only required INSERT/UPDATE columns, and index owner-scoped reads. SELECT/DELETE use owner `USING`; INSERT uses owner and positive-stock `WITH CHECK`; UPDATE checks both existing and resulting owner. IDs, ownership, derived keys, and timestamps are not owner-editable. Do not add material/colour uniqueness. Auth user removal cascades its spools.

#### 2. Generated schema typing and local rebuild

**Files**: `src/types/database.ts` (new), `src/lib/supabase.ts`, `supabase/config.toml`

**Intent**: Make product queries typed without replacing the working authentication client, and remove the missing-seed obstacle to reproducible local migrations.

**Contract**: Generate the public schema's `Database` type from local migrations and supply it to the existing server-client factory; `App.Locals.supabase` continues deriving its type from that factory. Preserve all cookie/header callbacks. Disable local seeding while there is no seed file; retain existing confirmation, expiry, and credential settings.

#### 3. Database contract tests

**File**: `supabase/tests/spools.test.sql` (new)

**Intent**: Prove ownership and field invariants independently of application endpoints.

**Contract**: Transactional pgTAP tests use separate account fixtures and execute assertions under `anon`/`authenticated` roles with explicit JWT identities. Cover own CRUD, cross-owner reads/update/delete, forged ownership and reassignment, null/blank/oversized labels, uppercase/whitespace normalization using every expected case in the cross-layer label contract, complete three-colour labels, duplicates, fractional/negative/non-finite/over-limit stock, zero INSERT rejection, and zero UPDATE acceptance. Privileged fixture setup is separate from restricted-role assertions; tests roll back their data.

### Success Criteria:

#### Automated Verification:

- A disposable local database rebuild applies the migration without a missing seed error: `npx supabase db reset --local`.
- Database ownership and field-rule tests pass under restricted roles: `npx supabase test db`.
- Regenerating public database types with `npx supabase gen types typescript --local --schema public` matches the committed `src/types/database.ts` after the repository's formatting convention.
- Existing auth contracts, type checks, and lint pass: `npm run test:auth`, `npx astro sync`, `npx astro check`, `npm run lint`.

---

## Phase 2: Stock operations and responses

### Overview

Expose authenticated stock operations with server validation, truthful results, private responses, and reusable query contracts.

### Changes Required:

#### 1. Shared field and read-model contracts

**Files**: `src/lib/spool-validation.ts`, `src/lib/spools.ts` (new)

**Intent**: Give server handlers and forms the same field rules and let the stock page and API use the same owner-scoped query boundary.

**Contract**: Validate exactly one string for each required form field; reject repeated/file-valued fields, malformed bodies, blank labels, fractional gram syntax, negative/non-finite values, and values beyond the documented bounds. Numeric input uses decimal digits, with no exponent, signs, grouping separator, decimal separator, or fractional syntax. Apply different create/edit minimums. Apply the explicit cross-layer whitespace normalization without splitting multicolour labels; the database supplies canonical UPPERCASE material and the case-insensitive colour key for S-02 reuse. Do not compute an independent JavaScript matching key. Map named database label constraints to field feedback and use returned canonical values. Queries take the request client and verified owner, never a submitted owner ID. DTOs expose `id`, material, colour, timestamps, recorded/reserved/available grams; reserved is always zero and available equals recorded. List ordering is `created_at DESC, id ASC` for stable display only. No reservation tie rule is implied. The shared list boundary used by the SSR page and GET API retrieves all batches within the configured response limit; a failed later batch fails the whole read rather than returning partial inventory.

#### 2. HTTP boundary and error mapping

**Files**: `src/lib/spool-response.ts`, `src/pages/api/spools/index.ts`, `src/pages/api/spools/[id]/update.ts`, `src/pages/api/spools/[id]/delete.ts` (new)

**Intent**: Support the island with explicit authorization and meaningful error feedback while preserving the existing auth finalization contract.

**Contract**: GET `/api/spools` returns `{ spools }` with 200; POST `/api/spools` creates and returns `{ spool }` with 201; POST `/api/spools/:id/update` returns the saved `{ spool }` with 200; POST `/api/spools/:id/delete` returns the confirmed deleted `{ id }` with 200. POST accepts only URL-encoded/multipart form data; reject JSON or other content types with 415. Only editable fields are accepted, with no client-supplied ownership or derived values. Missing/invalid sessions return JSON 401 and a fixed sign-in destination; auth outages return 503. Invalid UUID/payload/fields return 422 with stable field codes; inaccessible, deleted, and nonexistent UUIDs share 404. Classify known transient database failures as 503 with retry guidance; unexpected endpoint/database failures return 500 with a generic message and preserve the server cause without logging credentials or request bodies. A failed list never returns an empty success. Successful update/delete requires one returned affected row, not merely absence of an SDK error. Unsupported methods return 405 with `Allow`; GET never mutates. All application-generated stock API responses set `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, and `Pragma: no-cache`. Retain middleware cookie changes and SDK headers.

**Framework boundary**: The JSON error and cache-header contracts above apply to responses generated by application handlers. Installed Astro rejects cross-origin form submissions before application middleware with a non-JSON 403 and without these cache headers. Unexpected session lookup failures can also escape before endpoint execution and response finalization (`src/middleware.ts:45`). Keep these existing boundaries; do not promise endpoint-controlled JSON or cache headers for framework-generated responses. The island must handle such responses as described in Phase 3.

#### 3. Node contract checks

**Files**: `scripts/spool-contracts.test.mjs` (new), `package.json`

**Intent**: Test boundary cases and result mapping cheaply using the established native Node runner.

**Contract**: Add `test:spools` using the existing TypeScript stripping pattern. Test boundary validation, create/edit zero differences, material normalization, case/whitespace colour keys, preservation of `Black / Red / Gold`, distinct reordered labels, the cross-layer Unicode fixtures (including database case-expansion field errors and returned canonical values), no-row mutations, error versus empty-list results, unauthenticated/outage behavior, and cache headers. Use small controlled query fixtures for error mapping; database isolation remains covered by actual restricted-role tests. Pagination checks use 1,001 records and verify complete ordered results without missing or duplicate IDs. A later-batch failure must fail the whole read instead of returning partial inventory. Include equal creation timestamps to exercise the UUID ordering tie-break, and empty and exactly-1,000-record inventories to verify termination. The query fixture must honor the requested batching and ordering so a single unpaginated read cannot pass by receiving all records at once. Verify that the HTTP mapper returns the mapped failure status for a failed later batch, never a successful partial list.

### Success Criteria:

#### Automated Verification:

- Stock validation, response, and affected-row contracts pass: `npm run test:spools`.
- Real database constraints and isolation still pass: `npx supabase test db`.
- Auth contracts, sync, type checks, lint, and production build pass: `npm run test:auth`, `npx astro sync`, `npx astro check`, `npm run lint`, `npm run build`.
- Complete inventory pagination and later-batch failure contracts pass for 0, 1,000, and 1,001 records: `npm run test:spools`.

---

## Phase 3: Personal stock interface

### Overview

Make the verified stock operations usable on desktop and phone, with clear estimates and accessible form feedback.

### Changes Required:

#### 1. Protected page and navigation

**Files**: `src/pages/dashboard/spools.astro` (new), `src/pages/dashboard.astro`, `src/components/Topbar.astro`

**Intent**: Provide a discoverable stock entry point that uses the existing protected-page boundary and layout.

**Contract**: `/dashboard/spools` performs the initial owner-scoped read, applies the same private cache headers as the API, and renders the stock island with safe serialized DTOs. No-session page access retains the existing sign-in redirect; auth-unavailable retains 503. Database list failure renders an explicit retryable 503 or generic 500 state, never empty inventory. Add stock navigation on the dashboard and signed-in topbar; retain identity and sign-out controls.

#### 2. Inventory, forms, and deletion

**Files**: `src/components/spools/SpoolInventory.tsx`, `src/components/spools/SpoolForm.tsx`, `src/components/ui/FormField.tsx` (new)

**Intent**: Let the user change individual spools confidently without losing entered values on validation or network errors.

**Contract**: SSR inventory has labelled recorded/reserved/available values and a short explanation that recorded stock is an estimate, reservations set grams aside, and available is recorded minus reserved. Include empty, populated, submitting, validation-error, request-error, success, and delete-confirmation states. Forms provide material and colour suggestions while accepting arbitrary valid names; include a multicolour example. Create minimum is 1 g and edit minimum is 0 g, both step 1. Shared fields expose labels, constraints, `aria-invalid`, and described hints/errors using current tokens and `cn()`; reuse the existing Button. Update/delete actions target a specific ID; confirmation identifies the spool and provides cancel. Keep input on failure, associate field feedback, announce results, and manage focus after form transitions. Disable the active submit while pending; do not automatically retry mutations. Use the returned committed record/ID to update local inventory; an unsuccessful follow-up refresh must not imply that a confirmed write failed. Network uncertainty advises refreshing before another create. A 401 offers sign-in, a 404 explains that the spool is no longer available, and a 503 offers retry. Handle non-JSON and malformed responses without losing entered fields or exposing raw server content: a 403 explains that the request was rejected; other failures show a generic request-error message. An unreadable successful mutation response leaves the result uncertain, so advise refreshing before repeating the mutation. Wrap long and multicolour labels and maintain touch-sized controls without horizontal page scrolling.

### Success Criteria:

#### Automated Verification:

- Stock and auth contracts, sync, type checks, lint, and build pass: `npm run test:spools`, `npm run test:auth`, `npx astro sync`, `npx astro check`, `npm run lint`, `npm run build`.

#### Manual Verification:

- Desktop keyboard interaction supports add/edit/delete/cancel, visible focus, associated field errors, announced feedback, and retention of inputs after a failed save.
- At a phone viewport, long and three-colour labels wrap, controls remain usable, and the page has no horizontal overflow.
- The UI shows 150 g recorded / 0 g reserved / 150 g available with estimate explanations; create rejects 0 g and editing to 0 g retains the spool with zero available grams.

**Implementation Note**: After automated checks pass, obtain confirmation of this phase's manual verification before proceeding.

---

## Phase 4: End-to-end verification and CI

### Overview

Prove real authenticated persistence and isolation through the built application and direct data API, and record browser acceptance.

### Changes Required:

#### 1. Extend the existing HTTP smoke

**Files**: `scripts/spool-smoke.mjs` (new), `scripts/smoke.mjs`

**Intent**: Reuse the smoke's confirmed accounts, request helper, and cookie jars rather than create a competing auth integration harness.

**Contract**: Invoke a bounded stock scenario after accounts A/B can sign in and before capturing the JWT expiry windows for the existing refresh checks. Pass fixture identities and request/session access explicitly. Cover API and SSR CRUD, rereads, logout/relogin persistence, deletion, duplicate labels, uppercase material, complete three-colour names, zero differences, invalid/repeated/file-valued fields, unsupported JSON, missing/foreign targets, anonymous access, cross-origin form rejection, and no-store application responses without session refresh. The existing `appRequest` helper overwrites `Origin` (`scripts/smoke.mjs:212`); add an explicit hostile-origin option or a dedicated bounded request path so the rejection test actually sends a different origin. Assert the framework 403 separately from the application JSON/cache-header contract. Direct REST assertions use only local anon/publishable configuration and account access tokens to prove owner-scoped CRUD, forged ownership rejection, blocked reassignment, and database validation when application endpoints are bypassed. Read the same safe credential configuration as the app without printing keys, tokens, cookies, or personal payloads. Never use a service-role key for isolation assertions. Clean up created spools and retain existing auth smoke checks. Make expiry assertions use freshly confirmed valid tokens after the new scenarios; refresh through normal authenticated requests before calculating the wait if necessary. Preserve bounded run/request limits and fail clearly if local prerequisites are unavailable.

#### 2. Quality gates and verification record

**Files**: `.github/workflows/ci.yml`, `context/changes/personal-filament-stock/verification.md` (new), `AGENTS.md`

**Intent**: Keep new database/stock contracts enforced in CI and make the completed evidence discoverable.

**Contract**: Add `npm run test:spools` to the existing code-quality job and `supabase test db` after local startup in the integration job; retain built-preview smoke. Record exact commands/results and browser/device observations in the verification artifact, including incomplete checks truthfully. Update the existing repository guide's verification paragraph to mention native auth/stock contract tests, database tests, and the expanded smoke; retain the no-browser-runner fact. Remote Actions/hosted success requires observed evidence and remains separate from local acceptance.

### Success Criteria:

#### Automated Verification:

- A fresh disposable local database passes migrations and database tests: `npx supabase db reset --local`, `npx supabase test db`.
- All code-quality gates pass on Node 24.21.0 from `.nvmrc`: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.
- Built-preview smoke passes owner CRUD, logout/relogin persistence, direct REST isolation, hostile field requests, origin checks, and existing auth/session scenarios: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual Verification:

- In current Chrome and Firefox, a user completes add/correct/delete, sees truthful empty/error/success states, and sees persisted stock after refresh and logout/relogin.
- On a phone, add a PLA spool labelled Black / Red / Gold with 150 g, correct it to 0 g, cancel one deletion, then confirm deletion; labels, explanations, errors, focus, and controls remain usable.
- The verification record separates successful local checks and browser observations from any unperformed hosted or remote CI checks.

**Implementation Note**: After automated checks pass, obtain confirmation of the manual acceptance results before marking implementation complete.

---

## Testing Strategy

### Unit Tests:

Use the existing Node runner for public validation and response contracts. Include 0/1/maximum/above-maximum stock boundaries, decimal input rejection without rounding, repeated and file-valued fields, malformed bodies, uppercase material, colour normalization, and complete three-colour names. Test genuine failure outcomes: zero affected rows cannot claim success, database failure cannot become an empty list, and responses remain private without cookie refresh.

### Integration Tests:

Restricted-role pgTAP tests prove schema and RLS contracts independently of application validation. Built-preview smoke exercises actual cookies, middleware, endpoints, SSR, database state, and direct REST access using two different users. Preserve the existing session refresh/sign-out tests and their fresh-token timing assumptions. Simulated unit failures establish mapping behavior; they do not certify an actual provider outage.

### Manual Testing Steps:

1. Open the stock page while signed out and verify sign-in redirect; sign in and inspect the empty state.
2. Add `pla` / `Black / Red / Gold` / 150 g. Confirm material displays as PLA and the entire colour name remains visible with 150/0/150 g.
3. Add a second identical spool and verify separate record identities and independent editing/deletion.
4. Reject 150.5 g, blank labels, and 0 g on create. Correct an existing spool to 0 g and verify 0/0/0 g without deleting its record.
5. Refresh, sign out, and sign in again; verify the latest saved stock. Use a second account to confirm the inventory is independent.
6. Cancel deletion, then confirm deletion, and verify the record disappears on a fresh read. Check keyboard use and a phone as well as current Chrome/Firefox.

## Performance Considerations

The expected user has several spools and the declared user base is small. Use one owner-scoped initial read, an owner index, and local UI pending state; do not add realtime subscriptions or background polling. Supabase's configured maximum response size is 1,000 rows (`supabase/config.toml:15`): retrieve the complete inventory in bounded batches with stable ordering rather than silently omitting records at that limit. Preserve separate empty and failure states for every batch; do not introduce an arbitrary per-user spool cap.

## Migration Notes

The inspected repository has no existing product schema to migrate. Implement a versioned additive migration; regenerate types after applying it. Destructive rebuild checks target a disposable local stack only. Do not reset an existing personal or hosted database to verify the plan. Remote schema state was not inspected and deployment is outside S-01.

Rollback the application while retaining the additive table and stored data; do not drop users' stock as a rollback mechanism. Before S-03 enables reservations, upgrade every database-accessible stock mutation path to reject corrections below reservations and cancel reservations on deletion. Its migration must also decide reserved-spool material/colour edits. This plan settles stock entry precision, not reservation rounding, margin bounds, or best-fit ties.

## References

- Research: `context/changes/personal-filament-stock/research.md`.
- Scope and lineage: `context/changes/personal-filament-stock/change.md`; `context/foundation/roadmap.md:112`; `context/foundation/prd.md:80`, `:93`, `:110`, `:119`, `:127`.
- Stack: `context/foundation/tech-stack.md:24`; completed prerequisite: `context/archive/2026-10-09-verified-account-access/change.md` and `verification.md`.
- Auth and cache boundary: `src/middleware.ts:7`, `:20`, `:50`; `src/lib/supabase.ts:9`; `src/lib/auth-response.ts:3`, `:17`.
- Existing patterns: `src/lib/auth-validation.ts:41`; `src/components/auth/SignInForm.tsx:20`; `src/components/auth/FormField.tsx:8`; `src/components/ui/button.tsx:7`; `src/styles/global.css:6`.
- Verification infrastructure: `scripts/smoke.mjs:205`, `:567`, `:711`, `:730`; `scripts/auth-contracts.test.mjs:33`; `.github/workflows/ci.yml:19`, `:41`, `:90`; `.nvmrc:1`.
- Current [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security), [local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows), [generated types](https://supabase.com/docs/guides/api/rest/generating-types), and [database test CLI reference](https://supabase.com/docs/reference/cli/supabase-test-db). Resolved and checked through Context7 on 2026-10-10; retain the installed cookie adapter over differing quickstart examples.

## Progress

> Convention: pending rows become done when verified. Append the closing commit SHA when a step lands. Do not rename step titles.

### Phase 1: Database and data contracts

#### Automated

- [x] 1.1 A disposable local database rebuild applies the migration without a missing seed error: `npx supabase db reset --local`. — `ff23dfe`
- [x] 1.2 Database ownership and field-rule tests pass under restricted roles: `npx supabase test db`. — `ff23dfe`
- [x] 1.3 Regenerating public database types with `npx supabase gen types typescript --local --schema public` matches the committed `src/types/database.ts` after the repository's formatting convention. — `ff23dfe`
- [x] 1.4 Existing auth contracts, type checks, and lint pass: `npm run test:auth`, `npx astro sync`, `npx astro check`, `npm run lint`. — `ff23dfe`

### Phase 2: Stock operations and responses

#### Automated

- [x] 2.1 Stock validation, response, and affected-row contracts pass: `npm run test:spools`. — `5c6f3a7`
- [x] 2.2 Real database constraints and isolation still pass: `npx supabase test db`. — `5c6f3a7`
- [x] 2.3 Auth contracts, sync, type checks, lint, and production build pass: `npm run test:auth`, `npx astro sync`, `npx astro check`, `npm run lint`, `npm run build`. — `5c6f3a7`
- [x] 2.4 Complete inventory pagination and later-batch failure contracts pass for 0, 1,000, and 1,001 records: `npm run test:spools`. — `5c6f3a7`

### Phase 3: Personal stock interface

#### Automated

- [x] 3.1 Stock and auth contracts, sync, type checks, lint, and build pass: `npm run test:spools`, `npm run test:auth`, `npx astro sync`, `npx astro check`, `npm run lint`, `npm run build`. — `e112387`

#### Manual

- [x] 3.2 Desktop keyboard interaction supports add/edit/delete/cancel, visible focus, associated field errors, announced feedback, and retention of inputs after a failed save. — `e112387`
- [x] 3.3 At a phone viewport, long and three-colour labels wrap, controls remain usable, and the page has no horizontal overflow. — `e112387`
- [x] 3.4 The UI shows 150 g recorded / 0 g reserved / 150 g available with estimate explanations; create rejects 0 g and editing to 0 g retains the spool with zero available grams. — `e112387`

### Phase 4: End-to-end verification and CI

#### Automated

- [x] 4.1 A fresh disposable local database passes migrations and database tests: `npx supabase db reset --local`, `npx supabase test db`.
- [x] 4.2 All code-quality gates pass on Node 24.21.0 from `.nvmrc`: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.
- [x] 4.3 Built-preview smoke passes owner CRUD, logout/relogin persistence, direct REST isolation, hostile field requests, origin checks, and existing auth/session scenarios: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual

- [x] 4.4 In current Chrome and Firefox, a user completes add/correct/delete, sees truthful empty/error/success states, and sees persisted stock after refresh and logout/relogin.
- [x] 4.5 On a phone, add a PLA spool labelled Black / Red / Gold with 150 g, correct it to 0 g, cancel one deletion, then confirm deletion; labels, explanations, errors, focus, and controls remain usable.
- [x] 4.6 The verification record separates successful local checks and browser observations from any unperformed hosted or remote CI checks.
