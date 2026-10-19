# Implementation Review Fixes

## F1 — Negative legacy replay coverage after populated upgrade

- **Decision**: FIXED on 2026-10-18, following the author's “napraw” instruction.
- **Source**: `reviews/impl-review.md`, F1.
- **Change**: Extended `scripts/migration-persistence.mjs` with changed legacy payload/witness conflicts and exact replay rejection after explicit release and deletion of an actively reserved print. Independent legacy fixtures are committed before account-settings migration. Each rejected attempt compares complete product, reservation and ledger snapshots.
- **Verification**: `npm run test:migrations`, `npm run verify:deploy`, targeted ESLint and `git diff --check` passed. A disposable NULL-unsafe witness-comparison mutation was detected by the new added-witness scenario; its scratch database and temporary runner were cleaned up.
- **Remaining work**: None for F1. Review coverage remains phases 1, 2, 3; phase 4 is unchanged.

## F2 — Reconcile completed manual acceptance

- **Decision**: FIXED on 2026-10-19 after the author reaffirmed the existing manual acceptance.
- **Source**: `reviews/impl-review.md`, F2.
- **Change**: Corrected the stale pending wording in `verification.md`, marked checks 4.4/4.5 complete and cited their existing closing commit `9b068ba`. Canonical plan Progress was already complete.
- **Verification**: Inspected the documentation diff and ran `git diff --check`. No application tests were repeated for this documentation correction.
- **Remaining work**: None. Current review covers phases 1, 2, 3, 4 with no pending findings.
