# Personal Filament Stock — Plan Brief

> [Full plan](plan.md)
> [Research](research.md)

## What & Why

Let a hobbyist record, inspect, correct, and delete their own filament spools before planning a print. Stock is a manually entered estimate; the interface explains recorded, reserved, and available grams without promising physical sufficiency. This delivers roadmap S-01.

## Starting Point

Account access is complete and provides verified identity and a cookie-aware Supabase client. The dashboard is a placeholder; product tables, ownership policies, stock endpoints, and stock UI still need to be built. Existing Node tests and the two-account HTTP smoke provide verification infrastructure.

## Desired End State

The user opens `/dashboard/spools`, manages individual private spools, and keeps saved changes across refresh and later logins. A 150 g spool shows **150 g recorded / 0 g reserved / 150 g available**, with short explanations. Failed reads, failed writes, and an empty inventory receive distinct feedback.

## Key Decisions Made

| Decision              | Choice                                                              | Why                                                            | Source                      |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| Stock entry           | Whole grams; reject fractions without rounding                      | Fits manually estimated measurements                           | Plan: author                |
| Zero                  | Create minimum 1 g; edit minimum 0 g                                | Preserve a used-up spool without adding new empty ones         | Plan: author clarification  |
| Material              | Free text with suggestions; UPPERCASE storage; normalize whitespace | Support custom materials and consistent names                  | Plan: author correction     |
| Colour                | Free text with suggestions; case/whitespace-insensitive key         | Support shades and manufacturer names                          | Plan: author                |
| Multicolour           | Preserve full labels such as Black / Red / Gold                     | Three-colour filament is valid; do not collapse its components | Plan: author clarification  |
| Representation limits | Maximum 2,147,483,647 g; normalized labels 1–80 code points         | Bound storage and input without a physical-capacity claim      | Plan: planner               |
| Similar spools        | Separate UUID-addressed records; duplicate labels allowed           | Two matching spools are still separate stock                   | Research gap; Plan: planner |
| Access                | Existing session client plus operation-specific RLS and privileges  | Private application routes and direct data access must agree   | PRD / Research              |
| Quantities            | Reserved 0 g; available equals recorded                             | Reservations belong to S-03                                    | Roadmap / Research          |

Label normalization uses one explicit whitespace set in TypeScript and SQL. The database owns canonical material case and colour keys using ICU root rules; forms display committed values and map final normalized-length failures to field feedback. Both test layers cover the Unicode cases listed in the full plan.

## Scope

**In scope:** persistent owner-only CRUD, agreed field rules, inventory/forms/delete confirmation, explained gram values, accessible phone/desktop UI, database/Node/HTTP verification.

**Out of scope:** reservations, prints, margins, settlement, hosted deployment, extra spool attributes, a closed colour catalogue, HEX requirements, colour parsing/synonym merging, realtime updates, and a new browser test runner.

## Architecture / Approach

An Astro SSR page supplies initial private inventory; a React island sends form-encoded or multipart requests to authenticated JSON endpoints. The existing request-scoped Supabase client accesses a typed spool table protected by database rules. Application-generated stock responses are private and uncached; forms also handle non-JSON framework errors. Update/delete succeeds only when an affected record is confirmed. Inventory reads retrieve every batch, with tests above the 1,000-row response limit and explicit failure if a later batch fails. Forms require JavaScript for mutation interaction and retain inputs after failures.

## Phases at a Glance

| Phase                             | What it delivers                                                                   | Key risk                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Database and data contracts    | Migration, normalization, stock rules, RLS, generated types, restricted-role tests | Rounding or owner bypass at the database boundary                  |
| 2. Stock operations and responses | Shared validation, typed queries, endpoints, error/cache contracts, Node tests     | Reporting success for no affected record                           |
| 3. Personal stock interface       | Protected page, navigation, forms, confirmations, explained quantities             | Lost input, inaccessible feedback, or truncated multicolour labels |
| 4. End-to-end verification and CI | Extended real HTTP/direct REST smoke, CI gates, recorded browser acceptance        | Mistaking local or mocked evidence for hosted/browser acceptance   |

**Prerequisites:** completed F-01; Node 24.21.0 from `.nvmrc`; installed dependencies; Docker/local Supabase and Mailpit; local anon/publishable configuration; a disposable database for rebuild checks.

**Estimated effort:** approximately 4–6 focused after-hours sessions across four phases, including local integration and manual acceptance; this is a planning estimate.

## Open Risks & Assumptions

- Stock remains an estimate. Whole-gram stock entry does not settle later reservation rounding.
- Names match by agreed normalization, without synonyms or component reordering: Grey/Gray and differently ordered three-colour labels remain distinct.
- Concurrent owner edits use ordinary last-completed-write behavior; automatic retries and realtime conflict resolution are excluded.
- Remote schema/deployment remains unverified. S-03 must harden all database mutation paths before enabling reservations.

## Success Criteria (Summary)

- Owner CRUD survives fresh reads and logout/relogin; another account cannot read, change, forge, or take ownership of the records.
- Create rejects 0 g, edit accepts 0 g, fractions are rejected, materials become UPPERCASE, and complete multicolour names persist.
- Real database/HTTP checks and existing auth checks pass; phone and current Chrome/Firefox acceptance is recorded separately from hosted verification.

## References

- [Research](research.md), [full plan](plan.md), and [change identity](change.md).
- [Roadmap S-01](../../foundation/roadmap.md), [PRD](../../foundation/prd.md), and [chosen stack](../../foundation/tech-stack.md).
