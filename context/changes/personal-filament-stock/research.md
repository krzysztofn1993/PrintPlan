---
date: 2026-10-10T15:45:36+02:00
researcher: Codex
git_commit: 0b6adcb68d8b252c4bf57dd731b667c6ff698db2
branch: master
repository: PrintPlan
topic: "S-01: Record and inspect personal filament stock"
tags: [research, codebase, filament-stock, supabase, ownership]
status: complete
last_updated: 2026-10-10
last_updated_by: Codex
last_updated_note: Initial research for roadmap S-01; no implementation or runtime verification performed
---

# Research: S-01 personal filament stock

**Date:** 2026-10-10T15:45:36+02:00  
**Researcher:** Codex  
**Git commit:** `0b6adcb68d8b252c4bf57dd731b667c6ff698db2`  
**Branch:** `master`  
**Repository:** PrintPlan

## Research Question

For roadmap S-01 (`personal-filament-stock`), what is the agreed scope, which existing code and verification contracts can be reused, what persistence and ownership infrastructure is missing, and which decisions must planning resolve?

The supplied `s-01` resolves to the roadmap's change ID, rather than a separate change named `s-01` (`context/foundation/roadmap.md:112`, `:115`). No active or archived identity for either spelling existed in the inspected change inventory. This research creates the active identity under the canonical change ID.

## Summary

- **The prerequisite is complete.** F-01 is done and archived, with recorded local auth verification and user-confirmed browser acceptance. Roadmap handoff wording saying to complete F-01 is superseded; hosted verification remains F-02 (`context/foundation/roadmap.md:91`, `:118`, `:207`; `context/archive/2026-10-09-verified-account-access/change.md:4`; `verification.md:101`, `:122`, `:136`).
- **S-01 is private, persistent CRUD for unreserved spools.** Its fields are material, colour and estimated stock; recorded, reserved and available grams require explanations. Persistence and phone/desktop usability are part of the slice (`context/foundation/roadmap.md:108`, `:110`, `:114`; `context/foundation/prd.md:93`, `:110`, `:111`, `:127`).
- **Reuse the request-scoped Supabase client, not a replacement auth integration.** The inspected middleware populates verified identity and cookie-aware client state, but its page guard matches `/dashboard` and `/dashboard/…`. New data endpoints need explicit authorization and database ownership enforcement (`src/middleware.ts:7`, `:14`, `:27`, `:50`; `src/lib/supabase.ts:9`; `src/lib/auth-response.ts:3`).
- **Product persistence is still absent from the inspected repository paths.** The source and Supabase inventory has no product SQL migration, generated database type, spool UI or product query. Auth/session checks do not establish spool isolation (`supabase/config.toml:53`; `src/pages/dashboard.astro:7`; `scripts/smoke.mjs:567`, `:658`; inspected scope below).
- **Planning must settle stock precision and material/colour representation.** These are unspecified in the inspected product documents; they affect the initial schema and later matching. Research establishes the gap without choosing the product rule (`context/foundation/roadmap.md:114`; `context/foundation/prd.md:119`, `:145`).

## Detailed Findings

### Product boundary and downstream contracts

The source vocabulary comes from the PRD's spool requirements and stock explanations, plus S-01's explicit material/colour/estimated-stock fields (`context/foundation/prd.md:82`, `:93`, `:119`; `context/foundation/roadmap.md:114`). No domain glossary or lessons document exists in the inspected `context/` inventory. No naming or aggregate contract is inferred from the project name.

S-01 includes adding, listing/viewing, correcting and deleting a user's unreserved spools. The inspected S-01/PRD requirements do not specify manufacturer, diameter, price, original capacity or a separate spool name. They also do not specify uniqueness of a material/colour pair. An interface may need a way to distinguish similar spools, but that is a planning choice, not an established mandatory field (`context/foundation/roadmap.md:114`; `context/foundation/prd.md:80`, `:119`).

**Scope-bound inference:** before reservations exist, a spool's reserved amount is **0 g**, and available grams equal recorded grams. For the PRD's **150 g** spool in this unreserved stage, the display would therefore be **150 g recorded / 0 g reserved / 150 g available**. This follows from the unreserved scope and the documented available-stock semantics; it is not an observed implementation (`context/foundation/roadmap.md:110`, `:114`; `context/foundation/prd.md:48`, `:54`, `:93`, `:121`). The full reservation acceptance flow belongs to S-03.

Recorded stock is a manually entered estimate. Copy should explain that reserved grams are set aside for planned prints and available grams are the estimate remaining after reservations; it must not imply a physical guarantee (`context/foundation/prd.md:20`, `:93`, `:119`). Empty stock remains a meaningful later domain state because settlement may set the estimate to **0 g**; whether an initial create form accepts that value still needs a decision (`context/foundation/prd.md:123`).

When S-03 introduces reservations, it must also harden the existing stock mutation paths: reject corrections below reserved grams and cancel reservations on spool deletion. S-06 adds complete reservation-aware stock maintenance and cancellation feedback (`context/foundation/roadmap.md:110`, `:178`, `:185`). The selected stack places competing reservation/settlement changes in database functions with locking and idempotency (`context/foundation/tech-stack.md:24`).

**Architecture implication:** a future reservation invariant cannot depend solely on an Astro endpoint if owner-authenticated direct table writes remain permitted. S-03 must account for those database write paths as well as the S-01 UI. This is a future enforcement contract, not a requirement to build reservation tables in S-01 (ownership grants/policies: [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security); slice boundary: `context/foundation/roadmap.md:110`).

### Auth, response and route integration

The middleware obtains incoming cookies, constructs the request client, and sets `locals.supabase`, `locals.user` and auth availability. Apart from credential POSTs to the signup/signin endpoints, the configured client calls `auth.getUser()` before downstream handling (`src/middleware.ts:7`, `:11`, `:14`, `:27`). Product requests can reuse this identity/client rather than trusting a posted owner identifier.

The client's `getAll`/`setAll` contract retains cookie changes and SDK response headers. Middleware finalization commits the cookie mutations and applies those headers to returned responses. Keep this contract intact when adding product queries and responses (`src/lib/supabase.ts:9`, `:14`; `src/lib/auth-cookies.ts:25`, `:30`, `:50`; `src/middleware.ts:20`, `:57`).

The current protection predicate is exactly `/dashboard` or a path beginning `/dashboard/`. A stock page under that prefix inherits the existing missing-user redirect and auth-unavailable response; a proposed `/spools` or `/api/spools` does not inherit that protection (`src/lib/auth-response.ts:3`; `src/middleware.ts:50`). The page location and endpoint response contract are still planning choices. In particular, page redirects alone do not authorize a mutation endpoint.

The explicit auth-unavailable response is retryable and private, with status **503** and no-store headers. Normal middleware finalization forwards accumulated headers but does not independently set no-store for a successful personalized page. A stock page/API therefore needs an explicit cache contract rather than relying on a session refresh happening on that request (`src/lib/auth-response.ts:17`, `:69`; `src/lib/supabase.ts:14`; `src/middleware.ts:20`; inspected dashboard at `src/pages/dashboard.astro:7`).

Auth validation/error helpers classify auth failures and field errors. They do not establish product database error semantics. Stock handling still needs to distinguish validation failures, inaccessible/missing targets, temporary database failures and unexpected errors; a failed list query must not silently become an empty inventory (`src/lib/auth-errors.ts:14`; `src/pages/api/auth/signin.ts:14`, `:38`; `src/lib/auth-validation.ts:143`).

### Persistence and ownership

The selected stack already requires PostgreSQL persistence, migrations and per-user RLS, with Supabase Auth as identity (`context/foundation/tech-stack.md:24`). Local configuration exposes `public` and `graphql_public`, enables migrations, and has no declarative schema paths configured. Its seed configuration names `./seed.sql`, but that file is absent from the inspected Supabase inventory (`supabase/config.toml:7`, `:53`, `:60`). No product migration or generated database type was found in the inspected source/Supabase inventory; this says nothing about an uninspected remote database.

The current server client has no generated product schema type parameter (`src/lib/supabase.ts:9`). Database type generation is available through the selected Supabase workflow; schema/type integration would belong to the first persistent slice. Versioned migrations and a clean **local** rebuild can make table constraints and policies reproducible. The docs describe `supabase migration new`, local `supabase db reset` and TypeScript generation; no reset, type generation or schema mutation was executed during this research ([Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows)).

Current RLS documentation confirms separate table grants and row policies. Owner-scoped reads/deletes use `USING`; inserts use `WITH CHECK`; updates check the existing and resulting owner, with a corresponding SELECT policy. Service-role access bypasses RLS, so the user CRUD path should use the existing authenticated request client with a publishable/anon key. CI's smoke setup selects that key class; actual secret files and hosted configuration were not inspected ([Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security); `.github/workflows/ci.yml:66`; `src/lib/supabase.ts:9`).

**Planning implication:** derive ownership from verified request/database identity and enforce it in the database for the required CRUD operations, including attempts to reassign ownership. Test direct authenticated data access as well as application routes. RLS is necessary evidence for privacy, while user-friendly route errors remain an application concern (`context/foundation/prd.md:127`; RLS documentation above).

Mutation confirmation needs an affected-record contract. Supabase update/delete do not return affected rows by default; filtered operations can request them with `.select()`. Planning should define how inaccessible, already-deleted or missing targets are reported without claiming that a mutation succeeded solely because no error was returned ([update reference](https://supabase.com/docs/reference/javascript/update), [delete reference](https://supabase.com/docs/reference/javascript/delete)). The precise public response remains undecided.

### Forms, UI and installed framework behavior

The inspected dashboard is an authenticated welcome/sign-out page, not an inventory screen. `Layout` supplies English HTML, viewport metadata, global styles and configuration banners; `Topbar` is embedded by `Welcome`, rather than included in the layout or dashboard (`src/pages/dashboard.astro:7`; `src/layouts/Layout.astro:14`, `:36`; `src/components/Welcome.astro:18`; `src/components/Topbar.astro:6`). Stock navigation, list/form and success/empty/error states still need a product interface.

Semantic styling tokens and a shared button exist. Auth fields provide a local form pattern, but their props lack numeric constraints/select support, and their input/error markup does not attach `aria-invalid` or `aria-describedby`. Reusing that component unchanged would not establish accessible stock entry (`src/styles/global.css:6`, `:75`; `src/components/ui/button.tsx:7`; `src/components/auth/FormField.tsx:8`, `:42`, `:58`). This research does not request a global restyle.

Auth forms combine shared validation with ordinary POST submission; the server repeats validation. The form reader rejects repeated/non-string field values and malformed form bodies. The same boundary pattern is relevant to stock forms, but auth validators and messages are not stock validators (`src/components/auth/SignInForm.tsx:20`, `:30`, `:37`; `src/lib/auth-validation.ts:41`, `:143`; `src/pages/api/auth/signin.ts:14`). Astro documentation supports server `APIRoute` form handling and middleware locals ([Astro form endpoint recipe](https://docs.astro.build/en/recipes/build-forms-api/), [Astro middleware](https://docs.astro.build/en/guides/middleware/)). Choosing plain endpoints versus Actions is not necessary to settle during research; existing endpoints provide a local precedent.

**Installed versus latest documentation:** the lockfile resolves Astro **7.3.2**, Supabase SSR **0.12.7**, Supabase JS **2.116.0** and Supabase CLI **2.117.0**; manifest ranges are not installed versions (`package-lock.json:4129`, `:3027`, `:3052`, `:9395`). No version-specific Astro docs matching the installed version were returned by Context7.

Current Astro documentation describes default origin checking with modern browser request metadata, but the inspected installed origin predicate compares the `Origin` header to the request URL. For on-demand requests other than **GET/HEAD/OPTIONS**, that installed predicate checks form-like content types (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) or an absent content type and rejects a mismatch with **403**. It does not apply that predicate to `application/json`. In the inspected middleware loader, the check precedes user middleware. Retain this default and verify the chosen stock transport; do not assume the latest documentation's header algorithm is already installed ([Astro configuration reference](https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin); `node_modules/astro/dist/core/app/origin-check.js:2`, `:8`, `:23`; `node_modules/astro/dist/core/middleware/load.js:12`; `node_modules/astro/dist/core/config/schemas/defaults.js:44`; `astro.config.mjs:10`).

### Verification available and missing

Native Node auth contract tests already exist, contrary to the older AGENTS statement that no unit runner is configured. CI runs those tests plus sync, lint, type-check and build. A separate job starts local Supabase/Mailpit and runs the built preview smoke (`package.json:14`; `scripts/auth-contracts.test.mjs:33`; `.github/workflows/ci.yml:19`, `:41`, `:78`, `:90`; `AGENTS.md:31`). No browser runner was found in the inspected package dependencies or test-config filename inventory.

The HTTP smoke has separate confirmed accounts and cookie jars, but checks account/session behavior rather than spool CRUD or row ownership. Its existing fixtures are useful verification infrastructure, not evidence that private product data already works (`scripts/smoke.mjs:205`, `:567`, `:658`, `:691`, `:711`). The current checkout pins **Node 24.21.0** in `.nvmrc`, and CI follows that pin; the research shell also reported **24.21.0**, so implementation verification should use the repository-pinned runtime (`.nvmrc:1`; `.github/workflows/ci.yml:16`; research environment observation).

Evidence needed when implementing S-01 follows directly from the product/data contracts:

- Owner CRUD persists across fresh reads, refresh, logout and later login; deletion disappears from fresh reads (`context/foundation/prd.md:111`; `context/foundation/roadmap.md:108`).
- Separate accounts cannot read or mutate each other's spool IDs, insert for another owner or reassign ownership, including through direct data access (`context/foundation/prd.md:127`; RLS guide above).
- The chosen field rules hold when client validation is bypassed, including malformed/negative/non-finite quantities, blank labels and repeated/file-valued fields; expected outcomes depend on the unresolved input contract (`src/lib/auth-validation.ts:41`; `context/foundation/roadmap.md:114`).
- Missing/inaccessible mutation targets, auth/database outages, empty inventory and successful changes receive distinct truthful feedback; personalized responses follow the chosen cache policy (response/mutation findings above).
- Actual phone/current Chrome/Firefox interaction verifies readable stock explanations, usable controls, keyboard focus and associated field errors. HTTP smoke does not establish these browser properties (`context/foundation/prd.md:93`, `:110`; `scripts/smoke.mjs:205`; `src/components/auth/FormField.tsx:42`).

No build, test, local service startup, database query, deployment or browser check was run for this research. These are planning acceptance inputs, not a generated test suite.

## Architecture Insights

The reusable boundary is verified identity → request-scoped cookie-aware client → database ownership policy → server response/UI. Product persistence should fit that existing boundary. Page protection, RLS, validation and meaningful mutation results address different parts of the requirement; none of the inspected auth evidence substitutes for private spool data verification.

S-01 can remain an unreserved stock slice while preserving the documented S-03 transition. The important future contract is upgrading database-accessible mutation paths when reservations ship, not prebuilding the entire reservation workflow (`context/foundation/roadmap.md:110`; `context/foundation/tech-stack.md:24`).

## Historical Context

- **F-01 completion: supported.** The archived identity and final verification record show completed local account work. Browser acceptance is recorded user confirmation, with unspecified exact browser/device versions. It was not repeated here (`context/archive/2026-10-09-verified-account-access/change.md:4`; `verification.md:101`, `:122`, `:138`).
- **F-01 still needs configuration: superseded as a current claim.** Roadmap handoff notes at `:206`–`:208` and prose at `:217` conflict with its done state and archived evidence. The separate Baseline is explicitly dated **2026-10-09**, so its partial-auth entry remains historical starting-point evidence (`context/foundation/roadmap.md:67`, `:72`, `:91`; archived `verification.md:101`). The research leaves roadmap lifecycle/content untouched.
- **Auth redirects and server-client reuse: supported.** These remain current code contracts. The older shape-notes claim that protected-page access behavior is undecided is superseded by PRD policy and middleware (`context/archive/2026-10-09-verified-account-access/plan-brief.md:25`; `context/foundation/shape-notes.md:178`; `context/foundation/prd.md:127`; `src/middleware.ts:50`).
- **Product ownership is deferred to S-01/S-02: supported.** F-01's exclusion still agrees with the roadmap; this slice must supply product isolation (`context/archive/2026-10-09-verified-account-access/plan-brief.md:40`; `context/foundation/roadmap.md:108`).
- **Hosted/remote acceptance: unverified.** The F-01 record explicitly says no remote Actions run was observed and hosted email verification remains F-02. Local success does not certify either (`context/archive/2026-10-09-verified-account-access/verification.md:118`, `:136`).

## Code References

- `context/foundation/roadmap.md:112` — canonical slice scope and identity.
- `context/foundation/prd.md:93` — stock quantities and explanations.
- `src/middleware.ts:7` — request identity/client and response finalization.
- `src/lib/auth-response.ts:3` — exact protected-page predicate.
- `src/lib/supabase.ts:5` — server client and cookie/header adapter.
- `supabase/config.toml:53` — migration scaffolding.
- `src/pages/dashboard.astro:7` — current authenticated placeholder.
- `src/components/auth/FormField.tsx:8` — current input component limitations.
- `.github/workflows/ci.yml:28` — existing local integration harness.

## Related Research

`context/archive/2026-10-09-verified-account-access/research.md` supplies the historical auth investigation. For present completion, use its subsequent `verification.md` rather than treating preimplementation observations as current behavior.

## Open Questions and Planning Handoff

Research coverage is complete for the stated repository investigation. The following choices remain decisions for planning, rather than missing source sweeps:

- **Stock input/storage contract — owner: author during planning.** Decide accepted fractional grams, scale, upper bound, initial zero-stock behavior and handling of excess precision. The PRD leaves numeric precision open; roadmap reservation rounding is assigned to S-03, but S-01 still needs a concrete stock field rule (`context/foundation/prd.md:145`; `context/foundation/roadmap.md:221`).
- **Material/colour contract — owner: author during planning, coordinated with S-02.** Decide catalogue versus text, normalization, colour representation and matching equivalence. The inspected product documents name the fields but do not define these semantics (`context/foundation/roadmap.md:114`; `context/foundation/prd.md:48`, `:119`).
- **Interface/API choices — owner: planner.** Set the protected page location, mutation transport, cache/error/affected-record behavior and how similar spools are distinguished. Follow the existing server-client contract; route examples in this research are illustrative, not selected paths.
- **Later reserved-spool attribute changes — owner: author for S-03/S-06.** Editing a reserved spool's material/colour could invalidate matching; the inspected PRD/roadmap does not define that outcome. S-01 has unreserved records, so this does not require expanding its scope now (`context/foundation/prd.md:119`, `:121`; `context/foundation/roadmap.md:110`, `:178`).
- **Remaining reservation choices stay downstream.** Margin bounds, reservation rounding and best-fit/cancellation tie rules retain their roadmap allocation; they are not prerequisites to this repository research (`context/foundation/roadmap.md:221`, `:222`).

Remote schema/key state and deployed behavior were not inspected. Production bytes and roadmap status were not changed. The next planning input is this artifact under `personal-filament-stock`; research does not approve a plan or implementation.

## Inspected Scope and Source Method

The primary agent read the research skill and its references, AGENTS, full PRD/roadmap/tech-stack/shape-notes, change-folder inventory, decisive auth/cookie/response callers, installed origin-check implementation, relevant archived completion evidence, local configuration and package/CI metadata. Parallel read-only workers covered product/history, backend ownership integration, and UI/verification; each completed before synthesis.

The absence findings cover `src/`, `supabase/`, package/test-config inventory and the relevant context artifacts. No product SQL or `.from()`/`.rpc()` call was found in the inspected source/Supabase paths. These bounded findings exclude dependencies, build output, ignored runtime state and remote resources. Credential files were not read.

Current library docs were resolved and fetched through Context7 for Supabase and Astro, supplemented by the linked official Supabase references and Astro configuration reference. No quota failure occurred. Latest documentation was checked against decisive installed code where the origin-check algorithm differed. Exa was unnecessary because repository evidence and primary documentation answered the technical questions.
