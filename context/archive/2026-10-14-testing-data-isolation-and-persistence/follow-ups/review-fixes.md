# Implementation review fixes

## F1 — Some successful writes lack independent requested-value oracles

- **Decision**: Apply the proposed fix; selected by the author during triage on 2026-10-14.
- **Status**: FIXED, verified.
- **Changes**: `scripts/print-smoke.mjs` validates all requested editable fields on direct REST creates, validates REST edit values and retained identity/creation time, and retains each concurrent request to validate the winner's exact submitted values before updating its snapshot. API edits also check identity/creation time. `scripts/spool-smoke.mjs` validates direct REST create labels and correction identity/unchanged fields, independently rereads the corrected record through API and REST before deletion, and checks API correction identity/creation time.
- **Verification**: `npm run lint` passed. Full `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` against production preview passed with exit 0 and `All auth smoke steps passed`, including REST edits, API corrections, concurrency, exact survivors, fresh login, token expiry/refresh and revoked-session rejection. `git diff --check` passed before smoke.

## F2 — Timeout probes do not expire the shared scenario budget

- **Decision**: Apply the proposed fix; accepted by the author after clarification during triage on 2026-10-14.
- **Status**: FIXED, verified.
- **Changes**: `scripts/smoke.mjs` exposes a deadline injector to the two product smoke modules. It forces the shared scenario deadline into the past, asserts normal request-signal creation is blocked, and preserves an independent cleanup deadline capped at 30 seconds and the existing total bound. `scripts/spool-smoke.mjs` and `scripts/print-smoke.mjs` use this injector instead of expiring a throwaway request signal. `verification.md` corrects the original evidence and records actual shared-deadline cleanup proof.
- **Verification**: `npm run lint` and `git diff --check` passed. All four `PRINTPLAN_SMOKE_CLEANUP_PROBE` values (`spool-timeout`, `print-timeout`, `spool-post-signout`, `print-post-signout`) returned expected exit code 1 with the specific induced failure and both owner-cleanup PASS messages. Timeout probes additionally confirmed ordinary scenario requests were blocked while cleanup remained usable. Database queries found zero tagged probe records in both tables. Full normal built-preview smoke passed with exit 0 and `All auth smoke steps passed`.
- **Remaining triage**: none; F1 and F2 are fixed.
