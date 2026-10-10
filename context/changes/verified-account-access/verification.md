# Verified Account Access Verification

This document is the repeatable local runbook and evidence record for F-01. Local Supabase configuration exercises confirmed email; hosted email delivery, hosted templates and hosted URL allowlists remain F-02 work.

## Local setup

Use the Node version recorded in `.nvmrc` (`22.22.3` at this revision), then install the lockfile dependencies. The pin satisfies the minimum Node 22 versions required by the locked Astro ESLint and `undici` packages:

```sh
nvm install
nvm use
node --version
npm ci
```

The existing `supabase/config.toml` already enables email confirmations, points Auth at `http://localhost:4321`, keeps the local email catcher on port `54324`, and sets local JWT expiry to 120 seconds. This short expiry is only for local refresh verification. The confirmation template is `supabase/templates/confirmation.html`.

Start the local stack, including Mailpit. Restart it after changing `supabase/config.toml` so the running Auth service uses the new settings:

```sh
npx supabase start
# After a Supabase configuration change:
npx supabase stop --no-backup
npx supabase start
```

Mailpit's web interface is at <http://127.0.0.1:54324>; its v1 API is at the same origin under `/api/v1`. Keep CLI output and generated local keys private. Do not paste raw CLI output, confirmation links, callback query strings, cookies, passwords, or keys into this document or shared logs.

### Set local build and preview credentials safely

Both Astro's build and the Cloudflare preview need the local Supabase API URL and anon/publishable key. `.env` and `.dev.vars` are ignored by Git. The following Bash snippet refuses to overwrite either file, filters the Supabase status output to the two permitted values, and creates private files. If either file already exists, review it locally and merge only the required values without discarding its other settings; do not run a redirect that overwrites it.

```bash
set -euo pipefail
umask 077

if [[ -e .env || -e .dev.vars ]]; then
  printf 'Existing ignored credential files found. Review and update them locally; nothing was overwritten.\n' >&2
  exit 1
fi

status_env="$(mktemp)"
trap 'rm -f "$status_env"' EXIT
npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|PUBLISHABLE_KEY)=' > "$status_env"
set -a
source "$status_env"
set +a

local_key="${PUBLISHABLE_KEY:-${ANON_KEY:-}}"
if [[ -z "${API_URL:-}" || -z "$local_key" ]]; then
  printf 'Supabase status did not provide an API URL and anon/publishable key.\n' >&2
  exit 1
fi

printf 'SUPABASE_URL=%s\nSUPABASE_KEY=%s\n' "$API_URL" "$local_key" > .env
cp .env .dev.vars
```

Only the API URL and anon/publishable key are written to these files. Do not put the service-role key in either file. `.env.example` remains placeholder-only and is not a source of local credentials.

## Local CI-equivalent sequence

Run these checks after local Supabase is configured and restarted. The smoke uses the built Cloudflare preview, not the Astro development server. Start preview in one terminal and run smoke from another:

```sh
npm ci
npm run test:auth
npm run lint
npx astro sync
npx astro check
npm run build
npm run preview -- --host 127.0.0.1 --port 4321
```

In a second terminal, run:

```sh
BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke
```

The CI workflow checks Mailpit and preview readiness with bounded retries. Locally, `scripts/smoke.mjs` preflights both origins and fails if either service is unavailable. Its mailbox wait is limited to 30 seconds per fixture, its refresh-expiry wait to 180 seconds, each HTTP request to 10 seconds, and the complete smoke to 300 seconds. The two minted access tokens must reflect the configured 120-second local lifetime. Allow at least five minutes for smoke; a timeout or missing service is a failed run, not a partial pass.

Use new, unique local fixture addresses for each manual run. Keep the two confirmed accounts distinct because the existing signout scope is global per account. Open the delivered confirmation link in a separate clean browser context, do not purge shared Mailpit messages, and do not retain fixture passwords, full email addresses, links, JWTs, cookie values, or token query strings in evidence. The automated smoke uses unique local fixtures and isolated cookie jars and does not print credentials or cookie contents.

## Execution evidence

### Existing implementation records

These outcomes are copied from the completed rows in this change's canonical `plan.md` Progress section; they are not a fresh rerun in the Phase 4 authoring pass.

| Record                    | Commands or behavior                                                                      | Recorded outcome                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1, commit `a81264b` | `npm run test:auth`; `npm run lint`; `npx astro sync`; `npx astro check`; `npm run build` | Pass recorded in Progress. Direct invalid-signup and anonymous-dashboard checks also recorded complete.                                              |
| Phase 2, commit `cb1e1a1` | `npm run test:auth`; `npm run lint`; `npx astro sync`; `npx astro check`; `npm run build` | Pass recorded in Progress. Local Mailpit confirmation, fresh-context session, result-page states, and consumed-link replay checks recorded complete. |
| Phase 3, commit `0f6c24b` | `npm run smoke`; `npm run test:auth`; `npm run lint`                                      | Pass recorded in Progress. The controlled local Auth outage and recovery check is also recorded complete.                                            |

The prior Progress entries retain summary outcomes and closing commit SHAs; raw command logs were not copied here. No generated keys, callback tokens, passwords, or cookie values are included.

### Phase 4 local CI-equivalent run

The following outcomes were recorded on 2026-10-10 after running the local sequence with the confirmed-email configuration.

| Check                                                         | Result   | Date / sanitized evidence                                                                                                            |
| ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Node matches `.nvmrc`; `npm ci`                               | **Pass** | 2026-10-10 — Node v22.22.3; clean install completed without engine warnings.                                                         |
| `npm run test:auth`                                           | **Pass** | 2026-10-10 — 13 tests passed, 0 failed.                                                                                              |
| `npm run lint`                                                | **Pass** | 2026-10-10 — exit 0.                                                                                                                 |
| `npx astro sync`                                              | **Pass** | 2026-10-10 — generated types successfully.                                                                                           |
| `npx astro check`                                             | **Pass** | 2026-10-10 — 36 files, 0 errors, 0 warnings, 0 hints.                                                                                |
| `npm run build` with local credentials                        | **Pass** | 2026-10-10 — Cloudflare build completed; sitemap integration skipped because `site` is unset.                                        |
| Production preview readiness at `http://localhost:4321`       | **Pass** | 2026-10-10 — built preview returned HTTP success within the bounded wait.                                                            |
| Mailpit API readiness at `http://127.0.0.1:54324/api/v1/info` | **Pass** | 2026-10-10 — Mailpit v1.30.2 returned HTTP success.                                                                                  |
| `npm run smoke` with explicit app and Mailpit origins         | **Pass** | 2026-10-10 — all auth smoke steps passed, including native confirmation, actual-expiry refresh, revoked-session denial, and signout. |
| Full local sequence outcome                                   | **Pass** | 2026-10-10 — all listed local CI-equivalent gates passed.                                                                            |

The shell had no `nvm`, so commands ran with the exact `.nvmrc` version through `npm exec --yes --package=node@22.22.3 -- sh -c '…'`. An initial `npm ci` under the prior 22.14.0 pin completed but reported engine warnings for locked dependencies; `.nvmrc` and CI were aligned to 22.22.3, then the install was repeated successfully without engine warnings. `npm ci` reported 11 audit advisories (2 moderate, 9 high) and install-script notices for esbuild/workerd. The build passed with the sitemap warning recorded above.

**Remote Actions:** **Not observed.** No remote Actions run was reviewed during this local verification. Add a run URL, commit, and result only after observing an actual workflow run.

## Browser acceptance

The user confirmed on 2026-10-10 that the Chrome, Firefox/mobile, controlled-outage, and JavaScript-disabled checks passed. Exact browser versions, device or viewport details, and fixture labels were not supplied. No account password, full confirmation URL, token, or cookie is recorded. Confirmation links were opened in clean contexts.

| Environment                     | Acceptance coverage                                                                                                                                                                                                                                | Result / date / sanitized notes |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Current Chrome, desktop         | Hydrated field errors and password visibility; valid native form submission; confirmation in a separate clean context; reload retains the session; logout then protected-page denial; visible retry guidance during a controlled local Auth outage | **Pass**                        | 2026-10-10 — User confirmed all checks passed; browser version and fixture label not supplied.                     |
| Current Firefox, desktop        | Hydrated field errors and password visibility; valid native form submission; confirmation in a separate clean context; reload retains the session; logout then protected-page denial; visible retry guidance during a controlled local Auth outage | **Pass**                        | 2026-10-10 — User confirmed all checks passed; browser version and fixture label not supplied.                     |
| Phone or narrow mobile viewport | Responsive form use, field errors, password visibility, valid submission, clean-context confirmation, reload persistence, logout denial, and visible outage retry guidance                                                                         | **Pass**                        | 2026-10-10 — User confirmed all checks passed; device or viewport and fixture label not supplied.                  |
| JavaScript disabled             | Invalid signup is rejected by server validation; valid signup submits through the native form and completes the confirmation flow in a clean context                                                                                               | **Pass**                        | 2026-10-10 — User confirmed invalid and valid signup flows passed; browser version and fixture label not supplied. |
| Consumed confirmation link      | Replay in another clean context remains invalid and does not create a session                                                                                                                                                                      | **Pass**                        | Recorded in Phase 2 Progress 2.3 (`cb1e1a1`) and Phase 3 smoke (`0f6c24b`); not newly repeated for Phase 4.        |

The user confirmed the controlled local Auth outage was checked while the preview remained reachable, retry guidance appeared, and restoring Auth returned the flow to normal. Browser-visible behavior is based on this user confirmation, not inferred from the HTTP smoke.

## Remaining scope and limitations

- F-02 still requires hosted confirmation-template and redirect-URL configuration plus verification of real hosted email delivery. Local Mailpit evidence does not establish hosted SMTP behavior.
- A workflow definition is not proof of a remote Actions run; use the explicit remote record above.
- Exact browser versions, mobile device or viewport details, and fixture labels were not provided with the confirmation; the recorded outcomes preserve that limitation.
- HTTP smoke does not establish keyboard interaction; no keyboard-specific acceptance result is recorded.
