# Verified Account Access Implementation Plan

## Overview

Complete roadmap F-01 by configuring and verifying the existing email/password integration against local Supabase and the built Cloudflare preview. Require native Supabase email confirmation locally, enforce the existing form rules on the server, and distinguish an authentication-service outage from an absent or invalid session.

The author approved MEDIUM complexity, three substantive decisions, and the four phases below on 2026-10-09. This document authorizes planning only; implementation and verification results remain pending.

## Current State Analysis

The starter already has native POST signup, signin and signout endpoints, React forms, an informational signup-result page, and a protected dashboard. Middleware validates identity with `auth.getUser()` and exposes `App.Locals.user`. Preserve those boundaries and the agreed anonymous redirect to `/auth/signin`.

Local email confirmation is disabled. Signup discards its returned session, while the result page derives its wording from build mode. There is no confirmation endpoint. Local Auth URLs use port 3000, while preview uses port 4321. CI excludes Mailpit, so it cannot currently exercise email confirmation.

The cookie adapter ignores SDK cache-prevention headers. Middleware and POST handlers construct separate clients against the original incoming cookies; an installed-SDK experiment demonstrated duplicate refreshes in this configuration, without establishing a production failure. The existing smoke shares cookies across signup and signin, accepts redirect prefixes, and does not inspect page bodies. Its successful run would therefore be insufficient evidence of independent password login.

Research was static and did not start the backend or prove application behavior. The planning recheck used HEAD `a946c6b0cbc69308dd77a58528581b3ab173f6e0`; production sources were unchanged and this change folder was untracked. Research's earlier HEAD and untracked-source notes describe its earlier inspection.

## Desired End State

A new local account receives a Supabase confirmation email in Mailpit. Before confirmation, password login is denied and protected pages remain inaccessible. The delivered link is verified by Supabase through an application endpoint, establishes SSR session cookies, and redirects to `/`. Independent subsequent password login also succeeds.

Protected requests preserve identity across reloads and real access-token expiry. Successful signout removes local session cookies and denies subsequent access. Invalid sessions redirect to sign-in; a service outage returns a useful HTTP 503 on protected pages and failed signout, while signup/signin show a neutral retryable form error. A transient outage does not deliberately clear otherwise usable session cookies or claim successful logout.

Local smoke and the CI-equivalent flow prove these behaviors against the production preview with isolated cookie jars, exact redirect assertions, body checks and bounded timeouts. Browser acceptance is recorded separately and is required for completion.

### Key Discoveries:

- `context/foundation/roadmap.md:80` scopes F-01 to configured account access; hosted verification belongs to F-02, and product-data isolation belongs to S-01/S-02.
- `src/lib/supabase.ts:5`, `src/middleware.ts:6`, and `src/env.d.ts:3` provide the reusable server identity and cookie boundaries.
- `src/pages/api/auth/signup.ts:13` ignores signup data; `src/pages/auth/confirm-email.astro:4` infers confirmation policy from build mode.
- `src/components/auth/SignUpForm.tsx:22` defines email, six-character password and matching-password rules that the server currently omits.
- `scripts/smoke.mjs:7` shares its jar; `scripts/smoke.mjs:66` accepts prefixes, including an auth-error redirect when `/` is expected.
- `supabase/config.toml:154`, `supabase/config.toml:209`, and `.github/workflows/ci.yml:41` require URL, confirmation and email-service changes.
- Installed `@supabase/ssr` 0.12.7 supplies cache headers through `setAll` and writes cookies on session events. Installed auth-js 2.116.0 refreshes proactively before expiry; tests must inspect the JWT's actual `exp`.

## What We're NOT Doing

- Hosted Supabase configuration, external SMTP delivery, deployment, or Cloudflare account setup; these remain F-02.
- Product tables, ownership policies for spools/prints, reservations, or account-margin settings; these belong to subsequent slices.
- Roles, OAuth, password reset, a dedicated resend-confirmation feature, or a new authentication architecture.
- Replacing `getUser()` with a different authorization mechanism or trusting an unvalidated session user.
- Arbitrary return URLs, automatic return to the originally requested protected page, or changes to successful password-login destination `/`.
- A new browser automation framework, broad test rollout, monitoring platform, or dependency upgrade.

## Implementation Approach

Reuse one server Supabase client per request through typed locals. Its cookie adapter stages mutations in request-local memory and commits retained mutations to Astro's cookie store during response finalization; middleware also collects SDK response headers and applies them to the final response, including early redirects. Keep every request's client, cookie staging state and header accumulator isolated.

Use small shared validation helpers for the existing client and server rules and a separate auth-error classification boundary. Keep Supabase responsible for account creation, password authentication, token verification and refresh. The application owns input validation, response semantics and accurate English messages.

Configure a native local confirmation template linking to `/auth/confirm?token_hash=...&type=email`. The endpoint accepts only this email-confirmation contract and invokes `verifyOtp`. Its successful destination is fixed to `/`; callers cannot supply a redirect target. Use Mailpit's JSON API to retrieve the actual delivered link during smoke.

Keep the smoke on native Node HTTP facilities. Add focused Node tests for input and error contracts; run the real confirmation, cookie, refresh and signout behavior against build plus preview. No service-role key or admin-confirmation bypass is needed.

## Critical Implementation Details

### Response lifecycle

The SDK supplies cache headers only with a client's first cookie write; later empty batches must not erase them. Apply accumulated headers and retained cookie mutations after route execution and on middleware's early responses. Preserve Astro's cookie attachment and separate `Set-Cookie` entries rather than serializing them into one combined header.

The installed SDK removes its in-memory session and emits cookie deletions before returning a retryable signout error. Stage cookie writes from the start of each request; `getAll()` reads incoming cookies overlaid with retained staged values and deletions so the SDK sees current numbered chunks. Checkpoint the staged mutations immediately before `signOut()`. On a retryable failure, restore that checkpoint, preserving any successful middleware refresh mutations, and return the 503 immediately without further session operations on the cleared SDK client. Successful or idempotent signout retains its deletion mutations. Preserve accumulated privacy headers; the 503 response supplies its own private/no-store policy even when deletion mutations are discarded.

### Actual expiry and revocation

The installed SDK starts proactive refresh 90 seconds before access-token expiry and can retain a still-valid access token after a failed proactive refresh. Wait for the JWT's actual `exp` plus clock allowance before asserting expired-session behavior. Use two distinct confirmed accounts because the existing default signout scope is global for that account.

## Phase 1: Session and auth boundaries

### Overview

Make identity, cookies, input validation and error responses trustworthy before adding confirmation-link handling.

### Changes Required:

#### 1. Request-scoped client and response propagation

**Files**: `src/lib/supabase.ts`, `src/lib/auth-cookies.ts` (new), `src/middleware.ts`, `src/env.d.ts`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signout.ts`.

**Intent**: Reuse refreshed session state within a request and emit all cookie-related response headers. Preserve validated server identity and anonymous redirects.

**Contract**: Extend the server-client factory to collect SDK headers; middleware creates one nullable client, exposes it through typed locals, and finalizes every response with accumulated headers. Endpoints use that client. Guard `/dashboard` and its descendants by path segments, without treating `/dashboard-other` as a protected dashboard path. Missing/invalid sessions redirect to `/auth/signin`; missing configuration or transient Auth unavailability on a protected request returns 503.

Keep cookie staging, the `getAll()` overlay and checkpoint/restore operations in the small `auth-cookies.ts` helper, free of `astro:env` and alias-dependent imports. The factory wires this helper into the SDK adapter; the response finalizer commits only retained mutations to Astro cookies. A failed signout must discard only mutations made after its checkpoint, preserving earlier successful refresh writes and their headers, as specified in Response lifecycle.

#### 2. Form validation

**Files**: `src/lib/auth-validation.ts` (new), `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`, `src/pages/api/auth/signup.ts`, `src/pages/api/auth/signin.ts`.

**Intent**: Apply the current form rules even when a request bypasses hydrated React. Keep frontend and server validation consistent.

**Contract**: Signup requires string `email`, `password`, and `confirmPassword`, a nonempty syntactically valid email, a password of at least six characters, and matching confirmation. Signin requires valid email and a nonempty password without applying the signup minimum. Reject missing, repeated or non-string required fields and unreadable form bodies as form errors before contacting Supabase. Preserve password bytes; never put credentials into URLs or logs. Return field errors to the client validation flow and a neutral validation message through the existing server-error form presentation.

#### 3. Error semantics and configuration messages

**Files**: `src/lib/auth-errors.ts` (new), `src/lib/auth-response.ts` (new), `src/middleware.ts`, the three auth POST endpoints, `src/components/Topbar.astro`, `src/lib/config-status.ts`, `src/layouts/Layout.astro`.

**Intent**: Explain outages without presenting them as missing sessions or successful signout. Translate configuration text touched by this work into English.

**Contract**: Separate absent/invalid sessions and rejected credentials from retryable network errors and provider 5xx failures using SDK error types/statuses, not message substring matching. Protected-page and failed-signout outage responses have HTTP 503, private/no-store caching, English retry guidance, and a usable retry link or POST signout action. Signup/signin failures redirect to their own forms with stable neutral messages. Public pages stay reachable and do not label a known lookup outage as "Not signed in". Logout without a session remains idempotent; preserve the existing global scope. Unexpected exceptions retain diagnostic causes and are not silently converted into invalid-session outcomes; log no credentials, cookie values or confirmation tokens.

#### 4. Focused auth contract tests

**Files**: `scripts/auth-contracts.test.mjs` (new), `package.json`.

**Intent**: Prove the security and error distinctions that do not require a browser or live backend.

**Contract**: Add `npm run test:auth` using Node 22's built-in test runner with TypeScript stripping to import the pure validation/error/response/cookie helpers. Keep those helpers free of `astro:env` and alias-dependent imports. Cover malformed/missing/non-string fields, mismatched passwords, lengths five/six, short nonempty signin passwords, unchanged password whitespace, absent/invalid session versus retryable outage, and 503 response status and retry guidance. Add no test framework dependency.

Include SDK/adapter regression tests using the installed SSR client, synthetic session fixtures and controlled HTTP responses. Exercise successful `getUser()` followed by `/logout` returning 503 or a network failure; assert retryable 503 semantics and no emitted cookie deletions. Also exercise a successful middleware refresh before failed signout and assert its refreshed cookie chunks and privacy headers survive, while successful signout still emits deletions. Use the production cookie helper and response semantics rather than a mocked error classifier alone. These cases expand the coverage required by existing Progress step 1.1.

### Success Criteria:

#### Automated Verification:

- Auth boundary tests pass: `npm run test:auth`.
- Lint, Astro synchronization, type checks and build pass: `npm run lint`, `npx astro sync`, `npx astro check`, and `npm run build`.

#### Manual Verification:

- Direct signup POSTs with missing or mismatched confirmation return a readable form error and do not create an account; anonymous dashboard access still redirects to sign-in.

---

## Phase 2: Local email confirmation

### Overview

Use Supabase's native confirmation workflow with a server-side application callback and accurate result messages.

### Changes Required:

#### 1. Local Auth and email configuration

**Files**: `supabase/config.toml`, `supabase/templates/confirmation.html` (new).

**Intent**: Make the local backend exercise the selected confirmed-email policy and provide a bounded token lifetime for refresh verification.

**Contract**: Enable `[auth.email].enable_confirmations`, retain the local email service on port 54324, and align `site_url` with `http://localhost:4321` and redirect allowlists with the fixed local app destinations. Add `[auth.email.template.confirmation]` with an English subject and `content_path = "./supabase/templates/confirmation.html"`; its link uses `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Set local `auth.jwt_expiry = 120` seconds, retain refresh rotation and its existing reuse interval, and restart the local stack to apply settings. This short lifetime is a documented local verification setting, not a hosted configuration recommendation.

#### 2. Confirmation endpoint

**File**: `src/pages/auth/confirm.ts` (new).

**Intent**: Exchange the provider's delivered confirmation token for a server-cookie session.

**Contract**: GET accepts exactly one nonempty `token_hash` and `type=email`, validates parameters, and calls the request-scoped client's `auth.verifyOtp`. Successful verification redirects to `/` with SDK cookies and cache headers. Missing, malformed, expired, or consumed links redirect to `/auth/confirm-email?status=invalid` with a stable English explanation and sign-in/signup links. A provider outage returns the same retryable 503 semantics as protected access, without reporting the link invalid. Ignore external return-target parameters and never echo or log the token.

#### 3. Signup outcome and result page

**Files**: `src/pages/api/auth/signup.ts`, `src/pages/auth/confirm-email.astro`.

**Intent**: Describe what Supabase actually returned rather than inferring confirmation from development mode.

**Contract**: Inspect signup data as well as error. Successful signup without a session redirects to `/auth/confirm-email?status=pending`; a returned session redirects to `/auth/confirm-email?status=ready`. Pending copy instructs the user to check email without guaranteeing creation for an already registered address; ready copy reflects immediate session availability. The result page handles pending, ready and invalid states, with a neutral default for direct visits and links appropriate to the state. The selected local configuration must produce pending and deny signin until confirmation. Keep account-existence messages neutral and do not introduce a resend feature.

### Success Criteria:

#### Automated Verification:

- Auth tests, lint, Astro synchronization, type checks and build pass: `npm run test:auth`, `npm run lint`, `npx astro sync`, `npx astro check`, and `npm run build`.

#### Manual Verification:

- A unique signup receives a local Mailpit message; correct-password signin before confirmation fails, and the delivered link establishes dashboard access in a fresh browser context.
- Pending, invalid-link and direct-visit result pages show accurate English messages; consumed-link replay cannot create a fresh session.

---

## Phase 3: Reliable auth smoke

### Overview

Turn smoke success into evidence of the built application's actual auth behavior, including native confirmation and real token refresh.

### Changes Required:

#### 1. Assertions, requests and cookie isolation

**File**: `scripts/smoke.mjs`.

**Intent**: Remove the source-backed false-positive paths and make failures actionable.

**Contract**: Use separate jars for signup, callback, anonymous signin, active sessions and replay fixtures. Parse redirect URLs and assert exact origin/path plus required/allowed query state; an error redirect never matches successful `/`. Reject unexpected external destinations. Inspect page bodies for dashboard identity and expected result messages. Preserve `Set-Cookie` metadata, deletion/expiry, and numbered auth chunks. Bound network calls and waits; a failed prerequisite fails the run rather than allowing later checks to pass with inherited state. Reports contain step names and sanitized outcomes, never session credentials or full confirmation URLs.

#### 2. Native confirmation fixtures

**File**: `scripts/smoke.mjs`.

**Intent**: Verify the delivered email flow rather than granting confirmation through a test-only account API.

**Contract**: Accept `MAILPIT_URL` with default `http://127.0.0.1:54324` alongside existing `BASE_URL`. Preflight Mailpit's v1 JSON API; poll `/api/v1/search` with an encoded recipient filter, verify exact `To[].Address`, and fetch `/api/v1/message/{ID}`. Extract the confirmation href from HTML with entity decoding and validate app origin, `/auth/confirm`, `type=email`, and token presence. Use unique recipients; do not purge shared mailboxes. Confirm two distinct fixture accounts through their actual emails. Check signup grants no access, correct credentials fail before confirmation, callback succeeds in a fresh jar, and consumed-link replay in another empty jar fails. Missing mail, disabled confirmations or incompatible API shape fail explicitly.

#### 3. Independent login, refresh and revoked-session checks

**File**: `scripts/smoke.mjs`.

**Intent**: Establish password login independently and prove both sides of the refresh boundary.

**Contract**: For a confirmed account, wrong-password signin from an empty jar leaves protected access denied; correct-password signin from a different empty jar succeeds and displays that account's email across repeated requests. After both accounts are confirmed, obtain fresh password sessions and record their JWT `exp` values without logging tokens. Preserve account B's original cookies, sign it out while its access token is valid, and wait without authenticated requests until both JWTs have expired plus two seconds. With account A's expired cookies and valid refresh token, assert access, newly emitted/rotated tokens, future expiry, SDK cache headers, and a subsequent successful request. Replay account B's revoked, expired session and assert sign-in redirect plus deletion of auth chunks. Finally sign out A and prove its cleared jar is denied. Use a 180-second refresh-wait limit and a 300-second total run limit; fail preflight if minted token lifetime is inconsistent with the selected 120-second local setting.

#### 4. Negative response coverage

**Files**: `scripts/smoke.mjs`, `scripts/auth-contracts.test.mjs`.

**Intent**: Exercise malformed auth requests and prove cookie/header emission through both page responses and redirects.

**Contract**: Add live smoke cases for missing/mismatched/non-string signup fields, invalid email, unsupported confirmation type, missing token and a malformed token. Use confirmed fixtures for wrong-password and consumed-token cases. Assert the complete SDK cache-header contract whenever an auth response sets cookies, including callback/signin/signout redirects, refresh pages and invalid-session redirects. Keep outage classification in the focused tests and verify real provider downtime manually against preview; smoke must not shut down a developer's backend.

### Success Criteria:

#### Automated Verification:

- Built-preview smoke proves pending signup, denied unconfirmed login, native Mailpit confirmation, successful callback, and rejected malformed or consumed links: `npm run smoke`.
- Built-preview smoke proves independent wrong/correct password login, correct dashboard identity, malformed POST rejection, and strict redirects: `npm run smoke`.
- Built-preview smoke proves actual-expiry refresh and rotation, revoked-refresh rejection, cookie deletion, repeat-request persistence, and denial after signout: `npm run smoke`.
- Built-preview smoke verifies SDK cache headers on cookie-writing page and redirect responses and exits nonzero on missing prerequisites or exceeded timeouts: `npm run smoke`.
- Auth contract tests and lint pass: `npm run test:auth` and `npm run lint`.

#### Manual Verification:

- During controlled local Auth unavailability, protected access and failed signout return 503 with retry guidance, signup/signin report a retryable form error, and recovery restores access without a false logout-success message.

---

## Phase 4: CI and acceptance evidence

### Overview

Make the same confirmed-email verification repeatable locally and in CI, and record browser acceptance without overstating unrun checks.

### Changes Required:

#### 1. CI verification path

**File**: `.github/workflows/ci.yml`.

**Intent**: Run the selected local confirmation policy against the built app rather than retaining the old disabled-confirmation assumption.

**Contract**: Keep Node 22 and the existing `master` triggers. Run `npm run test:auth` in CI. Keep Mailpit when starting Supabase, extract only the local API URL and anon/publishable key into ignored `.env`/`.dev.vars`, and retain server-only secrets. Verify Mailpit and preview readiness with bounded failures, supply explicit `BASE_URL=http://localhost:4321` and `MAILPIT_URL=http://127.0.0.1:54324`, and run the updated smoke. Give the integration job sufficient time for startup and the bounded expiry wait; preserve always-run stack cleanup. Never print generated keys, callback tokens or cookie values.

#### 2. Local runbook and implementation evidence

**Files**: `context/changes/verified-account-access/verification.md` (new during implementation), `.env.example`, `src/lib/config-status.ts` if its documentation link is changed.

**Intent**: Leave a repeatable setup and an honest record of the foundation's verified behavior.

**Contract**: The verification document records Node from `.nvmrc`, `npm ci`, reuse of existing Supabase config, safe local credential setup for both build and preview, service restart after config changes, Mailpit access, lint/sync/check/test/build/preview/smoke commands, and bounded-wait expectations. Document the local 120-second JWT setting and F-02's remaining hosted email/template/URL verification. Preserve existing ignored credentials rather than overwriting them blindly. Keep `.env.example` placeholder-only. Record actual commands, outcomes, fixture policy, sanitized logs and limitations; distinguish local CI-equivalent evidence from an observed remote Actions run. Do not rewrite the historical bootstrap report or mark unperformed browser checks complete.

#### 3. Browser acceptance

**Files**: `context/changes/verified-account-access/verification.md`, this plan's canonical `Progress`.

**Intent**: Verify the user-facing form and session behavior that HTTP requests cannot establish.

**Contract**: Record acceptance in current Chrome and Firefox plus a phone or narrow mobile viewport. Cover hydrated field errors, password toggles, successful native form submission, confirmation from a separate clean browser context, reload persistence, logout and protected-page denial, and visible retry messaging during a controlled outage. Repeat a valid signup with JavaScript disabled to confirm the server boundary still works. Leave each manual row pending until observed and confirmed.

### Success Criteria:

#### Automated Verification:

- The documented local CI-equivalent sequence passes with confirmed-email configuration: `npm ci`, `npm run test:auth`, `npm run lint`, `npx astro sync`, `npx astro check`, `npm run build`, production preview, and `npm run smoke`.
- CI includes Mailpit, explicit app/mail origins, auth contract tests, bounded readiness, smoke and cleanup; the verification document records actual local results and any separately observed CI run.

#### Manual Verification:

- Chrome, Firefox and mobile acceptance pass for forms, confirmation in a clean context, session reload, logout denial and outage guidance; results are recorded in `verification.md`.
- A JavaScript-disabled signup obeys server validation and completes the native confirmation flow; results are recorded in `verification.md`.

---

## Testing Strategy

### Unit Tests:

Use the focused Node auth-contract suite for server/client validation predicates, SDK error classification and retryable response semantics. Test the five/six-character boundary and preserve nonempty short passwords for signin. Include the installed-SDK cookie-adapter regression cases from Phase 1 with synthetic sessions and controlled HTTP responses; verify failed-signout rollback, preservation of earlier refresh mutations and successful-signout deletion. Avoid tests of styling or implementation structure.

### Integration Tests:

The updated smoke owns native Mailpit delivery, unconfirmed denial, callback/session creation, consumed/malformed links, anonymous independent password login, exact redirects, page identity, cookie emission/deletion, real token refresh and revoked-session denial. It uses actual local Supabase and the production preview. Cookie decoding is test-only fixture inspection; application authorization continues to use `getUser()`.

For response assertions, cookie writes carry `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, and `Pragma: no-cache`, as supplied by the installed SSR SDK. Preserve stronger applicable privacy rules on other authenticated or error responses. Mail polling is bounded to 30 seconds per fixture, and all requests have explicit timeouts within the overall run budget.

### Manual Testing Steps:

1. In each supported browser, create a unique account and check field errors and password visibility controls.
2. Confirm that signup shows pending email instructions and correct-password signin remains denied before confirmation.
3. Open the Mailpit link in a clean browser context, then inspect dashboard identity and reload it.
4. Replay the link in another clean context and inspect the invalid-link message; perform fresh password signin separately.
5. Sign out, reopen the dashboard and confirm redirection. Repeat the server-validated signup flow with JavaScript disabled.
6. Temporarily make the dedicated local Auth service unavailable, inspect protected-page/signout 503 and retryable form errors, restore it, and verify recovery. Record actions and restore the service before ending verification.

## Performance Considerations

Reuse the existing server-confirmed lookup with one client per request; add no cross-request identity cache. The local two-minute token lifetime increases refresh frequency deliberately for verification. Smoke spends roughly two minutes waiting for actual expiry, uses bounded mailbox polling, and performs no authenticated requests during that wait. No new production latency target or load-testing project is introduced.

## Migration Notes

No product-schema migration or data reset is required. Restart local Supabase after Auth/template changes; existing auto-confirmed accounts are not evidence of the new policy, so use unique new fixtures. Never erase developer data or shared mailboxes to make a run pass.

Keep intermediate phases verifiable with their listed checks; do not claim full F-01 completion until the live smoke and manual acceptance have passed. If a local configuration rollback is necessary, restore the previous settings and restart the stack together; it does not count as verified confirmed-email acceptance. Hosted template settings, actual mail delivery and URL configuration must be applied and verified independently in F-02.

## References

- Scope: `context/foundation/prd.md` (FR-001 and Access Control), `context/foundation/roadmap.md` (F-01/F-02), and `context/foundation/tech-stack.md`.
- Baseline investigation: [research.md](./research.md).
- Existing implementation: `src/lib/supabase.ts:5`, `src/middleware.ts:6`, the auth endpoints, `src/components/auth/SignUpForm.tsx:22`, and `scripts/smoke.mjs:38`.
- Local configuration and CI: `supabase/config.toml:150`, `supabase/config.toml:202`, and `.github/workflows/ci.yml:27`.
- Current documentation fetched with Context7: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [local email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates), [server-side email verification](https://supabase.com/docs/guides/auth/auth-email-templates), and [SSR cookie/header contract](https://github.com/supabase/ssr/blob/main/src/types.ts).
- Mailpit contracts: [official OpenAPI schema](https://raw.githubusercontent.com/axllent/mailpit/master/server/ui/api/v1/swagger.json) and [recipient search filters](https://mailpit.axllent.org/docs/usage/search-filters/).
- Dependency evidence: installed `@supabase/ssr` 0.12.7 and auth-js 2.116.0; source details and planning follow-up findings must be checked against these versions if dependencies change.

## Progress

### Phase 1: Session and auth boundaries

#### Automated

- [x] 1.1 Auth boundary tests pass: `npm run test:auth`. — a81264b
- [x] 1.2 Lint, Astro synchronization, type checks and build pass: `npm run lint`, `npx astro sync`, `npx astro check`, and `npm run build`. — a81264b

#### Manual

- [x] 1.3 Direct signup POSTs with missing or mismatched confirmation return a readable form error and do not create an account; anonymous dashboard access still redirects to sign-in. — a81264b

### Phase 2: Local email confirmation

#### Automated

- [x] 2.1 Auth tests, lint, Astro synchronization, type checks and build pass: `npm run test:auth`, `npm run lint`, `npx astro sync`, `npx astro check`, and `npm run build`. — cb1e1a1

#### Manual

- [x] 2.2 A unique signup receives a local Mailpit message; correct-password signin before confirmation fails, and the delivered link establishes dashboard access in a fresh browser context. — cb1e1a1
- [x] 2.3 Pending, invalid-link and direct-visit result pages show accurate English messages; consumed-link replay cannot create a fresh session. — cb1e1a1

### Phase 3: Reliable auth smoke

#### Automated

- [x] 3.1 Built-preview smoke proves pending signup, denied unconfirmed login, native Mailpit confirmation, successful callback, and rejected malformed or consumed links: `npm run smoke`. — 0f6c24b
- [x] 3.2 Built-preview smoke proves independent wrong/correct password login, correct dashboard identity, malformed POST rejection, and strict redirects: `npm run smoke`. — 0f6c24b
- [x] 3.3 Built-preview smoke proves actual-expiry refresh and rotation, revoked-refresh rejection, cookie deletion, repeat-request persistence, and denial after signout: `npm run smoke`. — 0f6c24b
- [x] 3.4 Built-preview smoke verifies SDK cache headers on cookie-writing page and redirect responses and exits nonzero on missing prerequisites or exceeded timeouts: `npm run smoke`. — 0f6c24b
- [x] 3.5 Auth contract tests and lint pass: `npm run test:auth` and `npm run lint`. — 0f6c24b

#### Manual

- [x] 3.6 During controlled local Auth unavailability, protected access and failed signout return 503 with retry guidance, signup/signin report a retryable form error, and recovery restores access without a false logout-success message. — 0f6c24b

### Phase 4: CI and acceptance evidence

#### Automated

- [x] 4.1 The documented local CI-equivalent sequence passes with confirmed-email configuration: `npm ci`, `npm run test:auth`, `npm run lint`, `npx astro sync`, `npx astro check`, `npm run build`, production preview, and `npm run smoke`. — 8b903ed
- [x] 4.2 CI includes Mailpit, explicit app/mail origins, auth contract tests, bounded readiness, smoke and cleanup; the verification document records actual local results and any separately observed CI run. — 8b903ed

#### Manual

- [x] 4.3 Chrome, Firefox and mobile acceptance pass for forms, confirmation in a clean context, session reload, logout denial and outage guidance; results are recorded in `verification.md`. — 8b903ed
- [x] 4.4 A JavaScript-disabled signup obeys server validation and completes the native confirmation flow; results are recorded in `verification.md`. — 8b903ed
