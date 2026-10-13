---
date: 2026-10-12T12:31:22Z
researcher: Codex
git_commit: 41e27b6f776af65dbae5ed35e64847e4a08797a1
branch: master
repository: PrintPlan
topic: "personal-planned-prints: current contracts and planning handoff for roadmap S-02"
tags: [research, codebase, planned-prints, ownership, persistence, ui]
status: complete
last_updated: 2026-10-12
last_updated_by: Codex
last_updated_note: Initial research from roadmap S-02, current source, and archived stock decisions
---

# Research: Personal planned prints

**Date:** 2026-10-12T12:31:22Z, UTC clock observed during discovery.
**Researcher:** Codex.
**Git commit:** `41e27b6f776af65dbae5ed35e64847e4a08797a1`.
**Branch:** `master`.
**Repository:** PrintPlan.

## Research Question

What exists, which contracts can be reused, and which decisions remain before planning `personal-planned-prints`?

At initial discovery, no active or archived change with this identity was found in the inspected change identities. The supplied slug resolves to roadmap **S-02: Maintain planned prints**. Its scope is creating, viewing, editing, and deleting the user's unreserved planned prints with material, colour, and required grams. Sources: [roadmap:124](../../foundation/roadmap.md#L124), [PRD FR-003:86](../../foundation/prd.md#L86).

## Summary

- **The slice can build on implemented stock CRUD.** The inspected public migration/type schema and dashboard/stock route inventory contain spool persistence and UI, but no planned-print persistence, endpoints, or view. The stock service, page, and island provide reusable patterns for owned queries, committed-value responses, private reads, and inline mutations. Sources: [spool migration:14](../../../supabase/migrations/20261010000000_create_spools.sql#L14), [database types:5](../../../src/types/database.ts#L5), [stock service:59](../../../src/lib/spools.ts#L59), [stock page:21](../../../src/pages/dashboard/spools.astro#L21).
- **Privacy is an existing contract, not a new product choice.** Keep the verified session client, obtain ownership from the server, and enforce ownership through database policies and privileges as well as application queries. Sources: [PRD:127](../../foundation/prd.md#L127), [middleware:27](../../../src/middleware.ts#L27), [stock grants/RLS:78](../../../supabase/migrations/20261010000000_create_spools.sql#L78).
- **Material and colour semantics are already available for reuse.** The stock plan explicitly prepares canonical labels and a database colour key for S-02. Required-grams precision, minimum, and maximum are not explicitly settled for planned prints by that stock decision. Sources: [archived stock plan:130](../../archive/2026-10-10-personal-filament-stock/plan.md#L130), [stock quantity decisions:23](../../archive/2026-10-10-personal-filament-stock/plan.md#L23), [S-02 scope:126](../../foundation/roadmap.md#L126).
- **Reservations remain downstream.** S-03 must adapt deletion and other mutation paths when reservations become possible; complete reservation-aware print editing belongs to S-05. Sources: [roadmap slice boundary:110](../../foundation/roadmap.md#L110), [S-05:163](../../foundation/roadmap.md#L163).
- **The working tree includes unfinished Carbon theme work.** Shared controls and navigation already contain semantic styles, while the inspected stock page still contains the previous palette. Treat the shared theme contract as the UI integration point and coordinate edits to navigation. Sources: [theme identity:4](../carbon-terminal-theme/change.md#L4), [theme approach:52](../carbon-terminal-theme/plan.md#L52), [Topbar:6](../../../src/components/Topbar.astro#L6), [stock page:38](../../../src/pages/dashboard/spools.astro#L38).

## Detailed Findings

### Scope and terminology

The terms **planned print**, **material**, **colour**, and **required grams** come from S-02 and the PRD's manually entered print requirements, rather than inferred entity names. The PRD defines user-owned prints and persistence through refresh and later login. It requires usability on phones and current Chrome/Firefox. Sources: [roadmap:126](../../foundation/roadmap.md#L126), [PRD inputs:119](../../foundation/prd.md#L119), [quality requirements:110](../../foundation/prd.md#L110), [access control:127](../../foundation/prd.md#L127).

The inspected `context/` inventory contains no `context/foundation/lessons.md` or `context/domain/glossary.md`. No lessons or glossary priors could therefore be applied. Stock review fixes provide concrete known patterns below.

S-02 does not require an existing eligible spool before saving a planned print: the roadmap separates maintaining print requirements from reserving material. This is a scope inference from [S-02:126](../../foundation/roadmap.md#L126) and [S-03:138](../../foundation/roadmap.md#L138), not an implemented behavior. A stock-dependent create form would add an unstated restriction.

### Session and ownership boundaries

The request middleware constructs a cookie-aware typed Supabase client, obtains the user through `auth.getUser()`, and stores the client, user, availability state, cookie overlay, and response headers in locals. Its finalizer commits cookie changes and accumulated headers. A new data boundary can use this client without introducing a separate credential or session mechanism. Sources: [middleware:7](../../../src/middleware.ts#L7), [middleware:20](../../../src/middleware.ts#L20), [client:10](../../../src/lib/supabase.ts#L10).

`isProtectedDashboardPath` covers `/dashboard` and descendants, so a proposed `/dashboard/prints` route would inherit the existing redirect for missing sessions and unavailable-auth response. The API namespace is outside that predicate. Stock collection/update/delete handlers independently check availability and user identity before processing input; planned-print endpoints need equivalent checks. Sources: [dashboard predicate:3](../../../src/lib/auth-response.ts#L3), [middleware guard:50](../../../src/middleware.ts#L50), [collection handler:16](../../../src/pages/api/spools/index.ts#L16), [update handler:23](../../../src/pages/api/spools/[id]/update.ts#L23), [delete handler:18](../../../src/pages/api/spools/[id]/delete.ts#L18).

Stock inserts set `user_id` from the service's owner argument. Reads, updates, and deletes filter by owner; update/delete also filter by record ID. The service requires a returned affected row, translating an inaccessible or missing target into `not_found` rather than reporting success from a null SDK error. Sources: [insert projection:93](../../../src/lib/spools.ts#L93), [list query:48](../../../src/lib/spools.ts#L48), [update:123](../../../src/lib/spools.ts#L123), [delete:145](../../../src/lib/spools.ts#L145).

The spool migration enables RLS, restricts authenticated column grants, and uses operation-specific owner policies. The update trigger preserves ID, owner, and creation time. TypeScript `Insert`/`Update` types expose optional columns that the database grants do not permit clients to write; types do not replace authorization. Sources: [migration trigger:59](../../../supabase/migrations/20261010000000_create_spools.sql#L59), [grants and policies:78](../../../supabase/migrations/20261010000000_create_spools.sql#L78), [row write types:17](../../../src/types/database.ts#L17).

Current Supabase documentation confirms that `USING` checks existing rows, `WITH CHECK` checks resulting rows, and UPDATE requires a corresponding SELECT policy. Retrieved through Context7 using `library Supabase` followed by `docs /supabase/supabase` for owner-scoped CRUD. Source: [official RLS documentation](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/database/postgres/row-level-security.mdx). This confirms the database pattern; it does not verify a future print policy at runtime.

### Field contracts: reusable text, separate quantities

The accepted stock vocabulary is free text with optional suggestions. Material is stored in canonical uppercase; colour retains its normalized display case and has a generated lowercase matching key. Multicolour names retain components and order; synonyms are not merged. The stock plan explicitly identifies the colour key as preparation for S-02 reuse. Sources: [agreed stock contract:25](../../archive/2026-10-10-personal-filament-stock/plan.md#L25), [canonical reuse:130](../../archive/2026-10-10-personal-filament-stock/plan.md#L130).

In the inspected stock write path, TypeScript and SQL use the same explicit Unicode whitespace set. TypeScript counts code points and normalizes whitespace; SQL applies canonical case using ICU root collation and enforces the final label length. Stock material/colour limits are **1–80 normalized Unicode code points**, with the database checking material after uppercase conversion. Uppercasing can expand a label, so a passing client precheck is not the final constraint verdict. Sources: [validation:23](../../../src/lib/spool-validation.ts#L23), [code-point check:38](../../../src/lib/spool-validation.ts#L38), [migration constraints:23](../../../supabase/migrations/20261010000000_create_spools.sql#L23), [SQL normalization:32](../../../supabase/migrations/20261010000000_create_spools.sql#L32), [canonical contract:35](../../archive/2026-10-10-personal-filament-stock/plan.md#L35).

For spool stock, the application accepts decimal digits representing whole grams, with **1–2,147,483,647 g on create** and **0–2,147,483,647 g on edit**. The table constrains stock to nonnegative integral numeric values within that upper bound; its insert policy separately requires positive stock. These are stock-specific rules, not evidence that a planned print may be edited to require zero grams. Sources: [stock validator:66](../../../src/lib/spool-validation.ts#L66), [stock SQL constraint:25](../../../supabase/migrations/20261010000000_create_spools.sql#L25), [insert policy:91](../../../supabase/migrations/20261010000000_create_spools.sql#L91).

The inspected S-02/FR-003/Business Logic sources specify required material amount without a numeric acceptance range or explicit fractional policy. A positive whole-gram requirement using the stock representation bound is a possible planning choice, not an author-confirmed print rule. Reservation rounding remains a separate S-03 decision. Sources: [S-02:126](../../foundation/roadmap.md#L126), [FR-003:86](../../foundation/prd.md#L86), [print inputs:119](../../foundation/prd.md#L119), [S-03 unknowns:144](../../foundation/roadmap.md#L144).

Stock form validation accepts one string value per editable field and rejects unexpected, repeated, or file-valued fields. The planned-print boundary can preserve this structure with its own quantity name and whitelist. A print name/title is not specified by the inspected S-02 or PRD print-input list; making it mandatory would require a product decision. Sources: [form whitelist:26](../../../src/lib/spool-validation.ts#L26), [form extraction:121](../../../src/lib/spool-validation.ts#L121), [S-02:126](../../foundation/roadmap.md#L126), [PRD:119](../../foundation/prd.md#L119).

### Data queries and HTTP responses

Stock DTOs return ID, labels, timestamps, and displayed quantities without returning owner IDs. Insert/update reads the committed row, including database canonical values. For this unreserved stock path, `reservedGrams` is **0 g** and `availableGrams` equals recorded stock; those fields describe spools and should not become implied material reservations on a print. Sources: [DTO conversion:29](../../../src/lib/spools.ts#L29), [insert:85](../../../src/lib/spools.ts#L85), [update:116](../../../src/lib/spools.ts#L116).

The stock list service requests batches of **1,000 rows**, ordered by `created_at DESC, id ASC`, until a shorter page is returned. A failed later query returns a failure instead of its accumulated partial inventory. This is a list-completeness precedent, not a snapshot guarantee during concurrent changes or a best-fit tie policy. Sources: [batch size:5](../../../src/lib/spools.ts#L5), [ordered query:48](../../../src/lib/spools.ts#L48), [list loop:59](../../../src/lib/spools.ts#L59), [historical ordering scope:130](../../archive/2026-10-10-personal-filament-stock/plan.md#L130).

Observed stock routes use GET/POST on the collection and POST on explicit update/delete routes. Application responses distinguish unauthorized access, unavailable service, invalid input, missing target, unsupported media/method, and unexpected failure. They apply private cache headers and use stable error codes. These are reusable response structures; the constraint names, field names, messages, and destinations in `spool-response.ts` are stock-specific. Sources: [collection:16](../../../src/pages/api/spools/index.ts#L16), [update:23](../../../src/pages/api/spools/[id]/update.ts#L23), [delete:18](../../../src/pages/api/spools/[id]/delete.ts#L18), [private headers:25](../../../src/lib/spool-response.ts#L25), [constraint mapping:162](../../../src/lib/spool-response.ts#L162).

The service preserves SDK response status separately from the error object. The mapper uses that status for transient failures, retains a cause for unexpected failures, and reports sanitized diagnostics at API/page boundaries. Reusing the reporter mechanically would require adapting its known source filename filter to any new print modules. Sources: [query result status:56](../../../src/lib/spools.ts#L56), [failure mapping:136](../../../src/lib/spool-response.ts#L136), [reporter:209](../../../src/lib/spool-response.ts#L209), [filename filter:245](../../../src/lib/spool-response.ts#L245), [page reporting:25](../../../src/pages/dashboard/spools.astro#L25).

### UI, states, and active theme work

The stock page performs its initial owned read during SSR and passes committed data to a hydrated React island. It renders a retry alert for load failures rather than a successful empty inventory. In this inspected initial-load path there is no separate client list fetch or loading spinner. Sources: [stock page:11](../../../src/pages/dashboard/spools.astro#L11), [error branch:51](../../../src/pages/dashboard/spools.astro#L51), [island:69](../../../src/pages/dashboard/spools.astro#L69).

The island supplies inline create/edit forms, item-specific delete confirmation, an empty state, responsive item layout, controlled input retention, pending controls, field focus, and polite success announcements. It updates the list from the returned DTO and confirms deletion from the returned ID. Useful reuse anchors: [inventory state:30](../../../src/components/spools/SpoolInventory.tsx#L30), [saved row:104](../../../src/components/spools/SpoolInventory.tsx#L104), [delete result:146](../../../src/components/spools/SpoolInventory.tsx#L146), [empty state:218](../../../src/components/spools/SpoolInventory.tsx#L218), [form input/focus:95](../../../src/components/spools/SpoolForm.tsx#L95), [status region:194](../../../src/components/spools/SpoolInventory.tsx#L194).

Transport failures and unreadable successful mutation responses are treated as uncertain outcomes. The mounted form blocks repeat submission and offers refresh guidance; changing a field preserves uncertainty. This is a local interaction guard, not durable idempotency across cancelling/reopening, page loads, or retries from another client. Sources: [form guard:129](../../../src/components/spools/SpoolForm.tsx#L129), [uncertain save:152](../../../src/components/spools/SpoolForm.tsx#L152), [field edits:113](../../../src/components/spools/SpoolForm.tsx#L113), [delete uncertainty:119](../../../src/components/spools/SpoolInventory.tsx#L119). The form also handles unreadable response bodies, so planned-print UI must not assume that a framework failure contains application JSON ([form response parsing:161](../../../src/components/spools/SpoolForm.tsx#L161)).

Generic `FormField` supplies label/input association, hints/errors, invalid state, refs, and semantic styles. `Button` supplies semantic variants and focus behavior. Optional material/colour suggestion arrays currently live inside `SpoolForm`, rather than an exported shared vocabulary component. Sources: [shared field:18](../../../src/components/ui/FormField.tsx#L18), [Button:7](../../../src/components/ui/button.tsx#L7), [suggestions:26](../../../src/components/spools/SpoolForm.tsx#L26).

Navigation currently links dashboard and stock; the dashboard CTA points to stock. Proposed print navigation would touch `Topbar.astro` and possibly `dashboard.astro`. The former is already modified by Carbon work, whose plan also targets the dashboard/stock presentation. Sources: [Topbar:14](../../../src/components/Topbar.astro#L14), [dashboard CTA:20](../../../src/pages/dashboard.astro#L20), [theme consumer scope:132](../carbon-terminal-theme/plan.md#L132).

The inspected working tree has Carbon semantic feedback roles and shared workspace/panel/label/value decorations. Its stock page/cards still contain cosmic/white/blue palette classes that the theme plan schedules for replacement. The planning handoff should consume shared theme tokens/components and reread overlapping files before edits. This is observed unfinished theme integration, not a verified visual result. Sources: [global feedback roles:138](../../../src/styles/global.css#L138), [Carbon components:174](../../../src/styles/global.css#L174), [stock styles:38](../../../src/pages/dashboard/spools.astro#L38), [theme approach:52](../carbon-terminal-theme/plan.md#L52).

### Future reservation seam

The inspected migration, public database types, and spool service do not implement a print/reservation relation or reservation RPC. Their present stock reads explicitly use an unreserved DTO. Scope: [migration:14](../../../supabase/migrations/20261010000000_create_spools.sql#L14), [public types:5](../../../src/types/database.ts#L5), [Functions:43](../../../src/types/database.ts#L43), [stock DTO:29](../../../src/lib/spools.ts#L29).

S-03 owns making existing mutations safe when reservations are introduced, including cancelling reservations on planned-print deletion. S-05 adds automatic recalculation after editing a reserved print. The PRD requires retaining an eligible manual spool or attempting best-fit; an edit with no eligible spool remains saved and releases the prior reservation. Sources: [roadmap boundary:110](../../foundation/roadmap.md#L110), [S-05:165](../../foundation/roadmap.md#L165), [PRD reservation edits:121](../../foundation/prd.md#L121).

Because current stock grants permit direct authenticated data writes, future reservation invariants must address database-accessible writes as well as application endpoints. The stack decision places reservation/settlement operations in PostgreSQL functions exposed through RPC. This is a downstream architectural constraint, not a reason to implement reservations in S-02. Sources: [authenticated grants:80](../../../supabase/migrations/20261010000000_create_spools.sql#L80), [chosen stack:24](../../foundation/tech-stack.md#L24), [S-03:136](../../foundation/roadmap.md#L136).

### Verification available for implementation planning

The inspected verification layers currently target auth and stock. They do not establish planned-print behavior:

- Node contract files exercise strict payloads, Unicode labels, committed values, missing affected rows, list pagination, error/cache mapping, and actual installed SDK failures under controlled fetch. Print-specific counterparts can follow these patterns. Sources: [stock tests imports:6](../../../scripts/spool-contracts.test.mjs#L6), [SDK failures:169](../../../scripts/spool-contracts.test.mjs#L169), [mutation truthfulness:390](../../../scripts/spool-contracts.test.mjs#L390), [pagination:446](../../../scripts/spool-contracts.test.mjs#L446).
- Database tests create transactional fixtures and switch to anonymous/authenticated roles with explicit JWT identity. Print constraints and RLS need equivalent restricted-role checks; mocked query tests do not prove database enforcement. Source: [database suite:1](../../../supabase/tests/spools.test.sql#L1).
- `runSpoolSmoke` uses the authenticated accounts, cookie jars, application requests, direct REST checks, persistence checks, and cleanup. Direct isolation uses local anon/publishable credentials and user tokens. Sources: [smoke entry:418](../../../scripts/spool-smoke.mjs#L418), [local key restriction:60](../../../scripts/spool-smoke.mjs#L60), [REST check:175](../../../scripts/spool-smoke.mjs#L175), [persistence:714](../../../scripts/spool-smoke.mjs#L714), [cleanup:775](../../../scripts/spool-smoke.mjs#L775).
- Add product smoke scenarios before fresh auth-expiry capture, preserving usable sessions. Stock smoke already runs at that location. Sources: [smoke call:734](../../../scripts/smoke.mjs#L734), [expiry capture:745](../../../scripts/smoke.mjs#L745).
- CI runs native auth/stock checks, sync, lint, type checking, and build; its integration job runs database tests and built-preview HTTP smoke. `verify:deploy` currently includes auth checks but omits stock checks, so that command is not equivalent to the CI gate. Sources: [CI:19](../../../.github/workflows/ci.yml#L19), [integration:49](../../../.github/workflows/ci.yml#L49), [package scripts:17](../../../package.json#L17).

The inspected package scripts/dependencies and workflow do not configure a browser runner. HTTP smoke does not exercise React form interactions, focus, or layout. Phone and Chrome/Firefox UI acceptance therefore need their own evidence during implementation. Sources: [package manifest](../../../package.json), [workflow](../../../.github/workflows/ci.yml), [PRD usability:110](../../foundation/prd.md#L110).

## Architecture Insights

The observed pattern is **Astro page → owned data service → typed request Supabase client**, with a **React island → authenticated form endpoint → the same data service** for mutations. Database constraints, grants, and RLS protect the direct data path. A planned-print migration/type extension, dedicated service/validation/response modules, and page/form/list can follow this pattern. Those are planning candidates inferred from the inspected stock implementation, not existing print modules. Sources: [stock page:21](../../../src/pages/dashboard/spools.astro#L21), [stock form:143](../../../src/components/spools/SpoolForm.tsx#L143), [stock handler:43](../../../src/pages/api/spools/index.ts#L43), [database policy:85](../../../supabase/migrations/20261010000000_create_spools.sql#L85).

Potential paths such as `/dashboard/prints`, `/api/prints`, and `src/lib/prints.ts`, and database field names such as `required_grams`, are proposed naming choices. The product documents establish the domain terms, not those technical names. Preserve a dedicated print mutation boundary so downstream reservation changes have a clear integration point; do not infer a reservation status model from the unreserved S-02 scope.

## Historical Context

Historical claims are adjudicated separately:

- **Supported for text, scoped for quantities:** the archived stock plan settles canonical label behavior and explicitly anticipates S-02 reuse. Its whole-gram/create/edit minimum policy names stock, so it does not settle print quantity input. Sources: [stock plan:23](../../archive/2026-10-10-personal-filament-stock/plan.md#L23), [reuse:130](../../archive/2026-10-10-personal-filament-stock/plan.md#L130).
- **Superseded for current stock absence:** roadmap's dated baseline and tech-stack text say product persistence still needs to be built. Current spool migration, API, and UI show implemented stock. Their claims about the selected stack, and the need for unimplemented print/reservation capabilities, can still be used within those scopes. Sources: [dated baseline:67](../../foundation/roadmap.md#L67), [stack:24](../../foundation/tech-stack.md#L24), [stock migration:14](../../../supabase/migrations/20261010000000_create_spools.sql#L14), [stock page:37](../../../src/pages/dashboard/spools.astro#L37).
- **Recorded verification, not rerun evidence:** archived stock verification records local database/application checks and user-confirmed Chrome/Firefox/phone acceptance. It explicitly leaves hosted workflow/database/deployment unobserved in that pass. Sources: [verification:3](../../archive/2026-10-10-personal-filament-stock/verification.md#L3), [browser acceptance:21](../../archive/2026-10-10-personal-filament-stock/verification.md#L21), [hosted limits:27](../../archive/2026-10-10-personal-filament-stock/verification.md#L27).
- **Review fixes remain relevant:** retain uncertainty through field edits, coordinate pending form transitions, preserve SDK status separately, and report safe unexpected-error causes. The record limits browser reproduction and hosted evidence for those fixes. Sources: [F1:5](../../archive/2026-10-10-personal-filament-stock/follow-ups/review-fixes.md#L5), [F2:12](../../archive/2026-10-10-personal-filament-stock/follow-ups/review-fixes.md#L12), [F3:20](../../archive/2026-10-10-personal-filament-stock/follow-ups/review-fixes.md#L20), [F4:31](../../archive/2026-10-10-personal-filament-stock/follow-ups/review-fixes.md#L31).

## Related Research

- [Archived stock research](../../archive/2026-10-10-personal-filament-stock/research.md), interpreted alongside its [later plan](../../archive/2026-10-10-personal-filament-stock/plan.md) and current implementation.
- [Carbon theme research](../carbon-terminal-theme/research.md) and [active theme plan](../carbon-terminal-theme/plan.md), relevant to shared controls and navigation.

## Open Questions and Planning Handoff

1. **Required-grams input policy — author decision:** whole or fractional grams, positive minimum or allowed zero, and acceptable maximum. The stock rule is a precedent, not print-specific approval. Sources: [S-02:126](../../foundation/roadmap.md#L126), [stock policy:23](../../archive/2026-10-10-personal-filament-stock/plan.md#L23). Record the agreed policy before implementing its form and database checks.
2. **Print identity in the interface — author choice if expanding fields:** are material/colour/required grams and an identifier sufficient, or is a name wanted? A mandatory name is not stated in the inspected S-02/PRD input list. Sources: [S-02:126](../../foundation/roadmap.md#L126), [PRD:119](../../foundation/prd.md#L119).
3. **Technical choices for the plan:** confirm routes/module/table names, display ordering, duplicate-record handling, and ordinary concurrent-edit behavior. The stock ordering and UUID identity provide precedents; they are not new product guarantees. Sources: [stock query ordering:52](../../../src/lib/spools.ts#L52), [stock identity precedent:45](../../archive/2026-10-10-personal-filament-stock/plan.md#L45).
4. **Theme integration:** reread the shared components and navigation immediately before planning/implementation edits because Carbon is `implementing` and overlaps them. Source: [theme identity:4](../carbon-terminal-theme/change.md#L4).

Reservation arithmetic, best-fit ties, configurable margin, reservation-aware editing, and settlement remain routed to their roadmap slices. Their unresolved choices do not block researching unreserved CRUD. Sources: [S-03:144](../../foundation/roadmap.md#L144), [S-04:158](../../foundation/roadmap.md#L158), [S-05:171](../../foundation/roadmap.md#L171), [S-07:196](../../foundation/roadmap.md#L196).

## Evidence Coverage and Limitations

The primary agent read the skill and supplied repository instructions, PRD, roadmap, tech-stack document, request middleware/client/auth response helpers, decisive stock migration/service/validation/response/API/UI paths, and relevant archived decisions and fixes. Read-only workers completed separate database/API, UI/theme, and history/verification investigations. Their decisive evidence was inspected before synthesis. File inventories covered `src/`, `supabase/`, `scripts/`, `.github/`, and change/archive identities; absence claims above are bounded to those inspected schemas and paths.

The repository snapshot was `master` at the commit recorded above, with existing uncommitted Carbon presentation edits and its untracked change folder. Source anchors refer to the inspected local working tree; they are not commit permalinks. No credentials were read or included in documentation queries.

No application tests, builds, browser sessions, live database queries, hosted checks, or deployments were run for this research. Runtime and visual behavior remain implementation-verification work. `status: complete` means the scoped codebase investigation is complete; it does not approve a plan, settle the product choices above, or establish that planned prints are implemented.
