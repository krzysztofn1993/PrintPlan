# Implementation Review Fixes

## F1 — Negative legacy replay coverage after populated upgrade

- **Decision**: FIXED on 2026-10-18, following the author's “napraw” instruction.
- **Source**: `reviews/impl-review.md`, F1.
- **Change**: Extended `scripts/migration-persistence.mjs` with changed legacy payload/witness conflicts and exact replay rejection after explicit release and deletion of an actively reserved print. Independent legacy fixtures are committed before account-settings migration. Each rejected attempt compares complete product, reservation and ledger snapshots.
- **Verification**: `npm run test:migrations`, `npm run verify:deploy`, targeted ESLint and `git diff --check` passed. A disposable NULL-unsafe witness-comparison mutation was detected by the new added-witness scenario; its scratch database and temporary runner were cleaned up.
- **Remaining work**: None for F1. Review coverage remains phases 1, 2, 3; phase 4 is unchanged.
