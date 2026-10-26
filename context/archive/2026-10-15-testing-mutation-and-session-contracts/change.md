---
change_id: testing-mutation-and-session-contracts
title: Mutation and session regression contracts
status: archived
created: 2026-10-15
updated: 2026-10-26
archived_at: 2026-10-26T13:21:43Z
---

## Notes

Continue rollout Phase 2 of context/foundation/test-plan.md: Mutation and session contracts.
Protect risks #3 (stale/competing print edits), #4 (invalid grams or altered labels), and #5 (session refresh, revocation and authentication failures).
Reuse Node contracts, restricted-role SQL and production-preview HTTP smoke; add tests only where they provide missing regression signal.
The author requested a new branch and continuation through the next phase, with execution mode selected by the agent.
