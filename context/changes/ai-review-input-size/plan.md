# AI Review Input Size Implementation Plan

## Overview

Prevent unchanged archival moves from inflating reviewer input and support larger feature reviews with a bounded 1 MiB input. Preserve complete changed-path accounting, binary disclosure, rejection without truncation, and trusted-base execution.

## Current State Analysis

The research traced PR #47's preparation failure to disabled rename detection: its recorded refs produced 371,199 assembled JSON bytes against the former 262,144-byte ceiling. Exact-content rename detection reduces that recorded input to 11,909 bytes while retaining all 24 old/new path entries. These measurements describe recorded refs and metadata, not current hosted execution.

The author subsequently accepted exact-content rename detection and a 1 MiB ceiling. Both are already present in the clean planning checkout, along with real-Git regression coverage and README updates. This plan consolidates that implementation and specifies acceptance evidence; it does not require reapplying existing changes. Research reports earlier passing tests, lint, and build, but those results are historical until verified during execution.

The audit covers 33 merged PRs. The largest non-bootstrap assembled input was 536,436 bytes, whereas bootstrap PR #10 reached 2,700,194 bytes and 232 GitHub files. The selected ceiling accommodates the measured non-bootstrap byte sizes, not every possible PR; the separate 200-path guard still applies.

## Desired End State

Identical text moves produce compact rename metadata. Moved-and-edited text retains deletion/addition content, and mixed binary changes disclose omitted old/new paths. Assembled JSON at exactly 1,048,576 UTF-8 bytes is accepted; larger input fails before HTTP without truncation or a code verdict.

Offline evidence establishes these contracts and repository gates. Documentation explains the limits and the prerequisite for hosted adoption, without claiming that local acceptance proves model capacity or deployment.

### Key Discoveries:

- `packages/ai-reviewer/src/input/diff.mjs:50` enables exact-content detection only for the patch; path listing and binary classification remain separate no-renames collections.
- `packages/ai-reviewer/src/config.mjs:2` sets the ceiling; `packages/ai-reviewer/src/core/review.mjs:26` measures serialized input, including JSON escaping and metadata.
- `packages/ai-reviewer/test/workflow.test.mjs:147` covers large identical moves, unusual filenames, edited moves, and binary-only rejection.
- `packages/ai-reviewer/test/adapter.test.mjs:219` covers exact-ceiling acceptance and rejection before HTTP.
- `.github/workflows/review.yml:35` checks out the immutable PR base, so a head-only reviewer change cannot alter that run's implementation.

## What We're NOT Doing

- Similarity-based rename matching, chunked reviews, truncation, or archive exclusions.
- Raising the 200-path cap, changing output limits, automatic retries, or adding configuration overrides.
- Model selection, token-capacity guarantees, pricing estimates, or paid inference.
- Workflow permission changes, protection bypasses, remote merges, branch refreshes, or hosted deployment as part of this change's offline acceptance.
- Repeating the merged-PR audit or changing application/database behavior.

## Implementation Approach

Retain the existing narrow implementation and verify it against the accepted contract. Change source or tests only where inspection or a failing acceptance check demonstrates a gap. Record execution results in this change's `verification.md`, distinguishing earlier research, fresh offline checks, and future hosted adoption. All new Progress rows remain pending because creating this plan does not execute its acceptance steps.

## Critical Implementation Details

### Timing & lifecycle

The immutable trusted base supplies the reviewer package. Hosted adoption requires integrating the fix into that base, refreshing the affected PR branch, and requesting a fresh eligible run. Those operator actions remain outside this plan's execution; a retry against the old base does not establish adoption.

### Performance constraints

Git subprocess output remains bounded at 1 MiB per invocation. The accepted serialized input includes the patch plus escaping and metadata, so its raw patch is below that bound. Excess subprocess output may fail collection before assembly and must never produce approval.

## Phase 1: Reviewer Input Contract

### Overview

Confirm the existing implementation meets the accepted byte and coverage rules, correcting only demonstrated gaps.

### Changes Required:

#### 1. Bounded input

**Files**: `packages/ai-reviewer/src/config.mjs`, `packages/ai-reviewer/src/core/review.mjs`

**Intent**: Retain the accepted larger ceiling without weakening rejection behavior.

**Contract**: `LIMITS.inputBytes` is 1,048,576; `assembleInput` measures UTF-8 bytes of the serialized title, body, diff, paths, and unreviewedPaths. Equality is accepted, excess is rejected before provider invocation. The separate system prompt is outside this measurement; the path ceiling remains 200.

#### 2. Patch collection

**File**: `packages/ai-reviewer/src/input/diff.mjs`

**Intent**: Compact unchanged moves while preserving review coverage and Git isolation.

**Contract**: Patch generation uses `--find-renames=100%`; NUL-delimited path and numstat collection keep `--no-renames`. Retain old/new inventory, binary disclosure, immutable SHA validation, disabled executable diff drivers/text conversion, and current subprocess bounds.

#### 3. Focused regression coverage

**Files**: `packages/ai-reviewer/test/adapter.test.mjs`, `packages/ai-reviewer/test/workflow.test.mjs`

**Intent**: Reuse meaningful existing regressions and close only uncovered boundary cases.

**Contract**: Demonstrate acceptance at exactly 1,048,576 serialized UTF-8 bytes and rejection at 1,048,577 before HTTP, including a multibyte/JSON-escaping case so character count cannot substitute for bytes. Retain the real-Git fixture whose expanded identical move exceeds the configured ceiling, edited-move contents, tabs/newlines in paths, mixed binary disclosure, binary-only rejection, and Git isolation.

### Success Criteria:

#### Automated Verification:

- Adapter tests pass, including exact-byte acceptance and one-byte-over rejection before HTTP: `npm --prefix packages/ai-reviewer run test:adapter`.
- Workflow tests pass, including large moves, edited text, binary paths, unusual filenames, and Git isolation: `npm --prefix packages/ai-reviewer run test:workflow`.

---

## Phase 2: Verification and CI Readiness

### Overview

Establish fresh offline evidence and document the boundary between local readiness and hosted adoption.

### Changes Required:

#### 1. Package documentation

**File**: `packages/ai-reviewer/README.md`

**Intent**: Keep the existing limit and rename explanation accurate; clarify trusted-base adoption if necessary.

**Contract**: Describe 1 MiB as assembled UTF-8 JSON, preserve the 200-path rule and no-truncation policy, explain exact versus edited moves and binary disclosure, and state that the corrected reviewer must reach the immutable base before hosted runs use it.

#### 2. Verification evidence

**File**: `context/changes/ai-review-input-size/verification.md`

**Intent**: Make acceptance reviewable without confusing historical measurements with newly executed checks.

**Contract**: Record revision, commands/results, boundary and move-fixture coverage, documentation review, and any environmental limitations. Reference the existing research/audit rather than repeating it. Mark hosted adoption as outside scope and unverified unless independently evidenced; do not invent run URLs, usage, or cost.

### Success Criteria:

#### Automated Verification:

- The complete offline reviewer suite passes: `npm run test:ai-review`.
- The repository native, lint, type, and build gate passes: `npm run verify:deploy`.

#### Manual Verification:

- Review the README and verification evidence against the accepted limit, coverage rules, and trusted-base adoption prerequisite; confirm no hosted or model-capacity claim relies solely on offline tests.

**Implementation Note**: Complete automated checks before requesting human confirmation of the manual review. Do not mark the manual Progress row complete on the human's behalf.

---

## Testing Strategy

### Unit Tests:

Exercise serialized-byte boundaries through the actual assembler and the review adapter, proving zero HTTP calls on excess input. Include multibyte text and escaped characters; retain the changed-path and unreviewable-input checks.

### Integration Tests:

Use the existing temporary Git repositories to verify compact identical moves and complete edited content, old/new inventories, binary omission disclosure, hostile Git configuration isolation, and binary-only rejection. All provider requests remain injected offline fixtures.

### Manual Testing Steps:

1. Compare README policy statements with configuration, assembly, and collection.
2. Inspect recorded offline results and ensure limitations are explicit.
3. Confirm that future operator adoption requires the updated trusted base and a fresh eligible run, and that this change does not claim that run occurred.

## Performance Considerations

Exact-content matching removes repeated unchanged archive text. The byte ceiling remains a bounded-input policy, not a token estimate or a promise that the selected model accepts every input under it. Keep existing provider error handling and request limits. Benchmarking and model-capacity probing are outside scope.

## Migration Notes

No database or input schema migration is required. Preserve the trusted-base boundary. If a future rollback restores the smaller ceiling or disables rename detection, large/archive PRs can become operationally unreviewable again; do not bypass their review requirement to disguise that outcome.

## References

- [Research and accepted decisions](research.md)
- [Merged PR size audit](merged-pr-sizes.md)
- `packages/ai-reviewer/src/config.mjs:2`
- `packages/ai-reviewer/src/core/review.mjs:26`
- `packages/ai-reviewer/src/input/diff.mjs:50`
- `packages/ai-reviewer/test/adapter.test.mjs:219`
- `packages/ai-reviewer/test/workflow.test.mjs:147`
- `packages/ai-reviewer/README.md:24`
- `.github/workflows/review.yml:35`

## Progress

### Phase 1: Reviewer Input Contract

#### Automated

- [ ] 1.1 Adapter tests pass, including exact-byte acceptance and one-byte-over rejection before HTTP: `npm --prefix packages/ai-reviewer run test:adapter`.
- [ ] 1.2 Workflow tests pass, including large moves, edited text, binary paths, unusual filenames, and Git isolation: `npm --prefix packages/ai-reviewer run test:workflow`.

### Phase 2: Verification and CI Readiness

#### Automated

- [ ] 2.1 The complete offline reviewer suite passes: `npm run test:ai-review`.
- [ ] 2.2 The repository native, lint, type, and build gate passes: `npm run verify:deploy`.

#### Manual

- [ ] 2.3 Review the README and verification evidence against the accepted limit, coverage rules, and trusted-base adoption prerequisite; confirm no hosted or model-capacity claim relies solely on offline tests.
