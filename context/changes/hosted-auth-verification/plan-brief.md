# Hosted Auth Verification — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Publish the existing PrintPlan authentication flow at one stable HTTPS origin and verify it with real email delivery. Roadmap F-02 establishes the hosted environment that later product slices will use.

## Starting Point

F-01 records passing local auth, confirmation, cookie-refresh, and signout checks. The Cloudflare scaffold exists, but its Worker name is still the starter name; the Mailpit/120-second local smoke cannot directly verify a hosted instance.

## Desired End State

The new `print-plan` Worker and dedicated free-tier Supabase project serve confirmed-email signup and password login. Brevo Free delivers confirmation emails to controlled non-team recipients. The author completes hosted browser acceptance; normal token lifetime is restored and all application test accounts are deleted.

## Key Decisions Made

| Decision          | Choice                                                                                              | Why                                                             | Source           |
| ----------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| Hosting           | Cloudflare Workers + Builds; deploy `master`                                                        | Keep the selected project stack and deployment flow.            | Research / stack |
| Environment       | New `print-plan` Worker/project; one workers.dev HTTPS origin; no previews                          | Isolate initial configuration and fixtures.                     | Plan / author    |
| Email             | Brevo Free; verified individual sender; no domain purchase                                          | Enable non-team signup emails without a paid integration.       | Plan / author    |
| Sender appearance | Accept Brevo's provider-address replacement initially                                               | Start without owning a sending domain.                          | Plan / author    |
| Hosted acceptance | Author tests manually; implementer runs local automation                                            | Follow the author's requested division of work.                 | Plan / author    |
| Expiry experiment | Record a short temporary lifetime (e.g. 300 seconds); restore 3600 seconds and check fresh sessions | Keep the manual experiment short and return to normal settings. | Plan / author    |
| Fixture cleanup   | Delete all created application test accounts after acceptance                                       | Leave the hosted project free of acceptance fixtures.           | Plan / author    |
| Deployment gate   | Existing auth contracts, sync, lint, type checks, build in Workers Builds                           | Enforce checks where deployment occurs.                         | Research / plan  |

## Scope

**In scope:**

- Worker identity, reusable deployment gate, durable setup/runbook documentation.
- New hosted resources, runtime secrets, Supabase confirmation configuration, Brevo SMTP.
- Local regression evidence and manual hosted inbox/browser/session evidence, restoration and cleanup.

**Out of scope:**

- Product tables/RLS/reservations and product-persistence acceptance.
- Hosted test runner, inbox API, browser automation, previews, custom domains and paid integrations.
- Production auth redesign, deliberate hosted outages and permanent branded email setup.

## Architecture / Approach

GitHub `master` → Workers Builds (lockfile install + verification gate) → HTTPS Worker → hosted Supabase Auth → Brevo SMTP → real inbox → app confirmation callback → browser session. SMTP credentials remain in Supabase; application secrets remain server-only. Local smoke stays separate and unchanged.

## Phases at a Glance

| Phase                 | What it delivers                                                                             | Key risk                                                                |
| --------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Prepare repository | `print-plan` identity, `verify:deploy`, accurate docs, passing local gates/smoke             | Accidentally changing the completed local auth contracts.               |
| 2. Publish instance   | Dedicated Worker/project, Brevo SMTP, gated `master` deployment and revision record          | Provider activation and build/runtime configuration differ.             |
| 3. Verify and record  | Author's hosted checks, real expiry/revocation, 3600-second restoration and account deletion | Manual evidence must establish actual behavior and preserve no secrets. |

**Prerequisites:** Completed F-01; pinned Node/npm and local Supabase/Mailpit; owner access to GitHub, Cloudflare, Supabase and Brevo; a verified sender and two controlled non-team recipient addresses. Account/project identities and actual HTTPS origin are recorded when resources are created.

**Estimated effort:** Approximately 3–6 active hours across three phases, plus provider activation and author availability. Wait until 30 seconds after the latest fresh token expires. The wait depends on the selected short lifetime; 300 seconds gives an example wait of about five and a half minutes after the final test login. Other acceptance steps take additional time.

## Open Risks & Assumptions

- Brevo activation and actual inbox delivery must succeed; its replaced sender address is an initial compromise, not a permanent branded sending setup.
- Quotas, mail scanners or tracking can interrupt confirmation; configuration alone cannot certify delivery.
- Choose and record a short temporary expiry before minting test sessions. Restore 3600 seconds even after interruption and inspect fresh sessions before deleting fixtures.
- Local success cannot certify hosted browser cookies or product persistence. Required unexecuted checks remain pending.

## Success Criteria (Summary)

- Local deployment gates and the existing smoke pass; an observed gated `master` build publishes the recorded HTTPS revision.
- The author confirms real non-team emails, browser confirmation/login/logout, actual refresh and revoked-session rejection under the recorded short temporary expiry.
- Fresh sessions reflect restored 3600-second expiry, all created test users are deleted, and sanitized local/hosted evidence is complete.

## References

- [Full plan and source links](plan.md#references), [research](research.md), [roadmap F-02](../../foundation/roadmap.md).
