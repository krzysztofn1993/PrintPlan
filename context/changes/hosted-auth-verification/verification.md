# Hosted authentication verification

Observation date: **2026-10-11**

This record separates repository-local evidence from hosted observations. Hosted settings below are
owner-reported on 2026-10-11 and were not independently inspected from this workspace. The Phase 2
deployment check is distinct from Phase 3 authentication acceptance; a deployed root page does not
establish that the hosted browser acceptance has passed.

## Local evidence

These outcomes are transcribed from the completed Phase 1 rows in this change's `plan.md` Progress
section. They were not rerun while preparing this Phase 2 evidence record.

| Check                                                            | Recorded outcome | Source                                      |
| ---------------------------------------------------------------- | ---------------- | ------------------------------------------- |
| `npm run verify:deploy`                                          | Pass             | Phase 1, item 1.1; closing commit `dbeddfa` |
| Local production-preview smoke with Supabase and Mailpit         | Pass             | Phase 1, item 1.2; closing commit `dbeddfa` |
| Targeted Prettier check for repository and runbook documentation | Pass             | Phase 1, item 1.3; closing commit `dbeddfa` |

These are local/repository outcomes. They do not show that Workers Builds ran, a Worker was deployed,
hosted runtime values were configured, or hosted email was sent.

## Hosted deployment and configuration

The owner supplied the Cloudflare dashboard details and build-log excerpt below and reported that
email sending now works. The dashboards have not been independently inspected from this workspace;
pending items remain pending until the owner confirms the relevant settings or shares sanitized log
results. Do not treat planned names or settings in the runbook as proof that the corresponding
resources exist or are configured.

| Evidence                                                                                         | Observed value or result                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Cloudflare deployment history / Workers Builds connection                                       | Owner-reported dashboard history includes a `Build` from `master`   |
| Worker identity (planned target: `print-plan`)                                                   | `print-plan` (from the owner-provided origin)                       |
| Stable HTTPS application origin                                                                  | `https://print-plan.krzysztofn1993.workers.dev` (provided by owner) |
| `master` commit deployed                                                                         | `b8c6423` (owner-supplied short SHA; merge of PR #13)                |
| Workers Builds reference                                                                         | `bf72462e` (owner-supplied successful build reference)                |
| Worker version from successful build                                                             | `7176faa8-da59-43cc-8522-6764b18bbabe` (`Ready`, source `Build`, branch `master`; owner-supplied) |
| Current active Worker version                                                                    | `7176faa8-da59-43cc-8522-6764b18bbabe` (deployed by successful build; owner-supplied) |
| Effective Node version in remote build                                                           | `24.21.0`; owner selected this as the common pin and `.nvmrc`/runbook now match |
| Remote `npm ci` and `npm run verify:deploy` gate results                                         | `npm ci` passed (658 packages); 13 auth checks passed; sync, lint, `astro check` (36 files, 0 diagnostics), and build passed |
| Remote deploy result                                                                             | `npx wrangler deploy` succeeded; Worker `print-plan` deployed at the stable origin; version above |
| Earlier pre-merge build attempt                                                                  | Failed because `verify:deploy` was absent from the checked-out commit; resolved by merging PR #13 |
| Credential-free bounded `GET /` HTTP result                                                      | **Pass**; HTTP 200 observed after the successful deploy on 2026-10-11 with a 10-second timeout |
| Dedicated hosted Supabase project identity (planned target: `print-plan`)                        | Owner confirms the dedicated hosted project, 2026-10-11             |
| Worker runtime `SUPABASE_URL` and `SUPABASE_KEY` presence and project match                      | Owner confirms both are configured for that project; values not recorded, 2026-10-11 |
| Signup persistence                                                                         | Owner confirms signup records appear in hosted Supabase, 2026-10-11 |
| Hosted email/password, confirmation, refresh-token rotation, and 3600-second normal JWT settings | Owner confirms all listed settings, 2026-10-11                      |
| Hosted Site URL, exact redirect entries, and Confirm signup template                             | Owner confirms all listed settings, 2026-10-11                      |
| Brevo Free transactional activation and sender verification                                      | Owner reports sender issue resolved and email sending works on 2026-10-11 |
| Supabase custom SMTP presence, effective sender, and tracking behavior                           | Owner reports sending now works; exact settings/tracking still need confirmation; credentials were not shared |
| Effective Brevo and Supabase sending limits                                                      | **Pending observation**                                             |

Local Wrangler deployment inventory was unavailable: the non-interactive CLI requires a
`CLOUDFLARE_API_TOKEN`, which is not configured in this workspace. No token was requested or recorded.

The successful build log also reported a mismatch between local and remote `preview_urls` configuration
and warned that preview URLs may be enabled by default. The owner confirms Workers Builds preview builds
are disabled (2026-10-11); this is separate from the Worker `preview_urls` setting reported by Wrangler.
The build emitted npm install-script warnings, but `npm ci` returned success and all recorded gates
completed.

## Hosted browser observations

On 2026-10-11, the owner reports manually passing the six browser checks listed in the conversation:
fresh accounts A/B, signup pending and pre-confirmation signin denied, confirmation links opening the
matching accounts, consumed-link rejection, wrong-password rejection, signin/reload persistence/signout
and later signin, and repetition in Chrome, Firefox, and a mobile or narrow viewport. These are
owner-reported outcomes; browser versions, device/viewport details, and fixture labels were not supplied.

The owner has since confirmed the JavaScript-disabled validation passed. The 300-second
refresh/revocation experiment, restoring 3600 seconds, and fixture cleanup are still pending.

### HTTPS response-header check

On 2026-10-11, an HTTPS request using the owner-provided test account checked signin, dashboard, and
signout. No credentials, cookie values, or account identifiers are retained here. The signin and
signout responses both returned the required `Cache-Control: private, no-cache, no-store,
must-revalidate, max-age=0`, `Expires: 0`, and `Pragma: no-cache` headers. Both set a session cookie on
signin or deleted it on signout. The dashboard returned HTTP 200 and did not write cookies, so it did
not include those headers. The check used a direct HTTPS client rather than browser DevTools; it also
performed the app's global signout for this test account.

The observed Supabase session cookie had `Path=/`, `SameSite=Lax`, and a 400-day `Max-Age`; it did not
include `Secure`, and `HttpOnly` was false. Current Supabase SSR defaults document `HttpOnly: false`
and omit `Secure` from the default options. The source now sets `Secure` when the request URL uses
HTTPS; the updated behavior still needs a Cloudflare build/deploy and a fresh response check. This
check does not establish browser enforcement. See [Supabase SSR cookie defaults](https://github.com/supabase/ssr/blob/main/_autodocs/configuration.md),
checked 2026-10-11 using Context7. Confirmation-response and token-refresh-response headers were not
checked here, so the complete cookie-writing response matrix remains pending.

## Acceptance status

- **Phase 2 deployment and configuration:** Complete based on the recorded deployment and owner
  confirmations for items 2.2 and 2.4. Effective email sending limits remain to be recorded before
  further acceptance emails are sent.
- **Phase 3 hosted authentication acceptance:** The owner-reported browser flow and JavaScript-disabled
  validation passed. Signin/signout cache headers also passed the HTTPS response check. Full item 3.1
  remains pending confirmation and refresh response headers; the session-expiry, restoration, and
  cleanup checks remain pending.

When observations are supplied, record the observer/date and sanitized results here. Keep local and
hosted evidence separate. Do not include credentials, full recipient addresses, confirmation links
or query strings, raw headers, cookies, JWTs, refresh tokens, provider message bodies, or HAR files.
