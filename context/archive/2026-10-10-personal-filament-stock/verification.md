# Personal filament stock verification record

This record separates local checks from browser acceptance and hosted evidence. Automated checks below ran on Node 24.21.0 from `.nvmrc`. The existing local Supabase stack, Mailpit, and preview already occupied the default ports, so destructive database verification and the smoke used a fresh isolated Supabase project with alternate local ports.

## Local automated checks

| Command                                                                            | Result | Evidence                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx supabase --workdir /tmp/printplan-phase4.AkhDpE db reset --local`             | PASS   | Fresh isolated local project applied the migration without a missing-seed error.                                                                                                    |
| `npx supabase --workdir /tmp/printplan-phase4.AkhDpE test db`                      | PASS   | Restricted-role database contract suite passed.                                                                                                                                     |
| `npm run test:auth`                                                                | PASS   | 13 auth contract tests passed.                                                                                                                                                      |
| `npm run test:spools`                                                              | PASS   | 11 stock contract tests passed.                                                                                                                                                     |
| `npx astro sync`                                                                   | PASS   | Astro generated project types.                                                                                                                                                      |
| `npm run lint`                                                                     | PASS   | ESLint completed without errors.                                                                                                                                                    |
| `npx astro check`                                                                  | PASS   | 49 files checked; zero errors, warnings, or hints.                                                                                                                                  |
| `npm run build`                                                                    | PASS   | Cloudflare server build completed.                                                                                                                                                  |
| `BASE_URL=http://localhost:14321 MAILPIT_URL=http://127.0.0.1:55324 npm run smoke` | PASS   | Built-preview smoke passed auth, stock API/SSR CRUD, direct REST owner isolation, hostile-origin and malformed-field checks, persistence, expiry, refresh, revocation, and signout. |

## Browser and device acceptance

- Chrome: Passed. On 2026-10-11, the user confirmed add, correction, deletion, empty/error/success states, refresh and logout/relogin persistence, keyboard interaction, focus, field errors, and input retention.
- Firefox: Passed. On 2026-10-11, the user confirmed the same desktop checks.
- Phone: Passed. On 2026-10-11, the user confirmed adding a PLA spool labelled `Black / Red / Gold` with 150 g, correcting it to 0 g, cancelling then confirming deletion, and checking labels, explanations, errors, focus, controls, and layout.

## Hosted and remote checks

- GitHub Actions: Not observed in this implementation pass; local checks do not establish a hosted workflow result.
- Hosted database or deployment: Not checked. Hosted verification is outside this change's local acceptance.
