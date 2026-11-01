<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: CI Code Review Implementation Plan

- **Plan**: context/changes/ci-code-review/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations
- **Triage**: Complete on 2026-11-01; F1 fixed, 0 pending findings.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Preserve available usage and request identity on failed reviews

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: packages/ai-reviewer/src/providers/openai.mjs:56; packages/ai-reviewer/src/core/review.mjs:82
- **Detail**: Phase 1 requires request identity and usage in the operational envelope when available. The adapter throws on incomplete responses before extracting these fields; refusal and invalid-review paths also throw before extraction. The core error handler then explicitly resets both fields to null. An incomplete response can consume the configured output allowance while its saved artifact loses the returned token counts and response correlation. This does not approve an invalid review: the error status, null review, and failed merge check remain correct. The accepted 5.7 verification adaptation does not amend this metadata requirement. The real incomplete-response observation in verification.md also records the missing usage and request ID.
- **Fix**: Extract and validate allowlisted request identity and usage independently of result acceptance, carry that safe metadata through operational errors, and preserve it in the envelope while retaining error status and a null review. Add regression coverage for incomplete, refused, and invalid-review responses with available metadata.
  - Strength: Restores the planned metadata contract and supports cost reconciliation for unsuccessful billable requests without exporting raw provider output.
  - Tradeoff: Requires a small adapter/core error-contract change and validation of metadata on error paths.
  - Confidence: HIGH — reproduced using injected HTTP only; both metadata loss points are explicit.
  - Blind spot: No provider billing records were inspected; metadata availability depends on the provider response.
- **Decision**: FIXED — 2026-11-01, user selected the proposed fix. Validated request identity and usage are extracted before result acceptance and carried through ReviewResponseError into the error envelope. Two regression tests cover incomplete/refused/invalid reviews, invalid metadata, absent metadata, and transport failures. Status remains error with a null review; raw provider output is not retained.

### F1 reproduction

Call `reviewChange` with valid fixture context/input and an injected successful HTTP response containing:

```json
{
  "id": "resp_incomplete_fixture",
  "status": "incomplete",
  "output": [],
  "usage": {
    "input_tokens": 12,
    "output_tokens": 8000,
    "total_tokens": 8012
  }
}
```

Observed envelope fields before the fix:

```json
{
  "status": "error",
  "error": "INCOMPLETE_RESPONSE",
  "review": null,
  "requestId": null,
  "usage": null
}
```

Expected: the same operational error and null review, with validated request ID and usage retained. This reproduction made no network request.

## Scope and evidence

- All 27 Progress criteria are checked; reviewed phases are explicitly 1–5. Progress was read and left unchanged.
- Git scope starts at `685d0f8^` and ends at `a4c05d3`, including later reviewer corrections and acceptance records. The implementation matches the planned standalone package, prompt/schema boundaries, bounded single-request adapter, trusted orchestration, pending-first check, publication lifecycle, and independent application CI integration.
- The broad Git range includes the unrelated roadmap commit `10421c8`; its roadmap changes were excluded from CI scope. Root README merge requirements document the accepted protected-branch setup. The pre-existing local .gitignore edit belongs to the user's separate skill-ignore request and was preserved.
- Two parallel reviews checked plan drift and safety/pattern compliance. No additional substantiated security, architecture, scope, or pattern defect was identified.
- Manual criteria were assessed against the saved verification log, regression reports, and explicit author acceptance, rather than repeated remotely. Phase 4 history sanitation/publication relies on the recorded operator confirmation and selected-branch scan; this review does not independently audit hosting-retained objects or every published ref.
- Criterion 5.7 uses the explicitly accepted combination of offline fault fixtures and hosted failure/recovery observations. Criterion 5.14 uses the documented unavailable-workflow/recovery variant. Separate live fault injections and forced in-flight cancellation are not claimed.
- No paid inference, GitHub mutation, history rewrite, or code fix occurred during the initial review. The subsequent user-authorized triage fixed F1 locally on 2026-11-01; all dimension verdicts now pass. The original warning and reproduction remain above as historical evidence.

## Verification

Node `v24.21.0` matches .nvmrc. Commands ran on 2026-10-31.

| Command                                                                                                                       | Result | Observed output                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                                      | PASS   | Installed 661 packages; existing root dependency audit reported 30 vulnerabilities. Root lockfile unchanged.                                                      |
| `npm ci --ignore-scripts --prefix packages/ai-reviewer`                                                                       | PASS   | Installed 6 packages; 0 vulnerabilities.                                                                                                                          |
| `npm --prefix packages/ai-reviewer run test:contracts`                                                                        | PASS   | 7 tests, 0 failures.                                                                                                                                              |
| `npm --prefix packages/ai-reviewer run test:adapter`                                                                          | PASS   | 10 tests, 0 failures.                                                                                                                                             |
| `npm --prefix packages/ai-reviewer run test:workflow`                                                                         | PASS   | 8 tests, 0 failures, including real Git diff isolation and CI/smoke structure assertions.                                                                         |
| `npm --prefix packages/ai-reviewer run test:github`                                                                           | PASS   | 23 tests, 0 failures.                                                                                                                                             |
| `npm run test:ai-review`                                                                                                      | PASS   | 48 tests, 0 failures; HTTP fixtures injected and offline guard enabled.                                                                                           |
| `npm run verify:deploy`                                                                                                       | PASS   | Native contract suites, lint, Astro check, production build; Astro reported 0 errors, 0 warnings, 6 existing hints. Existing sitemap site-option warning remains. |
| `git diff --name-only -z 685d0f8^..HEAD -- '*.md' '*.json' '*.yml' '*.yaml' \| xargs -0 ./node_modules/.bin/prettier --check` | PASS   | All matched files use Prettier code style.                                                                                                                        |
| `git diff --check`                                                                                                            | PASS   | No whitespace errors.                                                                                                                                             |

Database, browser, and HTTP smoke suites were not rerun locally. Their existing workflow structure is preserved and checked by the reviewer integration suite; hosted acceptance evidence remains in verification.md.

## Triage — 2026-11-01

- Fixed: F1 (1). Rules recorded: 0. Skipped: 0. Pending: 0.
- The user selected triage, then explicitly requested the fix. The proposed fix was implemented locally; no commit, push, or provider request was made.
- The two new regression tests failed before the implementation change, observing a null request ID despite available metadata. Both pass after the fix.
- The adapter validates the response ID format and all three usage counters before crossing the error boundary. Invalid counters are not retained and still cause an operational error. Valid metadata can be retained independently when the other metadata field is invalid or unavailable.
- `npm --prefix packages/ai-reviewer run test:adapter`: PASS, 12 tests.
- `npm run test:ai-review`: PASS, 50 tests.
- `npm run verify:deploy`: PASS, native contract suites, lint, Astro diagnostics, and production build. Existing unused-parameter hints and sitemap configuration warning remain.
- Prettier check of the changed code and triage documents and `git diff --check`: PASS.
- Implementation and follow-up record: [review-fixes.md](../follow-ups/review-fixes.md).
