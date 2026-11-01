# Reviewer evaluation cases

This directory contains three frozen, synthetic review inputs. Each case keeps the model-visible `input.json` separate from its `oracle.json`. The input has exactly the fields accepted by `assembleInput()`: title, body, diff, paths, and unreviewedPaths. Oracle labels, reference findings, and deterministic assertion patterns are evaluation metadata and are never passed to the reviewer.

The `before.mjs` and `after.mjs` files are executable witnesses for each controlled change. `diff.patch` records the corresponding reviewable change. Case 3 is a small JavaScript translation of the reservation allocation behavior; it does not execute or modify the SQL migration.

Run the offline case and assertion tests through the repository's planned `npm run test:ai-review-evals` command once the eval package runner is installed. No API key, network access, or paid model call is needed for these tests.

## Reference findings

- **case-01**: the guarded stock helper returns 62 g for 150 g recorded and 88 g reserved. Its visible finite, nonnegative, and reserved-stock checks reject malformed states. The reference verdict is `pass`.
- **case-02**: the changed addition returns 238 g for the same inputs instead of subtracting the reservation to produce 62 g. This can overstate stock available to another print. The reference verdict is `fail`.
- **case-03**: with 300 g recorded, 209 g held elsewhere, and this print's existing 88 g hold, capacity excluding the current hold is 91 g. An 84 g edited request should retain and resize the reservation. The changed checks count the current hold in capacity twice, leave only 3 g, and release the reservation. There is no alternative spool in the witness. The reference verdict is `fail`.

Deterministic assertions independently check the expected verdict and, for known defects, bounded alternatives for the changed location, mechanism, and consequence. They filter obvious misses; they do not establish semantic truth or replace human review.

## Initial human finding checklist

Before using a future comparison to select a model or activate a gate, review every response against its oracle. For each alleged finding, confirm the actual changed location, hard evidence, triggering scenario, expected and incorrect behavior, reproducible steps, and attribution to this change. Check visible safeguards and record any additional false allegations. In particular, accept or correct the concise reference descriptions above before treating future model results as quality evidence.

No model comparison, spending authorization, hosted workflow, or paid request is part of this bootstrap phase.
