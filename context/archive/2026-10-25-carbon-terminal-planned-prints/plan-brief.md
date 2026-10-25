# Carbon Terminal Prints — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Repair expanded panels and clarify the existing mixed collection of planned and completed prints.
Wide-screen panels currently lose their intended full width, and the visible Reserved heading also contains actual consumption.
Keep the author-approved Carbon Terminal Data Table and all existing operation safeguards.

## Starting Point

The route, shared shell, tokens, table, forms, reservation and settlement flows already exist.
The 2026-10-23 Data Table acceptance is the baseline; earlier terminal screenshots do not establish current acceptance.
Research reproduced the CSS conflict in isolated markup; complete built-route evidence remains part of implementation.

## Desired End State

Prints consistently describes the collection, with Your prints and No prints yet in its collection states.
Expanded details stay full width and attached to their owning record on desktop and phones.
Users receive help beside decisions, can distinguish similar spool options and recover safely without numeric version jargon.

## Key Decisions Made

| Decision              | Choice                                                         | Why                                                       | Source                            |
| --------------------- | -------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Presentation baseline | Keep the shared Data Table                                     | Preserve the later accepted design.                       | Research                          |
| Detail structure      | Record group, five-cell summary, separate spanning detail rows | Repair geometry and accessible relationships together.    | Plan; researched shared consumers |
| Names                 | Prints; Your prints; No prints yet                             | Include planned and completed records consistently.       | Plan; author                      |
| Result heading        | Reservation / result on desktop, mobile and accessible labels  | Match both held grams and actual consumption.             | Research + Plan                   |
| Explanations          | Short introduction, help in workflow panels                    | Explain consequences where decisions happen.              | Plan; author                      |
| Similar spool options | Short, distinct IDs with accessible full IDs                   | Distinguish records without inventing physical labels.    | Plan; author                      |
| Version information   | Plain-language guidance; hide numeric versions                 | Retain safeguards without requiring protocol knowledge.   | Plan; author                      |
| Ownership             | Existing print/stock collections keep state and mutations      | Avoid changing draft, reservation or settlement behavior. | Research                          |

## Scope

**In scope:**

- Shared table structure/CSS; print panels and stock edit/delete as dependent consumers.
- Names and incoming links; contextual help; spool option IDs; edit/release/settlement recovery copy.
- Focused geometry/accessibility checks, updated existing assertions, current seven-state review and durable guidance.

**Out of scope:**

- Backend/schema changes, new reservation policies, filters, tabs, routes or physical spool labels.
- Replacing the accepted table/theme, extracting controllers, new test frameworks, historical artifact edits or deployment.

## Architecture / Approach

Keep the table header group; each record owns a summary row and optional separate detail rows inside its own group.
Remove the redundant semantic body group and decouple detail width from the mobile-only span reset.
Preserve form identity/reset keys, full IDs, quantity DTOs, exact captured attempts and detached settlement review.

## Phases at a Glance

| Phase                                        | What it delivers                                                         | Key risk                                               |
| -------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1. Shared detail-panel contract              | Reusable structure, geometry, consumer migration and focused regressions | Draft/focus stability and record-scoped test locators. |
| 2. Prints naming and contextual guidance     | Four author-approved choices and dependent E2E/HTTP assertions           | Losing a warning or overstating a recovery outcome.    |
| 3. Verification and retained review evidence | Full gates, browser screenshots, accessibility review and guidance       | Mistaking automated checks for human acceptance.       |

**Prerequisites:** Node 24.21.0, dependencies, Chromium, free preview port and local Supabase; Mailpit for HTTP smoke; Chrome/Firefox and assistive technology for human review.
**Estimated effort:** Approximately 2–3 focused implementation sessions plus author review across three phases; an estimate, not a deadline.

## Open Risks & Assumptions

- Per-record groups require helper changes because current tests search for panel controls inside the summary row.
- Prefix collisions must extend short spool IDs; IDs identify application records rather than physical spools.
- Current full-route appearance and screen-reader behavior remain unverified; the planned evidence gate resolves this.
- Existing version checks and captured attempts remain internal; UI simplification must retain their meaning and uncertainty.

## Success Criteria (Summary)

- All print/stock details retain full width, valid record context, readable quantities and usable focus across the specified layouts.
- Names, help, spool choices and recovery guidance match the four author decisions without changing operation behavior.
- Deploy verification, complete Chromium E2E and HTTP smoke pass; the author accepts fresh seven-state Chrome/Firefox evidence and accessibility checks.

## References

- [Detailed plan and Progress](plan.md), [research](research.md), [PRD](../../foundation/prd.md) and [accepted Data Table baseline](../../archive/2026-10-20-edit-reserved-print/verification.md).
