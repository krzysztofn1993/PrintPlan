# Hosted authentication setup and acceptance

This guide describes the hosted PrintPlan account-access environment and the evidence needed to verify
it. It is a procedure, not a record that a hosted deployment or acceptance run has passed. Record
observed deployment and test results in the active change's `verification.md`; keep incomplete checks
explicit.

## Prerequisites and boundaries

- Use the Node version in `.nvmrc` (`22.22.3` at this revision), npm, Git, and the repository's
  committed `package-lock.json`.
- Have access to the GitHub repository, a Cloudflare account with Workers Builds, a new free-tier
  hosted Supabase project, and a Brevo account with transactional sending activated.
- Verify one individual sender address controlled by the account owner in Brevo. Have two distinct,
  deliverable test addresses outside the Supabase organization team for hosted acceptance.
- Keep local testing separate from hosted verification. The [F-01 local runbook](../archive/2026-10-09-verified-account-access/verification.md)
  documents local Supabase, Mailpit, the 120-second local JWT lifetime, safe ignored credential setup,
  and the production-preview smoke. Those local settings do not configure the hosted project.
- Hosted verification uses the deployed stable HTTPS origin and real inboxes. `npm run smoke` remains
  the local Mailpit regression; changing `BASE_URL` does not make it a hosted runner.
- The repository defines `SUPABASE_URL` and `SUPABASE_KEY` as server-only values. Use the hosted
  project's anon/publishable key for the application. Never use a service-role key as an application
  credential. Keep SMTP credentials only in hosted Supabase's SMTP settings.

Do not copy generated local CLI output, credentials, confirmation links, query strings, passwords,
cookies, JWTs, refresh tokens, provider message bodies, or HAR files into repository documents or
shared logs. Record fixture labels rather than addresses.

## Workers Builds and Worker runtime

Connect the GitHub repository to Workers Builds and configure the repository root as the build root.
Use these production settings:

| Setting           | Value                                                |
| ----------------- | ---------------------------------------------------- |
| Production branch | `master`                                             |
| Preview builds    | Disabled                                             |
| Node version      | The version in `.nvmrc` (`22.22.3` at this revision) |
| Build variable    | `SKIP_DEPENDENCY_INSTALL=1`                          |
| Build command     | `npm ci && npm run verify:deploy`                    |
| Deploy command    | `npx wrangler deploy`                                |

The explicit install uses the committed lockfile and includes development dependencies; the build
variable prevents Workers Builds from running a second automatic dependency install. The deployment
gate runs auth contracts, `astro sync`, lint, `astro check`, and the production build. Inspect the
remote build log to confirm the effective Node version and each gate before treating a deployment as
verified. A GitHub Actions workflow definition or a successful home-page response is not evidence that
this Workers Builds run passed.

Workers Builds configuration and Worker runtime configuration are separate. In the deployed Worker
`print-plan`'s Variables & Secrets, add these runtime secrets:

| Name           | Value                                       |
| -------------- | ------------------------------------------- |
| `SUPABASE_URL` | The hosted Supabase project's HTTPS API URL |
| `SUPABASE_KEY` | That project's anon/publishable API key     |

Do not put these values in Workers Builds variables, repository files, or client-side code. Do not
add SMTP credentials to the Worker. Record the assigned stable HTTPS origin, deployed commit, build
reference, and Worker version without recording secrets. The expected origin has the form
`https://print-plan.<account-subdomain>.workers.dev`; use the actual assigned value everywhere below.

References: [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[Workers Builds image and Node settings](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
and [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## Hosted Supabase Auth

Create a dedicated free-tier hosted Supabase project named `print-plan`. The local `supabase/config.toml` and
`supabase/templates/confirmation.html` are not automatically applied to it. Configure and inspect the
hosted dashboard directly:

1. Enable email/password signup and require email confirmation. Keep refresh token rotation enabled.
2. Set the normal JWT expiry to **3600 seconds**. Change it to 300 seconds only for the controlled
   expiry/revocation experiment below, then restore 3600 seconds even if the experiment is interrupted.
3. Set **Site URL** to the actual stable app origin, without a trailing slash. Add exact Redirect URLs
   for the app root (`<origin>/`) and `<origin>/auth/confirm`. Do not add broad preview wildcards for
   this single-origin setup.
4. Copy the contents of `supabase/templates/confirmation.html` into the hosted **Confirm signup**
   email template. The template must construct the app callback using the project's Site URL, with
   exactly one `token_hash` parameter and `type=email`.
5. Confirm the Worker runtime secrets point to this same hosted project. A successful build or root
   page does not prove that authentication can reach it.

For a hosted origin such as `https://print-plan.<account-subdomain>.workers.dev`, a delivered link must
open at that exact origin under `/auth/confirm`, contain one nonblank `token_hash`, and contain
`type=email`. The callback consumes the link on its first GET. Open the delivered link first in its
intended clean browser context; test replay only in another empty context. Do not reuse a link that has
already been opened. If mail tracking or a scanner consumes or rewrites the link, correct the delivery
path and use a fresh confirmation link.

References: [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls),
[custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
and [session expiry](https://supabase.com/docs/guides/auth/sessions).

## Brevo Free SMTP

Activate Brevo transactional sending and verify the individual sender address before configuring
Supabase. In the hosted Supabase project's Auth SMTP settings, enter:

| Setting        | Value                                 |
| -------------- | ------------------------------------- |
| SMTP host      | `smtp-relay.brevo.com`                |
| Port           | `587`                                 |
| Username       | The SMTP login shown by Brevo         |
| Password       | A Brevo SMTP key, not a Brevo API key |
| Sender name    | `PrintPlan`                           |
| Sender address | The verified individual address       |

Keep the SMTP key only in hosted Supabase. Do not place it in repository files, Worker runtime
secrets, or Workers Builds variables. Brevo may replace an unauthenticated/free sender address with a
provider address; make that effective sender visible in setup notes and inspect the delivered message.
Check tracking settings and disable link rewriting if it changes the app origin, callback path, or
query parameters.

Brevo currently documents a Free allowance of 300 emails per day; Supabase also applies a separate
custom-SMTP rate limit. Confirm the effective limits shown for the accounts before testing and plan
only the required sends. Do not loop signup requests to work around a limit, buy a sending domain, or
switch to a paid provider as an automatic recovery step.

References: [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP),
[Brevo Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan),
and [sender-address replacement](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders).

## Hosted browser acceptance

Before creating fixtures, confirm the deployed commit and Worker version, stable HTTPS origin, Worker
runtime secret presence, hosted Supabase email-confirmation and callback settings, Brevo activation,
verified sender, and current sending limits. Keep prior non-secret settings for recovery; do not copy
secret values into evidence. Use two distinct fresh application accounts, A and B, with controlled
deliverable addresses outside the Supabase organization team. Keep the fixture-to-address mapping
privately so the accounts can be deleted later.

Run the account checks on current Chrome desktop, current Firefox desktop, and a phone or narrow mobile
viewport. Record browser versions and the device or viewport with fixture labels only. In those
environments, cover these behaviors:

1. Submit valid signup for fresh accounts A and B. Each signup remains pending and has no authenticated
   session before confirmation. Password signin before confirmation is denied.
2. Confirm that each message arrives in its real inbox. Open its link in a separate empty browser
   context. The resulting dashboard identifies the matching account. Reopen the consumed link in a
   different empty context and confirm it is rejected without creating a session.
3. Confirm wrong-password signin is rejected. Sign in independently with each confirmed account in a
   fresh context, reload the protected dashboard, and confirm the session persists. Sign out, confirm
   protected-page access is denied, then sign in again.
4. With JavaScript disabled, confirm invalid signup is rejected by server validation and a valid native
   form submission can complete the email-confirmation flow.
5. In browser Network tools, inspect confirmation, signin, refresh, and signout responses that write
   cookies. Require `Cache-Control` to contain `private`, `no-cache`, `no-store`, `must-revalidate`,
   and `max-age=0`, plus `Expires: 0` and `Pragma: no-cache`. Confirm session cookies persist in the
   actual HTTPS browser. Local HTTP cookie jars do not prove browser enforcement of HTTPS attributes.

Do not export HAR files, screenshots containing tokens or email addresses, or raw headers/cookies.
Record only pass/fail, the route/behavior, browser/device details, and sanitized fixture labels.

## 300-second expiry and revoked-session check

Complete the normal browser checks first. Then change hosted JWT expiry to **300 seconds** and mint
fresh password-signin sessions after the setting takes effect: one for A and two for B. Use persistent
contexts A, B1, and B2: A is one context for the live refresh check; B1 and B2 share account B so global
signout can revoke B2 while its existing cookies remain. Do not reuse sessions created before the
expiry change.

### Inspecting local token metadata and fingerprints

For each fresh context, open DevTools on the app origin and run the snippet below in its Console. It
reads the current Supabase auth cookie and any numeric chunks from this origin, reconstructs the
session locally, and prints only `iat`, `exp`, their difference, and short SHA-256 fingerprints for
the access and refresh tokens. It never prints the token values. If the cookie is not visible to
JavaScript, the browser prompts for the concatenated value copied locally from DevTools **Application
→ Cookies**; the prompt is used only for this calculation. Do not take a screenshot or save the raw
value, and clear the clipboard afterward.

```js
(async () => {
  const entries = document.cookie
    .split(";")
    .map((part) => {
      const separator = part.indexOf("=");
      return separator < 0 ? null : { name: part.slice(0, separator).trim(), value: part.slice(separator + 1) };
    })
    .filter(Boolean)
    .filter(({ name }) => /-auth-token(?:\.\d+)?$/.test(name));

  const groups = new Map();
  for (const entry of entries) {
    const base = entry.name.replace(/\.\d+$/, "");
    groups.set(base, [...(groups.get(base) ?? []), entry]);
  }

  let encoded;
  if (groups.size > 0) {
    const group = [...groups.values()][0];
    const chunks = group.filter(({ name }) => /\.\d+$/.test(name));
    const selected = chunks.length
      ? chunks.sort((left, right) => Number(left.name.match(/\.(\d+)$/)[1]) - Number(right.name.match(/\.(\d+)$/)[1]))
      : group;
    encoded = selected.map(({ value }) => decodeURIComponent(value)).join("");
  } else {
    encoded = prompt("Paste the concatenated auth-cookie value from DevTools for local processing:");
  }

  if (!encoded) throw new Error("No auth-cookie value was provided.");

  const decodeBase64Url = (value) => {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  };

  const cookieText = encoded.startsWith("base64-") ? decodeBase64Url(encoded.slice(7)) : encoded;
  const parsed = JSON.parse(cookieText);
  const session = parsed.session ?? parsed;
  const accessToken = session.access_token;
  const refreshToken = session.refresh_token;
  if (!accessToken || !refreshToken) throw new Error("The selected cookie did not contain a session.");

  const claims = JSON.parse(decodeBase64Url(accessToken.split(".")[1]));
  const fingerprint = async (token) => {
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  };

  console.table({
    iat: claims.iat,
    exp: claims.exp,
    lifetimeSeconds: claims.exp - claims.iat,
    accessFingerprint: await fingerprint(accessToken),
    refreshFingerprint: await fingerprint(refreshToken),
  });
})();
```

Confirm each newly issued JWT has integer `iat` and `exp`, and `exp - iat` is 300 seconds. Record
fingerprints and metadata only. The short fingerprints are comparison aids, not independent proof of
the JWT's cryptographic validity.

### Refresh and revocation sequence

1. Save the latest observed `exp` from A and B2. Sign B1 out, leaving B2's existing cookies untouched.
2. Leave A and B2 on blank tabs. Make no authenticated app requests until later than the latest
   recorded expiry plus 30 seconds for clock skew. Do not refresh either session during this wait.
3. Reopen A's dashboard. Require the same identity, newly written session cookies, changed access and
   refresh fingerprints, and a new future expiry. Make another protected request and confirm A remains
   signed in.
4. Reopen B2's dashboard. Require a redirect to signin and deletion of invalid auth-cookie chunks.
5. Observe the cookie-writing response privacy headers listed above in the browser Network tools.

This sequence uses two distinct accounts because Supabase signout revokes sessions globally for the
account. It demonstrates refresh/revocation at the selected 300-second setting; it does not require a
hosted runner or an externally decoded/manufactured JWT.

## Restore, verify, and clean up

Restore hosted JWT expiry to **3600 seconds** as soon as the 300-second experiment ends, including if
the experiment fails or is interrupted. Before deleting fixtures, mint new password-signin sessions
for A and B after restoration. Confirm their JWT metadata shows a 3600-second lifetime, then check
dashboard access, reload persistence, and successful signout. This restoration check does not claim to
have waited one hour to exercise another refresh.

After restoration:

1. In the dedicated hosted Supabase project's Auth users panel, delete every application test user
   created for this acceptance using the fixture identities maintained privately.
2. Do not delete the Supabase project, the Worker, the provider account, or operator accounts.
3. Confirm the fixture users are gone and clear the test browser contexts' cookies/site data.
4. Record that expiry was restored, fresh sessions showed the expected lifetime, signout succeeded,
   fixture cleanup completed, and browser state was cleared.

In the active change's `verification.md`, keep local and remote results separate. Record the environment
identity, stable origin, observed build reference, commit and Worker version, effective Node version,
gate results, runtime configuration presence, Brevo activation/sender status, browser versions/device or
viewport, fixture labels, expiry timing, fingerprint-change booleans, restoration, and cleanup. Attribute
manual results to the person who observed them. Do not include full addresses, credentials, confirmation
URLs or query strings, raw headers, cookies, JWTs, refresh tokens, provider bodies, screenshots of
secrets, or HAR files. A pending or failed required check remains explicit and blocks F-02 completion.

## Recovery

Before changing external settings, privately note the prior non-secret values and a way to recover the
account. If delivery, callback, or auth checks fail, restore JWT expiry to 3600 seconds first. Correct
the affected setting, then use a fresh signup and confirmation message for a retry; a consumed link
cannot be reused. Check Brevo activation, verified sender, effective sender replacement, and tracking
rewrites, then check Supabase Site URL/template/redirects and the Worker runtime secrets. Do not generate
repeated signups to bypass provider limits.

Keep the hosted environment available for troubleshooting instead of automatically deleting it. If a
deployed revision must be rolled back, deploy the last verified revision through the same gated Workers
Builds path. A code rollback does not restore Supabase Auth or SMTP settings; restore those settings
separately and verify their resulting values. Do not deliberately cause a hosted Auth outage as part of
this procedure.
