# Implementation review fixes

## F1 — Preserve available usage and request identity on failed reviews

- Status: FIXED locally on 2026-11-01.
- Authorization: The author selected triage and requested the proposed fix.
- Source: [Implementation review](../reviews/impl-review.md).
- Changes: Extract and validate provider request identity and usage before accepting review output; carry only those metadata fields through a dedicated error into the operational envelope. Preserve error status and a null review.
- Regression coverage: Incomplete, refused, and invalid-review responses retain valid metadata; invalid and unavailable metadata are rejected or remain null; raw provider output is not retained; one request per review is preserved.
- Verification: Adapter suite passes 12 tests; full offline reviewer suite passes 50 tests; `npm run verify:deploy`, Prettier, and whitespace checks pass. No live inference or remote mutation was needed.
- Remaining work: None for this finding.
