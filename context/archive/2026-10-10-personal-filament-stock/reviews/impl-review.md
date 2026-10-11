<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Personal Filament Stock Implementation Plan

- **Plan**: context/changes/personal-filament-stock/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-11
- **Verdict**: APPROVED
- **Initial verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 0 observations
- **Triage**: Complete — F1, F2, F3, F4 fixed; 0 pending findings

## Verdicts

| Dimension           | Verdict                                                              |
| ------------------- | -------------------------------------------------------------------- |
| Plan Adherence      | PASS — F1–F4 resolved through approved fixes                         |
| Scope Discipline    | PASS                                                                 |
| Safety & Quality    | PASS — all reported reliability issues resolved                      |
| Architecture        | PASS                                                                 |
| Pattern Consistency | PASS — unexpected stock causes reach a server diagnostic boundary    |
| Success Criteria    | PASS — prescribed commands pass; recorded manual acceptance reviewed |

## Findings

### F1 — Field edits remove the uncertainty guard after a save

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/spools/SpoolForm.tsx:113
- **Detail**: Network rejection and unreadable successful responses set `requestError.kind` to `uncertain` and release `pending` (lines 145–151 and 170–175). The submit guard and disabled button depend on that error. Each field remains editable and calls `clearFieldError`, which unconditionally clears `requestError`. If a create committed before its response was lost, changing any field removes the warning and permits another create without rereading stock, potentially duplicating the physical spool and inflating available stock. Phase 3 explicitly requires refresh guidance before repeating an uncertain mutation.
- **Fix**: Preserve an uncertain request error when clearing field validation errors, keeping refresh guidance and the submit guard after input changes.
- **Decision**: FIXED — User chose the proposed fix on 2026-10-11. `clearFieldError` now preserves an existing `uncertain` request error. Lint, Astro check (49 files; zero errors/warnings/hints), and production build pass. Browser reproduction was not repeated.

### F2 — Pending responses can close a newer form and discard its draft

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/spools/SpoolInventory.tsx:55
- **Detail**: Form pending state belongs to `SpoolForm`, while inventory transition controls remain enabled. Submit an edit for spool A on a slow connection, open Edit B, and enter a draft. `openEdit` unmounts A's form, but its request continues. A's eventual `saveSpool` callback unconditionally clears `editingSpoolId` at line 97, closing B and losing its draft. Switching to Add can similarly unmount a pending form and lose its inputs or failure feedback. An in-flight deletion allows another confirmation to replace `deleteSpoolId`; the first response then clears the newer confirmation at line 130 or assigns its error to the wrong target. Disabling the submitting form's own Cancel does not protect these transitions.
- **Fix**: Track the active mutation in `SpoolInventory`, share pending state with forms, and disable and guard transitions that replace its form or confirmation until the operation settles; preserve the uncertainty requirement from F1 afterward.
  - Strength: Prevents stale callbacks from closing another form and preserves inputs and feedback without introducing concurrent form state.
  - Tradeoff: Other inventory mutation controls are temporarily unavailable while a request is running; requires coordination between the two components.
  - Confidence: HIGH — the enabled transition handlers and unconditional completion handlers establish the race directly.
  - Blind spot: Slow-response navigation was traced in source rather than reproduced in a browser during this review.
- **Decision**: FIXED — User approved the proposed transition lock on 2026-10-11. Inventory now coordinates pending writes with both forms and deletion, disables incompatible controls, and synchronously guards open/close handlers with a ref. All handled success, network-error, malformed-success, and HTTP-error outcomes release the lock; F1's uncertainty state remains intact. Lint, Astro check (49 files; zero errors/warnings/hints), and production build pass. Slow-response browser reproduction was not repeated.

### F3 — Real SDK connection failures return 500 instead of retryable 503

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/spools.ts:55
- **Detail**: Read queries retain only `result.error` and discard the SDK's sibling `result.status`; mutation queries likewise destructure only `data` and `error`. The installed PostgREST SDK converts a fetch rejection into an error with `message`, `details`, `hint`, and an empty `code`, alongside `status: 0` (`node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:345`). The classifier at `src/lib/spool-response.ts:136` expects status/name/structured cause properties inside the error that this shape lacks. A review probe used the installed Supabase client and actual `listSpools` against an unavailable local port: it returned those four error keys and mapped to 500. Gateway HTTP status is also lost when it is absent from the error body. Users consequently receive generic failure feedback without the planned 503/Retry-After contract. Existing fixtures with nested `error.status: 503` do not model the installed SDK response.
- **Fix**: Carry the SDK response status through database failures, classify transport status 0 and known transient HTTP statuses at the shared boundary, and cover actual SDK-shaped connection and gateway failures in the contract checks.
  - Strength: Makes API and SSR classification use information already provided by the SDK instead of depending on synthetic error properties.
  - Tradeoff: Changes the shared failure representation and its fixtures; status 0 must remain distinguishable from unrelated application exceptions.
  - Confidence: HIGH — reproduced with the installed SDK and confirmed against its local source.
  - Blind spot: The probe demonstrated a local connection failure; an actual provider outage was not induced.
- **Decision**: FIXED — User chose the proposed fix on 2026-10-11. All stock queries preserve SDK response status; API handlers and SSR pass it to the shared classifier. Transport status 0, HTTP 429, and HTTP 5xx map to private 503 responses with retry guidance; unexpected failures without transient evidence still map to 500. New tests exercise the installed SDK with controlled network rejection and HTTP 429/503/520/400 responses across list/create/update/delete, verifying status propagation, privacy headers, Retry-After, and non-disclosure of raw diagnostic text. Stock contracts: 13/13 pass; auth contracts: 13/13 pass; lint, Astro check, and production build pass.

### F4 — Unexpected server causes are discarded when responses are created

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/spool-response.ts:208
- **Detail**: `mapSpoolDatabaseError` wraps an unexpected failure with its original cause at line 203. `createMappedSpoolFailureResponse` then uses only its body, status, and headers; every stock endpoint uses this conversion without reporting or retaining the cause. The stock SSR page also ignores `failure.cause` (`src/pages/dashboard/spools.astro:25`). Thus the diagnostic object is discarded after producing a generic 500. Phase 2 requires preserving the server cause, and existing auth handlers retain unexpected causes through throws (`src/pages/api/auth/signin.ts:43`, `src/middleware.ts:45`). The native check asserts only that the temporary mapper object has a cause, leaving the response boundary unverified.
- **Fix**: Report unexpected failures through a shared server diagnostic boundary used by API response conversion and SSR, retaining safe diagnostic context while keeping the generic client response and excluding credentials and submitted values.
  - Strength: Preserves evidence where the failure is consumed and covers both stock entry points.
  - Tradeoff: Requires a defined reporting destination and redaction policy; arbitrary raw SDK errors can contain sensitive database values or request URLs.
  - Confidence: HIGH — no consumer of `failure.cause` exists in the stock request paths.
  - Blind spot: No external error tracker was inspected or exercised; a server reporting destination must be selected during the fix.
- **Decision**: FIXED — User approved safe server logging on 2026-10-11. `reportSpoolFailure` is invoked by API response conversion and the SSR failure branch. It sends allowlisted error names, database codes, and known code filenames with line/column coordinates to `console.error`, with API/page context and a bounded, cycle-safe cause chain. Raw messages, details, arbitrary properties, credentials in stack URLs, and unknown paths are excluded. Regression checks verify that an actual response conversion reports the nested cause while retaining private generic client responses, that page diagnostics preserve safe database codes, and that expected failures are not reported. Stock contracts: 14/14 pass; auth contracts: 13/13 pass; lint, Astro check, and production build pass. Hosted log delivery was not tested.

## Scope and plan comparison

The Progress section contains 18 completed rows and zero pending rows. Current phase is 4. `change.md` was `implemented`, updated 2026-10-11, before this review. No accepted lessons register or domain glossary exists in this checkout.

Implementation scope was resolved from the feature commits rather than the plan's date, because the filename has no date and nearby commits include unrelated auth work. Reviewed range: `ff23dfe^..529caf8`, including phase commits `ff23dfe`, `5c6f3a7`, `e112387`, `4495fbc` and closing commit `529caf8`. The diff contains 30 files. Two independent review agents checked plan drift and safety/patterns.

| Planned area                                                                             | Actual evidence and verdict                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 migration, restricted-role tests, configuration, generated types, request client | MATCH: additive schema, exact numeric validation, ICU/whitespace normalization, column grants, ownership RLS, cascade, owner index and typed existing client. Disposable rebuild, 64 pgTAP assertions and generated-type comparison pass.                            |
| Phase 2 validation, queries, response mapping and stock endpoints                        | MATCH for field cardinality, Unicode prevalidation, zero differences, owner filters, affected-row checks, bounded ordered batches, private headers, auth and form transport. DRIFT in actual transient failure classification and diagnostic cause retention: F3/F4. |
| Phase 2 native checks and package script                                                 | MATCH for declared validation, canonical returns, pagination and boundary cases. Passing synthetic error fixtures miss F3/F4.                                                                                                                                        |
| Phase 3 protected stock page, navigation, form field and inventory/form components       | MATCH for SSR stock, explicit empty/error states, derived quantities/explanation, navigation, labels, associated errors, canonical writes and deletion confirmation. DRIFT in uncertainty persistence and pending transitions: F1/F2; SSR also inherits F4.          |
| Phase 4 smoke, CI, verification artifact and repository guide                            | MATCH: reused accounts/helpers, application and direct REST isolation, hostile origin and payloads, fresh expiry assumptions, local credential protections, cleanup, CI gates and separate local/browser/hosted evidence.                                            |
| Files in plan but absent from diff                                                       | None. Timestamp placeholder resolves to `20261010000000_create_spools.sql`.                                                                                                                                                                                          |
| Changed files outside explicit production file list                                      | `eslint.config.js` narrowly exempts generated types from incompatible lint rules; roadmap records S-01 progress. Change/research/plan/brief documents are expected workflow artifacts. These are justified supporting changes, with no product scope expansion.      |

The implementation respects the excluded scope: no reservations, planned prints, catalogue, extra spool attributes, hosted deployment, realtime infrastructure or new browser test framework. No critical authorization, injection or destructive migration issue was found.

## Verification performed during review

Commands were deduplicated across phases. All ran on Node v24.21.0. Reset and integration verification used the disposable checkout `/tmp/printplan-impl-review.0drsnp61`, project ID `printplan-impl-review`, with alternate ports; the existing local database and credential files were preserved. Only local anon/publishable credentials were supplied to the temporary application. The temporary preview and database were stopped afterward.

| Command                                                                                                   | Result | Actual output / evidence                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:auth`                                                                                       | PASS   | 13 tests, 13 pass, 0 fail.                                                                                                                                                                                                                                                                  |
| `npm run test:spools`                                                                                     | PASS   | 11 tests, 11 pass, 0 fail; includes 0/1,000/1,001 inventory and later-page failure checks.                                                                                                                                                                                                  |
| `npx astro sync`                                                                                          | PASS   | Project types generated.                                                                                                                                                                                                                                                                    |
| `npm run lint`                                                                                            | PASS   | ESLint exited 0 without errors.                                                                                                                                                                                                                                                             |
| `npx astro check`                                                                                         | PASS   | 49 files; 0 errors, 0 warnings, 0 hints.                                                                                                                                                                                                                                                    |
| `npm run build`                                                                                           | PASS   | Cloudflare server build completed. Existing sitemap warning: missing `site`, sitemap skipped.                                                                                                                                                                                               |
| `npx supabase --workdir /tmp/printplan-impl-review.0drsnp61 db reset --local`                             | PASS   | Fresh migration rebuild completed without a missing-seed failure.                                                                                                                                                                                                                           |
| `npx supabase --workdir /tmp/printplan-impl-review.0drsnp61 test db`                                      | PASS   | `All tests successful. Files=1, Tests=64. Result: PASS`.                                                                                                                                                                                                                                    |
| `npx supabase --workdir /tmp/printplan-impl-review.0drsnp61 gen types typescript --local --schema public` | PASS   | Generated output formatted with the repository Prettier configuration; `diff -u` against `src/types/database.ts` exited 0 with no differences.                                                                                                                                              |
| `npm run build` in disposable checkout                                                                    | PASS   | Same reviewed revision built with isolated local configuration.                                                                                                                                                                                                                             |
| `BASE_URL=http://localhost:16321 MAILPIT_URL=http://127.0.0.1:56324 npm run smoke` in disposable checkout | PASS   | Auth and stock scenarios passed, including owner CRUD, zero correction, duplicates, SSR/reread and logout/relogin persistence, direct REST isolation, hostile inputs/origin, privacy headers, expiry, refresh, revocation and signout. Exit 0; final output: `All auth smoke steps passed`. |

Additional diagnostic probe for F3: imported the installed Supabase client, `listSpools` and the mapper with Node TypeScript stripping, then queried unavailable `http://127.0.0.1:59999` using a dummy key. Output: `{"ok":false,"errorShape":["message","details","hint","code"],"databaseCode":"","mappedStatus":500}`. This confirms a defect outside the current passing fixtures; it does not certify provider-outage behavior.

## Manual acceptance and limits

Progress rows 3.2–3.4 and 4.4–4.6 are checked. `context/changes/personal-filament-stock/verification.md:21`–23 records user acceptance on 2026-10-11 for Chrome, Firefox and a phone, including keyboard/focus/error retention, multicolour layout, 150/0/150 quantities, correction to zero, cancellation/deletion and persistence. The record explicitly separates unobserved GitHub Actions and hosted database/deployment checks. There is observable documentation supporting these completed manual rows, so they are not flagged as unsupported.

This review read that recorded acceptance and inspected the implementation; it did not repeat browser/device sessions. F1/F2 concern uncertain/overlapping request transitions beyond the normal CRUD acceptance. Hosted deployment and remote CI remain unverified and outside this change's review scope.

## Triage completion

All four findings were fixed through user-approved choices on 2026-10-11. The current verdict and dimension verdicts above reflect the completed fixes; finding details and severities retain the original review evidence. No pending, skipped, or accepted-risk findings remain.

Final verification: `npm run test:spools` passes 14 tests, `npm run test:auth` passes 13 tests, `npm run lint` passes, `npx astro check` reports zero errors/warnings/hints across 49 files, and `npm run build` succeeds. Fix details and verification are recorded in `context/changes/personal-filament-stock/follow-ups/review-fixes.md`. The slow-response browser scenarios and hosted logging delivery were not repeated or exercised during triage.
