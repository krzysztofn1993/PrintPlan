---
change_id: testing-data-isolation-and-persistence
title: Prove data isolation and persistence for rollout Phase 1
status: archived
created: 2026-10-14
updated: 2026-10-14
archived_at: 2026-10-14T19:32:48Z
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Data isolation and persistence".
Risks covered: #1 cross-account/anonymous access; #2 loss or unintended alteration of acknowledged spool/print data.
Test types planned: restricted-role database integration + HTTP integration.
Risk response intent:

- #1: prove two independent owners and anonymous access cannot read or mutate foreign records, including guessed IDs and direct REST; challenge login-as-ownership and avoid privileged-role assertions.
- #2: prove committed values survive independent reads and fresh sessions, deletion affects only the selected record, and applicable existing migration upgrades preserve seeded data; challenge HTTP 200 or a clean rebuild as persistence proof.

Reuse existing coverage and close only grounded gaps. Follow cost × signal; research verifies actual paths and the cheapest useful layer. Do not add appearance tests, generated-code tests, or tests for unimplemented reservations/settlement.
After creating the folder, suggest the next natural /10x-research invocation for this change; continue research → plan → implement unless blocked. Each phase's implementation plan must finish by updating §6 cookbook patterns.
