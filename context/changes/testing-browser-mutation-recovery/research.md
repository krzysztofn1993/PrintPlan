---
date: 2026-10-15T20:14:00+02:00
researcher: Codex
git_commit: f558bfe496236061f2c2651da2ea9e616f15b1cf
branch: testing-browser-mutation-recovery
repository: PrintPlan
topic: Browser mutation recovery rollout, risk 6
tags: [research, browser, spools, prints, recovery]
status: complete
last_updated: 2026-10-15
last_updated_by: Codex
---

# Research: Browser mutation recovery

## Research Question

Ground rollout Phase 3, risk #6: which hydrated interactions need browser tests,
which accepted behaviors supply an independent oracle, and how can the suite
reuse real authentication and persistence without repeating server coverage?

## Summary

Use focused Playwright integration against a built preview and local Supabase.
The existing native contracts and HTTP smoke do not execute the controlled form
state or confirmation dialogs inspected here. Keep normal requests real; inject
specific failed acknowledgements at the browser HTTP boundary. Forward a write
before masking its response where the scenario needs a committed-but-unconfirmed
outcome, then use independent real reads to prove the resulting record.

The accepted stock and print contracts differ. Stock preserves its active-form
uncertainty guard through field edits and links to a fresh SSR page. Prints retain
a collection-level guard through cancel/reopen and failed refresh, with explicit
consent before discarding drafts. Applying print-style consent/global locking to
stock would extend production behavior, beyond this rollout.

## Detailed Findings

### Independent requirements and prior decisions

- Stock input retention, pending submission, refresh guidance and explicit 503
  retry come from `context/archive/2026-10-10-personal-filament-stock/plan.md:183`.
  Approved stock review F1 preserves uncertainty through field changes; F2 guards
  transitions during a pending write (`reviews/impl-review.md:27`, `:37` in that
  archive). These remain supported by the inspected form and collection paths.
- Prints require retained stale inputs, a fresh read before saving again, and no
  assurance that a mutation 5xx means nothing committed:
  `context/archive/2026-10-12-personal-planned-prints/plan.md:29`, `:150`, `:196`.
  Its independent manual examples use a winner at 90 g and a stale draft at 100 g
  (`:277`), plus readable 503 and failed/successful refresh (`:278`).
- Print review F2 was fixed and accepted: generic refresh retry must ask before
  discarding a draft. Review F1, submitting during an already-running refresh,
  was explicitly skipped (`context/archive/2026-10-12-personal-planned-prints/reviews/impl-review.md:26`,
  `:40`). Restrict new pending tests to write-first sequences, and start recovery
  reads after the write settles. Do not reopen F1.

### Stock recovery surface

- `src/components/spools/SpoolForm.tsx:97` owns the entered values; `:113` preserves
  uncertain feedback during field edits; `:129` guards submission. Network
  rejection and unreadable successful replies become uncertainty (`:152`, `:177`).
  Server validation maps known codes and focuses the first error (`:118`, `:186`);
  503 permits explicit retry (`:201`).
- `src/components/spools/SpoolInventory.tsx:49` shares the pending ref and state;
  guarded transitions (`:59`) and disabled row controls (`:272`, `:285`) protect
  the active form. Targeted deletion requires the acknowledged UUID (`:146`),
  while uncertain deletion blocks repeat confirmation (`:119`, `:348`).
- Stock refresh is navigation (`SpoolForm.tsx:303`, `SpoolInventory.tsx:335`), with
  an SSR service read and an explicit error page on failure
  (`src/pages/dashboard/spools.astro:20`, `:44`). Cancel unmounts the form and may
  reset its local error (`SpoolInventory.tsx:77`). There is no corresponding stock
  discard-dialog contract in the inspected archived stock plan or these paths.
- A useful real server validation case is 41 sharp-s characters: the client
  counts pre-case-conversion code points (`src/lib/spool-validation.ts:43`), while
  the accepted database-normalized material bound is 80 code points (archived
  stock `plan.md:31`). Correcting to 40 sharp-s characters should return 80 S
  characters. Obtain the expected values from the accepted contract, not a
  production normalization helper.

### Print recovery surface

- `src/components/prints/PrintForm.tsx:98` owns drafts; `:115` preserves conflict
  and uncertainty through edits. The POST includes the original expected version
  (`:139`). Network rejection (`:150`), unreadable successful responses (`:175`)
  and mutation 5xx (`:186`) notify the collection guard. A real 409 retains fields
  and blocks stale resubmission (`:202`, `:355`).
- The conflict action asks discard consent before reading (`PrintForm.tsx:226`).
  `src/components/prints/PrintList.tsx:173` reads the real list and validates DTOs;
  `:207` asks consent for generic refresh, returns without clearing forms/guard
  on read failure, and resets state after a validated successful read (`:220`).
  Version-keyed edit forms remount with current saved fields (`:490`).
- Generic “Try again” deliberately calls the generic consent path (`:374`).
  Test the accepted F2 sequence with an actual intervening version change, so an
  accidental conflict-specific retry would discard the visible draft.
- Delete has its own response handling and parent uncertainty (`:239`). Test it
  separately with two known IDs, a real committed deletion and a masked reply;
  reread must remove the target while preserving its survivor.
- `src/lib/prints.ts:138` already enforces atomic expected-version writes;
  `scripts/print-smoke.mjs:778` already races real edits. The browser conflict test
  needs a sequential intervening API edit, adding draft/consent evidence without
  duplicating the existing concurrency tournament.

### Infrastructure, authentication and CI

- `package.json:6` defines build/preview and native checks; no Playwright runner
  dependency or config exists in the inspected root. `.nvmrc:1` pins 24.21.0,
  matching the current runtime. `astro.config.mjs:10` uses SSR with the Cloudflare
  adapter and server-only secret fields. Preserve that boundary.
- The protected pages hydrate their collection with `client:load`
  (`src/pages/dashboard/spools.astro:53`, `src/pages/dashboard/prints.astro:52`).
  Wait for an observable interactive transition before filling a collection form.
  Sign-in uses the real form at `/auth/signin`
  (`src/components/auth/SignInForm.tsx:29`). Save storage state after real login.
- The existing smoke job starts local Supabase/Mailpit, creates ignored local
  app credentials, builds and runs preview (`.github/workflows/ci.yml:35`). Add a
  scoped browser gate there, preserving existing SQL/migration/HTTP gates. Have
  Playwright own its preview lifecycle; stop any previous smoke preview first or
  run browser tests before starting it. Do not silently reuse a stale server.
- `scripts/smoke-utils.mjs:101` already validates local Supabase configuration and
  rejects privileged app keys. Reuse its configuration guard where suitable.
  Any privileged account provisioning must remain local setup/cleanup; protection
  assertions must use the signed-in user and application API. Generate an
  ephemeral account or use explicit ignored E2E credentials; do not print secrets.
- Current local Supabase containers are running; ports 54321 and 54324 listen.
  Port 4321 was free when checked. Do not reset this populated local database to
  add browser coverage. No remote CI or hosted browser behavior was verified.

## Code References

- `src/components/ui/FormField.tsx:29`: error association and `aria-invalid`.
- `src/components/spools/SpoolForm.tsx:113`: accepted stock uncertainty behavior.
- `src/components/spools/SpoolInventory.tsx:119`: independent delete boundary.
- `src/components/prints/PrintForm.tsx:226`: conflict discard consent.
- `src/components/prints/PrintList.tsx:207`: fresh-read recovery and generic consent.
- `.github/workflows/ci.yml:35`: existing local-stack integration job.

## Architecture Insights

The cheapest useful layer for these rendered transitions is a small browser
integration suite. Keep fixtures independent and cleanup checked. Use accessible
roles/labels, condition-based waits and real persistence; never set React state
or mock an internal module. Forward-then-mask is fault injection, not evidence of
provider downtime. Traces and screenshots can contain local session data; ignore
them and avoid publishing raw authentication artifacts.

## Stack Grounding

Context7 CLI resolved `/microsoft/playwright` and fetched official Playwright
guidance for `route.fetch`/`route.fulfill`, dialogs, storageState setup projects,
webServer and Chromium installation in CI; checked 2026-10-15. Sources:
[network interception](https://github.com/microsoft/playwright/blob/main/docs/src/network.md),
[authentication](https://github.com/microsoft/playwright/blob/main/docs/src/auth.md),
[webServer](https://github.com/microsoft/playwright/blob/main/docs/src/test-api/class-testconfig.md),
[CI](https://github.com/microsoft/playwright/blob/main/docs/src/ci.md).
Browser/Playwright MCP and repository-specific provider MCP are not available in
this session. Local CLI/runtime verification remains possible.

## Historical Context and Related Research

The archived stock F1/F2 fixes and planned-print F2 fix are supported by current
source; their original browser checks were historical author observations. This
research did not rerun them. Phase 2's existing
`../testing-mutation-and-session-contracts/research.md` covers cheaper server
contracts and does not claim hydrated browser coverage.

## Open Questions and Corrections

Request an explicit backport decision before changing risk #6 guidance: scope
discard consent and the persistent collection guard to prints; describe stock's
active-form uncertainty preservation and navigation reread separately. Preserve
§7's skipped print F1. No code anchors belong in the test-plan risk table.

The runner/auth fixture strategy and browser gate must be made concrete in the
implementation plan. No production behavior change or database migration is
needed for the inspected scenarios. Browser runs, deliberate-break results and
installed runner versions remain implementation verification work.
