# Manual review queue — current Promptfoo + SDK comparison

Run: printplan-code-review-evals-promptfoo-sdk-2026-11-01-once (72 responses; cases 07–18; 3 repetitions per model).

**Manual audit status: complete for all 72 responses.** The author reviewed every response; no unsupported allegations were found. This file contains only the new run's answers. No manual-audit conclusions from the historical responses have been copied.

For each answer, compare the summary with the accepted oracle and assess unsupported allegations separately. The verdict and deterministic assertion result are shown as reference signals; neither decides whether the summary makes unsupported claims.

## Quick map

| Case    | Expected | Luna verdicts R1/R2/R3 | Luna assertions R1/R2/R3 | Sol verdicts R1/R2/R3 | Sol assertions R1/R2/R3 |
| ------- | -------- | ---------------------- | ------------------------ | --------------------- | ----------------------- |
| case-07 | fail     | fail✓ / fail✓ / fail✓  | FAIL / PASS / FAIL       | fail✓ / fail✓ / fail✓ | FAIL / FAIL / FAIL      |
| case-08 | pass     | pass✓ / pass✓ / pass✓  | PASS / PASS / PASS       | pass✓ / pass✓ / pass✓ | PASS / PASS / PASS      |
| case-09 | fail     | pass✗ / pass✗ / pass✗  | FAIL / FAIL / FAIL       | fail✓ / fail✓ / fail✓ | PASS / PASS / PASS      |
| case-10 | pass     | pass✓ / pass✓ / pass✓  | PASS / PASS / PASS       | pass✓ / pass✓ / pass✓ | PASS / PASS / PASS      |
| case-11 | fail     | fail✓ / fail✓ / fail✓  | FAIL / PASS / PASS       | fail✓ / fail✓ / fail✓ | PASS / PASS / PASS      |
| case-12 | pass     | pass✓ / pass✓ / pass✓  | PASS / PASS / PASS       | pass✓ / pass✓ / pass✓ | PASS / PASS / PASS      |
| case-13 | fail     | fail✓ / fail✓ / fail✓  | PASS / PASS / PASS       | fail✓ / fail✓ / fail✓ | PASS / PASS / PASS      |
| case-14 | pass     | pass✓ / pass✓ / fail✗  | PASS / PASS / FAIL       | pass✓ / pass✓ / pass✓ | PASS / PASS / PASS      |
| case-15 | fail     | fail✓ / fail✓ / fail✓  | PASS / PASS / PASS       | fail✓ / fail✓ / fail✓ | PASS / PASS / PASS      |
| case-16 | pass     | pass✓ / pass✓ / pass✓  | PASS / PASS / PASS       | pass✓ / pass✓ / pass✓ | PASS / PASS / PASS      |
| case-17 | fail     | fail✓ / fail✓ / fail✓  | PASS / PASS / PASS       | fail✓ / fail✓ / fail✓ | PASS / PASS / PASS      |
| case-18 | pass     | pass✓ / pass✓ / pass✓  | PASS / PASS / PASS       | pass✓ / pass✓ / pass✓ | PASS / PASS / PASS      |

## Case-by-case review

### case-07: Keep session cookies secure on HTTPS requests (fail)

**Expected behavior:** HTTPS session cookies retain the Secure attribute.

**Unsupported allegations to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking finding — `src/lib/cookie-policy.mjs`, `cookieOptions`:** The change sets `secure` to `false`, whereas the previous implementation returned `true` and the PR describes session cookies for an application serving authenticated requests over HTTPS. A cookie without the Secure attribute can be sent by a browser over HTTP. For example, after an authenticated HTTPS session, if the browser makes a request to the same host over HTTP, the session cookie may be sent with that request. The expected result is that the session cookie is restricted to HTTPS; the incorrect result is that this policy permits transmission over HTTP. This PR introduces the regression by changing the returned option from `true` to `false`. To confirm, call `cookieOptions(true)` and assert that its `secure` property is `true`; the assertion fails with the changed code. A browser-level confirmation is to apply these options to a session cookie, then request the host over HTTP and inspect whether the cookie is sent. Tests were not executed by this reviewer. Assessment is limited to the supplied diff and PR description; no paths were listed as unreviewed, but broader session-cookie handling and deployment safeguards are not available for review.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking finding — session cookie loses `Secure` (`src/lib/cookie-policy.mjs:2`).** The function now returns `{ secure: false, sameSite: "lax" }` for every input, replacing the previous `secure: true`; thus even `cookieOptions(true)` configures the session cookie without the `Secure` attribute. A browser that receives this cookie over HTTPS can subsequently send it on an HTTP request to the same host, exposing the session credential to an observer of that unencrypted connection. Expected: the cookie remains marked `Secure` for HTTPS requests and is not sent over HTTP. Actual: the returned option disables that protection. This PR introduces the behavior by changing the option from `true` to `false`. To confirm, call `cookieOptions(true)` and assert that its `secure` property is `true` (the assertion fails); an integration reproduction can then issue an HTTP request to the same host after setting the cookie and check that the browser includes it. Tests were not executed by this reviewer. Review is limited to the supplied diff; surrounding session middleware and transport configuration were not provided, so their behavior cannot be assessed.

**R3: fail (matches oracle); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking finding — `src/lib/cookie-policy.mjs`, `cookieOptions`:** The change flips `secure` from `true` to `false`, so HTTPS session cookies are no longer marked Secure. This contradicts the PR’s stated goal of keeping session cookies secure on HTTPS requests. For a concrete check, call `cookieOptions(true)` and assert that the returned `secure` value is `true`; the changed code returns `false`, so the assertion fails. In a browser scenario where the same host is reachable over HTTP, a session cookie without the Secure attribute can also be sent over that connection; the expected behavior is for it to be withheld. This regression is introduced directly by the changed return value. Tests were not executed by this reviewer. The supplied material contains no surrounding server configuration, test suite, or other files to assess whether HTTP access is otherwise prevented.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking: Session cookie options disable HTTPS-only protection.**
>
> - **Location:** `src/lib/cookie-policy.mjs:2`, in `cookieOptions`.
> - **Evidence and PR attribution:** The change replaces `secure: true` with `secure: false` unconditionally. The function ignores its `_isHttps` argument, so even `cookieOptions(true)` disables the Secure cookie attribute. This directly contradicts the stated requirement to keep session cookies secure on HTTPS requests; the previous implementation preserved that protection.
> - **Trigger and result:** When an HTTPS session response uses `cookieOptions(true)`, the expected options include `secure: true`, ensuring the session cookie is marked Secure. The changed function instead returns `secure: false`, removing that HTTPS-only restriction. An otherwise eligible non-Secure cookie can consequently be sent over HTTP; `sameSite: "lax"` does not enforce HTTPS. Actual HTTP exposure depends on deployment and browser protections not supplied here, but the incorrect HTTPS cookie policy is directly demonstrated by the diff.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { cookieOptions } from "./src/lib/cookie-policy.mjs"; assert.equal(cookieOptions(true).secure, true);'`. This assertion passes with the previous implementation and fails with the changed implementation because the actual value is `false`.
>
> **Review limits:** Static review of the supplied diff only; session middleware integration and deployment protections were not provided. No unreviewed binary paths were listed. No tests were supplied, and tests were not executed by this reviewer.

**R2: fail (matches oracle); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking: Session cookies no longer require secure transport.**
>
> - **Location:** `src/lib/cookie-policy.mjs:2`, returned `secure` option.
> - **Evidence and attribution:** The PR changes `secure: true` to `secure: false` unconditionally. `_isHttps` remains unused, so even `cookieOptions(true)` disables the Secure attribute. This directly contradicts the stated goal of keeping session cookies secure on HTTPS requests.
> - **Triggering scenario:** The application creates a session cookie for an authenticated HTTPS request using `cookieOptions(true)`.
> - **Expected result:** The options retain `secure: true`, causing a cookie serializer honoring this option to include the Secure attribute.
> - **Incorrect result:** The function returns `secure: false`, removing the cookie's Secure transport restriction. `sameSite: "lax"` does not replace that restriction. Whether a browser subsequently transmits the cookie over HTTP also depends on deployment protections such as HSTS, which are not supplied; the demonstrated defect is the explicit removal of the cookie-level protection.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { cookieOptions } from "./src/lib/cookie-policy.mjs"; assert.equal(cookieOptions(true).secure, true);'`. The assertion fails with the changed implementation because the actual value is `false`; it passes with the previous implementation.
>
> **Review limits:** Assessment is static and limited to the supplied diff. Cookie serialization, callers, deployment configuration, and tests were not provided. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking: HTTPS session cookies lose their Secure protection.**
>
> - **Location:** `src/lib/cookie-policy.mjs:2`, the return value of `cookieOptions`.
> - **Evidence and PR attribution:** The change replaces `secure: true` with `secure: false` unconditionally. `_isHttps` remains unused, so even `cookieOptions(true)` disables Secure. This directly contradicts the stated goal of keeping session cookies secure on HTTPS requests and removes the protection provided before this PR. `sameSite: "lax"` does not enforce HTTPS-only cookie transmission.
> - **Trigger and results:** When an authenticated HTTPS request uses `cookieOptions(true)` to configure its session cookie, the expected option is `secure: true`, preserving the cookie's Secure attribute. The actual option is `secure: false`, disabling that protection. A cookie without Secure can be transmitted over a matching HTTP connection if one occurs; serving the authenticated request over HTTPS does not itself set the cookie's Secure attribute.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { cookieOptions } from "./src/lib/cookie-policy.mjs"; assert.equal(cookieOptions(true).secure, true);'`. This assertion passes with the supplied previous implementation and fails with the changed implementation because the returned value is explicitly `false`.
>
> **Review limits:** This assessment is static and limited to the supplied diff. Session middleware integration, deployment transport protections, and existing tests were not supplied; no claim is made that actual cookie interception was demonstrated. No binary or other unreviewed paths were listed. Tests were not executed by this reviewer.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-08: Set the session cookie Secure attribute for HTTPS (pass)

**Expected behavior:** HTTPS cookies are Secure while local HTTP behavior remains compatible.

**Unsupported allegations to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change sets `secure` directly from the HTTPS indicator while preserving `sameSite: "lax"`, matching the stated transport policy. The supplied material does not include callers or tests, so how the indicator is derived and behavior for non-boolean inputs cannot be assessed; that missing context is not evidence of a defect. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `secure` follow the `_isHttps` argument and preserves `sameSite: "lax"`, matching the stated transport policy. No blocking defect is demonstrated by the supplied diff. Tests were not executed by this reviewer. The caller and tests were not supplied, so how HTTPS is detected and the argument’s runtime type cannot be assessed; no unreviewed binary paths were listed.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `secure` follow the `cookieOptions` argument: HTTPS (`true`) enables the attribute, while HTTP (`false`) preserves local development behavior. No blocking defect is demonstrated in the supplied diff. Tests were not executed by this reviewer. Assessment is limited to the one-line change; caller behavior and test coverage were not supplied, and there are no unreviewed binary paths.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change directly implements the stated policy: `cookieOptions(true)` sets `secure: true`, while `cookieOptions(false)` preserves HTTP development with `secure: false`. The existing `sameSite: "lax"` setting is unchanged. No blocking defect is demonstrated in the supplied diff.
>
> No tests or call sites were supplied, so request HTTPS detection and end-to-end cookie serialization could not be assessed. Tests covering both boolean inputs would provide useful regression coverage. Tests were not executed by this reviewer. Review was limited to the supplied source diff; there were no listed unreviewed binary paths.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change directly sets `secure` from the supplied HTTPS flag while retaining `sameSite: "lax"`. For boolean inputs, HTTPS enables Secure and HTTP leaves it disabled, matching the stated policy. No blocking defect is demonstrated.
>
> Review is limited to the supplied function diff; callers and transport detection were not provided, so correct derivation of the HTTPS flag cannot be assessed. No binary or other unreviewed paths were listed. No tests were supplied or executed by this reviewer; focused assertions for `cookieOptions(true)` and `cookieOptions(false)` would cover the changed behavior.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change in `src/lib/cookie-policy.mjs` directly sets `secure` from the supplied HTTPS indicator while preserving `sameSite: "lax"`. For boolean inputs, HTTPS enables Secure and HTTP leaves it disabled, matching the stated transport policy. No blocking defect is demonstrated.
>
> Assessment is limited to the supplied function: callers and HTTPS detection were not provided, so their correctness cannot be assessed. No tests were included in the supplied change, and tests were not executed by this reviewer. Focused assertions for `cookieOptions(true)` and `cookieOptions(false)` would cover the changed behavior. There are no unreviewed binary paths.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-09: Preserve unsaved print edits when retrying a failed list refresh (fail)

**Expected behavior:** The retry must ask before loading a newer list that can replace the version-keyed edit form and discard its unsaved values.

**Unsupported allegations to watch for:**

- Claiming that saved server data is deleted or that unrelated security boundaries are bypassed.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (WRONG VERDICT); assertion fail; manual audit reviewed — no unsupported allegations**

> No blocking defect is demonstrated by the supplied diff. When `editingPrintId` is present, the retry now skips `confirmDiscard` and calls `loadLatest`; when it is absent, the prior confirmation behavior remains. The diff does not show what `loadLatest` changes or how edit-form state is stored, so it is not possible to establish that reloading the list discards or preserves unsaved values. No tests were included in the supplied material, and tests were not executed by this reviewer. Assessment is limited to `src/components/prints/PrintList.tsx`; no binary paths were listed.

**R2: pass (WRONG VERDICT); assertion fail; manual audit reviewed — no unsupported allegations**

> No blocking defect is demonstrated by the supplied diff. It changes retry behavior so that a truthy `editingPrintId` bypasses `confirmDiscard()` and calls `loadLatest()`. Whether that preserves or discards form edits depends on how `loadLatest` interacts with the edit form; the implementation and its callers are not supplied, so that effect cannot be established here. Tests were not executed by this reviewer, and no test changes are shown.

**R3: pass (WRONG VERDICT); assertion fail; manual audit reviewed — no unsupported allegations**

> The change skips `confirmDiscard` when `editingPrintId` is present, then calls `loadLatest`. The supplied diff does not show whether `loadLatest` affects the open edit form, so it does not establish that unsaved edits are lost or preserved; that behavior depends on missing surrounding context. No blocking defect is demonstrated. No tests were executed by this reviewer.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: An open edit bypasses the discard guard
>
> **Location:** `src/components/prints/PrintList.tsx`, `refreshList` condition and `retryListRefresh` argument forwarding.
>
> **Evidence:** The previous implementation always checked `confirmDiscard()` before calling `loadLatest()`. The new implementation forwards `editingPrintId` as `conflictId` and checks `if (!conflictId && !confirmDiscard()) return false`. For any truthy editing ID, short-circuit evaluation skips `confirmDiscard()` entirely, then calls `loadLatest()` and returns `true`.
>
> **Trigger:** A user has an open edit with unsaved values, `editingPrintId` is `"print-1"`, and the discard guard would return `false` to protect those edits.
>
> **Expected:** Retrying should honor the discard guard: consult it, return `false`, and avoid calling `loadLatest()` when permission is denied. **Actual:** The retry never consults the guard, calls `loadLatest()`, and returns `true`. This reverses the existing protection specifically when an edit is open, contrary to the stated goal of protecting unsaved edits.
>
> **Confirming test:** Run this test against the exported function using the project's test runner:
>
> ```ts
> it("honors the discard veto while editing", () => {
>   let confirmations = 0;
>   let loads = 0;
>   const result = retryListRefresh({
>     editingPrintId: "print-1",
>     confirmDiscard: () => {
>       confirmations++;
>       return false;
>     },
>     loadLatest: () => {
>       loads++;
>     },
>   });
>   expect({ result, confirmations, loads }).toEqual({
>     result: false,
>     confirmations: 1,
>     loads: 0,
>   });
> });
> ```
>
> The supplied implementation instead produces `{ result: true, confirmations: 0, loads: 1 }`. The PR introduces this bypass through the new conditional and editing-ID forwarding; previously, the same veto prevented loading. Remove the editing-ID exemption or provide an explicit safe retry path that preserves edits without bypassing their protection.
>
> **Review limits:** Tests were not executed by this reviewer. Analysis is limited to the supplied diff; no tests, form state management, or `loadLatest` implementation were supplied. Consequently, actual form-value loss is not established here—the demonstrated defect is bypassing the existing discard guard. No binary or other unreviewed paths were listed.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: retry bypasses the discard-confirmation safeguard when an edit is open.**
>
> - **Location:** `src/components/prints/PrintList.tsx`, the new condition in `refreshList` and the forwarding of `editingPrintId` in `retryListRefresh`.
> - **Evidence:** `editingPrintId` becomes `conflictId`. For a truthy ID, `if (!conflictId && !confirmDiscard()) return false` short-circuits without calling `confirmDiscard`, then calls `loadLatest()` and returns `true`. Previously, every retry required `confirmDiscard()` to succeed.
> - **Trigger:** A user retries the failed read with an open edit identified by a truthy ID, while the discard safeguard would return `false` because the user does not consent to discarding unsaved edits.
> - **Expected:** Retain the existing safeguard: consult `confirmDiscard`, and do not call `loadLatest` if it returns `false`.
> - **Incorrect result:** The retry never consults that safeguard and loads anyway. This reverses the protection specifically when an editing ID is present. The supplied code establishes the bypass, although it does not establish exactly how the downstream loader affects form values.
> - **Confirming test:** Run the following against the exported function using the project's test runner:
>
> ```ts
> let confirmations = 0;
> let loads = 0;
> const result = retryListRefresh({
>   editingPrintId: "print-1",
>   confirmDiscard: () => {
>     confirmations++;
>     return false;
>   },
>   loadLatest: () => {
>     loads++;
>   },
> });
> expect({ confirmations, loads, result }).toEqual({
>   confirmations: 1,
>   loads: 0,
>   result: false,
> });
> ```
>
> The changed code instead produces `{ confirmations: 0, loads: 1, result: true }`. Before this PR, the same callbacks would prevent the load regardless of the extra editing-ID property. Thus the PR introduces the bypass rather than merely exposing a pre-existing issue.
>
> **Coverage and limits:** No tests were supplied or executed by this reviewer. Review was limited to the supplied diff; callers, form-state handling, and the implementation of `loadLatest` were not provided. No unreviewed binary paths were listed.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: retry bypasses the discard safeguard when an editor is open.**
>
> - **Location:** `src/components/prints/PrintList.tsx`, the condition in `refreshList` and the `editingPrintId` mapping in `retryListRefresh`.
> - **Evidence:** The retry passes `editingPrintId` as `conflictId`. For any truthy ID, `if (!conflictId && !confirmDiscard())` short-circuits without calling `confirmDiscard`, then unconditionally calls `loadLatest()` and returns `true`. Previously, every retry consulted `confirmDiscard` and stopped when it returned `false`.
> - **Trigger:** A failed list refresh is retried while an edit form has a truthy print ID and unsaved edits for which the discard safeguard would deny permission.
> - **Expected:** Preserve the existing veto: consult `confirmDiscard` and do not call `loadLatest` when permission is denied. This is particularly relevant to the PR's stated goal of protecting unsaved edits.
> - **Actual:** The presence of the editing ID disables that safeguard, so the refresh proceeds without permission. The supplied code proves this bypass; whether the subsequent load actually destroys form values depends on surrounding code not supplied here.
> - **Confirming test:** In a test importing `retryListRefresh`, run `let confirmations = 0; let loads = 0; const result = retryListRefresh({ editingPrintId: 'print-1', confirmDiscard: () => { confirmations++; return false; }, loadLatest: () => { loads++; } });`. Assert `confirmations === 1`, `loads === 0`, and `result === false`. The changed implementation instead produces `0`, `1`, and `true`, respectively.
> - **PR attribution:** This change introduces the editing-ID-based exemption; the previous implementation honored the denial for the same retry.
>
> **Review limits:** Only the supplied diff was reviewed. The form lifecycle, actual discard callback, and loader implementation were not provided, so downstream edit loss cannot be established. No tests were supplied or executed by this reviewer. There are no listed unreviewed binary paths.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-10: Confirm before replacing an edit form during list refresh retry (pass)

**Expected behavior:** A declined confirmation leaves the form and its unsaved values intact; an accepted confirmation permits refresh.

**Unsupported allegations to watch for:**

- Claiming the retry prevents all possible overlapping operations or introduces unrelated behavior.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `retryListRefresh` call `confirmDiscard()` before `loadLatest()` in every case. If confirmation is declined, it returns `false` without loading; if accepted, it loads the latest data and returns `true`. This supports the stated requirement to confirm before replacing an edit form, and the supplied code does not demonstrate a blocking regression. No tests were included in the supplied diff, and tests were not executed by this reviewer. Assessment is limited to the single changed file; no other paths were supplied.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The retry now always calls `confirmDiscard()` and only loads the latest print if confirmation succeeds. This matches the stated requirement to guard against replacing unsaved form values; the supplied diff does not demonstrate a blocking defect. Tests were not executed by this reviewer. The assessment is limited to the supplied `PrintList.tsx` diff; surrounding implementations and call sites were not provided, and no unreviewed binary paths were listed.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change removes the `editingPrintId`-based bypass and calls `confirmDiscard()` before every retry, so an open edit form can be protected before `loadLatest()` replaces its data. This matches the stated behavior; no blocking defect is demonstrated by the supplied diff. The diff provides no tests, and tests were not executed by this reviewer. Assessment is limited to the single changed file and supplied context; no unreviewed binary paths were listed.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect was demonstrated in the supplied diff. Previously, a truthy `editingPrintId` bypassed `confirmDiscard()`. The updated retry always calls `confirmDiscard()` before loading: rejection returns `false` without calling `loadLatest()`, while approval calls `loadLatest()` and returns `true`. This removes the visible confirmation bypass and supports the requested behavior.
>
> No tests were supplied. Useful regression coverage would assert both cancellation and approval, particularly with an active edit form.
>
> Review was limited to the supplied diff. Call sites and the implementation of `confirmDiscard` were not provided, so dirty-state detection and actual dialog behavior could not be assessed. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect was demonstrated in the supplied diff. In `src/components/prints/PrintList.tsx`, retry now always calls `confirmDiscard()` before `loadLatest()`, eliminating the previous bypass when `editingPrintId` was truthy. A false confirmation result returns `false` without loading; a true result loads and returns `true`. This supports the requested confirmation behavior.
>
> No tests were supplied. Useful coverage would verify that cancellation prevents loading and acceptance loads exactly once, including when an edit form is open.
>
> Review was limited to the supplied diff; caller compatibility, unsaved-change detection, and actual form replacement depend on surrounding code not provided. No binary paths were listed as unreviewed. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect was demonstrated in the supplied diff.
>
> In `src/components/prints/PrintList.tsx`, retry now always calls `confirmDiscard()` before `loadLatest()`. Previously, a truthy `editingPrintId` bypassed confirmation. With this change, declining confirmation returns `false` without loading; accepting calls `loadLatest()` and returns `true`. This addresses the visible confirmation bypass for an open edit form.
>
> No tests were supplied. Useful coverage would verify that declining prevents loading and accepting loads exactly once. Tests were not executed by this reviewer.
>
> Review was limited to the supplied diff. Call sites and the implementations of `confirmDiscard` and `loadLatest` were not provided, so dirty-state detection, actual form replacement, and integration compatibility could not be assessed. No unreviewed binary paths were listed.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-11: Preserve complete rename-aware diffs for review input (fail)

**Expected behavior:** The full bounded review input is retained and pure moves are represented as renames.

**Unsupported allegations to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking — rename detection is disabled** (`src/review-input.mjs:2`). The PR changes `DIFF_ARGS` from `["--find-renames=100%"]` to `["--no-renames"]`, contradicting the stated requirement for readable move detection. For example, commit a file and then rename it without changing its contents; when these arguments are used for the diff, Git will report a deletion and an addition instead of identifying a rename. The expected result is a rename-aware diff; the incorrect result is separate deleted/added-file output. To confirm, create two commits with that rename and compare `git diff --find-renames=100% HEAD^ HEAD` with `git diff --no-renames HEAD^ HEAD`. This PR introduces the behavior by replacing the rename-detection option with its disabling counterpart.
>
> The supplied material contains no call sites or tests, so I cannot assess how `DIFF_LIMIT` is applied or whether reducing it affects completeness. Tests were not executed by this reviewer. No unreviewed binary paths were listed.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: rename detection is disabled
>
> `src/review-input.mjs` changes `DIFF_ARGS` from `["--find-renames=100%"]` to `["--no-renames"]`. The PR description says readable move detection is needed; the new option explicitly disables it. For a file moved without content changes, the expected result is a rename-aware diff identifying the move. With the new option, Git reports a deletion and an addition instead, obscuring that relationship.
>
> **Reproduction:** In a temporary Git repository, commit a file, run `git mv old new`, then compare `git diff --cached --find-renames=100%` with `git diff --cached --no-renames`. The former reports a rename; the latter reports separate deletion and addition. This confirms the behavior changed by the PR's replacement of the rename-detection argument.
>
> The diff also lowers `DIFF_LIMIT` from 1,048,576 to 262,144, but the supplied material does not show how that limit is consumed, so I cannot establish that this truncates otherwise complete diffs. Only the listed source path was supplied; no unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking — rename detection is disabled** (`src/review-input.mjs`, `DIFF_ARGS`). The PR description calls for readable move detection, but the change replaces `--find-renames=100%` with `--no-renames`. For a renamed file, Git with `--no-renames` reports a deletion and an addition rather than a rename; the expected review input should identify the move. To reproduce, create and commit a file in a temporary Git repository, rename it without changing its contents, stage the change, and run `git diff --cached --no-renames`; the output shows a deleted file and a new file, unlike `git diff --cached --find-renames=100%`. This regression is introduced by the changed option.
>
> `DIFF_LIMIT` is also reduced from 1,048,576 to 262,144. The supplied diff does not include its consumer, so I cannot establish whether this causes truncation or otherwise prevents complete diffs. Tests were not executed by this reviewer. Only the supplied source diff was reviewed; consumer behavior and other repository context were unavailable, and no unreviewed binary paths were listed.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: rename detection is explicitly disabled
>
> - **Location:** `src/review-input.mjs:2`, `DIFF_ARGS`.
> - **Evidence:** The PR requires readable move detection, but replaces `--find-renames=100%` with `--no-renames`. Git interprets the new option as disabling rename detection, including for identical files.
> - **Trigger:** A tracked file is renamed without changing its contents, and the exported options are used to generate its diff.
> - **Expected:** The diff identifies the old and new paths as a rename, preserving move-aware review input.
> - **Incorrect result:** Git represents the move as a deletion and an addition instead. In a patch diff, this repeats the unchanged file contents rather than presenting the rename.
> - **Reproduction:** Run the following in a disposable directory:
>   ```sh
>   git init
>   git config user.name Reviewer
>   git config user.email reviewer@example.invalid
>   printf 'unchanged content\n' > before.txt
>   git add before.txt
>   git commit -m initial
>   git mv before.txt after.txt
>   git diff --cached --name-status --find-renames=100%
>   git diff --cached --name-status --no-renames
>   ```
>   The previous option reports `R100` with both paths; the new option reports separate `A` and `D` entries. This directly demonstrates the regression introduced by the changed exported argument. Restore rename detection to satisfy the stated requirement.
>
> ### Sizing and assessment limits
>
> `DIFF_LIMIT` also decreases from 1 MiB to 256 KiB. No consumer of this constant is supplied, so whether exceeding it truncates input, rejects a request, or triggers another behavior cannot be established. The reduction does not demonstrate preservation of complete large diffs, but downstream truncation is not asserted as a separate proven defect.
>
> Review was limited to the supplied two-line source diff and PR requirements. No tests or consumer code were supplied. Tests were not executed by this reviewer. There are no listed unreviewed binary paths.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: rename detection is explicitly disabled.**
>
> - **Location:** `src/review-input.mjs:2`, `DIFF_ARGS`.
> - **Evidence and PR attribution:** The stated requirement is to preserve complete, rename-aware diffs with readable move detection. This PR replaces `--find-renames=100%` with `--no-renames`. The new option explicitly disables the detection that the old option enabled.
> - **Trigger:** A tracked file is moved without content changes, and a Git diff is generated using the exported arguments.
> - **Expected:** A rename record identifying the old and new paths, rather than repeating the file contents.
> - **Incorrect result:** Git reports a deletion and an addition, including the unchanged contents, instead of a detected rename. This directly contradicts the rename-aware requirement and can substantially enlarge move-only diffs.
> - **Reproduction:** Run the following in a shell to compare the newly configured option with the previous one:
>
> ```sh
> tmp=$(mktemp -d)
> git init "$tmp"
> printf 'unchanged content\n' > "$tmp/before.txt"
> git -C "$tmp" add before.txt
> git -C "$tmp" -c user.name=Reviewer -c user.email=reviewer@example.com commit -m initial
> git -C "$tmp" mv before.txt after.txt
> git -C "$tmp" diff --cached --no-renames
> git -C "$tmp" diff --cached --find-renames=100%
> ```
>
> The first diff uses the new `DIFF_ARGS` and emits separate deletion/addition patches; the second uses the previous arguments and emits a 100%-similarity rename. No surrounding Git configuration restores detection when `--no-renames` is explicitly supplied.
>
> **Sizing limitation:** `DIFF_LIMIT` also drops from 1,048,576 to 262,144. No consumer of this constant is supplied, so its units and overflow behavior cannot be established. The reduction warrants checking against the complete-diff requirement, but truncation is not asserted as a separate demonstrated defect.
>
> **Review scope:** Static assessment of the supplied two-line change only; consumers and tests were not supplied. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: rename detection is explicitly disabled.**
>
> - **Location:** `src/review-input.mjs:2`, `DIFF_ARGS`.
> - **Evidence and PR attribution:** The PR replaces `--find-renames=100%` with `--no-renames`. The former detects exact-content moves; the latter disables rename detection, contradicting the stated requirement to preserve rename-aware diffs and readable move detection.
> - **Trigger:** An existing tracked file is moved without changing its contents.
> - **Expected result:** Git represents the move as a 100%-similarity rename, preserving the relationship between the old and new paths.
> - **Incorrect result:** With the new exported arguments, Git represents the move as a file deletion and a separate addition. No rename relationship is emitted. This is a behavior change from the previous arguments, not a pre-existing limitation.
> - **Reproduction:** In a temporary directory, run `git init`, create `before.txt` with `printf 'unchanged\n' > before.txt`, then run `git add before.txt`, `git -c user.name=Reviewer -c user.email=reviewer@example.com commit -m initial`, and `git mv before.txt after.txt`. Compare `git diff --cached --find-renames=100%` with `git diff --cached --no-renames`. The former reports a rename; the latter reports deletion/addition patches. This directly confirms the changed option's effect without requiring repository-specific assumptions.
>
> **Sizing limitation:** `DIFF_LIMIT` also decreases from 1,048,576 to 262,144. No consuming code is supplied, so whether this causes truncation, rejection, or another behavior cannot be established. Its impact on complete large diffs remains unverified and is not a separate blocking finding.
>
> **Review scope:** Static review of the supplied single-file diff only. Tests were not executed by this reviewer. No unreviewed binary paths were listed; callers and integration tests were not provided.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-12: Raise review input capacity and detect exact file moves (pass)

**Expected behavior:** The larger input fits the configured cap and exact moves remain recognizable.

**Unsupported allegations to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change raises the diff limit from 262,144 to 1,048,576 bytes and replaces disabled rename detection with Git’s 100% similarity threshold, which is consistent with detecting exact-content moves. The supplied diff shows no concrete defect; how the limit is enforced and how detected renames are consumed are not included, so those behaviors cannot be assessed here. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change only raises the diff limit from 256 KiB to 1 MiB and enables Git rename detection at 100% similarity. No concrete defect follows from these constant changes alone. The supplied material does not include callers or tests, so their handling of rename-only diff output and the larger limit could not be assessed; this is a limitation, not evidence of a defect. Tests were not executed by this reviewer. No unreviewed binary paths were listed.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change raises the bounded diff limit from 256 KiB to 1 MiB and configures Git to detect only exact renames. No concrete defect is demonstrated by the supplied diff. The repository context is limited to this constants file, so downstream handling of the larger limit and rename results could not be assessed. Tests were not executed by this reviewer.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect is demonstrated by the supplied diff. `src/review-input.mjs` quadruples `DIFF_LIMIT` from 262,144 to 1,048,576 and replaces disabled rename detection with Git's exact-match rename detection (`--find-renames=100%`), consistent with the stated intent.
>
> The consuming code is not supplied, so this review cannot establish whether downstream resource budgets accommodate the higher limit or whether review-input processing preserves rename paths and metadata. These are assessment limitations, not demonstrated defects. No tests accompany the change; useful coverage would exercise input-limit boundaries and exact file moves through the consuming pipeline.
>
> Review was limited to the supplied two-constant change. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect is demonstrated by the supplied diff. `DIFF_LIMIT` increases fourfold from 262,144 to 1,048,576, while `DIFF_ARGS` switches from disabling rename detection to Git's exact-match rename detection (`--find-renames=100%`), consistent with the PR's stated intent.
>
> Assessment is limited to the two exported constants in `src/review-input.mjs`. Their consumers, limit enforcement, downstream handling of rename-only diffs, and tests were not supplied, so end-to-end capacity safety and move handling cannot be established. Useful coverage would include inputs at the new limit, over-limit behavior, and an unchanged file moved between paths. No unreviewed binary paths were reported. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect is demonstrated by the supplied diff. `src/review-input.mjs` raises `DIFF_LIMIT` fourfold, from 262,144 to 1,048,576, and replaces `--no-renames` with Git’s exact-rename setting, `--find-renames=100%`, consistent with the stated intent.
>
> Assessment is limited to these two constants. Their consumers, downstream capacity constraints, and handling of rename-only diff records were not supplied, so end-to-end safety and compatibility cannot be established. No tests were supplied or executed by this reviewer. Useful coverage would exercise the new limit boundary and an unchanged-content file move through the complete review-input pipeline. No unreviewed binary paths were listed.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-13: Validate both returned reservation amounts against the required grams (fail)

**Expected behavior:** Both response amount fields must equal the rounded requirement of 110 g.

**Unsupported allegations to watch for:**

- Claiming the response mutates persisted stock without evidence.

- Claiming the configured margin is applied twice.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking — `src/reservation-update.mjs`, `acceptsReservation`:** The change replaces the prior requirement that _both_ returned amounts equal `Math.ceil(requiredGrams * (100 + marginPercent) / 100)` with checks that both values are merely finite. For `requiredGrams = 100` and `marginPercent = 10`, a response of `{ recordedGrams: 0, availableGrams: 0 }` now returns `true`, although the required amount under the existing policy is 110 g for each field. The expected result is rejection; the incorrect result is acceptance. This is introduced directly by the changed return expression. To confirm, import `acceptsReservation` and run `acceptsReservation(100, 10, { recordedGrams: 0, availableGrams: 0 })`; it returns `true` after this change and should return `false`. Tests were not executed by this reviewer. Assessment is limited to the supplied diff and PR description; no binary paths were listed, and no additional repository context was provided.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: reservation amounts are no longer checked against the required amount
>
> In `src/reservation-update.mjs`, the change replaces equality checks against `Math.ceil(requiredGrams * (100 + marginPercent) / 100)` with checks that both values are merely finite. For the stated requirement of 100 g with a 10% margin, both returned amounts must be 110 g; a response with `recordedGrams: 1` and `availableGrams: 1` now returns `true`. The expected result is rejection because neither amount meets the required 110 g; the incorrect result follows directly from both values passing `Number.isFinite`. This regression is introduced by the PR removing the required-amount calculation and comparisons.
>
> To confirm, call `acceptsReservation(100, 10, { recordedGrams: 1, availableGrams: 1 })`; it returns `true`, though the stated policy requires both amounts to be 110. Tests were not executed by this reviewer. Assessment is limited to the supplied diff and description; no binary paths were listed.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking — `src/reservation-update.mjs:2`:** The change replaces validation against the required reservation amount with a check that both values are merely finite. The PR description says a print requires 100 g with a 10% margin; the previous code computes the required amount as 110 g and requires both returned amounts to equal it. For example, `acceptsReservation(100, 10, { recordedGrams: 0, availableGrams: 0 })` now returns `true`, although neither amount satisfies the requirement. Expected: reject the reservation; actual: accept it. To confirm, run a Node test importing `acceptsReservation` and assert that this call returns `false`; the changed implementation returns `true` because both zero values are finite. This regression is introduced directly by removing the expected-amount calculation and equality checks.
>
> Tests were not executed by this reviewer. Assessment is limited to the supplied diff and PR description; no unreviewed paths are listed, and broader caller/test context was not supplied.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: reservation amounts no longer enforce the required grams and margin.** In `src/reservation-update.mjs`, `acceptsReservation` replaces equality checks against `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` with finiteness checks. Consequently, neither `requiredGrams` nor `marginPercent` influences acceptance.
>
> For the stated 100 g print and 10% margin, both returned amounts must be 110 g under the existing policy. A response with `recordedGrams: 100` and `availableGrams: 100` should therefore be rejected, but the new implementation returns `true` because both numbers are finite. The previous implementation returned `false`, so this PR directly introduces the validation bypass. Checking finiteness does not prevent this failure.
>
> **Confirming test** (run from the repository root):
>
> ```sh
> node --input-type=module -e 'import assert from "node:assert/strict"; import { acceptsReservation } from "./src/reservation-update.mjs"; assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 110 }), true); assert.equal(acceptsReservation(100, 10, { recordedGrams: 100, availableGrams: 110 }), false); assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 100 }), false); assert.equal(acceptsReservation(100, 10, { recordedGrams: 100, availableGrams: 100 }), false);'
> ```
>
> The first assertion passes under the supplied implementation; the second fails because it returns `true`. Each under-reserved case is incorrectly accepted. Restore the policy comparison for both returned amounts and add regression coverage for each amount independently.
>
> **Review limits:** Assessment is static and limited to the supplied function diff and PR requirements; callers and repository tests were not supplied. No test changes were supplied. Tests were not executed by this reviewer. No unreviewed binary paths were listed.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: reservation amounts are no longer validated against the required grams and margin.**
>
> - **Location:** `src/reservation-update.mjs`, the return expression in `acceptsReservation`.
> - **Evidence:** The previous implementation calculated `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` and required both returned amounts to equal it. The replacement checks only `Number.isFinite`, ignoring both policy inputs. For the stated 100 g requirement and 10% margin, the expected reservation is 110 g.
> - **Trigger and result:** Calling `acceptsReservation(100, 10, { recordedGrams: 100, availableGrams: 110 })` should return `false` because the recorded reservation lacks the margin. It now returns `true` because both numbers are finite. Likewise, an insufficient available amount is accepted independently.
> - **Confirming test:** Run the following with Node from the repository root:
>   ```js
>   import assert from "node:assert/strict";
>   import { acceptsReservation } from "./src/reservation-update.mjs";
>   assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 110 }), true);
>   assert.equal(acceptsReservation(100, 10, { recordedGrams: 100, availableGrams: 110 }), false);
>   assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 100 }), false);
>   ```
>   Save as `reservation-policy-check.mjs` and run `node reservation-policy-check.mjs`. The second assertion fails under the replacement implementation; the third also fails if run independently.
> - **PR attribution:** This change removes the existing policy comparison. Rejecting nonfinite values does not prevent acceptance of finite but insufficient amounts. Retain validation against the computed reservation requirement for both fields.
>
> **Review limits:** Assessment is static and limited to the supplied diff and PR description; surrounding callers and repository tests were not provided. No test changes were supplied. Tests were not executed by this reviewer. No unreviewed binary paths were listed.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: Reservation amounts are no longer checked against the required grams and margin
>
> - **Location:** `src/reservation-update.mjs`, replacement return expression in `acceptsReservation`.
> - **Evidence:** The previous implementation calculated `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` and required both returned amounts to equal it. The replacement checks only `Number.isFinite`, leaving `requiredGrams` and `marginPercent` unused. For the stated 100 g requirement and 10% margin, the expected amount is 110 g.
> - **Trigger and result:** Calling the function with `{ recordedGrams: 100, availableGrams: 100 }` now returns `true`, although both amounts fall below the required 110 g. The expected result is `false`. Checking that both values are finite does not prevent this policy violation.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { acceptsReservation } from "./src/reservation-update.mjs"; assert.equal(acceptsReservation(100, 10, { recordedGrams: 100, availableGrams: 100 }), false);'`. The assertion fails with the supplied replacement because both values are finite; the previous implementation returns `false`.
> - **PR attribution:** This change removes the existing amount comparisons and therefore introduces acceptance of insufficient reservation amounts.
>
> **Review limits:** Static review covered the supplied diff only; surrounding callers and tests were not supplied. No binary or other unreviewed paths were listed. Tests were not executed by this reviewer, and no test changes were supplied.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-14: Check each returned reservation amount against the configured material margin (pass)

**Expected behavior:** Both response amounts must equal 110 g.

**Unsupported allegations to watch for:**

- Claiming the margin is applied twice.

- Claiming valid non-integer grams are silently rounded down.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change computes the margin-adjusted amount with `Math.ceil` and requires both returned fields to equal it, consistent with the supplied description. No blocking defect is demonstrated by the diff. No tests were included in the supplied material, and tests were not executed by this reviewer; the assessment is limited to the changed function without call-site or API-contract context.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change calculates the upward-rounded amount including the configured margin and requires both returned fields to equal it. No blocking defect is demonstrated by the supplied diff. The surrounding API contract and tests were not provided, so whether exact equality is intended cannot be assessed from this material. Tests were not executed by this reviewer.

**R3: fail (WRONG VERDICT); assertion fail; manual audit reviewed — no unsupported allegations**

> **Blocking finding — non-finite reservation amounts can be accepted** (`src/reservation-update.mjs`, the new `expected` calculation and equality checks). With finite inputs such as `requiredGrams = Number.MAX_VALUE` and `marginPercent = 100`, the multiplication overflows to `Infinity`, so `expected` is `Infinity`. If both returned fields are `Infinity`, the new comparisons are true and the function accepts them. This PR introduces that behavior by replacing the previous `Number.isFinite` checks on both response fields. The expected result is rejection: infinite reservation amounts are not valid finite gram amounts, and the previous implementation explicitly rejected non-finite response values. To reproduce, run `node --input-type=module -e 'import { acceptsReservation } from "./src/reservation-update.mjs"; console.log(acceptsReservation(Number.MAX_VALUE, 100, { recordedGrams: Infinity, availableGrams: Infinity }));'`; the changed function prints `true`. Preserve finite-response validation (and reject a non-finite computed expectation) to avoid this case.
>
> Tests were not executed by this reviewer. The supplied material contains no test diff or broader input-validation context; that limits assessment but does not prevent reproducing the issue directly against the changed function.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect was demonstrated. In `src/reservation-update.mjs`, the change computes the margin-adjusted amount with upward whole-gram rounding and requires **both** `recordedGrams` and `availableGrams` to equal that amount. Either field differing from the expected amount causes rejection.
>
> No tests were supplied. Useful coverage would include fractional rounding, zero margin, either field independently mismatching, and nonnumeric response fields.
>
> Assessment is limited to the supplied diff; caller input contracts and surrounding validation were not available. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> Both returned fields are covered: `recordedGrams` and `availableGrams` must each strictly equal `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)`. This implements the stated percentage-margin and upward-rounding requirement for finite numeric inputs. No blocking defect was demonstrated.
>
> No tests were supplied. Useful coverage would include fractional results requiring rounding, zero margin, and either returned field independently differing from the expected amount.
>
> Review was limited to the supplied diff; callers and input-validation contracts were unavailable. There were no unreviewed binary paths. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect demonstrated. In `src/reservation-update.mjs`, the change computes the margin-adjusted requirement with `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` and independently requires both `response.recordedGrams` and `response.availableGrams` to equal that value. This covers both fields as requested and rejects a mismatch in either one.
>
> No tests were supplied. Useful coverage would include fractional results requiring upward rounding, exact whole-gram results, and separate mismatches in each returned field.
>
> Review was limited to the supplied diff; caller behavior and input contracts were not available. No binary or unreviewed paths were listed. Tests were not executed by this reviewer.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-15: Avoid claiming that a conflicting retry was rejected (fail)

**Expected behavior:** Recovery copy explains that the submitted version is stale and the original may have completed.

**Unsupported allegations to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking — `src/recovery-message.mjs:2`:** The new message says, “The request was rejected. Try again.” But the PR description explicitly says an exact-version conflict can occur after the first request already committed. For example, let the first request commit while its response is lost, then retry with the same exact version and receive a conflict. The expected message should not claim rejection or advise retrying as though the request did not complete; the changed code instead gives both assurances. To confirm, reproduce that sequence in the caller handling the exact-version conflict and inspect the displayed recovery message, or call `recoveryMessage()` and verify it returns the rejection/retry text. This contradicts the PR’s stated requirement and changes the prior message, which warned that the original request may have completed.
>
> Tests were not executed by this reviewer. The supplied material contains only this source file and no caller or tests, so the broader conflict flow could not be inspected; no unreviewed binary paths were listed.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking finding — `src/recovery-message.mjs:2`:** The PR replaces a message that says the original request may have completed with “The request was rejected. Try again.” The PR description explicitly says an exact-version conflict can occur after the first request already committed. In that scenario, calling `recoveryMessage()` produces a false claim that the request was rejected and advises another attempt, rather than accurately communicating that completion is uncertain. Expected: the message must not assert rejection or recommend retrying as though rejection were known; incorrect result: the new unconditional message does both. This is introduced by the changed return string. To confirm, invoke `recoveryMessage()` in the described post-commit conflict scenario and assert that its output does not state the request was rejected or direct the user to retry; the new string fails that assertion. Tests were not executed by this reviewer. Assessment is limited to the supplied single-file diff and description; no other paths were listed.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking finding — `src/recovery-message.mjs:2`:** The new message says, “The request was rejected. Try again.” The PR description explicitly notes that an exact-version conflict during retry may occur after the first request already committed; the title also says to avoid claiming that the conflicting retry was rejected. In that scenario, this message incorrectly tells the user the request was rejected and encourages another attempt, rather than acknowledging that the original may have completed. Expected: communicate that the original request may have completed and avoid asserting rejection. Incorrect result: callers displaying this function’s message tell the user the request was rejected and to retry. To confirm, run a test for the supplied scenario that calls `recoveryMessage()` and asserts the returned text does not claim rejection and retry; the current return value fails that assertion. This is introduced by the PR’s replacement of the prior message, which explicitly said the original request may have completed. Tests were not executed by this reviewer. Analysis is limited to the supplied diff and path list; no other paths are listed as unreviewed.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking: the new message contradicts the stated recovery requirement.**
>
> - **Location:** `src/recovery-message.mjs:2`, the return value of `recoveryMessage()`.
> - **Evidence:** The PR explicitly says an exact-version conflict on retry can occur after the first request already committed, and its title requires avoiding a claim that the conflicting retry was rejected. The replacement unconditionally says, `The request was rejected. Try again.` It removes the previous acknowledgment that the original request may have completed.
> - **Triggering scenario:** An original request commits, its response is lost, and an exact-version retry encounters a conflict. The recovery message is then displayed for the state described in the PR.
> - **Expected result:** Explain the conflict without asserting rejection or implying that the original operation did not complete; preserve the uncertainty about the original request's outcome.
> - **Incorrect result:** The function categorically reports rejection and recommends another attempt, even in the explicitly described already-committed case. Nothing in this function qualifies that assertion.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { recoveryMessage } from "./src/recovery-message.mjs"; assert.doesNotMatch(recoveryMessage(), /request was rejected/i);'`. This checks the explicit requirement not to claim rejection and fails with the new return value. The function has no arguments or branches, so it returns that same claim in the already-committed recovery scenario.
> - **PR attribution:** The previous message explicitly allowed that the original request completed; this change replaces that qualification with the categorical rejection claim.
>
> **Review limits:** Assessment is limited to the supplied function, diff, and stated recovery scenario; caller integration and broader tests were not supplied. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: The replacement message contradicts the stated recovery state
>
> - **Location:** `src/recovery-message.mjs:2`, the return value of `recoveryMessage()`.
> - **Evidence:** The PR explicitly states that an exact-version conflict during retry can occur after the first request already committed. The replacement nevertheless says, “The request was rejected. Try again.” This removes the existing acknowledgment that the original request may have completed and asserts rejection instead.
> - **Triggering scenario:** The original request commits, its response is lost, and a retry encounters an exact-version conflict. When this recovery message is displayed, the original request has completed successfully even though the retry conflicts.
> - **Expected result:** Communicate that the original request may already have completed, without claiming that the overall request was rejected or presenting another retry as the unqualified next step.
> - **Incorrect result:** The function unconditionally reports rejection and tells the user to retry. A retry's conflict does not establish that the original request failed.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { recoveryMessage } from "./src/recovery-message.mjs"; assert.doesNotMatch(recoveryMessage(), /the request was rejected/i, "A retry conflict must not imply that the original request was rejected");'`. This assertion fails with the new return value and passes with the previous one. The commit/response-loss/conflicting-retry sequence described above provides the corresponding integration reproduction.
> - **PR attribution:** The previous string explicitly preserved uncertainty about completion; this change replaces it with the unsupported rejection claim, directly contradicting the stated purpose of the PR.
>
> **Review limits:** Assessment is limited to the supplied diff and PR description; the conflict-handling caller and integration tests were not supplied. No binary or other unreviewed paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: Message incorrectly asserts rejection after an ambiguous retry conflict
>
> - **Location:** `src/recovery-message.mjs`, line 2, returned string.
> - **Evidence and requirement:** The PR explicitly aims to avoid claiming that a conflicting retry was rejected because the first request may already have committed. The change instead replaces “The original request may have completed” with the unconditional statement “The request was rejected. Try again.”
> - **Triggering scenario:** The first request commits, its completion is not known to the caller, and an exact-version retry conflicts. This is the scenario explicitly described in the PR. When `recoveryMessage()` supplies the recovery text, it always returns the rejection claim; there is no conditional logic in this function that preserves the uncertainty.
> - **Expected result:** Explain that the original request may have completed rather than assert rejection or unconditionally recommend another attempt.
> - **Incorrect result:** The displayed text asserts rejection even though the original request committed and tells the user to try again.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { recoveryMessage } from "./src/recovery-message.mjs"; assert.doesNotMatch(recoveryMessage(), /request was rejected/i);'`. This requirement-focused assertion fails directly on the new literal. No backend setup is needed to demonstrate the unconditional wording.
> - **PR attribution:** The previous message explicitly acknowledged possible completion. This replacement removes that qualification and introduces the claim the PR title says to avoid.
>
> **Review limits:** Static review of the supplied one-file diff and PR description only; caller and backend behavior were not supplied. No binary or other unreviewed paths were listed. No tests were added in the supplied diff, and tests were not executed by this reviewer.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-16: Describe exact-version retry conflicts without asserting rejection (pass)

**Expected behavior:** The user is told the submitted version is stale and the original operation may have completed.

**Unsupported allegations to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The replacement message matches the stated intent: it avoids asserting that the original request was rejected, while explaining that the submitted version is no longer current. No blocking defect is demonstrated in the supplied change. Tests were not executed by this reviewer; assessment is limited to the one changed source file and the supplied PR description.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The revised message is neutral about whether the original request completed and states that the submitted version is no longer current, matching the stated intent. No blocking defect is evident in the supplied change. Tests were not executed by this reviewer; the assessment is limited to the single changed source file, with no additional repository context or unreviewed binary paths provided.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change replaces an unqualified rejection claim with wording that allows the original request to have completed and states that the submitted version is not current, consistent with the PR description. No blocking defect is demonstrated by the supplied diff. The recovery-state context and related tests were not supplied, so this review cannot assess whether the new wording matches every recovery path. Tests were not executed by this reviewer.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The replacement text matches the stated requirement: it explains that the submitted version is no longer current and allows that the original request may have completed, rather than asserting rejection. The change preserves the function's interface and introduces no demonstrated blocking defect.
>
> Review was limited to the supplied wording change in `src/recovery-message.mjs`. Recovery-state logic, callers, and tests were not supplied, so whether this message is displayed exclusively in the appropriate state could not be assessed. No unreviewed binary paths were reported. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The replacement in `src/recovery-message.mjs` matches the stated copy requirement: it says the submitted version is not current and describes completion of the original request as possible, rather than asserting rejection. The function signature and return type remain unchanged. No blocking defect is demonstrated.
>
> Review was limited to the supplied one-line replacement; callers and recovery-state logic were not provided, so whether this message is displayed only in the appropriate state could not be assessed. No test changes were supplied, and tests were not executed by this reviewer. There are no listed unreviewed binary paths.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The replacement copy meets the stated wording requirement: it explains that the submitted version is no longer current and leaves the original request’s completion uncertain rather than asserting rejection. The function’s signature and return type are unchanged. No blocking defect is demonstrated.
>
> Review was limited to the supplied single-function diff; recovery-state logic and callers were not provided, so whether the message is displayed only in appropriate states could not be assessed. No tests were supplied, and tests were not executed by this reviewer. No unreviewed binary paths were listed.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-17: Keep a review action for a saved settlement after its source row is removed (fail)

**Expected behavior:** A session-level action remains available to reopen the saved settlement receipt.

**Unsupported allegations to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking finding — `src/settlement-actions.mjs:2`:** The PR contradicts its stated requirement that saved settlement results remain reviewable after their source record is deleted. Previously, `actions` always returned `["review"]`; the change returns `[]` when `_printExists` is false. For a saved settlement whose source print has been removed, calling `actions(result, false)` therefore removes the review action instead of preserving it. To reproduce, import `actions` and run `assert.deepEqual(actions({}, false), ["review"])`: the assertion fails because the function returns `[]`. The expected result is `["review"]`; the incorrect result follows directly from the new conditional, so this regression is introduced by this PR. Tests were not executed by this reviewer; the assessment is limited to the supplied diff and description.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking finding — `src/settlement-actions.mjs`:** The change returns no actions when `_printExists` is false, although the PR description explicitly requires saved settlement results to remain reviewable after source-record deletion. For example, call `actions({}, false)` for a saved settlement whose source print was deleted: the expected result is `["review"]`, but the changed code returns `[]`, removing the review action. This behavior is introduced by the new conditional; the prior implementation always returned `["review"]`. A confirming test is `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.deepEqual(actions({}, false), ["review"]);'`; it fails against the changed implementation. Tests were not executed by this reviewer. Assessment is limited to the supplied diff and path list; no unreviewed paths were listed.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> **Blocking — saved settlements become unreviewable when their source row is removed** (`src/settlement-actions.mjs`, line 2). The stated requirement is that saved settlement results remain reviewable after source-record deletion. Before this PR, `actions` always returned `["review"]`; the changed code returns `[]` when `_printExists` is false. Thus, for a saved result whose source print has been removed, the expected action is `["review"]`, but the PR returns no actions. This directly contradicts the requirement and regresses the prior behavior.
>
> To reproduce, run: `node --input-type=module -e 'import { strict as assert } from "node:assert"; import { actions } from "./src/settlement-actions.mjs"; assert.deepEqual(actions({ id: "saved" }, false), ["review"]);'`. The assertion fails because the function returns `[]`. The changed conditional introduces this behavior.
>
> Tests were not executed by this reviewer. Assessment is limited to the supplied diff and path list; no other changed or unreviewed paths were supplied.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: Deleted source removes the required review action
>
> - **Location:** `src/settlement-actions.mjs`, line 2.
> - **Evidence:** The PR explicitly requires saved settlement results to remain reviewable after source-record deletion. The changed return statement produces `[]` when `_printExists` is false, removing the previously unconditional `"review"` action.
> - **Trigger:** Request actions for a saved settlement whose source print has been deleted, passing `false` as `_printExists`.
> - **Expected:** The returned actions include `"review"`, preserving the stated recovery path.
> - **Actual:** The function returns an empty array, offering no review action. `_result` is unused, so it cannot preserve the action for saved results.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.ok(actions({ id: "saved-settlement" }, false).includes("review"));'`. The assertion fails under the supplied change; the previous implementation satisfies it.
> - **PR attribution:** This PR introduces the failure by replacing the unconditional review action with a source-existence condition.
>
> **Review limits:** Static assessment of the supplied single-file diff and PR requirement only; callers and any alternative recovery UI were not supplied. No binary or other unreviewed paths were listed. Tests were not executed by this reviewer, and no test changes were supplied.

**R2: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: review action disappears after source deletion
>
> - **Location:** `src/settlement-actions.mjs`, `actions`, changed return statement.
> - **Evidence:** The explicit requirement says saved settlement results must remain reviewable after source-record deletion. The new `_printExists ? ["review"] : []` returns no actions when the source no longer exists, regardless of the saved result.
> - **Trigger:** Call `actions(savedResult, false)` for a saved settlement whose source print has been deleted.
> - **Expected:** The returned actions include `"review"`, preserving the recovery path.
> - **Actual:** The returned array is empty, removing the review action from this function's output.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.ok(actions({ saved: true }, false).includes("review"));'`. The assertion fails because the function returns `[]`; the saved-result object's shape does not affect this implementation because `_result` is unused.
> - **PR attribution:** Previously the function always returned `["review"]`, including when `_printExists` was false. This change directly removes that behavior in the scenario the requirement says to preserve.
>
> **Review limits:** Assessment is limited to the supplied single-file diff and PR description; callers and UI behavior were not supplied. No unreviewed binary paths were listed. No tests were supplied, and tests were not executed by this reviewer.

**R3: fail (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> ### Blocking: Review action disappears after source deletion
>
> - **Location:** `src/settlement-actions.mjs:2`.
> - **Evidence:** The explicit requirement says saved settlement results must remain reviewable after source-record deletion. The new expression `_printExists ? ["review"] : []` removes the review action when the source no longer exists.
> - **Trigger:** Call `actions(savedResult, false)` for a saved settlement whose source print has been deleted.
> - **Expected:** The returned actions include `"review"`, preserving access to the saved result.
> - **Actual:** The function returns `[]`, eliminating the review action in precisely the required recovery case. No fallback or exception for saved results appears in the supplied function; `_result` is unused.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.ok(actions({ id: "saved-settlement" }, false).includes("review"));'`. This assertion fails under the changed implementation.
> - **PR attribution:** Previously the function returned `["review"]` regardless of source existence. This change introduces the removal of that action after deletion.
>
> **Review limits:** Assessment is static and limited to the supplied diff and requirement; surrounding UI, persistence, and recovery code were not provided. No binary or other unreviewed paths were listed. No tests were supplied, and tests were not executed by this reviewer.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

### case-18: Preserve in-session access to a saved settlement receipt (pass)

**Expected behavior:** The user can reopen the saved settlement result for the current session.

**Unsupported allegations to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show the six new model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `review` available regardless of whether the source print exists, which matches the stated goal for a saved settlement result and does not modify settlement state in the supplied code. No blocking defect is demonstrated. The diff provides no caller or surrounding validation context, so whether this function is ever called for a result that is not saved cannot be assessed as a defect from the supplied material. Tests were not executed by this reviewer; no test changes are shown.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `review` available regardless of `_printExists`, matching the stated requirement, and does not alter settlement state in the supplied code. No blocking defect is demonstrated. Tests were not executed by this reviewer; no tests are included in the supplied diff. Review is limited to the single changed function, so the surrounding action-handling context was unavailable. There are no unreviewed binary paths.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `review` available regardless of `_printExists`, matching the stated goal of retaining in-session access when the source print is gone. This function only returns an action list, so the shown change does not alter settlement state. The supplied material does not include call sites or tests, so I cannot assess whether callers invoke it only for saved results; that missing context is not evidence of a defect. Tests were not executed by this reviewer.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> No blocking defect is demonstrated. In `src/settlement-actions.mjs`, returning `["review"]` unconditionally preserves the review action when the source print is absent and retains existing behavior when it is present. The function does not mutate the settlement result or other state.
>
> No tests were supplied. Useful coverage would assert that both print-exists values return `["review"]` and leave the supplied result unchanged.
>
> Tests were not executed by this reviewer. Analysis is limited to the supplied function; callers and the review-action handler were not provided, so end-to-end receipt access cannot be established. No binary or other unreviewed paths were listed.

**R2: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change makes `actions()` return `["review"]` regardless of source-print existence, matching the stated requirement. The function does not mutate either argument or any settlement state. No blocking defect is demonstrated in the supplied diff.
>
> No tests were supplied or executed by this reviewer. Useful coverage would assert that both `actions(result, true)` and `actions(result, false)` return `["review"]` without modifying `result`.
>
> Analysis is limited to the supplied function; callers and the review-action implementation were not provided, so end-to-end receipt access cannot be established. No binary or other unreviewed paths were listed.

**R3: pass (matches oracle); assertion pass; manual audit reviewed — no unsupported allegations**

> The change in `src/settlement-actions.mjs` directly implements the stated requirement: `actions()` now returns `["review"]` regardless of whether the source print exists. It preserves the existing action when the print exists and makes it available when the print is absent. The function performs no writes or mutations, so the supplied change does not alter settlement state. No blocking defect is demonstrated.
>
> No tests were supplied or executed by this reviewer. Useful regression coverage would assert `["review"]` for both print-existence values and verify that the supplied result remains unchanged. Analysis is limited to the supplied function and diff; caller behavior and the review-action implementation were not provided. There are no listed unreviewed paths or binaries.

</details>

**Manual audit:** All six responses reviewed; no unsupported allegations.

## Review outcome

The human audit is complete for all 72 responses; no unsupported allegations were found. Keep wrong verdicts and text-anchor assertion misses as separate measurements. No conclusions from the historical audit were imported into this run.
