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

| Evidence                                                                                         | Observed value or result                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare deployment history / Workers Builds connection                                        | Owner-reported dashboard history includes a `Build` from `master`                                                                                                                                                                                                                               |
| Worker identity (planned target: `print-plan`)                                                   | `print-plan` (from the owner-provided origin)                                                                                                                                                                                                                                                   |
| Stable HTTPS application origin                                                                  | `https://print-plan.krzysztofn1993.workers.dev` (provided by owner)                                                                                                                                                                                                                             |
| Initial successful `master` commit deployed                                                      | `b8c6423` (owner-supplied short SHA; merge of PR #13; predates the HTTPS cookie fix)                                                                                                                                                                                                            |
| Initial successful Workers Builds reference                                                      | `bf72462e` (owner-supplied successful build reference)                                                                                                                                                                                                                                          |
| Worker version from that initial successful build                                                | `7176faa8-da59-43cc-8522-6764b18bbabe` (`Ready`, source `Build`, branch `master`; owner-supplied)                                                                                                                                                                                               |
| Current post-fix production commit                                                               | `17e7ae4` (`4168df1c624ed512534f4e7990008bc2bf64a6fa`; owner supplied the source commit from build details; merge of PR #14)                                                                                                                                                                    |
| Current post-fix successful Workers Builds reference                                             | `e53e5b96` (owner-provided build reference and successful log, 2026-10-11)                                                                                                                                                                                                                      |
| Current active Worker version                                                                    | `62cb28c8-fcdf-4479-8065-37671e1c6f5e` (owner-provided `$workers.scriptVersion.id`, matching the supplied production deploy log)                                                                                                                                                                |
| Effective Node version in remote build                                                           | `24.21.0`; owner selected this as the common pin and `.nvmrc`/runbook now match                                                                                                                                                                                                                 |
| Remote `npm ci` and `npm run verify:deploy` gate results                                         | `npm ci` passed (658 packages); 13 auth checks passed; sync, lint, `astro check` (36 files, 0 diagnostics), and build passed                                                                                                                                                                    |
| Remote deploy result                                                                             | Build `e53e5b96`: `npx wrangler deploy` succeeded at `2026-10-11T11:01:41Z`; Worker `print-plan` deployed at the stable origin with version `62cb28c8-fcdf-4479-8065-37671e1c6f5e`                                                                                                              |
| Earlier pre-merge build attempt                                                                  | Failed because `verify:deploy` was absent from the checked-out commit; resolved by merging PR #13                                                                                                                                                                                               |
| Credential-free bounded `GET /` HTTP result                                                      | **Pass**; HTTP 200 observed after the successful deploy on 2026-10-11 with a 10-second timeout                                                                                                                                                                                                  |
| Dedicated hosted Supabase project identity (planned target: `print-plan`)                        | Owner confirms the dedicated hosted project, 2026-10-11                                                                                                                                                                                                                                         |
| Worker runtime `SUPABASE_URL` and `SUPABASE_KEY` presence and project match                      | Owner confirms both are configured for that project; values not recorded, 2026-10-11                                                                                                                                                                                                            |
| Signup persistence                                                                               | Owner confirms signup records appear in hosted Supabase, 2026-10-11                                                                                                                                                                                                                             |
| Hosted email/password, confirmation, refresh-token rotation, and 3600-second normal JWT settings | Owner confirms all listed settings, 2026-10-11                                                                                                                                                                                                                                                  |
| Hosted Site URL, exact redirect entries, and Confirm signup template                             | Owner confirms all listed settings, 2026-10-11                                                                                                                                                                                                                                                  |
| Brevo Free transactional activation and sender verification                                      | Owner reports sender issue resolved and email sending works on 2026-10-11                                                                                                                                                                                                                       |
| Supabase custom SMTP presence, effective sender, and tracking behavior                           | Owner reports sending works; sender is replaced with a provider address on `brevosend.com`; delivered confirmation link uses a `sendibt3.com` click-tracking wrapper. Owner confirms the redirect correctly confirms the account and leads to PrintPlan. Full sender and link are not retained. |
| Effective Brevo sending limit                                                                    | Owner-observed 300 emails/day shared by Marketing & Transactional; 295/300 remaining (98%) at the 2026-10-11 observation                                                                                                                                                                        |
| Effective Supabase Auth sending limit                                                            | 30 emails/hour per project, observed in the owner-supplied hosted Authentication Rate Limits screenshot on 2026-10-11                                                                                                                                                                           |

Local Wrangler deployment inventory was unavailable: the non-interactive CLI requires a
`CLOUDFLARE_API_TOKEN`, which is not configured in this workspace. No token was requested or recorded.

During F2 triage on 2026-10-11, the owner chose to complete the post-fix deployment evidence.
A read-only `npx wrangler deployments list --name print-plan` attempt again failed because this
workspace has no Cloudflare authentication. The initial successful deployment above is retained as
historical evidence. The owner subsequently supplied the post-fix build, runtime version and source
commit documented below. No deployment or rollback was performed during triage.

### Post-fix build evidence supplied during F2 triage

The owner supplied build reference `e53e5b96` and its successful production build/deploy log on
2026-10-11. The log began at `2026-10-11T11:00:28.420Z` and completed successfully at
`2026-10-11T11:01:41.584Z`. Its sanitized outcomes are:

- Effective Node version: `24.21.0`; npm: `10.9.2`.
- `SKIP_DEPENDENCY_INSTALL` was present; automatic dependency installation was skipped.
- The user build command was `npm ci && npm run verify:deploy`; installation added 658 packages.
- All 13 auth contract tests passed; sync and lint passed; Astro check reported 36 files and zero
  errors, warnings or hints; the production build completed.
- `npx wrangler deploy` uploaded `print-plan` and deployed the stable HTTPS origin with Current
  Version ID `62cb28c8-fcdf-4479-8065-37671e1c6f5e`, matching the owner-provided runtime version ID.
- The deploy bindings list included `IMAGES` and `ASSETS`; no Astro session binding was listed.
- The existing sitemap warning and npm install-script notices did not prevent build/deploy success.

The supplied log does not contain the checked-out Git commit SHA or branch. In response to the
request for build source details, the owner supplied commit `17e7ae4`, titled “Merge pull request #14
from krzysztofn1993/hosted-auth-verification” / “Secure hosted auth cookies over HTTPS”. Available
Git history resolves it to `4168df1c624ed512534f4e7990008bc2bf64a6fa`, a merge of the previous
production revision `b8c6423` and the fix branch at `5af6403`, present on `origin/master`.
Inspection of that revision confirms both the HTTPS cookie wiring introduced in `bdd22fd` and
`session: false` introduced in `5af6403` are included. The source revision is supplied by the owner,
not inferred from the build timestamp.

The post-fix deployment identity is therefore commit `17e7ae4`, successful build `e53e5b96`, and
version `62cb28c8-fcdf-4479-8065-37671e1c6f5e`. The owner identified that version through
`$workers.scriptVersion.id`, matching the production deploy log. Later hosted observations, including
the F1 token metadata issued at 12:13:13 and 13:00:09 UTC after this 11:01:41 UTC deployment, are
associated with this owner-identified production revision. Earlier missing-Secure observations and
the initial deployment remain historical. Cloudflare inventory was not independently inspected;
build and runtime identity remain attributed owner evidence. These additions resolve F2.

The initial successful build log reported a mismatch between local and remote `preview_urls` configuration
and warned that preview URLs may be enabled by default. The owner confirms Workers Builds preview builds
are disabled (2026-10-11); this is separate from the Worker `preview_urls` setting reported by Wrangler.
The build emitted npm install-script warnings, but `npm ci` returned success and all recorded gates
completed.

### Earlier Cloudflare branch preview

The owner supplied a successful Cloudflare build log dated 2026-10-11 for branch `hosted-auth-verification`.
Cloudflare installed 658 packages, `npm run build` passed, and `npx wrangler preview` created a remote
preview named `hosted-auth-verification`. The reported preview URL was
`https://hosted-auth-verification-print-plan.krzysztofn1993.workers.dev`; the deployment ID was
`dff97f8a-0f73-4843-ba9f-84aea0a185c0`. The log excerpt did not include the source commit SHA.

This was a preview deployment, not an update to the stable production Worker. This run used
`npm run build` rather than `npm ci && npm run verify:deploy`, and `npx wrangler preview` rather than
`npx wrangler deploy`. Therefore it proves the Astro production build completed for the branch, but it
does not replace the production deployment gate or verify that the stable origin now sends `Secure`
cookies. Wrangler documents `preview` as a remote Preview deployment in its [command implementation](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/preview/preview.ts).

## Hosted browser observations

On 2026-10-11, the owner reports manually passing the six browser checks listed in the conversation:
fresh accounts A/B, signup pending and pre-confirmation signin denied, confirmation links opening the
matching accounts, consumed-link rejection, wrong-password rejection, signin/reload persistence/signout
and later signin, and repetition in a Chromium desktop browser, Firefox, and a mobile or narrow
viewport. These are owner-reported outcomes using fixture labels A/B. Browser versions and viewport
details were initially absent; the owner supplied the following details during F4 triage on 2026-10-11:

| Environment     | Owner-supplied details                                        |
| --------------- | ------------------------------------------------------------- |
| Brave desktop   | Brave 1.95.104, official x86_64 build; Chromium 153.0.8010.53 |
| Firefox desktop | Firefox 157.0.1, 64-bit                                       |
| Narrow viewport | 427 × 952 pixels; no physical phone model supplied            |

The owner explicitly accepted Brave in place of the originally planned Chrome during triage. The
earlier Chrome label is corrected to Brave; these observations do not claim a separate Chrome run.
The Phase 3 amendment in plan.md records the accepted browser choice. These additions resolve F4.

The owner has since confirmed the JavaScript-disabled validation passed. For a short-expiry trial on
2026-10-11, the owner set access-token expiry to 60 seconds, signed out B1, left A and B2 idle for about
four minutes, and reports that A remained signed in while B2 was denied at the dashboard. The owner
then restored the setting to 3600 seconds. This trial used 60 seconds rather than the planned 300; the
owner did not provide token fingerprints or exact expiry timestamps. Test-account cleanup and browser
state clearing were later confirmed complete by the owner on 2026-10-11.

### HTTPS response-header check

On 2026-10-11, an HTTPS request using the owner-provided test account checked signin, dashboard, and
signout. No credentials, cookie values, or account identifiers are retained here. The signin and
signout responses both returned the required `Cache-Control: private, no-cache, no-store,
must-revalidate, max-age=0`, `Expires: 0`, and `Pragma: no-cache` headers. Both set a session cookie on
signin or deleted it on signout. The dashboard returned HTTP 200 and did not write cookies, so it did
not include those headers. The check used a direct HTTPS client rather than browser DevTools; it also
performed the app's global signout for this test account.

The first check found `Path=/`, `SameSite=Lax`, and a 400-day `Max-Age`, but no `Secure`; `HttpOnly`
was false. Current Supabase SSR defaults document `HttpOnly: false` and omit `Secure` from the default
options. See [Supabase SSR cookie defaults](https://github.com/supabase/ssr/blob/main/_autodocs/configuration.md),
checked 2026-10-11 using Context7.

After the owner confirmed the branch was merged and deployed, a fresh HTTPS check of the stable origin
signed in with the existing test account. Signin returned HTTP 302 to `/` and set an auth cookie with
`Secure`, `Path=/`, and `SameSite=Lax`; `HttpOnly` remained false. Its response included
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, and
`Pragma: no-cache`. The authenticated dashboard returned HTTP 200. No credentials, cookie values, or
account identifiers are retained. This direct HTTP check confirms the response attribute but does not
establish browser cookie enforcement. The check created a session; no global signout was performed.

The owner supplied the response headers from a fresh email-confirmation flow on 2026-10-11. It redirected
to `/`, included `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`,
and `Pragma: no-cache`, and set the auth cookie with `Secure`, `Path=/`, and `SameSite=Lax`. `HttpOnly`
was absent. The session payload reported a 3600-second access-token lifetime. No cookie or token values
are retained here. The supplied response included the raw cookie value in the conversation; the owner was
advised to revoke that session before continuing.

For a short refresh check, the owner compared the session cookie before and after waiting more than 15
seconds and requesting the dashboard. The cookie value changed and the dashboard remained available,
according to the owner. The supplied cookie payloads showed a 15-second access-token lifetime. The
owner later confirmed that the refresh response included `Set-Cookie` and supplied its privacy headers:
`Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0`, `Expires: 0`, and
`Pragma: no-cache`. The response status and cookie value are not retained here. After this exposure, the
owner was advised to revoke the session. The owner then restored the normal
3600-second setting, signed in again, and reports that the dashboard worked. A separate fresh HTTPS
signin check after restoration returned HTTP 302 to `/` and issued a token with a 3600-second lifetime
(`exp - iat`, decoded in memory; the token was not retained). It also set `Secure` and the expected
signin privacy headers. The short-expiry refresh and 60-second A/B trial are accepted as behavior checks;
the exact trial duration is not a product requirement.

### F1 triage follow-up

On 2026-10-11, the owner clarified the results of the same 15-second hosted refresh trial:

- The owner confirms waiting until the issued tokens expired plus at least 30 seconds.
- The owner confirms the new access token had a later expiry.
- The owner confirms a subsequent dashboard request also succeeded.
- The owner subsequently supplied two local fingerprint/metadata results and confirmed the second
  was obtained only by reloading the dashboard in the same session, without signing out or signing
  in again. Both the access-token and refresh-token fingerprints changed.
- The earlier access token was issued at `2026-10-11T12:13:13Z` and expired at
  `2026-10-11T12:13:28Z`, a 15-second lifetime. The renewed access token was issued at
  `2026-10-11T13:00:09Z` and expires at `2026-10-11T14:00:09Z`, a 3600-second lifetime.
  Its issuance occurred 2801 seconds after the earlier token's expiry, exceeding the 30-second
  allowance. The issued lifetimes reflect the short test setting and subsequent restoration.

These are owner-reported browser observations and locally decoded metadata, not independent
cryptographic verification. Only token-change booleans and timing metadata are retained; the supplied
fingerprints and token values are not copied into this record. Together with the previously recorded
B1/B2 revocation result, subsequent-request confirmation, and response privacy-header observations,
these additions resolve F1's missing refresh evidence.

### F3 SMTP observation follow-up

On 2026-10-11, the owner supplied the hosted Supabase Rate Limits screen showing “Rate limit for
sending emails” set to 30 emails/hour, described as the number of emails sent per hour from the
project. This is separate from the owner-observed Brevo quota of 300 emails/day, shared by Marketing
& Transactional. Brevo showed 295/300 remaining (98%) at that observation; remaining quota is a
point-in-time value, not a permanent setting.

The owner also confirms the delivered tracking link still correctly confirms the account and leads
to PrintPlan. Provider sender replacement on `brevosend.com` and click-tracking redirection through
`sendibt3.com` are recorded as observed behavior. No interference was reported, so no tracking-setting
change is made during triage. The full sender address, wrapped confirmation link and screenshot are
not retained in repository files. These observations resolve F3.

## Acceptance status

- **Phase 2 deployment and configuration:** Complete based on the deployment and
  owner confirmations for items 2.2 and 2.4. F2 deployment identity and F3 sending-limit/sender/tracking
  observations are now resolved.
- **Phase 3 hosted authentication acceptance:** Complete based on the owner-reported browser flow,
  JavaScript-disabled validation, short-expiry refresh and revocation checks, restored 3600-second
  setting, and test-account cleanup. HTTPS signin, signout, confirmation, and refresh response privacy
  headers passed; fresh signin and confirmation responses include `Secure`. The owner reports the
  dashboard remained available after refresh and after a fresh signin with the restored setting. The
  exact temporary expiry duration was not a product requirement. F1's separate access/refresh
  comparisons and timing follow-up are complete. F4 browser versions and the narrow viewport are
  recorded with A/B fixture labels, and the owner accepted Brave in place of Chrome. The runtime scope
  addendum documents the existing HTTPS cookie/session configuration fixes. The guide and brief now
  use a recorded short temporary expiry, with 300 seconds as an example, the expiry-plus-30-second
  wait and mandatory 3600-second restoration preserved. Final documentation validation is recorded
  in the implementation review; all seven review findings are addressed.

When observations are supplied, record the observer/date and sanitized results here. Keep local and
hosted evidence separate. Do not include credentials, full recipient addresses, confirmation links
or query strings, raw headers, cookies, JWTs, refresh tokens, provider message bodies, or HAR files.
