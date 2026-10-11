# Hosted authentication verification

Observation date: **2026-10-10**

This record separates repository-local evidence from hosted observations. The hosted fields below
remain pending until the account owner observes the corresponding dashboard, build log, or request.
The Phase 2 deployment check is distinct from Phase 3 authentication acceptance; a deployed root page
does not establish that authentication works.

## Local evidence

These outcomes are transcribed from the completed Phase 1 rows in this change's `plan.md` Progress
section. They were not rerun while preparing this Phase 2 evidence record.

| Check                                                            | Recorded outcome | Source                                      |
| ---------------------------------------------------------------- | ---------------- | ------------------------------------------- |
| `npm run verify:deploy`                                          | Pass             | Phase 1, item 1.1; closing commit `f1f7365` |
| Local production-preview smoke with Supabase and Mailpit         | Pass             | Phase 1, item 1.2; closing commit `f1f7365` |
| Targeted Prettier check for repository and runbook documentation | Pass             | Phase 1, item 1.3; closing commit `f1f7365` |

These are local/repository outcomes. They do not show that Workers Builds ran, a Worker was deployed,
hosted runtime values were configured, or hosted email was sent.

## Hosted deployment and configuration

No Cloudflare, Supabase, or Brevo dashboard observation or Workers Builds log is recorded in the
available repository evidence as of the observation date. Do not treat planned names or settings in
the runbook as proof that the corresponding resources exist or are configured.

| Evidence                                                                                         | Observed value or result                                             |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Cloudflare account / Workers Builds connection                                                   | **Pending observation**                                              |
| Worker identity (planned target: `print-plan`)                                                   | **Pending observation**                                              |
| Stable HTTPS application origin                                                                  | **Not configured yet**, confirmed by the account owner on 2026-10-10 |
| `master` commit deployed                                                                         | **Pending observation**                                              |
| Workers Builds reference                                                                         | **Pending observation**                                              |
| Deployed Worker version                                                                          | **Pending observation**                                              |
| Effective Node version in remote build                                                           | **Pending observation**                                              |
| Remote `npm ci` and `npm run verify:deploy` gate results                                         | **Pending observation**; no remote build log result recorded         |
| Remote deploy result                                                                             | **Pending observation**                                              |
| Credential-free bounded `GET /` HTTP result                                                      | **Pending**; there is no assigned origin to request                  |
| Dedicated hosted Supabase project identity (planned target: `print-plan`)                        | **Pending owner confirmation**                                       |
| Worker runtime `SUPABASE_URL` and `SUPABASE_KEY` presence and project match                      | **Pending owner confirmation**; values must not be copied here       |
| Hosted email/password, confirmation, refresh-token rotation, and 3600-second normal JWT settings | **Pending owner confirmation**                                       |
| Hosted Site URL, exact redirect entries, and Confirm signup template                             | **Pending owner confirmation**                                       |
| Brevo Free transactional activation and sender verification                                      | **Pending owner confirmation**                                       |
| Supabase custom SMTP presence, effective sender, and tracking behavior                           | **Pending owner confirmation**; credentials must not be copied here  |
| Effective Brevo and Supabase sending limits                                                      | **Pending observation**                                              |

Local Wrangler deployment inventory was unavailable: the non-interactive CLI requires a
`CLOUDFLARE_API_TOKEN`, which is not configured in this workspace. No token was requested or recorded.

## Acceptance status

- **Phase 2 deployment and configuration:** Pending the observations listed above.
- **Phase 3 hosted authentication acceptance:** Pending. No hosted inbox, browser, session, expiry,
  restoration, or cleanup results are inferred from the local Phase 1 checks.

When observations are supplied, record the observer/date and sanitized results here. Keep local and
hosted evidence separate. Do not include credentials, full recipient addresses, confirmation links
or query strings, raw headers, cookies, JWTs, refresh tokens, provider message bodies, or HAR files.
