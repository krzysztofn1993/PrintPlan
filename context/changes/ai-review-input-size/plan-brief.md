# AI Review Input Size — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Keep unchanged archive moves from exhausting the reviewer's input budget and support larger feature reviews with a bounded 1 MiB input. The recorded archive PR #47 input falls from 371,199 to 11,909 bytes with exact-content rename detection, without dropping its old/new path inventory.

## Starting Point

The accepted limit, exact-content rename handling, README explanation, and move regression already exist in the planning checkout. Research reports earlier successful checks; the plan calls for fresh acceptance evidence and any missing byte-boundary coverage rather than reapplying the implementation.

## Desired End State

Identical text moves remain compact; moved-and-edited files retain their changed content. Inputs at exactly 1,048,576 serialized UTF-8 bytes are accepted, larger inputs fail before HTTP, and binary omissions remain explicit. Offline readiness and future hosted adoption are clearly distinguished.

## Key Decisions Made

| Decision        | Choice                                                          | Why                                                                    | Source                       |
| --------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------- |
| Input ceiling   | 1 MiB = 1,048,576 serialized UTF-8 JSON bytes                   | Supports the measured larger feature inputs while retaining a bound.   | Research: accepted follow-up |
| Rename handling | Exact-content detection for patch only                          | Removes unchanged text without changing path/stat parsing.             | Research: accepted follow-up |
| Coverage        | Retain old/new paths, edited content, binary disclosure         | Compact representation must preserve review coverage.                  | Research                     |
| Other controls  | Retain 200 paths, no truncation, existing output/request limits | The accepted scope changes only input size and patch representation.   | Research                     |
| Delivery        | Two phases; offline acceptance and CI readiness                 | Separates contract verification from evidence and operator adoption.   | Plan: approved structure     |
| Hosted actions  | Outside execution scope                                         | Trusted-base adoption is documented without scheduling paid inference. | Plan: approved structure     |

## Scope

**In scope:**

- Confirm the existing input and rename contracts; correct demonstrated gaps only.
- Verify exact-byte boundaries, multibyte/escaped input, large moves, edited text, unusual paths, binary disclosure, and Git isolation.
- Run offline reviewer/repository gates and record evidence; review package documentation.

**Out of scope:**

- Similarity matching, chunking, truncation, archive exclusions, path-limit increases, and model changes.
- Paid inference, remote merges, branch refreshes, deployment, and protection changes.

## Architecture / Approach

Keep immutable-base execution and the existing input schema. Compact only the patch's identical moves, retain no-renames path/stat collection, and enforce the byte ceiling on assembled JSON before provider invocation. Reuse the existing implementation and tests, adding only missing acceptance coverage.

## Phases at a Glance

| Phase                            | What it delivers                                  | Key risk                                                                  |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Reviewer Input Contract       | Verified byte limit and move/coverage behavior    | Confusing character counts with serialized bytes or omitting moved paths. |
| 2. Verification and CI Readiness | Fresh gates, evidence, and adoption documentation | Mistaking offline success for hosted or model-capacity acceptance.        |

**Prerequisites:** Repository Node version and installed root/reviewer dependencies; no API credentials required for offline checks.
**Estimated effort:** One short implementation/verification session across two phases, assuming no gate failures.

## Open Risks & Assumptions

- A 1 MiB byte ceiling does not guarantee the configured model's token capacity; existing operational errors remain authoritative.
- The separate 200-path guard still rejects overly broad changes; bootstrap PR #10 exceeds both measured size and file limits.
- Git subprocess bounds remain 1 MiB; excessive output can fail before assembly.
- Hosted adoption requires the corrected trusted base and a fresh eligible run; neither is established by this plan.

## Success Criteria (Summary)

- Large identical moves are compact while edited text, old/new paths, binary disclosure, and Git isolation remain covered.
- Exactly 1,048,576 serialized UTF-8 bytes are accepted and 1,048,577 are rejected before HTTP without truncation.
- Offline reviewer and repository gates pass, with evidence and documentation reviewed by a human.

## References

- [Full plan and source anchors](plan.md)
- [Research and accepted follow-ups](research.md)
- [Merged PR measurements](merged-pr-sizes.md)
