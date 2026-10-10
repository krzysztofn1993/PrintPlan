---
date: 2026-10-10T13:45:39Z
researcher: Codex
git_commit: 0b6adcb68d8b252c4bf57dd731b667c6ff698db2
branch: hosted-auth-verification
repository: hosted-auth-verification
topic: "hosted-auth-verification: deployment contracts and hosted account verification gaps"
tags: [research, codebase, auth, supabase, cloudflare, deployment]
status: complete
last_updated: 2026-10-10
last_updated_by: Codex
last_updated_note: Initial repository and current documentation investigation; hosted execution remains unverified
---

# Research: Hosted auth verification

**Date:** 2026-10-10T13:45:39Z
**Researcher:** Codex
**Git Commit:** 0b6adcb68d8b252c4bf57dd731b667c6ff698db2
**Branch:** hosted-auth-verification
**Repository:** hosted-auth-verification; product: PrintPlan

## Research Question

For roadmap F-02, what existing deployment and authentication contracts can be reused, what prevents the current
account smoke from verifying a hosted instance, and what configuration, decisions and evidence must planning address?

At the start of this investigation, the supplied change ID had no active or archived change folder. Scope comes from
`context/foundation/roadmap.md:93`: establish a hosted account verification path that later product slices can use.
Product persistence and ownership checks belong to S-01/S-02 (`context/foundation/roadmap.md:108`). The selected stack
already specifies Cloudflare Workers, Workers Builds, GitHub and deployment on pushes to `master`
(`context/foundation/tech-stack.md:8`, `context/foundation/tech-stack.md:24`).

## Summary

- The application has SSR routes, native email confirmation, password signin, request-scoped session validation,
  cookie refresh propagation and signout. Reuse these contracts; the hosting investigation does not establish a need
  to replace the auth architecture (`astro.config.mjs:10`, `src/middleware.ts:7`, `src/pages/auth/confirm.ts:14`,
  `src/pages/api/auth/signin.ts:28`, `src/lib/auth-errors.ts:45`).
- Hosted readiness is unproven. The checked-in Worker retains the starter name and local Supabase settings retain
  localhost URLs; repository files cannot establish the remote Worker bindings or hosted Auth settings
  (`wrangler.jsonc:3`, `supabase/config.toml:154`). No hosted account was inspected during this research.
- Changing `BASE_URL` alone cannot turn the inspected smoke into hosted verification. It still requires Mailpit,
  generates `@example.com` recipients and requires JWT lifetimes between 110 and 130 seconds
  (`scripts/smoke.mjs:195`, `scripts/smoke.mjs:411`, `scripts/smoke.mjs:457`).
- Preserve the implemented email-confirmation policy on the hosted Supabase project. Signup accepts the session the
  provider returns, and middleware checks user presence; those inspected paths do not independently enforce a
  confirmed email (`src/pages/api/auth/signup.ts:28`, `src/pages/api/auth/signup.ts:47`, `src/middleware.ts:30`).
- F-01 has recorded local completion, while F-02 needs its own hosted execution evidence. The roadmap prerequisite is
  marked done; its handoff row still says to complete F-01 (`context/foundation/roadmap.md:91`,
  `context/foundation/roadmap.md:206`).

Research is complete for repository and documentation analysis. It does not certify a deployment or F-02 completion.
External environment settings, email receipt, HTTPS cookie behavior and hosted refresh remain execution gaps.

## Detailed Findings

### Deployment target and build contracts

`astro.config.mjs:10` uses server output and the Cloudflare adapter. `wrangler.jsonc:4` points to
`@astrojs/cloudflare/entrypoints/server`, with `nodejs_compat` and an `ASSETS` binding to `./dist`. These settings match
the current documented adapter entrypoint and runtime arrangement. The documented deployment sequence builds Astro
before running Wrangler. If planning introduces named Cloudflare environments, the adapter documentation requires
selecting the environment during the build rather than reusing one artifact with a different deploy flag.
[Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/),
[Astro Cloudflare deployment](https://docs.astro.build/en/guides/deploy/cloudflare/).

The Worker name remains `10x-astro-starter` (`wrangler.jsonc:3`), while the stack records `print-plan`
(`context/foundation/tech-stack.md:4`). Bootstrap explicitly deferred renaming the Worker to deployment work
(`context/changes/bootstrap-verification/verification.md:1044`). Resolve the actual Worker identity before connecting
Builds; the package name is not evidence of the remote deployment target (`package.json:2`).

The repository pins Node to 22.22.3 in `.nvmrc:1`; GitHub Actions uses that value (`.github/workflows/ci.yml:16`).
Workers Builds supports `.nvmrc` and `NODE_VERSION` for selecting Node. Preserve the pin and record the actual remote
build runtime rather than relying on its changing default.
[Workers Builds image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/).

Workers Builds runs a configured build command and then a deployment command; production-branch selection controls
which pushes deploy. For this repository, the established branch is `master`, the existing compilation script is
`npm run build`, and the documented deployment command is `npx wrangler deploy`. Non-production preview builds are
configurable and introduce a distinct preview URL/settings contract.
[Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[Build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/);
`context/foundation/tech-stack.md:24`, `package.json:7`.

The inspected GitHub workflow checks and builds the app, while its smoke job provisions local Supabase and preview.
It contains no hosted deployment step (`.github/workflows/ci.yml:18`, `.github/workflows/ci.yml:41`,
`.github/workflows/ci.yml:90`). Consequently, that workflow definition does not establish that Workers Builds is
connected or that its deployments wait for GitHub checks. A plan must specify where deployment gates are enforced.

### Runtime secrets and readiness

`SUPABASE_URL` and `SUPABASE_KEY` are optional server secrets (`astro.config.mjs:19`). The client factory returns
`null` when either is absent (`src/lib/supabase.ts:5`). The configuration banner checks their presence rather than
connectivity or key validity (`src/lib/config-status.ts:14`). A successful public home response therefore cannot
establish usable authentication (`src/pages/index.astro:1`, `src/middleware.ts:50`).

Workers Builds variables are separate from runtime variables. Configuring the build environment does not populate
the deployed Worker's environment; runtime values belong to its Variables & Secrets settings or the supported
Wrangler secret mechanism. The Astro adapter documents compatibility with `astro:env/server`, so the current imports
have a supported integration path that must still be verified in the deployed revision.
[Build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Astro Cloudflare bindings](https://docs.astro.build/en/guides/integrations-guide/cloudflare/#environment-variables-and-bindings).

Use the selected hosted project's URL and anon/publishable key for the application, preserving server-only schema
access. F-01 explicitly excludes a service-role key from its application credential files
(`context/archive/2026-10-09-verified-account-access/verification.md:59`). The application setup and any eventual
fixture administration have different credential requirements; the latter is an unresolved operational choice.

The inspected Wrangler file declares neither a custom domain nor a named environment, and declares no Supabase
values (`wrangler.jsonc:1`). Remote bindings, routes and domains may exist outside that file; their state is unknown.

### Hosted email confirmation and callback origin

Local Auth sets `site_url = "http://localhost:4321"`, localhost additional redirect URLs, and email confirmations
enabled (`supabase/config.toml:154`, `supabase/config.toml:209`). Its template is referenced through a local content
path (`supabase/config.toml:219`). These files establish the local setup, not hosted dashboard configuration.

The template builds its link as `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email`
(`supabase/templates/confirmation.html:3`). Signup passes email and password without `emailRedirectTo`
(`src/pages/api/auth/signup.ts:28`). The hosted project needs its confirmation setting, Site URL and Confirm signup
template verified against this contract. The callback expects one nonblank `token_hash` and one `type=email`, calls
`verifyOtp`, requires a returned session, and redirects to `/` (`src/pages/auth/confirm.ts:15`).

Supabase documents `.SiteURL` as the configured application URL and `.RedirectTo` as the requested redirect value.
Its default confirmation link uses a different verification destination; the server callback template is therefore
a functional part of this integration. Email tracking may rewrite links, and some mail systems prefetch links.
Because this application verifies the token on GET, scanner visits are a plausible cause of a consumed link before
the user's visit, not an observed incident here. Check the chosen mail path before changing the confirmation UX.
[Email templates](https://supabase.com/docs/guides/auth/auth-email-templates);
`supabase/templates/confirmation.html:3`, `src/pages/auth/confirm.ts:28`.

For production redirect configuration, Supabase recommends exact destinations; preview wildcards are supported.
In this inspected template, expanding the redirect allowlist does not change the `.SiteURL` expression. If multiple
app origins share a project, confirmation still targets that project's configured Site URL unless the integration
changes. A preview strategy must account for the callback origin and its resulting browser cookies.
[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls);
`supabase/templates/confirmation.html:3`, `src/pages/api/auth/signup.ts:28`.

The hosted confirmed-email policy is consequential: signup routes a returned session to `status=ready`, otherwise
to `status=pending` (`src/pages/api/auth/signup.ts:47`). Dashboard authorization checks a current user without an
explicit email-confirmation predicate (`src/middleware.ts:30`, `src/middleware.ts:54`). Preserve the provider policy
and verify denied password signin before confirmation; changing it would contradict the F-01 smoke contract
(`scripts/smoke.mjs:599`).

### Real email delivery and fixture requirements

Without custom SMTP, Supabase's documented default sender restricts recipients to the project's organization team
and currently limits sending to two messages per hour. The default service is intended for exploration, with no
delivery SLA. A limited check using authorized team recipients is distinct from proving signup delivery for other
users; the latter requires an appropriate configured sending service.
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

The inspected fixture generator creates unique `@example.com` addresses and the smoke discovers email through
Mailpit (`scripts/smoke.mjs:195`, `scripts/smoke.mjs:332`). Hosted verification needs controlled deliverable addresses
and a way to obtain the delivered links. A real inbox check may be manual or use an approved existing inbox
integration; no inbox provider was selected during research. Admin confirmation or generated links would not
establish real email receipt.

The PRD excludes paid API integrations (`context/foundation/prd.md:137`). A plan must preserve that constraint when
choosing a sending/inbox path, including any provider prerequisites; research has not approved a paid service.
The selected hosted project's SMTP settings, sending limits and allowed recipients were not inspected.

### Smoke portability and preserved assertions

The current script accepts HTTP or HTTPS origins, but preflights Mailpit's v1 API regardless of `BASE_URL`
(`scripts/smoke.mjs:438`, `scripts/smoke.mjs:457`). Its mailbox acquisition and fixtures require adaptation or a
separate hosted verification path. Preserve the local CI regression path while defining hosted evidence explicitly.

For each inspected `assertJwtExpiry` call, the JWT must contain integer `iat` and `exp`, and `exp - iat` must fall
between 110 and 130 seconds (`scripts/smoke.mjs:411`). The local setting is 120 seconds
(`supabase/config.toml:158`). The script limits the complete run to 300 seconds, expiry waiting to 180 seconds,
mailbox waiting to 30 seconds per recipient and an HTTP request to 10 seconds (`scripts/smoke.mjs:10`). It waits until
the later of the signed-in accounts' token expiries plus two seconds, without authenticated requests during that
wait (`scripts/smoke.mjs:748`). These conditions do not accommodate an arbitrary hosted token lifetime.

F-01 describes its short lifetime as a local verification setting
(`context/archive/2026-10-09-verified-account-access/verification.md:16`). Determine the selected hosted lifetime and
an honest expiry/refresh verification method in planning. A signin request or a manually edited JWT cannot substitute
for evidence that a genuinely expired access token caused a valid session to refresh.

Reusable behavioral assertions include:

- Validation rejection and pending signup without an auth session; password signin denied before confirmation
  (`scripts/smoke.mjs:476`, `scripts/smoke.mjs:573`, `scripts/smoke.mjs:599`).
- Confirmation in an empty cookie jar, matching dashboard identity, and consumed-link rejection in another empty
  jar (`scripts/smoke.mjs:618`, `scripts/smoke.mjs:628`).
- Wrong-password rejection and independent password signin from empty jars, followed by repeated authenticated
  requests (`scripts/smoke.mjs:643`, `scripts/smoke.mjs:691`).
- Changed access and refresh tokens after actual expiry, persistence on the subsequent request, denied revoked
  refresh after expiry, and signout cookie deletion followed by protected-page denial
  (`scripts/smoke.mjs:767`, `scripts/smoke.mjs:780`, `scripts/smoke.mjs:786`, `scripts/smoke.mjs:794`).
- Exact HTTP 302 destinations constrained to the configured origin, expected path, permitted query keys and no
  fragment (`scripts/smoke.mjs:281`).

The custom jar parses cookie attributes but emits stored name/value pairs without browser domain, path, Secure or
SameSite enforcement (`scripts/smoke.mjs:82`, `scripts/smoke.mjs:118`). Hosted browser acceptance must check actual
HTTPS persistence in the PRD's Chrome, Firefox and phone environments (`context/foundation/prd.md:110`).

The inspected smoke signs fixture accounts out but contains no account deletion call within `runSmoke`
(`scripts/smoke.mjs:438`). CI stops its local Supabase stack (`.github/workflows/ci.yml:92`); a hosted run needs an
explicit fixture retention/cleanup policy. Global signout means independent accounts matter when verifying a valid
refresh alongside a revoked session (`src/lib/auth-errors.ts:55`).

### Session, cache and failure contracts

Middleware creates the client and cookie store per request, performs `getUser` outside the credential POST paths,
and gives the handlers that client (`src/middleware.ts:7`). Cookie mutations and SDK-supplied response headers are
accumulated and applied to the final response (`src/lib/supabase.ts:14`, `src/middleware.ts:20`). Preserve this wiring
when adding deployment configuration or verification.

For unavailable protected access, confirmation, or signout, the current response helper produces HTTP 503 with
retry guidance and private cache prevention (`src/lib/auth-response.ts:29`, `src/pages/auth/confirm.ts:7`,
`src/pages/api/auth/signout.ts:5`). Failed retryable signout restores mutations to the checkpoint taken immediately
before that operation, preserving earlier middleware refresh writes (`src/lib/auth-errors.ts:52`,
`src/lib/auth-cookies.ts:44`). This is a concrete contract, not proof of hosted outage behavior.

When the HTTP smoke sees cookie writes, it requires the SDK cache directives plus `Expires: 0` and `Pragma: no-cache`
(`scripts/smoke.mjs:62`, `scripts/smoke.mjs:241`). Preserve these checks on cookie-writing redirects and refresh
responses. The application supplies no explicit `cookieOptions` (`src/lib/supabase.ts:9`); precise cookie defaults and
deployed CDN behavior require package/runtime evidence. A successful localhost test cannot certify them for HTTPS.

## Code References

- `astro.config.mjs:10` — SSR adapter and optional server secret schema.
- `wrangler.jsonc:3` — Worker identity, entrypoint, assets and observability configuration.
- `.github/workflows/ci.yml:18` — repository checks; `:41` — local smoke environment.
- `supabase/config.toml:154` — local URLs and token lifetime; `:209` — email confirmation policy.
- `supabase/templates/confirmation.html:3` — callback constructed from the project Site URL.
- `src/middleware.ts:7` — request client, session lookup, protection and response finalization.
- `src/lib/supabase.ts:5` — secret availability, cookie callback and SDK header propagation.
- `src/lib/auth-errors.ts:45` — global signout and retryable failure handling.
- `scripts/smoke.mjs:438` — local integration flow and prerequisites.

## Architecture Insights

The hosted verification path crosses distinct configuration boundaries: Workers Builds prepares and deploys the
revision, the Worker receives runtime secrets, Supabase controls confirmation policy and email content, the sender
delivers the link, and the browser receives app-origin session cookies. These boundaries explain why a successful
build or root-page response is insufficient (`.github/workflows/ci.yml:23`, `src/lib/supabase.ts:5`,
`supabase/templates/confirmation.html:3`, `src/pages/auth/confirm.ts:28`).

F-02 should establish reproducible deployment and auth evidence for later slices. Passing auth identity checks does
not establish persisted spool/print isolation; the roadmap assigns those contracts to the product persistence slices
(`context/foundation/roadmap.md:108`, `src/pages/dashboard.astro:14`).

## Historical Context

- **Supported recorded completion:** F-01's verification records the local smoke as passed on 2026-10-10 and the
  roadmap marks F-01 done. These are accepted existing records, not fresh execution in this research
  (`context/archive/2026-10-09-verified-account-access/verification.md:113`, `context/foundation/roadmap.md:91`).
- **Supported limitation:** F-01 explicitly leaves hosted email/template/URL verification to F-02 and records no
  observed remote Actions run (`context/archive/2026-10-09-verified-account-access/verification.md:118`, `:136`).
- **Qualified browser evidence:** The archive records author-confirmed local browser/outage outcomes without exact
  browser/device details. Preserve that attribution; it cannot establish hosted browser behavior
  (`context/archive/2026-10-09-verified-account-access/verification.md:122`).
- **Superseded current baseline claims:** The earlier research reported disabled local confirmations, no OTP
  callback and missing SDK header propagation. Current sources enable confirmations, implement `verifyOtp`, and
  accumulate SDK headers. Its separate finding that signup does not pass `emailRedirectTo` remains supported
  (`context/archive/2026-10-09-verified-account-access/research.md:59`, `:65`, `:75`;
  `supabase/config.toml:209`, `src/pages/auth/confirm.ts:28`, `src/lib/supabase.ts:14`,
  `src/pages/api/auth/signup.ts:28`).
- **Historical deployment claim remains historical:** Bootstrap says Builds was not connected during its run and
  deferred Worker naming. The current file still has that starter name, but current external connection state cannot
  be inferred from the record (`context/changes/bootstrap-verification/verification.md:1035`, `:1044`,
  `wrangler.jsonc:3`).
- **Roadmap contradiction resolved for planning:** The F-02 handoff row says to complete F-01, despite F-01 being
  marked done with archived evidence. The remaining gaps are hosted environment decisions and execution, rather
  than a need to repeat the completed local change (`context/foundation/roadmap.md:91`, `:206`).

## Related Research

[Verified account access research](../../archive/2026-10-09-verified-account-access/research.md) describes the
pre-implementation baseline; use it with the individual current verdicts above. Its
[verification record](../../archive/2026-10-09-verified-account-access/verification.md) supplies the local handoff.

## Open Questions and Planning Handoff

The established decisions are Workers hosting, using Builds with a GitHub connection, the `master` deployment branch, Supabase
email/password auth, the implemented confirmed-email flow, and server-only configuration. Sources are
`context/foundation/tech-stack.md:24`, `supabase/config.toml:209`, `astro.config.mjs:19` and the F-01 evidence above.

Planning needs the following concrete choices or account evidence:

- **Environment and origin — author/account owner:** Which existing or new Worker and hosted Supabase project will
  serve verification, and what stable HTTPS origin will be used? If previews are required, define their callback
  origin and resource isolation; no preview requirement was established here.
- **Email delivery — author/account owner:** Is custom SMTP already configured, or is an initial team-recipient
  demonstration intended? Select controlled recipients and a delivery/inbox path compatible with the PRD's cost
  constraint. Do not treat a team-only demonstration as proof of arbitrary-user signup delivery.
- **Hosted runner and expiry — planning:** Decide whether to adapt the existing script or create a focused hosted
  runner plus manual mailbox/browser steps. Keep explicit coverage for actual expiry and refresh under the selected
  hosted settings; record partial coverage when a step cannot be executed.
- **Deployment gates and records — planning/account owner:** Record the build trigger, checked revision, effective
  runtime secrets, successful deployment URL/version and observed checks. Resolve whether Builds runs the required
  gates itself or relies on enforced merge checks; the repository does not show the remote policy.
- **Fixtures and acceptance — planning/account owner:** Define account retention/cleanup and repeatable real-inbox,
  clean-browser confirmation, reload, logout and subsequent login evidence. Preserve retryable failure semantics;
  any hosted failure experiment needs a defined environment and recovery path.

## Investigation Coverage and Limitations

Read-only workers covered application/runtime contracts and smoke/CI coverage. Both completed before synthesis;
the primary inspected decisive handlers, response/cookie paths, smoke predicates, configuration and historical claims.
Foundation PRD, stack and roadmap supplied scope. No lessons document or domain glossary exists in the inspected
`context/` tree.

Context7 library resolution and documentation fetches succeeded for Astro, Supabase and Cloudflare Workers.
Official provider pages supplied the detailed runtime/build distinction, mail restrictions and URL/template rules.
Context7 did not expose a matching version-specific Astro documentation ID; documentation describes the current
integration rather than independently proving the installed version's behavior. The lockfile records Astro 7.3.2,
Cloudflare adapter 14.3.1, Supabase SSR 0.12.7, Supabase JS 2.116.0 and Wrangler 4.131.1
(`package-lock.json:4130`, `:72`, `:3028`, `:3053`, `:10897`). Installed adapter/SSR sources are absent in this workspace.

GitHub CLI's repository read failed because it is unauthenticated, so workflow results and remote branch protection
were not observed. Cloudflare and hosted Supabase account settings were not inspected, and no hosted origin was
provided. No build, app test, signup, deployment or remote configuration change was performed. The research artifact
and its change identity are the repository writes for this investigation.
