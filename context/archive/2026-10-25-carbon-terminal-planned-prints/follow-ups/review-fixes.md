# Implementation review fixes

Source: [implementation review](../reviews/impl-review.md).

## F1 — Workbench locator migration

The author selected **Fix now** for F1 on 2026-10-25.

- [x] Replace affected descendant-region lookups with ID-scoped workbench roots and explicit region-role/accessibility-name assertions.
- [x] Scope spool-description checks to the Choose a spool group and receipt quantities to the workbench form.
- [x] Assert the refreshed print name on its summary record.
- [x] Preserve behavior, persisted quantities and request-count assertions in the existing scenarios.
- [x] Run reservation and settlement recovery together: **34 passed (1.1m)**.
- [x] Run the complete Chromium suite: **83 passed (2.7m)**, including authentication setup and teardown.
- [x] Pass standalone lint, production build and formatting checks.
- [x] Pass the final `npm run verify:deploy` gate: 100 native contract tests, lint, type checks and production build; Astro reports 0 errors, 0 warnings and 6 existing hints.

Changed tests: `tests/e2e/reservation-recovery.spec.ts` and `tests/e2e/settlement-recovery.spec.ts`. Local Supabase configuration was temporarily aligned for browser verification and then restored byte-for-byte. Browser teardown removed its private authentication artifacts.

## F2 — Reconcile the plan with the final presentation contract

The author selected **Fix now** for F2 on 2026-10-25.

- [x] Add the follow-up design addendum to [plan.md](../plan.md#follow-up-design-addendum-2026-10-25), with provenance from `34488c8`, current captures and repository guidance.
- [x] Distinguish record-local deletion details, collection workbenches and detached settlement recovery.
- [x] Reconcile affected geometry, ownership, accessibility and test-scoping requirements; document the request-ID compatibility helper.
- [x] Preserve the original plan content and Progress entries.
- [x] Check Markdown formatting, linked paths and diff whitespace.

## F3 — Record manual accessibility review details

The author selected completion of the evidence and supplied review details on 2026-10-25.

- [x] Record author-reported Brave 1.97.57 / Chromium 155.0.8059.80 and Firefox 157.0.1, including Brave's pending-restart update notice.
- [x] Record working keyboard navigation/focus restoration, author visual acceptance of contrast and problem-free Firefox 200% zoom.
- [x] Attribute these observations to the author and retain the historical capture provenance and plan Progress entries.
- [x] Record the author's explicit decision on 2026-10-25 to skip the unavailable screen-reader check. F3 is SKIPPED; the check is NOT PERFORMED, and the supplied Brave/Tab description documents keyboard testing.

Triage is complete: F1 and F2 are FIXED, F3 is SKIPPED and no decisions remain pending. The review verdict is APPROVED with an explicit screen-reader verification limitation. The screen-reader check has not passed; its omission is recorded as the author's decision.
