---
date: 2026-10-09T20:44:10+02:00
researcher: Codex
git_commit: 6dcbe409be8f0c84fd5360a5cc24895762e4c120
branch: vm-work
repository: PrintPlan
topic: "verified-account-access: existing account integration and verification gaps"
tags: [research, codebase, authentication, supabase, cookies, smoke]
status: complete
last_updated: 2026-10-09
last_updated_by: Codex
---

# Research: Verified account access

**Date:** 2026-10-09T20:44:10+02:00  
**Researcher:** Codex  
**Git commit:** 6dcbe409be8f0c84fd5360a5cc24895762e4c120  
**Branch:** vm-work  
**Repository:** PrintPlan

## Research Question

What does roadmap F-01 already provide for email/password registration, login, cookie sessions and anonymous protected-page redirects, and what must planning resolve or verify?

The change folder was absent; its scope comes from `context/foundation/roadmap.md:80` and FR-001 / Access Control in `context/foundation/prd.md:79` and `context/foundation/prd.md:127`. F-01 verifies the integration; its name does not establish mandatory email verification. Hosted verification belongs to F-02 (`context/foundation/roadmap.md:93`), and spool/print ownership enforcement belongs to the first persistence slices (`context/foundation/roadmap.md:90`, `context/foundation/roadmap.md:108`).

## Summary

- The inspected starter implements signup, signin, signout, server-side user lookup and a `/dashboard` prefix guard. These are reusable paths, not proof of a successful configured auth run (`src/pages/api/auth/signup.ts:13`, `src/pages/api/auth/signin.ts:13`, `src/pages/api/auth/signout.ts:7`, `src/middleware.ts:12`).
- The checked-in local backend disables email confirmations. Signup ignores its returned session, and the result page chooses wording using `import.meta.env.DEV`. Consequently, a production preview against that backend shows email instructions despite the disabled-confirmation setting (`supabase/config.toml:209`, `src/pages/api/auth/signup.ts:13`, `src/pages/auth/confirm-email.astro:4`).
- The existing smoke has verification weaknesses: redirect-prefix matching accepts an auth-error redirect where `/` is expected, and cookies can survive from signup into signin checks. Its authenticated dashboard assertion does not independently establish a fresh successful signin (`scripts/smoke.mjs:7`, `scripts/smoke.mjs:38`, `scripts/smoke.mjs:66`).
- CI already defines local Supabase, build, preview and smoke execution. A workflow definition is not a successful-run record (`.github/workflows/ci.yml:27`). Bootstrap explicitly recorded smoke as unrun (`context/changes/bootstrap-verification/verification.md:167`).

Research is complete for the static investigation. F-01 completion remains unproven: no auth smoke, browser session check, backend startup or hosted inspection was performed during this research.

## Detailed Findings

### Identity and protected-page contract

`createClient()` returns `null` if either server configuration value is absent. Otherwise, it constructs an SSR client with cookie reads from the incoming `Cookie` header and writes through `AstroCookies.set`, retaining SDK options (`src/lib/supabase.ts:5`). Middleware calls `auth.getUser()` and stores the user or `null` in `App.Locals.user` (`src/middleware.ts:6`, `src/env.d.ts:3`).

The guard predicate is `pathname.startsWith('/dashboard')`, with `/dashboard` as the configured prefix. With no locals user, matching requests redirect to `/auth/signin`; that predicate also matches similarly prefixed paths (`src/middleware.ts:4`, `src/middleware.ts:18`). Dashboard renders the locals user's email; the home Topbar uses the same identity for its navigation (`src/pages/dashboard.astro:4`, `src/components/Topbar.astro:2`). Future protected sections will need deliberate guard coverage.

`getUser()` is a server-confirmed identity lookup, so the present guard does not trust the embedded cookie user. Current docs also discuss `getClaims()` for JWT validation; replacing the current lookup is not a prerequisite established by this research. Preserve validated identity rather than authorizing from an unvalidated `getSession()` user. [Supabase getUser reference](https://supabase.com/docs/reference/javascript/auth-getuser), [SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

Middleware discards the returned auth error. A returned null user takes the anonymous branch, so this path does not distinguish a missing session from a provider failure yielding no user (`src/middleware.ts:10`). Runtime failure behavior is unverified.

### Registration, login and logout

The signup and signin handlers read `email` and `password` with TypeScript casts and pass them to Supabase. Missing configuration and returned provider errors redirect to the corresponding form with an encoded error message. Signup with no returned error redirects to `/auth/confirm-email`; successful signin redirects to `/` (`src/pages/api/auth/signup.ts:4`, `src/pages/api/auth/signin.ts:4`). The signin route does not preserve a requested destination.

The inspected POST handlers do not validate FormData types or compare `confirmPassword`. Signup's hydrated React form checks required email, email syntax, a minimum password length of six characters and matching confirmation; signin checks email and password presence. Both submit native POST forms with `noValidate` (`src/components/auth/SignUpForm.tsx:8`, `src/components/auth/SignUpForm.tsx:22`, `src/components/auth/SignUpForm.tsx:66`, `src/components/auth/SignInForm.tsx:18`, `src/components/auth/SignInForm.tsx:43`). Client validation is not a server-boundary guarantee.

Signout awaits `auth.signOut()` if a client exists, discards its returned error and redirects to `/` (`src/pages/api/auth/signout.ts:4`). That redirect alone does not prove session removal. The next protected request is the meaningful behavioral check (`scripts/smoke.mjs:57`).

### Confirmation behavior and environment policy

Local email signup is enabled, with confirmations explicitly disabled (`supabase/config.toml:202`). The existing smoke assumes immediate password login, and its inherited guide names disabled confirmations as a prerequisite (`scripts/smoke.mjs:42`, `README.md.scaffold:179`). This is an existing local integration baseline, not a settled policy for a hosted account.

Provider settings determine whether an account must confirm email before signin; current Supabase documentation distinguishes hosted and local defaults. The inspected product requirements specify email/password access without an additional confirmation gate. [Supabase password-based auth](https://supabase.com/docs/guides/auth/passwords); `context/foundation/prd.md:127`.

The result page derives its message from build mode rather than signup outcome (`src/pages/auth/confirm-email.astro:4`). For a returned signup session, the installed SDK saves the session and emits `SIGNED_IN`, while the application ignores that returned data (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:1088`, `src/pages/api/auth/signup.ts:13`). This supports checking actual signup outcome when planning accurate copy; it does not establish that the current backend has been exercised.

If confirmation is enabled later, the inspected page-route inventory contains no code-exchange or OTP-verification handler; `/auth/confirm-email` is informational. Signup supplies no `emailRedirectTo`, and local auth URLs still point to port 3000 instead of the preview's port 4321 (`src/pages/api/auth/signup.ts:13`, `src/pages/auth/confirm-email.astro:4`, `supabase/config.toml:154`, `.github/workflows/ci.yml:51`). A confirmed-email flow needs its own endpoint/template/redirect design and verification if selected. Context7 supplied official [signup callback example](https://github.com/supabase/supabase/blob/master/examples/realtime/nextjs-authorization-demo/app/login/page.tsx) and [email template guidance](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/auth-email-templates.mdx).

### Cookie lifecycle and SDK contract

The lockfile resolves `@supabase/ssr` to 0.12.7 and `@supabase/supabase-js` / `auth-js` to 2.116.0; the manifest ranges alone do not identify installed behavior (`package-lock.json:3027`, `package-lock.json:3052`, `package-lock.json:2860`).

The installed SSR client uses lazy session initialization, persists session changes, disables background auto-refresh and URL-session detection, and writes changed storage on signin, refresh and signout events (`node_modules/@supabase/ssr/src/createServerClient.ts:80`, `node_modules/@supabase/ssr/src/createServerClient.ts:165`, `node_modules/@supabase/ssr/src/createServerClient.ts:187`). Thus cookie refresh must be verified through request/response behavior, including redirects, rather than inferred from a successful build.

Middleware and auth handlers construct separate clients reading the original request header (`src/middleware.ts:7`, `src/pages/api/auth/signout.ts:5`, `src/lib/supabase.ts:12`). A same-request stale-cookie interaction after middleware refresh is a follow-up risk, not a demonstrated defect. Check it when exercising an expired access token with a valid refresh token.

The installed SSR storage passes cache-control headers as a second `setAll` argument when it writes cookies; the application callback handles the cookie argument without propagating those headers (`node_modules/@supabase/ssr/src/cookies.ts:645`, `src/lib/supabase.ts:14`). This is an observed adapter gap. Verify response headers when planning session persistence; no CDN cache leak or hosted impact was demonstrated. [SSR response propagation guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

### Existing verification and its limits

For the local disabled-confirmation baseline, the script declares eight HTTP steps: home response, anonymous dashboard redirect, signup, wrong-password signin, correct-password signin, authenticated dashboard, signout and dashboard redirect after signout (`scripts/smoke.mjs:38`). It uses manual redirects and a shared cookie jar (`scripts/smoke.mjs:7`, `scripts/smoke.mjs:23`).

Its consequential limitations are:

- Expected `/` on signin/signout is tested with `startsWith`, so `/auth/signin?error=...` also satisfies that location check (`scripts/smoke.mjs:54`, `scripts/smoke.mjs:57`, `scripts/smoke.mjs:66`).
- When signup returns session cookies that survive subsequent requests, the dashboard check can succeed using that earlier session even if the correct-password signin failed. The script does not reset the jar before testing signin. This is a source-backed false-positive possibility, not an observed runtime result (`scripts/smoke.mjs:7`, `scripts/smoke.mjs:42`, `scripts/smoke.mjs:56`; installed signup session behavior at `node_modules/@supabase/auth-js/src/GoTrueClient.ts:1091`).
- The request helper returns status and location without body content, so home/dashboard 200 checks do not establish page identity or correct confirmation wording (`scripts/smoke.mjs:35`).
- The inspected steps do not exercise expired-token refresh, a fresh browser cookie context, confirmation links, or hydrated form behavior (`scripts/smoke.mjs:38`). Signout is checked indirectly through the following protected request, without inspecting deletion attributes (`scripts/smoke.mjs:57`).

CI's smoke job starts local Supabase, derives API/anon configuration, writes `.env` and `.dev.vars`, builds, serves preview and runs the script. It excludes Mailpit, consistent with the disabled-confirmation smoke baseline (`.github/workflows/ci.yml:39`). Workflow triggers target `master`; the inspected working branch is `vm-work` (`.github/workflows/ci.yml:3`). No CI run result was inspected.

### Configuration and local prerequisites

The application declares optional server-only URL/key secrets and uses truthiness for its configuration banner. This reports presence, not reachability or key validity (`astro.config.mjs:19`, `src/lib/config-status.ts:14`). `.env.example` contains placeholders. The inherited guide documents local credentials in `.env` and `.dev.vars`, which are ignored by Git (`.env.example:1`, `README.md.scaffold:100`, `.gitignore:16`). Preserve this secret boundary; use the local anon-key pattern already defined by CI.

At inspection, root `.env` and `.dev.vars` files were absent, `node_modules` was present, and Docker's executable was available. No credentials were read, backend health queried or Docker daemon availability verified. The Node baseline is 22.14.0 (`.nvmrc:1`); the shell default was v24.21.0, so document tooling used an explicitly selected Node 22.14.0 executable. The inherited guide requires Docker for local setup (`README.md.scaffold:80`); existing `supabase/config.toml` should be reused rather than reinitialized.

Configuration warnings contain Polish text. Translate that content if these files are updated, following the English-content rule (`src/lib/config-status.ts:15`, `src/layouts/Layout.astro:24`, `AGENTS.md:7`).

## Code References

- `src/lib/supabase.ts:5` — shared server client and cookie adapter.
- `src/middleware.ts:6` — validated user lookup and redirect guard.
- `src/pages/api/auth/signup.ts:4`, `signin.ts:4`, `signout.ts:4` — native POST auth boundaries.
- `src/pages/auth/confirm-email.astro:4` — build-mode-dependent result copy.
- `scripts/smoke.mjs:38`, `scripts/smoke.mjs:66` — acceptance sequence and permissive matching.
- `.github/workflows/ci.yml:27` — existing local integration job.
- `supabase/config.toml:150`, `supabase/config.toml:202` — redirect and confirmation configuration.

## Architecture Insights / Planning Handoff

The reusable boundary is the shared SSR client plus `App.Locals.user`, native POST forms and server redirects. F-01 should establish trustworthy runtime evidence at that boundary; it does not need a new auth architecture or product tables (`src/lib/supabase.ts:5`, `src/env.d.ts:3`, `context/foundation/roadmap.md:90`).

Planning should carry forward these contracts:

- Preserve email/password access, validated server identity and anonymous protected-page redirects (`context/foundation/prd.md:79`, `context/foundation/prd.md:127`).
- Reuse the local Supabase / build / preview integration path, with explicit environment settings (`.github/workflows/ci.yml:39`).
- Close the permissive redirect and inherited-cookie verification gaps before treating smoke success as proof of password login (`scripts/smoke.mjs:66`, `scripts/smoke.mjs:7`).
- Establish accurate signup messaging, independent signin from an anonymous cookie context, session reuse across requests and refreshes, and post-signout denial. Token refresh and response-cookie/header propagation need concrete runtime evidence (`src/pages/auth/confirm-email.astro:4`, `src/lib/supabase.ts:14`).

These are planning inputs, not an implementation plan or acceptance approval. Hosted setup remains F-02; per-user spool/print data protection remains with S-01/S-02 (`context/foundation/roadmap.md:93`, `context/foundation/roadmap.md:108`).

## Historical Context

- **Recorded history:** Bootstrap reported build/type/lint success and explicitly omitted auth smoke. That historical evidence is preserved; this research did not rerun those checks (`context/changes/bootstrap-verification/verification.md:160`).
- **Supported distinction:** Its statement that build success does not verify login remains consistent with the separate runtime smoke path (`context/changes/bootstrap-verification/verification.md:167`, `.github/workflows/ci.yml:48`).
- **Current repository support:** A GitHub Actions workflow exists, including smoke. The bootstrap claim that it was inherited describes provenance and is not independently established by this static inspection (`context/changes/bootstrap-verification/verification.md:1035`, `.github/workflows/ci.yml:27`).
- **External state unknown:** Bootstrap recorded no deployment/service setup and no Cloudflare Builds connection. That describes its run; current external account state cannot be inferred from these files (`context/changes/bootstrap-verification/verification.md:1035`, `context/changes/bootstrap-verification/verification.md:1047`).

## Related Research and Evidence Coverage

No prior `research.md`, lessons document or domain glossary was found in the inspected context tree. The relevant predecessor is `context/changes/bootstrap-verification/verification.md:167`; scope comes from the PRD and roadmap.

Read-only workers examined the auth flow and configuration/verification dimensions. Primary review checked decisive handlers, middleware/cookie wiring, signup session persistence in installed SDK source, smoke assertions, CI and scope documents. Supabase documentation was fetched with Context7 (library resolution followed by separate confirmation and SSR-cookie queries) and official reference pages. No builds or application tests were run.

The application, config and foundation files cited here were untracked in the inspected Git status. The commit identifies repository HEAD, not the revision of those bytes; references are local file/line anchors. Installed SDK source anchors are dependency evidence tied to the lockfile, not tracked application files.

## Open Questions

- **Product/environment choice:** Should F-01 retain the checked-in local disabled-confirmation baseline, or explicitly support confirmed-email signup? PRD does not settle this additional policy. Enabling confirmation affects signup copy, callback/template/redirect configuration and smoke prerequisites (`context/foundation/prd.md:127`, `supabase/config.toml:209`).
- **Runtime evidence:** What happens with expired access tokens, invalid sessions and provider errors, and do updated cookies/headers survive page responses and redirects? This needs a configured integration run; static paths and current smoke do not answer it (`src/lib/supabase.ts:12`, `src/pages/api/auth/signout.ts:7`, `scripts/smoke.mjs:38`).
- **Verification environment:** Backend configuration and CI run outcomes were not inspected. Select the concrete local environment and record the resulting F-01 checks during implementation; hosted verification remains the separately scoped F-02 (`.github/workflows/ci.yml:27`, `context/foundation/roadmap.md:93`).
