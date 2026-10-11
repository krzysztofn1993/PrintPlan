# Hosted Auth Verification Implementation Plan

## Overview

Deliver roadmap F-02: a stable HTTPS PrintPlan instance on Cloudflare Workers, connected to a new hosted Supabase project and Brevo's free SMTP service. Preserve the verified authentication flow, keep automated verification local, and give the author a repeatable manual hosted acceptance procedure.

The author approved MEDIUM complexity and the three phases below on 2026-10-10. Planning does not deploy the application or establish that hosted checks have passed.

## Current State Analysis

F-01 records successful local authentication contracts, native email confirmation, cookie refresh, revoked-session rejection, and signout. Its archived verification also records author-confirmed local browser checks. Those records are the baseline, not evidence about the new hosted instance.

Astro already renders through the Cloudflare adapter. The Worker retains the starter name, runtime credentials are optional server secrets, and the existing root page can respond successfully without usable authentication. No remote Worker, Supabase project, SMTP configuration, or deployment revision has been inspected.

The local smoke requires Mailpit, generated example.com recipients, and a 120-second JWT lifetime. Its 300-second total deadline and 180-second expiry wait make it unsuitable for the selected hosted configuration. The existing GitHub workflow runs auth contracts, sync, lint, type checks, build, and a separate local Supabase smoke job.

The research handoff resolves the apparent F-01 prerequisite conflict: F-01 is done despite the roadmap's stale backlog note. Product persistence and ownership checks remain S-01/S-02 work.

## Desired End State

- A new Worker named `print-plan` serves one stable `https://print-plan.<account-subdomain>.workers.dev` origin, connected to a new free-tier hosted Supabase project named `print-plan`. Record the actual assigned origin and project identity during setup.
- Workers Builds deploys pushes to `master` only after the repository's auth contracts, sync, lint, type checks, and build succeed. GitHub retains its separate local smoke job; no dependency on GitHub results is assumed.
- Supabase requires email confirmation, uses the hosted origin and existing confirmation template, and sends through Brevo Free to controlled recipients outside the Supabase organization team.
- The author verifies the hosted flow manually, including real inbox receipt, clean-context confirmation, browser cookie persistence, actual expiry/refresh, revoked-session rejection, logout, and later login.
- Hosted JWT expiry is temporarily reduced to a short value for the expiry experiment, then restored to 3600 seconds and checked with a newly minted session. Record the actual short value used; a specific duration is not required. All created application test accounts are deleted after acceptance.
- A durable runbook and sanitized execution evidence support later hosted product slices. Unexecuted checks remain pending; F-02 completion requires both automated and manual criteria.

### Key Discoveries:

- `wrangler.jsonc:3` retains `10x-astro-starter`; `:4` and `:7` already supply the adapter entrypoint and asset binding.
- `astro.config.mjs:19` and `src/lib/supabase.ts:6` define optional server-only Supabase configuration; a build or home-page response alone cannot establish authentication readiness.
- `src/middleware.ts:20` finalizes cookie writes and SDK headers; `:30` validates users per request; `:50` protects dashboard paths. Preserve these contracts.
- `src/pages/auth/confirm.ts:15` accepts one token hash and `type=email`, then uses `verifyOtp`; the template constructs the callback from `.SiteURL` in `supabase/templates/confirmation.html:3`.
- `src/lib/auth-errors.ts:55` signs out globally. Separate accounts are required when comparing a still-valid refresh with a revoked account.
- `scripts/smoke.mjs:10`, `:411`, and `:457` establish the local deadlines, short-lifetime assertion, and Mailpit prerequisite.
- `.github/workflows/ci.yml:18` supplies the existing fast gate sequence; `:41` starts local Supabase and `:91` runs the local smoke.
- `README.md:1` is only a project name. `README.md.scaffold` contains superseded starter instructions, including disabling email confirmation.

## What We're NOT Doing

- Spool/print tables, migrations, RLS, reservation rules, or claims that product persistence has been verified.
- A new hosted HTTP runner, inbox API integration, browser automation framework, or changes to the local smoke's timing and fixtures.
- Branch previews, additional deployment environments, custom website domains, or purchasing a sending domain.
- Paid SMTP plans or paid API integrations. Brevo's provider-address replacement is accepted for this initial setup; a permanent branded sending domain is outside this change.
- Replacing authentication handlers, changing confirmed-email policy, adding roles, or putting SMTP/service-role credentials in the application.
- Deliberately causing a hosted Auth outage. Existing local outage contracts remain the evidence for retryable failures; this plan does not claim a hosted outage exercise.

## Implementation Approach

Use the existing Astro/Supabase integration and Cloudflare configuration. Add a reusable repository verification command and a small, durable hosted runbook. Configure the new external resources without introducing application SMTP code: Supabase generates the confirmation message and sends it through Brevo.

The implementer owns repository preparation and local automation. The account owner completes account registration, provider activation, secret entry, and dashboard configuration where authenticated access is unavailable. The author performs manual acceptance against the deployed page, as explicitly requested. Missing execution access leaves the affected criterion pending; it does not justify weakening it.

The chosen email path is Brevo Free with a verified individual sender, allowing initial use without buying a domain. Brevo documents automatic replacement of an unauthenticated/free sender address. Acceptance must verify actual receipt and functional app-origin links; an SMTP configuration screen alone is insufficient. Do not buy a domain or switch providers automatically if activation fails.

## Critical Implementation Details

### Configuration boundaries

Workers Builds variables and Worker runtime secrets are separate. SMTP credentials belong only to hosted Supabase's custom SMTP settings. Changing local `supabase/config.toml` does not configure the hosted project; keep its 120-second local verification setting.

### Expiry and revocation sequencing

Changing JWT expiry does not rewrite existing tokens. Mint fresh sessions after selecting the temporary short expiry and again after restoring 3600 seconds. Complete browser acceptance first, then start the expiry experiment from fresh isolated sessions and avoid authenticated requests during the wait.

### Confirmation links

A GET to the callback consumes the token. Open a delivered link first in its intended clean browser context, then test replay in another clean context. Copying an already consumed link into another browser cannot establish a new session; mail scanning or tracking interference is a failed delivery-path check requiring correction and a fresh email.

## Phase 1: Prepare the repository and deployment gate

### Overview

Make deployment reproducible and document the agreed hosted setup while retaining the existing local regression checks.

### Changes Required:

#### 1. Worker identity

**File**: `wrangler.jsonc`

**Intent**: Replace the deferred starter Worker name with the selected PrintPlan deployment identity.

**Contract**: Worker name is `print-plan`; retain the current entrypoint, compatibility flags, assets, and observability configuration.

#### 2. Shared verification command

**File**: `package.json`

**Intent**: Give Workers Builds one command that stops deployment when an existing repository gate fails.

**Contract**: Add `verify:deploy`, sequencing `npm run test:auth`, `astro sync`, `npm run lint`, `astro check`, and `npm run build`, stopping on the first nonzero exit. Run with the committed lockfile dependencies and the Node version in `.nvmrc`. Preserve `test:auth`, `smoke`, and the current GitHub local smoke job.

#### 3. Canonical setup and acceptance documentation

**Files**: `README.md`, `README.md.scaffold`, new `context/foundation/hosted-auth.md`

**Intent**: Replace the minimal project entrypoint with accurate PrintPlan setup and command links, and provide a guide that outlives this change. Mark the scaffold README as historical and superseded, so its confirmation-disabled/cloud-smoke instructions are not followed.

**Contract**: The durable guide contains prerequisites, local-versus-hosted boundaries, Workers Builds settings, runtime secrets, hosted Supabase Auth settings, Brevo setup, manual acceptance steps, expiry restoration, account cleanup, and recovery instructions. README links to this guide and the archived F-01 local runbook. Documentation and application/source content remain English.

### Success Criteria:

#### Automated Verification:

- The deployment gate passes under the pinned Node version after `npm ci`: `npm run verify:deploy`.
- The existing local production-preview regression passes with local Supabase and Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.
- The updated repository and durable runbook documentation passes targeted Prettier checking.

**Implementation Note**: Record real command results. Reuse the existing safe local credential setup; preserve ignored credential files rather than overwriting them.

---

## Phase 2: Configure and publish the hosted instance

### Overview

Create the selected resources, connect email delivery and automatic deployment, and record the exact revision and environment used for acceptance.

### Changes Required:

#### 1. Hosting resources and build settings

**Targets**: Cloudflare Worker `print-plan`, its Workers Builds GitHub connection, `context/foundation/hosted-auth.md`

**Intent**: Publish one stable HTTPS target with gates enforced by its actual deployment process.

**Contract**: Repository root is the build root; production branch is `master`; preview builds are disabled. Use `.nvmrc`'s Node version, build variable `SKIP_DEPENDENCY_INSTALL=1`, build command `npm ci && npm run verify:deploy`, and deploy command `npx wrangler deploy`. This avoids duplicate automatic installation and enforces lockfile installation with development dependencies. Observe the effective Node version and successful gate/deploy steps in the remote build log. Record Worker identity, assigned origin, commit, build reference, and deployed version without credentials.

#### 2. Hosted Supabase and application secrets

**Targets**: New free-tier hosted Supabase project `print-plan`, Worker runtime Variables & Secrets, `context/foundation/hosted-auth.md`

**Intent**: Connect the application to its dedicated hosted account backend and preserve the existing confirmed-email policy.

**Contract**: Set runtime `SUPABASE_URL` and the project's anon/publishable `SUPABASE_KEY`. Keep email/password signup enabled, email confirmation required, refresh token rotation enabled, and the normal JWT lifetime at 3600 seconds outside the controlled test window. Set Site URL to the actual stable HTTPS app origin and exact redirect entries for its root and `/auth/confirm`. Apply `supabase/templates/confirmation.html` as the hosted Confirm signup template. Do not assume the local TOML/template configuration has been applied remotely.

#### 3. Free SMTP delivery

**Targets**: Brevo Free account and verified sender, hosted Supabase custom SMTP settings, `context/foundation/hosted-auth.md`

**Intent**: Send real signup confirmations to controlled addresses outside the Supabase organization team without a paid integration or domain purchase.

**Contract**: Activate Brevo transactional sending and verify an individual sender address controlled by the author. Configure Supabase with host `smtp-relay.brevo.com`, port `587`, the SMTP login shown in Brevo, and a Brevo SMTP key, not a Brevo API key. Use sender name `PrintPlan` and the verified address. Keep provider-address replacement visible in setup/evidence, and verify that delivered confirmation links retain the exact application origin, `/auth/confirm`, one `token_hash`, and `type=email`. Inspect tracking settings and disable link rewriting if it interferes. Record effective sending limits; the currently documented Brevo Free allowance is 300 emails/day, while Supabase applies a separate custom-SMTP rate limit. Never store SMTP credentials in repository files or Worker/application secrets.

#### 4. Deployment evidence

**File**: New `context/changes/hosted-auth-verification/verification.md`

**Intent**: Distinguish successful configuration and deployment from authentication acceptance.

**Contract**: Record environment identity, deployed commit/version, observed Workers Builds gate results, runtime configuration presence, email-provider activation, and observation date. Preserve separate local and remote evidence. Record pending acceptance explicitly; do not infer it from a root-page response or from an unobserved GitHub workflow.

### Success Criteria:

#### Automated Verification:

- The recorded stable HTTPS origin returns HTTP 200 for `/` in a credential-free bounded request.

#### Manual Verification:

- The account owner confirms the dedicated Worker/project, one stable HTTPS origin, runtime Supabase configuration, required email confirmation, rotation, and the hosted callback template/settings.
- An observed Workers Builds run for the recorded `master` commit installs with `npm ci`, passes every deployment gate under the pinned Node version, and deploys the recorded Worker version.
- Brevo Free transactional sending is activated, the selected sender is verified, and custom SMTP settings are present in hosted Supabase without repository/application credential exposure.

**Implementation Note**: The account owner must confirm these external settings and the observed deployment before Phase 3's hosted acceptance begins. Preserve local results if account access or provider activation delays publishing.

---

## Phase 3: Verify hosted authentication and close the evidence record

### Overview

The implementer supplies local automation evidence and a precise checklist; the author executes the hosted checks and restores the normal settings before deleting fixtures.

### Changes Required:

#### 1. Hosted browser acceptance procedure

**Files**: `context/foundation/hosted-auth.md`, `context/changes/hosted-auth-verification/verification.md`

**Intent**: Prove the existing account behavior through the deployed HTTPS origin and real inboxes, with attributed browser evidence.

**Contract**: Use two distinct fresh application accounts A/B with controlled deliverable addresses outside the Supabase team. Cover pending signup without a session, denied signin before confirmation, actual inbox receipt, confirmation in an empty browser context, matching dashboard identity, consumed-link rejection in another empty context, wrong-password rejection, independent password signin, reload persistence, successful signout, protected-page denial, and later signin. Cover Chrome and Firefox desktop and a phone/narrow mobile environment; record versions/device or viewport and fixture labels. Email confirmation is exercised on fresh accounts; existing confirmed accounts may be reused across browser signin checks. Include native submission with JavaScript disabled and server rejection of invalid signup. Observe redirects and privacy/cache headers locally in browser Network tools; do not export raw headers, cookies, or HAR files into evidence.

#### 2. Real expiry and revoked-session procedure

**Files**: `context/foundation/hosted-auth.md`, `context/changes/hosted-auth-verification/verification.md`

**Intent**: Verify automatic session renewal and global-signout revocation without a hosted runner or manufactured expired tokens.

**Contract**: After other browser checks, set a short temporary hosted JWT expiry and mint fresh password-signin sessions for A and B. The exact test duration is not a product requirement; record the value actually used and wait beyond the issued sessions' expiry. Keep A in one persistent browser context and B in two distinct persistent contexts B1/B2. The runbook must provide a self-contained local DevTools procedure for comparing old/new access and refresh token fingerprints without printing or persisting token values or uploading them to an external decoder.

Sign out B1, preserving B2's existing cookies. Leave A/B2 on blank tabs with no authenticated app requests until after the latest recorded JWT expiry plus a clock-skew allowance of 30 seconds. Reopen A's dashboard: require the same identity, newly written session cookies, changed access and refresh token values, and a new future expiry; then verify another request retains the session. Reopen B2's dashboard: require redirect to signin. Record only whether values changed; do not copy or retain tokens. Browser DevTools comparisons and configuration observations are author evidence, not independent cryptographic verification of a decoded JWT.

For every cookie-writing confirmation/signin/refresh/signout response, check `Cache-Control` contains `private`, `no-cache`, `no-store`, `must-revalidate`, and `max-age=0`, with `Expires: 0` and `Pragma: no-cache`; record this with the browser checks in 3.1. Verify actual browser cookie persistence over HTTPS; do not claim a local HTTP jar proves browser attribute enforcement.

#### 3. Restoration, cleanup, and final records

**Files**: `context/foundation/hosted-auth.md`, `context/changes/hosted-auth-verification/verification.md`; hosted Supabase Auth settings and test users

**Intent**: Leave normal hosted settings and an auditable result without retaining test accounts or credentials.

**Contract**: Restore 3600-second hosted JWT expiry after the experiment, including on failure/interruption. Mint a fresh session and verify its lifetime reflects 3600 seconds and that the dashboard works; reload/signout behavior is covered in 3.1. The short-expiry test demonstrates refresh/revocation; the restoration check does not claim an additional one-hour expiry experiment. Delete all application test users created by this acceptance from this dedicated project's Auth users panel, using fixture identities maintained privately. Do not delete provider/operator accounts, the Supabase project, or the Worker. Confirm fixture deletion and clear local test-browser cookie state.

Evidence includes local gate/smoke results, deployed revision, attributed real-inbox/browser results, expiry timing and token-change booleans, restoration, and cleanup. Use fixture labels only; exclude full recipient addresses, credentials, confirmation URLs/query strings, raw cookie/JWT/refresh values, and provider bodies. Every incomplete or failed check remains explicit and blocks F-02 completion.

### Success Criteria:

#### Manual Verification:

- The author confirms real non-team inbox delivery, fresh-context confirmation, consumed-link rejection, validation/credential rejection, HTTPS session persistence, signout denial, and later login in the documented browser matrix.
- The author confirms refresh and revoked-session behavior after a short temporary expiry, recording the actual value used, A's access/refresh rotation and subsequent persistence, and B2's revoked-session rejection. Cookie-writing response privacy headers are recorded with the browser checks in 3.1.
- Hosted JWT expiry is restored to 3600 seconds and freshly minted sessions demonstrate that lifetime and successful dashboard/reload/signout.
- All application test accounts created during acceptance are deleted from the dedicated hosted project and test-browser cookie state is cleared.
- The verification record contains attributed local/remote results, deployed commit/version, browser details, restoration and cleanup, with no failed or pending required checks and no sensitive artifacts.

**Implementation Note**: Do not mark manual rows complete from local automation, file existence, provider configuration, or an unobserved deployment. F-02 remains unfinished until the author supplies the required hosted results.

---

## Testing Strategy

### Unit Tests

Run the existing `npm run test:auth` contracts through `verify:deploy`. No new unit suite or test framework is needed for deployment identity, command wiring, or documentation changes. If observed hosted failures require production code changes, investigate and extend the reviewed scope before introducing a fix and its appropriate regression test.

### Integration Tests

Retain the F-01 local production-preview/Mailpit smoke unchanged and execute it in Phase 1. It verifies the adapter, native confirmation, short-lived local refresh, invalid-session handling, and global signout. Record the local origin and 120-second lifetime separately from the hosted origin and whichever temporary short expiry was used.

### Manual Testing Steps

1. Confirm the deployed revision, stable origin, hosted configuration, activated Brevo sender, and sending quota before creating accounts.
2. Register fresh A/B accounts, verify delivered links in clean contexts and preconfirmation/replay rejection, then complete desktop/mobile signin, reload, signout, and native-form checks.
3. Set a short temporary expiry, mint fresh A/B sessions, sign B1 out, and wait past actual token expiry without authenticated requests in A/B2.
4. Verify A refresh/persistence and B2 denial/deletion, with the documented local fingerprint and response-header checks.
5. Restore 3600 seconds, inspect newly minted sessions, verify normal account access, then delete all acceptance fixtures and clear their browser state.
6. Record sanitized evidence. Missing email, scanner-consumed links, provider rejection, unexpected caching, or incorrect lifetime is a failed check, requiring correction and a new affected run.

## Performance Considerations

This is a small-user hosted verification foundation. The existing application request model is retained. Plan the manual run within the observed provider and Supabase quotas; do not loop signup requests to overcome rate limits. The expiry experiment requires approximately five minutes plus the stated skew allowance after the latest fresh session; provider activation and human/browser steps are additional elapsed time.

## Migration Notes

No product schema or existing account migration is required. The new hosted Supabase project is separate from local Supabase and existing external projects. Renaming the Worker config creates/targets `print-plan`; it does not remove a remotely existing starter Worker.

Before external configuration changes, record the previous non-secret settings and a private recovery method. If verification fails, restore the normal JWT lifetime first, correct the affected configuration, and rerun the affected checks. Retain the environment for troubleshooting rather than automatically deleting it. If a deployed code revision must be rolled back, return to the last verified revision through the same gated deployment path; do not assume a code rollback restores Supabase/SMTP settings.

## References

- [Research](research.md); [F-01 local verification](../../archive/2026-10-09-verified-account-access/verification.md).
- [Roadmap F-02](../../foundation/roadmap.md); [selected stack](../../foundation/tech-stack.md); [PRD](../../foundation/prd.md).
- Repository anchors: `wrangler.jsonc:3`, `package.json:14`, `.github/workflows/ci.yml:18`, `astro.config.mjs:19`, `src/middleware.ts:20`, `src/pages/auth/confirm.ts:15`, `src/lib/auth-errors.ts:55`, `scripts/smoke.mjs:411`.
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [build image/version/install settings](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/), checked 2026-10-10 using Context7 and official documentation.
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) and [session expiry guidance](https://supabase.com/docs/guides/auth/sessions), checked 2026-10-10 using Context7 and official documentation.
- [Brevo SMTP configuration](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), [Free plan limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), and [sender-address replacement](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders), checked 2026-10-10. Provider activation and actual delivery remain implementation/acceptance prerequisites.

## Progress

> Pending rows are completed only with execution evidence; append the closing commit SHA when a step lands.

### Phase 1: Prepare the repository and deployment gate

#### Automated

- [x] 1.1 The deployment gate passes under the pinned Node version after `npm ci`: `npm run verify:deploy`. — dbeddfa
- [x] 1.2 The existing local production-preview regression passes with local Supabase and Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`. — dbeddfa
- [x] 1.3 The updated repository and durable runbook documentation passes targeted Prettier checking. — dbeddfa

### Phase 2: Configure and publish the hosted instance

#### Automated

- [x] 2.1 The recorded stable HTTPS origin returns HTTP 200 for `/` in a credential-free bounded request.

#### Manual

- [x] 2.2 The account owner confirms the dedicated Worker/project, one stable HTTPS origin, runtime Supabase configuration, required email confirmation, rotation, and the hosted callback template/settings. — owner-confirmed, including signup persistence in hosted Supabase, 2026-10-11
- [x] 2.3 An observed Workers Builds run for the recorded `master` commit installs with `npm ci`, passes every deployment gate under the pinned Node version, and deploys the recorded Worker version. — build `bf72462e`, commit `b8c6423`, version `7176faa8-da59-43cc-8522-6764b18bbabe`
  - The owner selected Node `24.21.0` as the common pin; the observed remote build used this version, and `.nvmrc` plus the runbook now match.
- [x] 2.4 Brevo Free transactional sending is activated, the selected sender is verified, and custom SMTP settings are present in hosted Supabase without repository/application credential exposure. — owner reports sender issue resolved and sending works, 2026-10-11

### Phase 3: Verify hosted authentication and close the evidence record

#### Manual

- [x] 3.1 The author confirms real non-team inbox delivery, fresh-context confirmation, consumed-link rejection, validation/credential rejection, HTTPS session persistence, signout denial, and later login in the documented browser matrix. — owner-confirmed; HTTPS cookie-writing response privacy headers checked
  - Owner reports the six simplified browser checks passed manually on 2026-10-11, including Chrome, Firefox, and mobile/narrow viewport; JavaScript-disabled validation also passed.
  - HTTPS signin, signout, fresh confirmation, and refresh responses passed the observed privacy/cache header check; fresh production signin and confirmation responses include `Secure`. The owner confirms the refresh response included `Set-Cookie`; its value is not retained. Supabase SSR's default `HttpOnly=false` remains unchanged.
- [x] 3.2 The author confirms short-expiry refresh and revoked-session behavior, A's access/refresh rotation and subsequent persistence, and B2's revoked-session rejection. — owner-reported 60-second A/B trial and a later 15-second refresh check; no raw values retained
  - After waiting more than 15 seconds, the owner reports the dashboard remained available and the cookie value changed. In the 60-second trial, A remained signed in and B2 was denied after B1 signout and about four minutes idle. The test duration is not fixed; refresh response privacy headers are tracked in 3.1.
- [x] 3.3 Hosted JWT expiry is restored to 3600 seconds and a freshly minted session demonstrates that lifetime and successful dashboard access.
  - Owner restored 3600 seconds, signed in again, and reports the dashboard worked. A fresh production signin inspected in memory returned a 3600-second access token and `Secure` cookie. Reload/signout behavior is covered by 3.1.
- [x] 3.4 All application test accounts created during acceptance are deleted from the dedicated hosted project and test-browser cookie state is cleared. — owner-confirmed, 2026-10-11
- [x] 3.5 The verification record contains attributed local/remote results, deployed commit/version, browser details, restoration and cleanup, with no failed or pending required checks and no sensitive artifacts. — browser versions and fixture labels were not retained
