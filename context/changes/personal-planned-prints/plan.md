# Personal Planned Prints Implementation Plan

## Overview

Deliver roadmap S-02: an authenticated user can create, view, edit, and delete their own unreserved planned prints. Persist manually entered material, colour, required grams, and an optional name. Protect edits from stale forms through optimistic version checks.

The author confirmed MEDIUM complexity, the five product decisions below, and these four phases on 2026-10-12. This plan covers preparation for implementation; no product implementation, commit, or deployment is included in this planning run.

## Current State Analysis

The research baseline is `41e27b6`; the current inspected revision is `2b021943fb3b4109f71edaf89acddb48b871a85a`. Stock CRUD, request-scoped authenticated Supabase access, restricted-role database tests, native Node contracts, and built-preview HTTP smoke already exist. No planned-print table, service, endpoints, or view exists in the inspected source/schema.

Carbon phase 1 is now committed: shared semantic tokens, fixed dark mode, controls, and navigation are available. Dashboard and stock presentations still have earlier palette overrides; Carbon phases 2–3 remain pending. New print views consume the existing semantic contract. Re-read overlapping navigation/dashboard files before implementation rather than replacing another change's work.

There is no domain glossary or lessons document. Domain terms come from roadmap S-02 and PRD FR-003/Business Logic. Reservations and reservation-aware edits belong to S-03/S-05. The dated roadmap baseline and AGENTS descriptions of absent stock persistence are superseded by the actual stock code.

## Desired End State

A signed-in user opens `/dashboard/prints`, sees only their planned prints, and manages each independently. Data survives refresh and logout/relogin. A planned print can be saved with no spools recorded or eligible; saving requirements neither reserves nor consumes stock.

### Agreed product contract

| Area                | Contract                                                                                                                                                                                         | Source                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Required grams      | Whole grams from 1 through 2,147,483,647 g, inclusive, on both create and edit; reject zero and fractions without rounding. This is the requirement before any safety margin.                    | Author, question 1 and range clarification                    |
| Optional name       | An optional editable name, up to 80 normalized Unicode code points; omitted, empty, or whitespace-only means no name. Preserve case.                                                             | Author, question 2                                            |
| Identical prints    | Identical fields, including names, are allowed on separate UUID-addressed records; each can be edited and deleted independently.                                                                 | Author, question 3 and deletion clarification                 |
| Display order       | `created_at DESC, id ASC`; editing does not move a print in the list.                                                                                                                            | Author, question 4                                            |
| Concurrent edits    | An edit succeeds only against the version the form read. A stale form receives 409 without overwriting the record, keeps its inputs, and requires reading the current print before another save. | Author, question 5                                            |
| Deletion            | Explicit item-specific confirmation; delete the selected ID. Version-based protection applies to editing, not deletion.                                                                          | Author, deletion clarification and accepted question 5 option |
| Material and colour | Free text with optional suggestions; reuse stock's normalization, matching semantics, and 1–80-code-point label bounds.                                                                          | Archived stock plan; research                                 |
| Privacy             | Derive ownership from the verified server identity; enforce it through owner-scoped queries, database privileges, and RLS.                                                                       | PRD Access Control; research                                  |

The gram maximum is a representation bound, not a physical model-size recommendation. Inputs `1`, `80`, and `250` are valid; `0`, `80.5`, and `2147483648` are invalid. Decimal digit strings with leading zeros are accepted; signs, exponent notation, separators, and surrounding numeric whitespace are rejected.

For names, `  Phone   holder  ` becomes `Phone holder`; an omitted or blank name is stored as null. Named cards show the name prominently and retain requirements/identifier. Unnamed cards use the material/colour requirement as their heading. Keep a readable identifier in both cases; names need not be unique.

**Shared text semantics:** normalize exactly U+0009–U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029, U+202F, U+205F, U+3000, and U+FEFF. Collapse each run to one ASCII space and trim ASCII edge spaces. Preserve other characters, punctuation, component order, and combining marks. Do not add Unicode composition, synonym merging, or transliteration.

The database supplies material UPPERCASE and a lowercase colour matching key using ICU root collation `"und-x-icu"`; preserve the normalized colour display case. Enforce material length after uppercase conversion. For example, `Straße` becomes `STRASSE`, while `Black / Red / Gold` remains one complete colour label. Names follow whitespace rules but are not uppercased or used for material matching.

### Key Discoveries:

- Dashboard descendants already inherit the page guard; APIs need explicit authorization (`src/lib/auth-response.ts:3`, `src/middleware.ts:50`).
- The request client and middleware finalize session cookies and accumulated headers; preserve that boundary (`src/lib/supabase.ts:10`, `src/middleware.ts:20`).
- Stock service already returns committed values, verifies affected rows, and distinguishes failed reads from empty lists (`src/lib/spools.ts:59`, `:85`, `:116`).
- Direct data writes are part of the security surface; TypeScript types do not replace grants and RLS (`supabase/migrations/20261010000000_create_spools.sql:78`).
- SDK status is separate from its error object; preserve it and safe cause diagnostics (`src/lib/spool-response.ts:136`, `:209`).
- Stock interactions retain uncertainty after field changes and coordinate pending transitions; preserve those lessons in print UI (`src/components/spools/SpoolForm.tsx:113`, `src/components/spools/SpoolInventory.tsx:46`).
- Carbon workspace/panel/typography classes and shared controls already exist (`src/styles/global.css:174`, `src/components/ui/FormField.tsx:18`, `src/components/ui/button.tsx:7`).
- Print smoke must run before auth expiry snapshots, and the local deployment verifier currently omits stock contracts (`scripts/smoke.mjs:734`, `:745`, `package.json:17`).

## What We're NOT Doing

- Reservations, spool assignment/eligibility checks, best-fit, margin calculation/settings, settlement, or reservation-aware editing/deletion. Their arithmetic and ordering decisions remain with downstream slices.
- A new print lifecycle/status model, priority queue, model files, printer integration, or import from G-code/3MF.
- Mandatory or unique names, deduplication warnings, synonym matching, or parsing multicolour components.
- Conflict merging, force-overwrite, record locks during editing, realtime synchronization, automatic mutation retries, or durable create idempotency.
- Optimistic locking for stock or print deletion, or requiring version predicates from every custom direct REST client. Database ownership, constraints, and version increments still apply to direct print writes.
- Pagination controls, search/filtering, an arbitrary print-count cap, offline editing, a new browser test framework, or a broad generic CRUD/validation refactor.
- Completing the separate Carbon restyle, schema changes to existing stock, or hosted deployment/remote database mutation.

## Implementation Approach

Follow the stock architecture: Astro SSR page → owner-scoped typed service → request Supabase client; React island → form-encoded authenticated endpoints → the same service. Keep print validation, service, and response mapping in dedicated pure modules so native Node checks can import them without introducing runtime alias dependencies.

Use an additive `public.prints` table and database-managed integer `version`. Update predicates include ID, verified owner, and expected version in the same database statement. The trigger increments version on every successful update, including unchanged field values and direct REST writes. An owner-only existence probe after zero affected rows distinguishes a conflict from a missing/inaccessible target; it never authorizes a later unconditional update.

Keep existing stock behavior unchanged. Reuse shared UI and label semantics, with print-specific DTOs and validation rather than importing spool entities or stock quantities. Initial SSR results remain readable before hydration; interactive mutations require JavaScript as in stock.

## Critical Implementation Details

### Version comparison and privacy

Do not read a version, compare it in application memory, and then issue an unconditional update. The write itself must filter on the expected version; incrementing the version must happen in that same database operation. Any subsequent existence probe is owner-scoped, maps its own failures, and cannot disclose another user's record.

### Framework and mutation boundaries

The installed framework can reject cross-origin forms with non-JSON 403 before application handlers, and unexpected session lookup failures can occur before endpoint finalization. Promise JSON/private headers for application-generated responses, and make the island handle unreadable/framework responses without exposing raw content. An uncertain mutation outcome must remain guarded after field changes; HTTP failure or smoke results alone do not prove browser interaction behavior.

## Phase 1: Database and Data Contracts

### Overview

Establish private print persistence with optional names, canonical requirements, immutable identity, and database-managed versions.

### Changes Required:

#### 1. Planned-print migration

**File**: `supabase/migrations/<timestamp>_create_prints.sql` (new)

**Intent**: Store unreserved print requirements independently of spools and reject invalid values even when application validation is bypassed.

**Contract**: `public.prints` has generated UUID `id`, `user_id` referencing `auth.users` with cascade deletion, nullable `name`, `material`, `colour`, generated `colour_key`, exact numeric `required_grams`, positive integer `version` defaulting to 1, and managed `created_at`/`updated_at`; all except name are non-null. Use unconstrained-scale numeric storage with integral/range checks so fractional input is rejected before any rounding/coercion. Normalize text as specified, enforce named name/material/colour/quantity constraints, and preserve ID/owner/creation time on updates. Increase version from the old value once per successful update, including no-op updates. Enable operation-specific owner RLS; revoke anonymous/public access; grant authenticated SELECT/DELETE, INSERT only owner/name/requirements, and UPDATE only name/requirements. Version, timestamps, identity, and derived keys are not client-editable. Add an index matching `(user_id, created_at DESC, id ASC)`; do not add uniqueness or spool/reservation relations.

#### 2. Schema types

**File**: `src/types/database.ts`

**Intent**: Extend the typed request client with the additive table without disrupting authentication or existing stock queries.

**Contract**: Regenerate public schema types after applying the migration. Represent nullable name, required grams, and version consistently with the table; retain the existing spool schema and client/cookie factory. Database grants, not generated optional fields, define permitted writes.

#### 3. Restricted-role database tests

**File**: `supabase/tests/prints.test.sql` (new)

**Intent**: Prove field and owner invariants independently of application endpoints.

**Contract**: Follow transactional pgTAP fixtures and explicit JWT identity/role switching from `supabase/tests/spools.test.sql`. Cover own CRUD, anonymous access denial, cross-owner read/update/delete isolation, forged ownership, blocked identity/timestamp/version reassignment, duplicate prints, omitted/blank/named values, null required fields, and all quantity boundaries on insert and update. Test name 80/81-code-point boundaries and unchanged case; canonical material/colour Unicode fixtures, multicolour order, and case-expansion length failures; default version 1, update to 2, no-op update increments, and stale conditional update changes zero rows. Restricted-role assertions must not use privileged access as evidence of authorization.

### Success Criteria:

#### Automated Verification:

- A disposable local database rebuild applies the additive migration with stock retained in the migration chain: `npx supabase db reset --local`.
- Restricted-role print and existing stock database contracts pass: `npx supabase test db`.
- Public schema types generated with `npx supabase gen types typescript --local --schema public` match `src/types/database.ts` after repository formatting.
- Existing auth/stock contracts and static checks pass: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npx astro check`, `npm run lint`.

---

## Phase 2: Operations and API

### Overview

Expose truthful owner-only CRUD, strict validation, private responses, and atomic optimistic editing.

### Changes Required:

#### 1. Print validation and service

**Files**: `src/lib/print-validation.ts`, `src/lib/prints.ts` (new)

**Intent**: Share print-specific field contracts between server and form and keep reads/mutations under one owner-scoped boundary.

**Contract**: Provide list/create/update/delete service functions using the typed request client and verified owner. `PrintDto` exposes `id`, `name: string | null`, `material`, `colour`, `requiredGrams`, `version`, `createdAt`, and `updatedAt`, excluding owner IDs, colour keys, spool quantities, and reservation fields. Create returns the committed row/version 1. Update accepts `expectedVersion` separately from editable fields, filters the write by ID/owner/version, and returns the committed row with its incremented version. A zero-row update probes only that owner's record: present → conflict, absent → not found, probe failure → database error. Delete requires a returned ID before reporting success and is owner/ID-scoped without a version predicate.

**Contract**: Form extraction requires exactly one text value for material/colour/requiredGrams, permits an omitted name, and rejects repeated/file-valued/unknown fields. Create disallows expectedVersion; edit requires exactly one decimal-digit integer expectedVersion from 1 through 2,147,483,647. Name blank normalization produces null; edit omission clears the optional name because updates replace all editable fields. Quantities follow the agreed digit-only grammar and inclusive bounds. Database case-conversion constraints remain authoritative and map to field errors. Lists retrieve all bounded 1,000-row batches in the agreed order; later-page failure discards the entire accumulated result. Stable batching is not a cross-request snapshot guarantee during other writes.

#### 2. Endpoints and response mapping

**Files**: `src/lib/print-response.ts`, `src/pages/api/prints/index.ts`, `src/pages/api/prints/[id]/update.ts`, `src/pages/api/prints/[id]/delete.ts` (new)

**Intent**: Give the island clear outcomes without confusing conflicts, missing records, outages, or uncertain writes.

**Contract**: GET `/api/prints` returns `{ prints }` with 200; POST creates and returns `{ print }` with 201; POST `/api/prints/:id/update` returns `{ print }` with 200; POST `/api/prints/:id/delete` accepts an empty form and returns `{ id }` with 200. Writes accept URL-encoded/multipart forms; reject unsupported media with 415, malformed/invalid fields or IDs with 422, and unsupported methods with 405/`Allow`. Check auth availability/user before processing editable input. Missing sessions return 401 with fixed `/auth/signin`; missing, deleted, and foreign targets share 404. A present owned record with a stale expectedVersion returns 409 with stable code `edit_conflict` and safe refresh guidance, without an overwrite or automatic rebase.

**Contract**: All application-generated API responses use stock's explicit private/no-cache/no-store directives, `Expires: 0`, and `Pragma: no-cache`; set the same protection on SSR data responses. Preserve SDK status separately, map transient failures to 503 with `Retry-After: 30`, and unexpected failures to generic 500. A mutation 5xx response cannot establish that no write committed; give safe guidance to refresh the print list before repeating the operation, including when the error JSON is readable. `Retry-After` does not authorize repeating an uncertain mutation; GET failures remain retryable. Report unexpected causes at API/page boundaries through bounded allowlisted diagnostics adapted to print source filenames, without provider messages, user input, URLs, or credentials. Preserve existing cookie/header finalization and distinguish framework-generated non-JSON errors from handler JSON.

#### 3. Native print contracts

**Files**: `scripts/print-contracts.test.mjs` (new), `package.json`

**Intent**: Verify validation, result truthfulness, conflict classification, and response mapping with the established native runner.

**Contract**: Add `test:prints` following the TypeScript-stripping command used by stock. Cover name absence/blank/Unicode limits, required-grams grammar and boundaries in both modes, strict form whitelists, create versus edit version requirements, committed values, owner predicates, missing affected rows, owned versus foreign/missing conflicts, and failure of the post-update existence probe. Exercise actual installed SDK failure/status shapes under controlled fetch and safe diagnostic output, including status-0 mutation results mapped to private JSON 503 with refresh guidance rather than an assurance that repeating the write is safe. Cover private headers and error codes, and list termination/completeness for 0/1,000/1,001 records with equal-time ID ties and later-page failures. Real database/concurrent-write behavior remains an integration check.

### Success Criteria:

#### Automated Verification:

- Print validation, owned mutations, conflict classification, pagination, and private response contracts pass: `npm run test:prints`.
- Existing auth/stock contracts and static/build checks pass: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.
- Restricted-role database contracts still pass with expected-version updates: `npx supabase test db`.

---

## Phase 3: Planned-Print View and Navigation

### Overview

Deliver usable list/create/edit/delete flows, preserve inputs on failure, and explain stale edits without silently overwriting them.

### Changes Required:

#### 1. SSR route and navigation

**Files**: `src/pages/dashboard/prints.astro` (new), `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Make planned prints discoverable beside filament stock and load their initial data through the protected server boundary.

**Contract**: SSR fetches owned prints, applies private headers, and hydrates the list with safe DTOs. Empty data and load failure are separate states; failures render 503/500 with retry guidance, never a successful empty list. Retain inherited sign-in redirects and auth-unavailable behavior. Add a `Planned prints` signed-in navigation link with current-route indication and a dashboard entry point; retain stock, identity, and sign-out controls. Reconcile current overlapping Carbon edits before changing these files.

#### 2. List, forms, and feedback

**Files**: `src/components/prints/PrintList.tsx`, `src/components/prints/PrintForm.tsx` (new)

**Intent**: Let users recognize and manage independent prints and recover safely from validation, conflicts, and uncertain requests.

**Contract**: Reuse `FormField`, `Button`, `cn()`, semantic feedback roles, and the Carbon workspace/panel contract; do not copy stock's older palette overrides. Use a decorative heading LED and highlighted principal panel, ordinary nested cards/forms, monospace metadata/grams, and sans-serif labels/body copy. Forms offer optional material/colour suggestions without requiring stock; name is visibly optional. Required grams use min 1, max 2,147,483,647, step 1 in both modes. All displayed requirements exclude the future safety margin; no stock availability or reservation result is implied.

**Contract**: Support empty/list/create/edit/delete-confirmation/pending/validation/request-error/conflict/success states. Name or fallback requirements plus an identifier distinguish entries; actions target exact UUIDs. Delete confirmation describes the selected entry and permits cancel. Keep local ordering identical to the server after mutations. Use returned committed records/IDs and validated versions; field errors are associated, first invalid field receives focus, successful transitions restore focus, and outcomes are politely announced.

**Contract**: A 409 retains the user's fields and old expectedVersion, explains that another save changed the print, blocks another submission from that stale form, and offers an explicit action to read the latest print. That action warns that refreshing discards unsaved fields; cancel/back navigation remains available. Do not silently replace only the version and resubmit stale values. Pending coordination blocks incompatible form/list transitions. After network failure, unreadable success, or any mutation 5xx response (including readable JSON 500/503), retain the uncertainty guard at list level through field changes and form cancellation/reopening until a successful fresh read; advise refreshing and reviewing the current list before repetition. A failed refresh must not clear the guard. GET failures remain retryable. Do not automatically retry writes. Handle 401/404/503 and non-JSON 403/generic failures without exposing raw response content.

### Success Criteria:

#### Automated Verification:

- Print, stock, and auth contracts plus static/build checks pass: `npm run test:prints`, `npm run test:spools`, `npm run test:auth`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.

#### Manual Verification:

- Keyboard add/edit/cancel/delete flows preserve labels, errors, inputs, announcements, visible focus, and focus restoration; pending or uncertain operations cannot be repeated through form transitions.
- Names are optional, unnamed/identical prints remain distinguishable, 80 g requirements are shown without a margin, invalid zero/fractional grams are rejected, and editing does not reorder the list.
- In two tabs, the first edit succeeds and the stale second edit shows a conflict with retained fields; refresh reads the saved version without silently applying stale values.
- At 390px and 320px widths, long names/material/three-colour labels and identifiers wrap, actions have at least 44px touch targets, and the page has no horizontal overflow.

**Implementation Note**: Record actual manual observations and obtain confirmation before advancing. Automated/HTTP checks do not establish React focus, input retention, or visual acceptance.

---

## Phase 4: Verification and CI

### Overview

Prove authenticated persistence, isolation, competing-write behavior, and supported-browser acceptance through the existing verification stack.

### Changes Required:

#### 1. Shared HTTP smoke extension

**Files**: `scripts/print-smoke.mjs`, `scripts/smoke-utils.mjs` (new), `scripts/spool-smoke.mjs`, `scripts/smoke.mjs`

**Intent**: Verify print behavior against the built application and real database while reusing the existing confirmed accounts, cookie jars, and bounded harness.

**Contract**: Extract only neutral local-config/private-response/REST/session/error helpers needed by both product smoke modules; retain stock-specific scenarios and DTO checks. The orchestrator still owns account setup, CookieJar, appRequest, and deadlines. Invoke `runPrintSmoke` with validated config/accounts/jars/requestSignal after stock scenarios and before fresh auth expiry capture. Use independent tracked print IDs and cleanup, because stock smoke removes its fixtures before returning.

**Contract**: Cover anonymous page/API access, SSR empty/populated states, optional/cleared names, canonical labels, duplicates, CRUD rereads, logout/relogin persistence, no-stock-required creation, strict fields/version payloads, zero/fraction rejection on create/edit, unsupported media/methods, hostile-origin rejection, and application private headers without a refresh cookie write. Exercise both users' data paths, inaccessible/nonexistent/deleted targets, and direct REST grants/RLS/constraints with local anon/publishable keys plus user tokens, never privileged isolation assertions. Direct edits must increment version and invalidate an older application form.

**Contract**: For one owned print, issue two competing HTTP updates using the same expectedVersion and independent usable cookie jars: exactly one returns 200, one returns 409, the final version increases once, and the persisted fields equal the winner. Verify a stale sequential retry also fails and an owned existence-probe failure cannot become a false 409/404 in native contracts. Keep expired/revoked-session checks intact; both jars must be usable with future expiry before capturing the existing deliberate expiry window.

#### 2. Gates and verification evidence

**Files**: `package.json`, `.github/workflows/ci.yml`, `AGENTS.md`, `context/changes/personal-planned-prints/verification.md` (new)

**Intent**: Enforce new contracts alongside existing auth/stock checks and leave honest implementation evidence.

**Contract**: Add `test:prints` to code-quality CI and both `test:spools`/`test:prints` to `verify:deploy`; keep directory-wide database tests and built-preview smoke integration. Update repository guidance to describe implemented print paths and the expanded commands without changing credential/session conventions or claiming a browser runner. Record revision, exact commands/results, concurrency outcome, browser versions/viewports, representative screenshots if available, and any pending coverage. Local results do not establish hosted CI/deployment success.

### Success Criteria:

#### Automated Verification:

- A disposable local migration rebuild and all database contracts pass: `npx supabase db reset --local`, `npx supabase test db`.
- The updated complete native verification gate passes on Node 24.21.0 after `npm ci`: `npm run verify:deploy`.
- Built-preview smoke passes print/stock/auth persistence, privacy, direct REST isolation, and exactly-one-winner concurrent editing within the existing run limit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual Verification:

- Current Chrome and Firefox support named/unnamed CRUD, deletion cancellation, refresh/logout/relogin persistence, and independent identical entries; another account cannot see them.
- Phone use and desktop keyboard checks confirm readable Carbon states, wrapping, focus, touch targets, retained invalid/conflicting inputs, and safe pending/uncertain behavior.
- The verification record contains actual automated and manual evidence and clearly identifies unperformed hosted/remote checks without claiming them as passed.

**Implementation Note**: Obtain manual acceptance before marking the implementation complete; leave unverified Progress rows pending.

---

## Testing Strategy

### Unit Tests:

Use native Node checks for boundary contracts, not new class-string tests. Named tests must cover optional-name clearing, positive whole-gram create/edit limits, stale expectedVersion rejection, owner-only conflict probes, true affected-row success, Unicode canonicalization errors, malformed successes, transient SDK status retention, and complete list reads. Preserve all existing stock/auth regressions.

### Integration Tests:

Use restricted-role pgTAP to prove database normalization/privileges/RLS/version management and built-preview smoke for real cookie sessions, API/SSR rereads, and simultaneous conditional writes. Actual concurrent requests must establish exactly one winner; sequential stale fixtures alone do not establish concurrency. Form focus, layout, and retained inputs require browser observations because HTTP smoke does not hydrate React.

### Manual Testing Steps:

1. Sign out and open the print route; confirm the sign-in redirect. Sign in with no stock and confirm the empty print state.
2. Add `pla` / `Black / Red / Gold` / 80 g with no name. Confirm canonical PLA, the complete colour, 80 g without a margin, and a visible identifier.
3. Add an identical print named `  Phone   holder  `; confirm `Phone holder`. Add another identical named print and verify separate IDs and actions.
4. Edit/clear the name and change required grams to 90. Verify name fallback and unchanged creation ordering. Reject zero, fractions, missing requirements, and overlong normalized names.
5. Open one print in two tabs at the same version. Save 90 g in one, then 100 g in the stale other: retain 90 g in the database, show 409 conflict, and retain the unsaved 100 g until explicit refresh/cancel.
6. Exercise validation, slow pending writes, network uncertainty, unreadable successful responses, readable JSON mutation 500/503, expired sessions, missing targets, and load failures through controlled local/browser fixtures; do not inject production failures. For a readable mutation 503, confirm that field changes and cancellation/reopening cannot repeat the write, a failed refresh retains the guard, and a successful fresh read exposes any saved print before repetition is available. Confirm GET failures can be retried.
7. Cancel one deletion, then confirm it; the other duplicate remains. Refresh and logout/relogin; verify saved state and isolation with another account.
8. Repeat representative flows in Chrome/Firefox and on a phone, including 390px/320px views, long text, keyboard navigation, focus restoration, and readable feedback. Record observations.

## Performance Considerations

The PRD targets a small user base. Use the owner/order index, SSR initial read, local UI updates, and bounded complete list batches with the configured 1,000-row response limit; add no polling or realtime subscriptions. The conflict path adds one indexed owner-only read only after a zero-row update.

The smoke already has a 300-second total deadline, 10-second request bounds, and a 180-second expiry-wait limit. Preserve those limits and measure the expanded run; consolidate redundant scenarios if necessary without dropping required coverage. Do not silently lengthen JWT expiry or move authenticated requests into the deliberate expiry wait.

## Migration Notes

Apply an additive versioned print migration after stock and regenerate schema types. Rebuild only a disposable local stack; do not reset a populated personal/hosted database. Existing spools remain unchanged and prints have no migration dependency on stock contents. Roll back application entry points while retaining stored print data rather than dropping the table.

Before S-03 ships reservations, it must make every database-accessible print/stock mutation safe, including print deletion releasing reservations. S-05 then supplies full reservation-aware editing. Those slices must preserve or deliberately adapt the version contract and increment it when changing editable requirements; this plan does not preselect their arithmetic, locking, or tie rules.

## References

- Scope/identity: `context/changes/personal-planned-prints/change.md`; `context/foundation/roadmap.md:124`; `context/foundation/prd.md:86`, `:110`, `:119`, `:127`.
- Research: `context/changes/personal-planned-prints/research.md`.
- Accepted text rules and review fixes: `context/archive/2026-10-10-personal-filament-stock/plan.md`; `context/archive/2026-10-10-personal-filament-stock/follow-ups/review-fixes.md`.
- Auth/client: `src/middleware.ts:7`, `:20`, `:50`; `src/lib/supabase.ts:10`; `src/lib/auth-response.ts:3`.
- Database/service/validation: `supabase/migrations/20261010000000_create_spools.sql:14`, `:32`, `:78`; `src/types/database.ts:5`; `src/lib/spools.ts:59`, `:116`; `src/lib/spool-validation.ts:23`, `:128`.
- HTTP/interaction: `src/lib/spool-response.ts:162`, `:209`; `src/pages/api/spools/index.ts:16`; `src/components/spools/SpoolForm.tsx:95`; `src/components/spools/SpoolInventory.tsx:30`.
- Shared UI/theme: `src/components/ui/FormField.tsx:18`; `src/components/ui/button.tsx:7`; `src/styles/global.css:174`; `context/changes/carbon-terminal-theme/plan.md`.
- Verification: `scripts/spool-contracts.test.mjs:6`; `supabase/tests/spools.test.sql:1`; `scripts/spool-smoke.mjs:418`, `:775`; `scripts/smoke.mjs:734`, `:745`; `.github/workflows/ci.yml:19`, `:49`; `package.json:17`.
- Stack: `context/foundation/tech-stack.md:24`; `supabase/config.toml:15`, `:36`, `:62`; `.nvmrc:1`.
- Current conditional-update evidence, retrieved with Context7 on 2026-10-12: [Supabase filtered update with returned row](https://github.com/supabase/supabase/blob/master/apps/ui-library/registry/default/blocks/headless-app-tanstack/supabase/functions/mcp/tools/tasks.ts) and [multiple equality filters](https://github.com/supabase/supabase/blob/master/apps/www/components/Realtime/examples/todo-example.tsx). The version/409 design is this plan's application contract, not an SDK-provided locking facility.

## Progress

> Convention: pending rows become done when verified. Append the closing commit SHA when a step lands. Do not rename step titles.

### Phase 1: Database and Data Contracts

#### Automated

- [x] 1.1 A disposable local database rebuild applies the additive migration with stock retained in the migration chain: `npx supabase db reset --local` — b36d527
- [x] 1.2 Restricted-role print and existing stock database contracts pass: `npx supabase test db` — b36d527
- [x] 1.3 Public schema types generated with `npx supabase gen types typescript --local --schema public` match `src/types/database.ts` after repository formatting. — b36d527
- [x] 1.4 Existing auth/stock contracts and static checks pass: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npx astro check`, `npm run lint`. — b36d527

### Phase 2: Operations and API

#### Automated

- [x] 2.1 Print validation, owned mutations, conflict classification, pagination, and private response contracts pass: `npm run test:prints`.
- [x] 2.2 Existing auth/stock contracts and static/build checks pass: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.
- [x] 2.3 Restricted-role database contracts still pass with expected-version updates: `npx supabase test db`.

### Phase 3: Planned-Print View and Navigation

#### Automated

- [ ] 3.1 Print, stock, and auth contracts plus static/build checks pass: `npm run test:prints`, `npm run test:spools`, `npm run test:auth`, `npx astro sync`, `npm run lint`, `npx astro check`, `npm run build`.

#### Manual

- [ ] 3.2 Keyboard add/edit/cancel/delete flows preserve labels, errors, inputs, announcements, visible focus, and focus restoration; pending or uncertain operations cannot be repeated through form transitions.
- [ ] 3.3 Names are optional, unnamed/identical prints remain distinguishable, 80 g requirements are shown without a margin, invalid zero/fractional grams are rejected, and editing does not reorder the list.
- [ ] 3.4 In two tabs, the first edit succeeds and the stale second edit shows a conflict with retained fields; refresh reads the saved version without silently applying stale values.
- [ ] 3.5 At 390px and 320px widths, long names/material/three-colour labels and identifiers wrap, actions have at least 44px touch targets, and the page has no horizontal overflow.

### Phase 4: Verification and CI

#### Automated

- [ ] 4.1 A disposable local migration rebuild and all database contracts pass: `npx supabase db reset --local`, `npx supabase test db`.
- [ ] 4.2 The updated complete native verification gate passes on Node 24.21.0 after `npm ci`: `npm run verify:deploy`.
- [ ] 4.3 Built-preview smoke passes print/stock/auth persistence, privacy, direct REST isolation, and exactly-one-winner concurrent editing within the existing run limit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.

#### Manual

- [ ] 4.4 Current Chrome and Firefox support named/unnamed CRUD, deletion cancellation, refresh/logout/relogin persistence, and independent identical entries; another account cannot see them.
- [ ] 4.5 Phone use and desktop keyboard checks confirm readable Carbon states, wrapping, focus, touch targets, retained invalid/conflicting inputs, and safe pending/uncertain behavior.
- [ ] 4.6 The verification record contains actual automated and manual evidence and clearly identifies unperformed hosted/remote checks without claiming them as passed.
