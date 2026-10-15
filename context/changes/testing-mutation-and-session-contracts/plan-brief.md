# Mutation and session contracts — Plan brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Continue test rollout Phase 2 on a new branch. Fill gaps in numeric edits, Unicode preservation and authentication outage handling so tests catch data changes and false authentication outcomes.

## Starting Point

Existing Node, SQL and HTTP suites already cover versioned mutations and real refresh/revocation. Local Supabase/Mailpit are running; no test framework installation is needed.

## Desired End State

Invalid edits preserve committed stock; agreed text survives normalization. Auth outages retain session cookies and return retryable failures, with recovery proved on a fresh request. Existing live races and actual-expiry smoke stay green.

## Key Decisions Made

| Decision      | Choice                                                                  | Why                                                         | Source                         |
| ------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| Scope         | Risks #3–#5, one implementation phase                                   | Preserve approved rollout order                             | Rollout + author approval      |
| Concurrency   | Retain and rerun existing live race                                     | It already checks winner, conflict and reread               | Research                       |
| Field oracles | Literal gram/Unicode fixtures                                           | Expected values remain independent of implementation        | Archived contracts + research  |
| Auth boundary | Extract existing middleware factory; installed SDK with controlled HTTP | Tests run application decisions without a copied dispatcher | Research + plan                |
| Execution     | Research delegated; implementation here                                 | Independent discovery, one cohesive implementation          | Author authorized agent choice |

## Scope

**In scope:** Node/SQL gaps, narrow behavior-preserving middleware extraction, existing live verification, cookbook and evidence.

**Out of scope:** browser recovery Phase 3, visual testing, new dependencies, schema changes, provider shutdown, deployment and reopened F1.

## Architecture / Approach

Keep client construction in the current adapter and inject it into the extracted middleware factory. Tests provide real SSR clients with controlled provider responses and production cookie storage. SQL assertions use authenticated owners and byte-exact label oracles.

## Phases at a Glance

| Phase                                               | What it delivers                                              | Key risk                                        |
| --------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| 1. Complete mutation and session regression signals | Missing tests, verified existing integration checks, cookbook | Invalid stock/labels and false session outcomes |

**Prerequisites:** Node v24.21.0, installed dependencies, local Supabase/Mailpit and local build/preview credentials.
**Estimated effort:** One focused implementation session plus author closeout review.

## Open Risks & Assumptions

- Controlled HTTP proves SDK/application boundaries; it does not simulate real provider downtime.
- Live smoke retains its bounded wait for actual JWT expiry.
- Manual evidence review and commit approval remain pending until the author confirms.

## Success Criteria (Summary)

- Native gates, SQL, populated migration and built-preview smoke pass.
- Deliberate breaks turn the new checks red and production files are restored.
- Cookbook describes the shipped tests and their limits; author confirms closeout.
