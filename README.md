# PrintPlan

PrintPlan is a small web app for tracking filament stock and planning print reservations. The current
application is the account-access foundation; spool and reservation features are planned separately.

## Local development

Use the Node version in `.nvmrc` (currently `24.21.0`) and install the committed dependencies:

```sh
nvm install
nvm use
npm ci
```

Follow the [F-01 local verification runbook](context/archive/2026-10-09-verified-account-access/verification.md)
for safe credential setup, confirmed-email configuration, preview smoke tests, and local cleanup. It
explains how to set the local Supabase API URL and anon/publishable key in the ignored `.env` and
`.dev.vars` files without overwriting existing credentials. Start the local stack with:

```sh
npx supabase start
npm run dev
```

## Checks

- `npm run test:auth` runs the focused auth contract tests.
- `npm run verify:deploy` runs the deployment gate: auth contracts, Astro sync, lint, Astro check,
  and production build.
- `npm run smoke` exercises the auth flow against a running app and Mailpit. For the local production
  preview, use the command and environment values in the F-01 runbook.
- `npm run lint` and `npm run build` run their individual checks.

## Hosted authentication

The durable [hosted authentication setup and acceptance guide](context/foundation/hosted-auth.md)
covers Cloudflare Workers Builds, runtime secrets, hosted Supabase Auth, Brevo SMTP, browser acceptance,
expiry restoration, cleanup, and recovery. Local Supabase configuration and Mailpit results do not
configure or verify the hosted environment.

## Project layout

- `src/pages/` contains routes and auth endpoints.
- `src/components/` and `src/layouts/` contain the interface.
- `src/lib/` contains shared auth and UI helpers.
- `supabase/` contains local Auth configuration and the confirmation email template.
- `context/` contains product, implementation, and verification documentation.

## Deployment

The selected deployment is a Cloudflare Worker named `print-plan`, built from pushes to `master` by
Workers Builds. See the [hosted authentication guide](context/foundation/hosted-auth.md) for the build
and deploy settings. Keep hosted Supabase credentials in the Worker runtime's Variables & Secrets;
never commit them or place SMTP credentials in the application.
