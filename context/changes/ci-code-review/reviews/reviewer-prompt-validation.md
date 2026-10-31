# Reviewer evidence requirements and final validation

## Accepted policy — 2026-10-31

The author approved separate review rules and a final response-validation checklist in the same assembled prompt. Implement the English equivalent of the approved Polish draft while retaining all six scoring dimensions and the eight-field JSON response contract.

Every blocking finding must identify a changed-code location, hard evidence, a triggering scenario, expected and incorrect results, an executable confirming test or reproducible steps, and how this PR introduces, worsens, or activates the problem. The reviewer describes the confirming test; it does not execute it. Unverified concerns, missing context, missing test coverage alone, and unrelated pre-existing defects cannot justify rejection. This accepted instruction supersedes the earlier policy that allowed essential missing tests alone to block a change.

A pass means no blocking finding was demonstrated in the supplied material, not a guarantee of defect-free code. The reviewer must account for visible safeguards, preserve the untrusted-input boundary, and disclose that it did not execute tests. Scores remain independent from the verdict.

## Implementation

- `system.md`: scope, trust boundary, evidence requirements, PR attribution, and verdict rules.
- `criteria.md`: scoring dimensions, exact response format, and the final validation checklist. The loader appends criteria after system instructions, so self-validation is the final part of the assembled prompt.
- Existing package tests now also check the evidence policy, nonblocking treatment of missing context/coverage, pre-existing behavior, and validation checklist.
- Runtime JSON Schema validation is unchanged. The checklist is an instruction to the model, not an additional inference call or a programmatic verification of whether its evidence is true.

Prompt ID: `code-review`. New combined digest: `7e5260d50a6b4d8d42688efc9f07e1faa4b99f6f15f815d540d5b67e8e301631`. The earlier live reviews used digest `94cf3b8c1dd4626f0adc71b1ca1dc3ed67a2e88fae1cebf4ebba6f107c38867f`.

## Verification and deployment

- `npm run test:ai-review`: PASS, 46 tests.
- `npm run verify:deploy`: PASS, including native contracts, lint, Astro checks, and production build.
- Changed-file formatting and whitespace checks: PASS.
- During local implementation, no provider request, remote write, model-variable change, or Manual Progress update was performed. Those offline checks confirm the bundled prompt contract; the subsequent hosted observations are recorded below.

The new prompt must reach trusted `master` before hosted reviews can use it. A PR event executes the package and prompts from its captured base SHA. Retrying an old event or merely pushing prompt changes to an unmerged PR does not activate them. After merging, use a fresh eligible event with the updated base and verify the recorded digest. Evaluate both known correct code and the deliberate arithmetic defect to check for false rejections and missed defects.

## Hosted acceptance and closure

The author merged prompt PR #42 as master `8e701a0fc9eac1786ceced0887a6dd4ee66ee0f6`, then updated PR #41's branch. Run `41201707354` confirms the new digest and a published pass for the correction, without treating unverified uncertainty as a blocker.

PR #40 subsequently used the same new prompt to reject the real addition defect in run `41202310623`, explicitly identifying expected 62 versus actual 238 and a confirming test. Correction run `41202628985` produced a valid published pass. These positive/negative examples support the accepted policy; they do not establish general reviewer accuracy or guarantee that future model judgments are correct. The author accepted the recorded results in consolidated acceptance on 2026-10-31.
