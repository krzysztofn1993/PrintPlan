# Implementation review fixes

Source: `context/changes/personal-filament-stock/reviews/impl-review.md`.

## F1 — Preserve mutation uncertainty during field edits

- [x] Apply the user-approved fix in `src/components/spools/SpoolForm.tsx:113`: clearing a field error retains an existing `uncertain` request error, preserving refresh guidance and the submission guard.
- [x] Verify with `npm run lint`, `npx astro check`, and `npm run build`: all pass on Node 24.21.0; Astro check reports zero errors, warnings, or hints.

Completed on 2026-10-11. The browser failure scenario was not repeated.

## F2 — Prevent form transitions while a mutation is pending

- [x] Apply the user-approved fix in `src/components/spools/SpoolInventory.tsx` and `src/components/spools/SpoolForm.tsx`: share mutation pending state, disable incompatible form and inventory controls, and guard inventory open/close transitions synchronously.
- [x] Inspect all handled completion branches: successful saves, network failures, unreadable success responses, and HTTP failures release the shared lock; deletion uses the same coordination. Existing uncertain-save submission protection remains active.
- [x] Verify with `npm run lint`, `npx astro check`, and `npm run build`: all pass on Node 24.21.0; Astro check reports zero errors, warnings, or hints.

Completed on 2026-10-11. Slow-response interaction was not repeated in a browser.

## F3 — Preserve SDK status for transient failure classification

- [x] Apply the user-approved fix in `src/lib/spools.ts` and `src/lib/spool-response.ts`: retain SDK response status independently of its error body and classify transport status 0, HTTP 429, and HTTP 5xx as temporarily unavailable.
- [x] Pass the retained status through all stock API operations and the SSR inventory read.
- [x] Replace synthetic nested-status fixtures and add regression checks using the installed SDK with controlled fetch failures and gateway responses for all four query operations. Verify private 503 responses with retry guidance, permanent errors remaining generic 500, and no raw diagnostic text in client responses.
- [x] Verify `npm run test:spools` (13 pass), `npm run test:auth` (13 pass), `npm run lint`, `npx astro check` (49 files; zero errors/warnings/hints), and `npm run build`: all pass on Node 24.21.0.

Documentation was fetched with Context7 from `/supabase/supabase`. Official references: [PostgREST connection errors](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/api/rest/postgrest-error-codes.mdx) and [SDK automatic retry behavior](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/api/automatic-retries-in-supabase-js.mdx). Exact installed error shapes were additionally checked against local SDK source and exercised by the regression tests.

Completed on 2026-10-11. No provider outage was induced; database migrations and full smoke were not rerun for this response-mapping change.

## F4 — Report safe unexpected-failure diagnostics

- [x] Apply the user-approved shared reporter in `src/lib/spool-response.ts` and invoke it from both API response conversion and `src/pages/dashboard/spools.astro`.
- [x] Use server console logging with allowlisted error types, database codes, and known code filenames with line/column coordinates. Bound the cause chain to five entries and twelve candidate stack frames per cause; stop at cycles. Exclude raw messages/details, arbitrary properties, credential-bearing stack URLs, unknown paths, and request/form values.
- [x] Extend response-boundary tests to capture emitted logs and assert preservation of safe nested causes alongside generic private client responses. Add page-reporting checks for database codes, unknown-name/code filtering, cyclic causes, and silence for expected failures.
- [x] Verify `npm run test:spools` (14 pass), `npm run test:auth` (13 pass), `npm run lint`, `npx astro check` (49 files; zero errors/warnings/hints), and `npm run build`: all pass on Node 24.21.0.

Completed on 2026-10-11. This fix changed two production files and the existing stock contract test file. Hosted log delivery was not tested. The reporter intentionally retains safe metadata rather than raw provider text; unknown source filenames are omitted from logged stack coordinates.

## Final state

F1, F2, F3, and F4 are fixed. The implementation review verdict is APPROVED, with no pending decisions. Browser reproduction of slow-response UI interactions and hosted verification retain the limits stated in the review report.
