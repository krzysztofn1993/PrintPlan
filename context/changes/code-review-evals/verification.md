# Verification: Static reviewer evaluations

## Bootstrap state

Phase 3 adds the trusted workflow and offline CI wiring. The bootstrap must be merged to trusted `master` before hosted prompt evaluation can be considered active. Existing required checks remain authoritative during bootstrap.

The checked-in approval policy is disabled and contains no approved model or numeric USD allowance. No paid API request, hosted workflow dispatch, branch-protection mutation, push, or merge is part of phases 1–3.

## Offline checks

- `npm run test:ai-review-evals`
- `npm run test:ai-review`
- `npm run lint`
- `npm run build`
- `npm --prefix packages/ai-reviewer/evals run preflight` (no key or provider request)

## Pending manual verification

- The author verifies the bootstrap infrastructure is on trusted `master`.
- The author confirms spending policy is disabled and reviews the later spending and branch-protection activation sequence.
- The author reviews and accepts the three reference findings before a future comparison.
