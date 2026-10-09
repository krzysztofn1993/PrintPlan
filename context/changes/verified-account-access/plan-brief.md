# Verified Account Access — Plan Brief

> Full plan: [plan.md](./plan.md)
> Research: [research.md](./research.md)

## What & Why

Complete roadmap F-01 with trustworthy local evidence that email/password accounts, confirmation links and cookie sessions work through the built application. This foundation unlocks the personal stock and planned-print slices.

## Starting Point

The starter has auth endpoints, forms and a protected dashboard, but configured runtime behavior is unproven. Local confirmation is disabled, signup copy depends on build mode, the cookie adapter omits SDK cache headers, and smoke can confuse failed login with success.

## Desired End State

A new local account receives a Supabase email in Mailpit and remains unable to log in until confirmed. The delivered link creates a server-cookie session; independent password login, reloads, real token refresh and logout work reliably. Auth outages receive useful retry guidance instead of an invalid-session redirect or false logout success.

## Key Decisions Made

| Decision           | Choice                                                                                                         | Why                                                                                   | Source          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------- |
| Email confirmation | Require native Supabase confirmation locally, verified through Mailpit.                                        | Exercise the full email flow before hosted verification.                              | Plan            |
| Validation         | Enforce existing form rules on the server, including matching confirmation and a six-character signup minimum. | A direct POST must not bypass form rules; signin still accepts any nonempty password. | Plan            |
| Outages            | Protected pages and failed signout return 503; signup/signin show neutral retryable form errors.               | Separate infrastructure failure from missing/invalid sessions and failed credentials. | Plan            |
| Identity           | Keep server-confirmed `getUser()` and reuse one client per request.                                            | Preserve the starter's boundary and share refreshed state within a request.           | Research / Plan |
| Destinations       | Anonymous protected access goes to sign-in; successful signin and confirmation go to `/`.                      | Preserve the agreed redirect and avoid arbitrary return targets.                      | PRD / Plan      |
| Refresh evidence   | Local JWT lifetime is 120 seconds; test actual expiry with two distinct confirmed accounts.                    | Proactive refresh and account-global signout otherwise make fixtures misleading.      | Research / Plan |
| Verification       | Focused native Node tests plus real HTTP smoke against build/preview, followed by browser acceptance.          | Cover boundary behavior without adding a browser framework.                           | Research / Plan |

## Scope

**In scope:**

- Request-scoped client, cookies/cache headers, server validation and outage handling.
- Local confirmation configuration/template, fixed server callback and accurate signup messages.
- Independent login, native email, refresh/revocation and signout smoke; CI and recorded browser acceptance.

**Out of scope:**

- Hosted setup, external SMTP and deployment (F-02); product tables and ownership policies (S-01/S-02).
- Roles, OAuth, password reset, dedicated confirmation resend, arbitrary return URLs and broad test/monitoring rollout.

## Architecture / Approach

Astro middleware creates one Supabase client per request, validates identity and finalizes response headers. Its cookie adapter stages mutations with an in-request overlay; retryable signout failures discard signout mutations while retaining earlier successful refresh writes. Focused SDK/adapter regression tests cover this behavior and successful cookie deletion. Existing forms submit to validated POST endpoints. Supabase sends the Mailpit email; `/auth/confirm` exchanges its `token_hash` using native `verifyOtp` and sets the session through the shared cookie adapter. Smoke follows the actual delivered link with isolated jars, without admin confirmation APIs.

## Phases at a Glance

| Phase                          | What it delivers                                                | Key risk                                                 |
| ------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Session and auth boundaries | Shared request state, validation and explicit outage responses. | Cookies or cache headers lost on redirects.              |
| 2. Local email confirmation    | Native local email, fixed callback and accurate messages.       | Configuration/template mismatch or consumed links.       |
| 3. Reliable auth smoke         | Exact assertions, independent login and actual-expiry checks.   | Inherited cookies or proactive refresh masking failures. |
| 4. CI and acceptance evidence  | Mailpit-enabled CI, repeatable runbook and browser results.     | Treating unrun checks as completion.                     |

**Prerequisites:** Node 22.14.0, `npm ci`, Docker with local Supabase, available local app/mail ports, and safely configured ignored environment files. Hosted credentials are unnecessary.
**Estimated effort:** Approximately 3–4 focused evening sessions; container startup and browser verification may add time. Smoke has a 300-second total limit, including a 180-second refresh-wait limit.

## Open Risks & Assumptions

- No live auth run was performed during planning; runtime evidence is required during implementation.
- The current email config uses the legacy `inbucket` label; verify the actual Mailpit v1 API at startup and fail explicitly if incompatible.
- Local short-lived tokens and mail capture do not prove hosted email delivery, templates or URLs; F-02 must verify those separately.

## Success Criteria (Summary)

- Signup remains pending until its delivered confirmation link succeeds; fresh-context password login works afterward.
- Sessions survive reload and actual expiry, revoked refresh sessions are rejected, and signout denies subsequent access with correct cookie/cache-header behavior.
- Local CI-equivalent checks and browser acceptance pass; malformed input and provider outages receive the agreed responses, with actual results recorded.

## References

- [Full plan](./plan.md), [baseline research](./research.md), [PRD](../../foundation/prd.md), and [roadmap F-01/F-02](../../foundation/roadmap.md).
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [local email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates), and [Mailpit recipient search](https://mailpit.axllent.org/docs/usage/search-filters/).
