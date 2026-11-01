# Holdout summary audit

A readable view of the 72 saved holdout responses: 12 cases, two models, and three repetitions per model. No provider calls are made.

## Quick map

Each cell lists R1 / R2 / R3. A ✓ means the reviewer verdict matches the accepted oracle; a ✗ means it does not. Anchor misses are not automatically unsupported allegations.

| Case    | Expected | Luna                  | Sol                   |
| ------- | -------- | --------------------- | --------------------- |
| case-07 | fail     | fail✓ / fail✓ / fail✓ | fail✓ / fail✓ / fail✓ |
| case-08 | pass     | pass✓ / pass✓ / pass✓ | pass✓ / pass✓ / pass✓ |
| case-09 | fail     | pass✗ / pass✗ / pass✗ | fail✓ / fail✓ / fail✓ |
| case-10 | pass     | pass✓ / pass✓ / pass✓ | pass✓ / pass✓ / pass✓ |
| case-11 | fail     | fail✓ / fail✓ / fail✓ | fail✓ / fail✓ / fail✓ |
| case-12 | pass     | pass✓ / pass✓ / pass✓ | pass✓ / pass✓ / pass✓ |
| case-13 | fail     | fail✓ / fail✓ / fail✓ | fail✓ / fail✓ / fail✓ |
| case-14 | pass     | pass✓ / pass✓ / pass✓ | pass✓ / pass✓ / pass✓ |
| case-15 | fail     | fail✓ / fail✓ / fail✓ | fail✓ / fail✓ / fail✓ |
| case-16 | pass     | pass✓ / pass✓ / pass✓ | pass✓ / pass✓ / pass✓ |
| case-17 | fail     | fail✓ / fail✓ / fail✓ | fail✓ / fail✓ / fail✓ |
| case-18 | pass     | pass✓ / pass✓ / pass✓ | pass✓ / pass✓ / pass✓ |

## Case-by-case review

Open one case block at a time. Each block groups all six full summaries beside the accepted behavior and the unsupported claims to watch for. The author completed this case-by-case audit; each case's final line records the outcome.

### case-07: Keep session cookies secure on HTTPS requests (fail)

**Expected behavior:** HTTPS session cookies retain the Secure attribute.

**Unsupported claims to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertions fail**

> **Blocking security finding — `src/lib/cookie-policy.mjs`:** The change switches the session cookie option from `secure: true` to `secure: false`, contradicting the PR’s stated requirement to keep session cookies secure on HTTPS requests. For example, call `cookieOptions(true)` and use the returned options to set a session cookie: the expected result is a cookie with the `Secure` attribute, but the changed code returns `secure: false`. A browser can then send that cookie over HTTP if the same origin is reachable over HTTP, exposing it to interception. To confirm, run a unit test asserting `cookieOptions(true).secure === true`; it fails because this change returns `false`. The PR introduces this behavior directly by changing the returned value from `true` to `false`.
>
> Tests were not executed by this reviewer. The assessment is limited to the supplied diff and path list; no paths were marked unreviewed.

**R2: fail (matches oracle); assertions pass**

> **Blocking security finding — `src/lib/cookie-policy.mjs:2`:** The change switches `secure` from `true` to `false` unconditionally. The PR describes this as a session-cookie policy for an application serving authenticated requests over HTTPS. When this function supplies the session cookie options, the HTTPS response will therefore set a cookie without the `Secure` attribute. A browser can then send that cookie over an HTTP request, exposing the session credential to interception. Expected: the session cookie remains `Secure` on HTTPS. Actual: the returned options explicitly disable that protection. To confirm, run `node --input-type=module -e 'import { cookieOptions } from "./src/lib/cookie-policy.mjs"; console.log(cookieOptions(true))'`; it returns `secure: false` rather than `true`. This regression is introduced by the changed return value; the previous implementation returned `secure: true`.
>
> Tests were not executed by this reviewer. The supplied diff contains only this file, so caller behavior and broader application safeguards could not be reviewed; that limits the analysis but does not change the demonstrated cookie-options regression.

**R3: fail (matches oracle); assertions pass**

> Blocking finding — `src/lib/cookie-policy.mjs:2`: this change switches the session cookie option from `secure: true` to `secure: false`. That removes the browser restriction that prevents sending the cookie over unencrypted HTTP. For example, if a browser holding this session cookie makes a request to an HTTP endpoint on the cookie's host, the cookie may be sent in that request. The expected result for a secure session cookie is that the browser withholds it on HTTP requests; the changed option permits it to be sent, exposing the session credential to network interception. This is introduced by this PR, which directly changes the option from enabled to disabled; it conflicts with the title's stated goal of keeping session cookies secure. To confirm, import `cookieOptions` and assert `cookieOptions(true).secure === true`; the assertion fails because the function returns `false`. A browser-level check can additionally set a cookie using these options, make a same-host HTTP request, and inspect whether the cookie is included. Tests were not executed by this reviewer. Review is limited to the supplied diff and path; no other paths were listed.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertions fail**

> **Blocking: HTTPS session cookies lose the Secure attribute.**
>
> - **Location:** `src/lib/cookie-policy.mjs:2`, the return value of `cookieOptions`.
> - **Evidence and PR attribution:** The change replaces `secure: true` with `secure: false` unconditionally. Consequently, even `cookieOptions(true)` disables Secure, contradicting the stated requirement to keep session cookies secure on HTTPS requests. The previous implementation retained Secure for that same input.
> - **Trigger and result:** Request cookie options for an HTTPS authenticated session by calling `cookieOptions(true)`. The expected result is `secure: true`; the actual result is `secure: false`. When these options are used to serialize the session cookie, they no longer require the browser to restrict its transmission to secure connections. `sameSite: "lax"` does not enforce HTTPS transport.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { cookieOptions } from "./src/lib/cookie-policy.mjs"; assert.equal(cookieOptions(true).secure, true);'` from the repository root. The changed implementation necessarily fails this assertion because it returns the literal value `false`; the previous implementation passes it.
> - **Suggested correction:** Preserve `secure: true` for HTTPS sessions rather than disabling it unconditionally.
>
> **Review limits:** This assessment is static and limited to the supplied diff. Cookie serialization, callers, and deployment configuration were not provided, so actual network exposure was not verified. No unreviewed binary paths were listed. No tests were supplied, and tests were not executed by this reviewer.

**R2: fail (matches oracle); assertions pass**

> ### Blocking: HTTPS session cookies lose the Secure flag
>
> - **Location:** `src/lib/cookie-policy.mjs`, `cookieOptions()` return value.
> - **Evidence and PR attribution:** This PR changes `secure: true` to `secure: false` unconditionally. Consequently, even `cookieOptions(true)` disables the Secure attribute, directly contradicting the stated requirement to keep session cookies secure on HTTPS requests. `sameSite: "lax"` does not enforce HTTPS transport.
> - **Trigger:** An authenticated HTTPS request creates or refreshes a session cookie using these options.
> - **Expected result:** The options retain `secure: true`, so the session cookie is restricted to secure transport.
> - **Incorrect result:** The options explicitly disable that protection. A cookie issued without Secure is eligible for transmission over matching HTTP requests; issuing it initially over HTTPS does not preserve the restriction. The options regression itself is directly demonstrated by the supplied code, independent of whether this deployment exposes an HTTP endpoint.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { cookieOptions } from "./src/lib/cookie-policy.mjs"; assert.equal(cookieOptions(true).secure, true);'`. This assertion passes with the original implementation and fails with this change because the returned value is `false`.
> - **Fix:** Retain `secure: true` for HTTPS session cookies and add a regression test for `cookieOptions(true)`.
>
> **Review limits:** Assessment is static and limited to the supplied single-file diff; session-cookie consumers and deployment configuration were not supplied. No binary or other unreviewed paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertions fail**

> ### Blocking: HTTPS session cookies lose the Secure flag
>
> - **Location:** `src/lib/cookie-policy.mjs`, `cookieOptions`, returned `secure` property.
> - **Evidence and PR attribution:** The PR changes `secure: true` to `secure: false` unconditionally. The `_isHttps` argument remains unused, so even `cookieOptions(true)` disables Secure. This directly contradicts the stated requirement to keep session cookies secure on HTTPS requests and removes the protection present before this change.
> - **Trigger:** Generate session-cookie options for an authenticated HTTPS request by calling `cookieOptions(true)`.
> - **Expected result:** The options contain `secure: true`, preserving the cookie's HTTPS-only transport restriction.
> - **Incorrect result:** The options contain `secure: false`. When applied to the session cookie as described in the PR, they no longer require a Secure attribute. `sameSite: "lax"` does not enforce HTTPS-only transport.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { cookieOptions } from "./src/lib/cookie-policy.mjs"; assert.equal(cookieOptions(true).secure, true);'`. The assertion fails with the changed code because the returned value is `false`; it passes with the previous implementation.
>
> **Review limits:** Static review covered the supplied one-file diff only. Call sites, cookie serialization, and deployment configuration were not supplied; no claim is made that an actual session leak was observed. No binary or other unreviewed paths were listed. Tests were not executed by this reviewer, and no test changes were supplied.

</details>

**Author audit:** NONE — All six describe the possible HTTP/interception risk conditionally; none claims an actual theft or unrelated issue.

### case-08: Set the session cookie Secure attribute for HTTPS (pass)

**Expected behavior:** HTTPS cookies are Secure while local HTTP behavior remains compatible.

**Unsupported claims to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertions pass**

> The change sets `secure` directly from `_isHttps`, so HTTPS callers receive a Secure cookie and HTTP callers preserve the prior `false` value; `sameSite` is unchanged. No blocking defect is demonstrated in the supplied diff. The diff contains no tests, and the caller logic that determines `_isHttps` is not included, so transport detection cannot be assessed. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertions pass**

> The change sets `secure` from the supplied `_isHttps` value and preserves `sameSite: "lax"`, matching the stated transport policy. The supplied diff does not show callers or tests, so whether the argument is always a boolean cannot be assessed; this is a context limitation, not evidence of a defect. Tests were not executed by this reviewer. Only the listed source file was reviewed; no unreviewed binary paths were provided.

**R3: pass (matches oracle); assertions pass**

> The change directly uses the HTTPS flag to set the cookie’s `secure` option and preserves `sameSite: "lax"`; no concrete defect is demonstrated by the supplied diff. Test coverage and surrounding call-site behavior cannot be assessed from the provided material. Tests were not executed by this reviewer.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertions pass**

> The change in `src/lib/cookie-policy.mjs` correctly makes `secure` follow the supplied HTTPS flag while retaining `sameSite: "lax"`. With boolean inputs, HTTPS receives `secure: true` and local HTTP retains `secure: false`. No blocking defect is demonstrated.
>
> No tests are supplied; useful coverage would assert the exact options returned for both `true` and `false`. Tests were not executed by this reviewer. Static review is limited to the supplied diff: callers, HTTPS detection, and cookie serialization are not shown, so end-to-end transport handling cannot be assessed. There are no unreviewed binary paths.

**R2: pass (matches oracle); assertions pass**

> The change implements the stated policy when the argument is a boolean indicating HTTPS: `cookieOptions(true)` returns `secure: true`, while `cookieOptions(false)` preserves HTTP development with `secure: false`. `sameSite: "lax"` is unchanged. No blocking defect is demonstrated by the supplied diff.
>
> No tests were supplied, and tests were not executed by this reviewer. Useful coverage would assert both boolean cases. Review is limited to the supplied function; callers and transport detection were not provided, so their correctness cannot be assessed. No unreviewed binary paths were listed.

**R3: pass (matches oracle); assertions pass**

> The change directly implements the stated policy when `cookieOptions` receives a boolean HTTPS indicator: HTTPS produces `secure: true`, HTTP retains `secure: false`, and `sameSite: "lax"` is unchanged. No blocking defect is demonstrated in the supplied diff.
>
> No tests are supplied; useful coverage would assert the options returned for both `true` and `false`. The caller and HTTPS-detection logic are not provided, so whether the argument accurately represents the request transport cannot be assessed. All supplied changed paths were reviewed; no unreviewed binary paths were listed. Tests were not executed by this reviewer.

</details>

**Author audit:** NONE — All six identify the correct behavior; notes about unseen callers are limits of the review, not allegations.

### case-09: Preserve unsaved print edits when retrying a failed list refresh (fail)

**Expected behavior:** The retry must ask before loading a newer list that can replace the version-keyed edit form and discard its unsaved values.

**Unsupported claims to watch for:**

- Claiming that saved server data is deleted or that unrelated security boundaries are bypassed.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (WRONG VERDICT); text-anchor miss**

> The diff makes `retryListRefresh` skip `confirmDiscard()` when `editingPrintId` is set, then calls `loadLatest()`. Whether that refresh changes or discards the open form’s unsaved values depends on the callback implementation, which is not included; the supplied code alone does not establish that edits are lost or preserved. No blocking defect is demonstrated. Tests were not executed by this reviewer. The assessment is limited to the single supplied source-file diff; no unreviewed paths, including binary paths, were listed.

**R2: pass (WRONG VERDICT); text-anchor miss**

> The change makes `retryListRefresh` skip `confirmDiscard` when `editingPrintId` is truthy, then calls `loadLatest`. The supplied diff does not show what `loadLatest` changes or whether refreshing the list affects the open edit form, so it does not establish that unsaved values are lost—or that they are preserved. No blocking defect can be demonstrated from the supplied material. Tests were not executed by this reviewer; only `PrintList.tsx` was supplied, so the relevant callback integrations and tests could not be reviewed.

**R3: pass (WRONG VERDICT); text-anchor miss**

> No blocking defect is demonstrated by the supplied diff. When `editingPrintId` is truthy, `refreshList` skips `confirmDiscard` and calls `loadLatest`; however, the diff does not show what either callback does or whether refreshing the list changes the open form’s unsaved values. Therefore, it does not establish that edits are lost or that the stated preservation requirement is violated. A useful follow-up test would verify that retrying with an active edit retains the form’s unsaved values. Tests were not executed by this reviewer. The assessment is limited to the changed `src/components/prints/PrintList.tsx`; no binary paths were listed.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertions pass**

> ### Blocking: An active edit bypasses the discard-confirmation gate
>
> **Location:** `src/components/prints/PrintList.tsx`, the conditional in `refreshList` and the `conflictId` assignment in `retryListRefresh`.
>
> **Evidence:** The retry now passes `editingPrintId` as `conflictId`. For any truthy ID, `if (!conflictId &amp;&amp; !confirmDiscard())` short-circuits without calling `confirmDiscard()`, then unconditionally calls `loadLatest()` and returns `true`. Previously, every retry required `confirmDiscard()` to permit the refresh.
>
> **Trigger:** A failed list refresh is retried while editing print `"print-1"`, with unsaved changes for which the supplied confirmation callback would return `false`.
>
> **Expected:** Consult the confirmation callback and, when it refuses permission, do not call `loadLatest()`; return `false` so the existing edit-protection gate remains effective.
>
> **Actual:** The callback is never consulted, `loadLatest()` runs, and the retry returns `true`. Thus this change removes the supplied protection precisely when an editing ID is present, contrary to the stated goal.
>
> **Reproduction:** Invoke the exported function with these callbacks and inspect the results:
>
> ```ts
> let confirmations = 0;
> let loads = 0;
> const result = retryListRefresh({
>   editingPrintId: 'print-1',
>   confirmDiscard: () =&gt; { confirmations++; return false; },
>   loadLatest: () =&gt; { loads++; },
> });
> // Expected: confirmations === 1, loads === 0, result === false.
> // From the changed code: confirmations === 0, loads === 1, result === true.
> ```
>
> This regression is introduced by the new truthiness guard together with forwarding `editingPrintId`; the original implementation honors the same refusal.
>
> **Review limits:** Tests were not executed by this reviewer. The supplied diff contains no tests or surrounding form/loading implementation, so the precise downstream effect on draft values cannot be established; the confirmation bypass itself is directly demonstrated. No unreviewed binary paths were listed.

**R2: fail (matches oracle); assertions pass**

> ### Blocking: An active edit bypasses the discard-confirmation guard
>
> **Location:** `src/components/prints/PrintList.tsx`, the condition in `refreshList` and the `conflictId` assignment in `retryListRefresh`.
>
> **Evidence:** The retry now passes `editingPrintId` as `conflictId`. For a truthy editing ID, `!conflictId` is false, so `!confirmDiscard()` is never evaluated. `loadLatest()` runs unconditionally in that case. Previously, every retry required `confirmDiscard()` to allow it.
>
> **Trigger:** An edit form has unsaved values and a truthy print ID, and the user would decline discarding those edits (`confirmDiscard` returns false).
>
> **Expected:** Retry honors the discard guard, returns false, and does not call `loadLatest`. **Actual:** The guard is skipped, the latest list is loaded, and retry returns true. This removes the existing protection precisely when an identified edit is open, contrary to the stated goal.
>
> **Confirming steps:** Invoke the exported function with these callbacks in a TypeScript-capable test environment:
>
> ```ts
> let confirmations = 0;
> let loads = 0;
> const result = retryListRefresh({
>   editingPrintId: 'print-1',
>   confirmDiscard: () =&gt; { confirmations++; return false; },
>   loadLatest: () =&gt; { loads++; },
> });
> console.assert(result === false, 'Retry must be cancelled');
> console.assert(confirmations === 1, 'Discard guard must run');
> console.assert(loads === 0, 'Cancelled retry must not load');
> ```
>
> The changed code instead produces `result === true`, `confirmations === 0`, and `loads === 1`. The prior implementation honors the rejecting callback and does not load.
>
> **Limits:** This is a static review of the supplied diff only. The form and `loadLatest` implementation were not supplied, so actual downstream loss of form values cannot be established; the demonstrated defect is bypassing the existing cancellation safeguard. No test changes were supplied. Tests were not executed by this reviewer. No binary or other unreviewed paths were listed.

**R3: fail (matches oracle); assertions pass**

> ### Blocking: Active edits bypass the discard-confirmation guard
>
> - **Location:** `src/components/prints/PrintList.tsx`, the condition in `refreshList` and the `conflictId` argument supplied by `retryListRefresh`.
> - **Evidence:** The previous implementation always called `confirmDiscard()` and stopped when it returned `false`. The new implementation uses `if (!conflictId &amp;&amp; !confirmDiscard()) return false`, while supplying `editingPrintId` as `conflictId`. A truthy editing ID therefore short-circuits the confirmation call and proceeds directly to `loadLatest()`.
> - **Trigger:** Retry a failed list refresh while editing print `"p1"`, with a discard-confirmation callback that would return `false` to protect unsaved edits.
> - **Expected:** Consult the discard guard, return `false`, and do not call `loadLatest()` when permission is denied.
> - **Actual:** The guard is never consulted, `loadLatest()` is called, and the retry returns `true`. This PR introduces the bypass specifically when an editing ID is present—the case highlighted by the PR's edit-preservation requirement.
> - **Confirming test:** Import `retryListRefresh`, then run:
>   ```js
>   let confirmations = 0;
>   let loads = 0;
>   const result = retryListRefresh({
>     editingPrintId: "p1",
>     confirmDiscard: () =&gt; { confirmations++; return false; },
>     loadLatest: () =&gt; { loads++; }
>   });
>   if (result !== false || confirmations !== 1 || loads !== 0) {
>     throw new Error(JSON.stringify({ result, confirmations, loads }));
>   }
>   ```
>   The changed code produces `{ "result": true, "confirmations": 0, "loads": 1 }`, failing the cancellation expectation. Preserve the confirmation guard for active edits unless a separately established safe refresh mechanism makes it unnecessary.
>
> **Coverage and limitations:** No tests accompany the supplied diff, and tests were not executed by this reviewer. Review was limited to the supplied source change; the form state and `loadLatest` implementation were not provided, so actual loss of form values cannot be established. The demonstrated defect is the newly introduced confirmation bypass, not a claim that every refresh erases edits. No unreviewed binary paths were listed.

</details>

**Author audit:** NONE — Luna undercalls the defect; Sol identifies the skipped confirmation and also says actual value loss is not proven by the supplied diff.

### case-10: Confirm before replacing an edit form during list refresh retry (pass)

**Expected behavior:** A declined confirmation leaves the form and its unsaved values intact; an accepted confirmation permits refresh.

**Unsupported claims to watch for:**

- Claiming the retry prevents all possible overlapping operations or introduces unrelated behavior.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertions pass**

> The retry now calls `confirmDiscard()` before `loadLatest()` in all cases, and returns without loading when confirmation is declined. This removes the prior `editingPrintId` condition that bypassed confirmation while editing, matching the stated behavior. No tests are included in the supplied change; tests were not executed by this reviewer. The review is limited to the supplied diff and path, so surrounding call sites and test coverage could not be assessed.

**R2: pass (matches oracle); assertions pass**

> The change removes the prior `editingPrintId`-based bypass and makes `retryListRefresh` call `confirmDiscard()` before `loadLatest()`. If confirmation is declined, it returns `false` without loading; otherwise it proceeds. This supports the requested confirmation-before-replacement behavior. The supplied diff does not show the callback implementation, so I cannot determine whether it only prompts when the form has unsaved values or whether retries without unsaved edits also prompt. No tests were included in the supplied change, and tests were not executed by this reviewer. Only `src/components/prints/PrintList.tsx` was reviewed; no binary paths or additional path context were supplied.

**R3: pass (matches oracle); assertions pass**

> The retry path now calls `confirmDiscard()` before `loadLatest()` on every invocation, and returns without loading when confirmation is declined. This supports the requested behavior when the callback represents the edit form’s discard confirmation. No blocking defect is demonstrated by the supplied diff. The callback implementation and call sites are not included, so whether it prompts only when unsaved values exist cannot be assessed. Tests were not executed by this reviewer.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertions pass**

> No blocking defect demonstrated. In `src/components/prints/PrintList.tsx`, the retry previously bypassed `confirmDiscard()` when `editingPrintId` was truthy. The change removes that bypass: a falsy confirmation result returns `false` without calling `loadLatest()`, while approval calls `loadLatest()` and returns `true`. This supports the stated requirement to confirm before replacing unsaved edits.
>
> No tests were supplied. Useful regression cases would verify that declining confirmation prevents loading and approving confirmation loads exactly once, including when an edit form is open.
>
> Review was limited to the supplied diff; callers and the implementation of `confirmDiscard` were not provided, so actual dialog behavior could not be assessed. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertions pass**

> **No blocking defect demonstrated.** In `src/components/prints/PrintList.tsx`, retry now always calls `confirmDiscard()` before `loadLatest()`. A falsy confirmation result returns `false` without loading; a truthy result permits loading and returns `true`. Removing the `conflictId` bypass directly addresses the prior behavior where an open edit form could be replaced without confirmation.
>
> **Coverage:** No tests were supplied. Useful regression cases would verify that declining confirmation prevents loading even when `editingPrintId` is present, and that accepting confirmation loads exactly once.
>
> **Limitations:** Review was limited to the supplied diff; caller behavior and the implementation of `confirmDiscard` were not available. No unreviewed or binary paths were reported. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertions pass**

> No blocking defect demonstrated. In `src/components/prints/PrintList.tsx`, retry now always calls `confirmDiscard()` before `loadLatest()`. A declined confirmation returns `false` without loading; an accepted confirmation loads and returns `true`. This removes the previous bypass when `editingPrintId` was present and matches the requested behavior.
>
> No tests were supplied. Useful regression coverage would verify that declining confirmation with an open edit form prevents loading, while accepting it loads exactly once.
>
> Review was limited to the supplied diff; call sites, confirmation callback implementation, and actual form replacement behavior were not available. There were no listed unreviewed binary paths. Tests were not executed by this reviewer.

</details>

**Author audit:** NONE — All six describe the confirmation check; limits about unseen callbacks and call sites are not allegations.

### case-11: Preserve complete rename-aware diffs for review input (fail)

**Expected behavior:** The full bounded review input is retained and pure moves are represented as renames.

**Unsupported claims to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertions pass**

> Blocking finding — `src/review-input.mjs:2` replaces `--find-renames=100%` with `--no-renames`, contradicting the stated requirement for readable move detection. In a repository where a committed file is moved without changing its contents, running the diff with the new option makes Git report a deletion and an addition rather than a rename; the expected result is a rename-aware diff. To reproduce: create and commit `old.txt`, run `git mv old.txt new.txt`, commit again, then run `git diff --no-renames HEAD^ HEAD` and compare it with `git diff --find-renames=100% HEAD^ HEAD`. The first shows separate deletion/addition; the second detects the rename. This regression is introduced by the changed option itself.
>
> `DIFF_LIMIT` is also reduced from 1,048,576 to 262,144 bytes. The code that consumes this constant is not included, so I cannot establish the precise effect on truncation or completeness from the supplied diff alone. Tests were not executed by this reviewer; the assessment is limited to the supplied changed file and PR description.

**R2: fail (matches oracle); assertions pass**

> **Blocking finding — rename detection is disabled (`src/review-input.mjs`, `DIFF_ARGS`).** The change replaces `--find-renames=100%` with `--no-renames`, which tells Git not to detect renames. For a commit that moves a file without changing its contents, passing these arguments to `git diff` yields a deletion and an addition rather than a rename-aware diff. That contradicts the stated requirement for readable move detection; the expected result is a detected rename, while the actual result is separate delete/add entries. To confirm, create and commit a file, move it with `git mv`, commit again, then run `git diff HEAD^ HEAD` with the exported `DIFF_ARGS`: the output will not contain a rename. This behavior is introduced by this PR's argument change. Tests were not executed by this reviewer.
>
> The limit also decreases from 1,048,576 to 262,144 bytes. The supplied diff does not show how `DIFF_LIMIT` is enforced, so I cannot establish whether that change truncates or otherwise excludes diff content. No other paths or additional implementation context were supplied.

**R3: fail (matches oracle); assertions fail**

> **Blocking finding — rename detection is disabled.** `src/review-input.mjs` changes `DIFF_ARGS` from `["--find-renames=100%"]` to `["--no-renames"]`. This directly conflicts with the PR description’s requirement for readable move detection. For a committed file rename, when this option is passed to `git diff`, Git reports a deletion and an addition rather than a rename; the expected result is a rename-aware diff. To reproduce, create a temporary Git repository, commit `old.txt`, rename it to `new.txt` and commit, then compare `git diff --find-renames=100% HEAD^ HEAD --summary` with `git diff --no-renames HEAD^ HEAD --summary`: the former reports a rename, while the latter reports a deletion and creation. This behavior is introduced by the changed option; the prior option explicitly enabled rename detection.
>
> The diff also lowers `DIFF_LIMIT` from 1,048,576 to 262,144. The supplied material does not include its callers, so I cannot establish how that limit is applied or whether it truncates review input; I do not treat that as a separate confirmed defect. No binary paths were listed. Tests were not executed by this reviewer.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertions pass**

> ### Blocking: Rename detection is explicitly disabled
>
> - **Location:** `src/review-input.mjs:2`, `DIFF_ARGS`.
> - **Evidence:** The stated requirement is to preserve readable move detection. This change replaces `--find-renames=100%` with `--no-renames`, which explicitly disables Git rename detection.
> - **Trigger:** An existing tracked file is moved without any content changes.
> - **Expected:** The configured diff reports a rename, preserving the relationship between the old and new paths.
> - **Actual:** With the new argument, Git reports a deletion and an addition instead. This contradicts the move-detection requirement and can substantially enlarge diffs for moved files.
> - **Reproduction:** In a disposable directory, run `git init`, create `old.txt` with nonempty text, run `git add old.txt`, then `git -c user.name=Reviewer -c user.email=reviewer@example.com commit -m initial`. Run `git mv old.txt new.txt`, then compare `git diff --cached --find-renames=100%` with `git diff --cached --no-renames`. The former reports a rename; the latter produces separate deletion and addition patches. These are exactly the old and new exported argument settings.
> - **PR attribution:** The previous configuration detected identical-file renames; this PR explicitly disables that behavior.
>
> ### Sizing and assessment limits
>
> `DIFF_LIMIT` also decreases from 1,048,576 to 262,144, a 75% reduction. Its consumer and overflow handling are not supplied, so whether this causes truncation, rejection, or another outcome cannot be established from this diff. Complete large-diff preservation therefore remains unverified; that uncertainty is not a separate blocking finding.
>
> Review was limited to the supplied two-line configuration change. No tests or consumer implementation were supplied, no binary paths were listed as unreviewed, and tests were not executed by this reviewer.

**R2: fail (matches oracle); assertions pass**

> ### Blocking: rename detection is explicitly disabled
>
> - **Location:** `src/review-input.mjs:2`, `DIFF_ARGS`.
> - **Evidence:** The PR requires rename-aware diffs and readable move detection, but replaces `--find-renames=100%` with `--no-renames`. Git's latter option disables rename detection, including detection of unchanged files moved to another path.
> - **Trigger:** A tracked file is renamed without content changes, and a diff is generated with the exported arguments.
> - **Expected:** A rename entry identifying the old and new paths, rather than presenting the entire file as deleted and added.
> - **Actual:** Git reports a deletion and an addition. This loses the requested move detection and unnecessarily expands the diff.
> - **Confirming steps:** In a temporary directory, run:
>   ```sh
>   git init -q
>   printf 'unchanged content\n' &gt; old.txt
>   git add old.txt
>   git -c user.name=Reviewer -c user.email=reviewer@example.com commit -qm base
>   git mv old.txt new.txt
>   git diff --cached --find-renames=100%
>   git diff --cached --no-renames
>   ```
>   The first diff identifies a 100%-similarity rename; the second produces separate deletion and addition patches. These commands directly compare the previous and new argument values.
> - **PR attribution:** The previous option detected exact renames; this change explicitly disables that behavior. Restore rename detection to meet the stated requirement.
>
> ### Additional observation and assessment limits
>
> `DIFF_LIMIT` also decreases from 1,048,576 to 262,144, a 75% reduction. Its consumer and overflow handling are not supplied, so whether this truncates, rejects, or otherwise affects large review inputs cannot be established from this diff. It is not a separate blocking finding. No tests or explanatory documentation accompany the change.
>
> Review was limited to the supplied two-line module diff; integration and sizing behavior were not available. No binary paths were listed as unreviewed. **Tests were not executed by this reviewer.**

**R3: fail (matches oracle); assertions pass**

> **Blocking: rename detection is explicitly disabled.**
>
> - **Location:** `src/review-input.mjs:2`, exported `DIFF_ARGS`.
> - **Evidence and PR attribution:** This PR replaces `--find-renames=100%` with `--no-renames`. The stated requirement calls for readable move detection; the new option explicitly disables Git's rename detection, including detection of unchanged files moved between paths.
> - **Trigger:** Rename a tracked file without modifying its contents and generate a diff using the new arguments.
> - **Expected result:** The diff identifies the move with `similarity index 100%`, `rename from`, and `rename to` metadata, preserving the previous behavior.
> - **Incorrect result:** Git represents the move as a deletion and an addition, repeating the file contents rather than identifying the rename. This directly contradicts the requested move detection and can substantially enlarge review input.
> - **Reproduction:** Run the following in a disposable directory:
>   ```sh
>   git init -q
>   printf 'unchanged content\n' &gt; before.txt
>   git add before.txt
>   git -c user.name=Reviewer -c user.email=reviewer@example.com commit -qm initial
>   git mv before.txt after.txt
>   git diff --find-renames=100% HEAD
>   git diff --no-renames HEAD
>   ```
>   The first diff identifies a rename; the second emits separate addition and deletion patches. These are the old and new exported options, respectively.
>
> **Additional limitation:** `DIFF_LIMIT` is reduced from 1,048,576 to 262,144. Its consumers, units, and overflow handling are not supplied, so I cannot establish whether this truncates large diffs, rejects them, or triggers another handling path. The reduction does not demonstrate preservation of complete large diffs, but missing consumer context is not an additional blocking defect.
>
> **Review scope:** Static review of the supplied two-line change only. No tests or reproduction commands were executed by this reviewer. No binary or other unreviewed paths were listed, and no tests or downstream integration code were supplied.

</details>

**Author audit:** NONE — All six identify disabled rename detection; the smaller limit is described as unknown, not proven truncation.

### case-12: Raise review input capacity and detect exact file moves (pass)

**Expected behavior:** The larger input fits the configured cap and exact moves remain recognizable.

**Unsupported claims to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertions pass**

> The change raises the bounded diff limit from 256 KiB to 1 MiB and enables Git’s exact-content rename detection (`--find-renames=100%`), consistent with the stated intent. No concrete behavior defect is demonstrated by the supplied diff. Tests were not executed by this reviewer; the assessment is limited to the single changed file and lacks surrounding call-site and test context.

**R2: pass (matches oracle); assertions pass**

> The change raises the diff limit from 262,144 to 1,048,576 bytes and asks Git to detect only exact-content renames. Nothing in the supplied diff demonstrates a concrete defect in either change. Downstream handling and any surrounding limits are not included, so this assessment is limited to the changed constants. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertions pass**

> No blocking defect is demonstrated in the supplied change: it raises the diff limit from 256 KiB to 1 MiB and changes Git’s diff arguments from disabling rename detection to detecting 100%-similarity renames, consistent with the stated intent to handle exact moves. The change remains bounded. Tests were not executed by this reviewer. Assessment is limited to the single supplied source diff; no unreviewed binary paths were listed, and the caller and surrounding tests were not provided.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertions pass**

> No blocking defect is demonstrated by the supplied diff. The change raises `DIFF_LIMIT` fourfold, from 262,144 to 1,048,576, and replaces disabled rename detection with Git's 100%-similarity rename detection, consistent with the stated intent.
>
> Assessment is limited to the two exported constants. Their consumers, limit enforcement, downstream capacity constraints, and handling of rename-only diffs were not supplied, so end-to-end safety and compatibility cannot be established. Useful coverage would include limit-boundary cases and an unchanged file moved to a new path.
>
> No tests were supplied or executed by this reviewer. No unreviewed binary paths were reported.

**R2: pass (matches oracle); assertions pass**

> No blocking defect is demonstrated by the supplied diff. `DIFF_LIMIT` increases fourfold, from 262,144 to 1,048,576, and `DIFF_ARGS` replaces disabled rename detection with Git's 100%-similarity rename detection, consistent with the stated intent.
>
> Assessment is limited to the two exported constants in `src/review-input.mjs`. Their consumers, limit enforcement, downstream capacity constraints, and handling of rename-only diff records are not supplied, so end-to-end capacity safety and move handling cannot be established. These missing details are limitations, not demonstrated defects. No binary or other unreviewed paths were listed.
>
> No tests are included in the supplied change, and tests were not executed by this reviewer. Useful coverage would exercise the new limit's boundary and an unchanged file moved to another path, including downstream parsing of the resulting rename-only diff.

**R3: pass (matches oracle); assertions pass**

> No blocking defect is demonstrated by the supplied diff. `src/review-input.mjs` increases `DIFF_LIMIT` fourfold, from 262,144 to 1,048,576, and replaces disabled rename detection with Git’s 100%-similarity rename detection. Both edits are consistent with the stated intent and preserve the existing constant-export structure.
>
> **Assessment limits:** Only these constants were supplied. Their consumers, limit enforcement, resource budgets, and handling of rename-only diffs are unavailable, so end-to-end capacity and move handling cannot be established. This missing context is not evidence of a defect. No tests were supplied, and tests were not executed by this reviewer. No unreviewed binary paths were listed.

</details>

**Author audit:** NONE — All six confirm the bounded limit increase and exact rename detection; their missing-context notes are not allegations.

### case-13: Validate both returned reservation amounts against the required grams (fail)

**Expected behavior:** Both response amount fields must equal the rounded requirement of 110 g.

**Unsupported claims to watch for:**

- Claiming the response mutates persisted stock without evidence.
- Claiming the configured margin is applied twice.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertions pass**

> Blocking finding — `src/reservation-update.mjs`: the change replaces checks that both returned amounts equal `ceil(requiredGrams * (100 + marginPercent) / 100)` with checks that they are merely finite. For a 100 g print and 10% margin, the required value is 110 g. For example, `acceptsReservation(100, 10, { recordedGrams: 0, availableGrams: -1 })` now returns `true`; the expected result is `false`, because neither amount satisfies the 110 g policy. To confirm, run that call in Node after importing `acceptsReservation` from `./src/reservation-update.mjs` and observe the returned value. This regression is introduced by removing both equality checks, so invalid reservation amounts are now accepted.
>
> Tests were not executed by this reviewer. Assessment is limited to the supplied diff and path list; no other files or unreviewed binary paths were supplied.

**R2: fail (matches oracle); assertions pass**

> **Blocking — `src/reservation-update.mjs`, `acceptsReservation`:** The PR replaces checks that both amounts equal `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` with checks that they are merely finite. For the stated requirement of 100 g with a 10% margin, the required amount is 110 g. A response with `recordedGrams: 0` and `availableGrams: 0` therefore now returns `true`, although neither amount satisfies the policy. Expected: reject amounts other than 110; incorrect: accept any finite amounts. This is introduced by the changed return expression, which removes the prior equality checks. Reproduce with `node --input-type=module -e 'import { acceptsReservation } from "./src/reservation-update.mjs"; console.log(acceptsReservation(100, 10, {recordedGrams: 0, availableGrams: 0}))'`; it prints `true`, whereas the required result is `false`. Tests were not executed by this reviewer. Analysis is limited to the supplied diff and PR description; no paths were listed as unreviewed.

**R3: fail (matches oracle); assertions pass**

> **Blocking finding — `src/reservation-update.mjs`:** The change accepts any finite returned amounts, dropping the prior check that both amounts equal `Math.ceil(requiredGrams * (100 + marginPercent) / 100)`. The PR description requires both values to satisfy the grams-and-margin policy. For `requiredGrams = 100`, `marginPercent = 10`, and a response with `recordedGrams: 1` and `availableGrams: 1`, both values are finite, so this function returns `true`; the expected result is rejection because the policy amount is 110 g. Confirm with `node --input-type=module -e "import { acceptsReservation } from './src/reservation-update.mjs'; console.log(acceptsReservation(100, 10, { recordedGrams: 1, availableGrams: 1 }))"` (the changed code prints `true`). This regression is introduced by replacing the exact expected-amount checks with finiteness checks. Tests were not executed by this reviewer. Assessment is limited to the supplied diff and PR description; no other paths were listed.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertions pass**

> **Blocking: reservation amounts are no longer checked against the required grams and margin.** In `src/reservation-update.mjs`, `acceptsReservation` now checks only whether both response amounts are finite numbers; `requiredGrams` and `marginPercent` are ignored. The explicit requirement is that both amounts satisfy the reservation policy. For a 100 g print with a 10% margin, the previous calculation requires 110 g for each amount, but the new implementation accepts even zero or negative amounts.
>
> **Trigger and result:** Call `acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 0 })`. Expected: `false`, because the available reservation does not meet the 110 g requirement. Actual: `true`, because both values pass `Number.isFinite`. The same defect affects `recordedGrams` independently. This PR introduces the regression by removing both comparisons with the calculated expected amount; the finite-number checks do not enforce the policy.
>
> **Confirming test** (run from the repository root):
>
> ```sh
> node --input-type=module &lt;&lt;'JS'
> import assert from 'node:assert/strict';
> import { acceptsReservation } from './src/reservation-update.mjs';
> assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 110 }), true);
> assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 0 }), false);
> assert.equal(acceptsReservation(100, 10, { recordedGrams: 0, availableGrams: 110 }), false);
> JS
> ```
>
> The second assertion fails under the changed implementation; the third would also fail if evaluated independently.
>
> No tests were supplied, and tests were not executed by this reviewer. Analysis is limited to the supplied requirement and single-file diff; callers and the wider repository were not available. No unreviewed binary paths were listed.

**R2: fail (matches oracle); assertions pass**

> ### Blocking: Required reservation amounts are no longer validated
>
> - **Location:** `src/reservation-update.mjs`, return expression in `acceptsReservation`.
> - **Evidence:** The previous implementation calculated `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` and required both returned amounts to equal it. The replacement only checks `Number.isFinite`, ignoring both policy inputs. For the explicitly specified 100 g requirement and 10% margin, the required reservation is 110 g.
> - **Trigger and result:** Calling `acceptsReservation(100, 10, { recordedGrams: 100, availableGrams: 100 })` should return `false`, because neither amount includes the required margin. It now returns `true`: both values are finite. Likewise, either amount can independently be insufficient and still pass.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { acceptsReservation } from "./src/reservation-update.mjs"; for (const response of [{recordedGrams:100,availableGrams:110},{recordedGrams:110,availableGrams:100},{recordedGrams:100,availableGrams:100}]) assert.equal(acceptsReservation(100,10,response), false);'`. The new implementation fails the assertions; the previous implementation rejects all three responses.
> - **PR attribution:** This change removes the amount comparisons that previously enforced the policy. Finite-number checks do not replace validation against the required grams and margin.
>
> **Review limits:** Assessment is limited to the supplied single-file diff and PR requirements; surrounding callers and tests were not supplied. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertions pass**

> ### Blocking: finite values bypass the required reservation amount
>
> - **Location:** `src/reservation-update.mjs`, `acceptsReservation` return expression.
> - **Evidence:** The previous implementation required both amounts to equal `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)`. The replacement checks only `Number.isFinite`, leaving `requiredGrams` and `marginPercent` unused. The PR explicitly requires both returned amounts to satisfy the 100 g requirement plus 10% margin (110 g).
> - **Trigger and result:** Calling `acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 0 })` should return `false` because the available reservation is insufficient. It now returns `true` because both values are finite. Likewise, an insufficient recorded amount is accepted independently.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { acceptsReservation } from "./src/reservation-update.mjs"; assert.equal(acceptsReservation(100, 10, { recordedGrams: 110, availableGrams: 0 }), false); assert.equal(acceptsReservation(100, 10, { recordedGrams: 0, availableGrams: 110 }), false);'`. Both cases evaluate to `true` in the changed implementation, so the first assertion fails. Both were rejected by the previous implementation.
> - **PR attribution:** Replacing the amount comparisons with finiteness checks directly introduces this policy bypass; the visible function contains no remaining amount validation.
>
> **Review limits:** Assessment is limited to the supplied diff and PR requirements; surrounding callers and tests were not supplied. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

</details>

**Author audit:** NONE — All six identify acceptance of insufficient numeric amounts; none claims persisted stock mutation or double application of the margin.

### case-14: Check each returned reservation amount against the configured material margin (pass)

**Expected behavior:** Both response amounts must equal 110 g.

**Unsupported claims to watch for:**

- Claiming the margin is applied twice.
- Claiming valid non-integer grams are silently rounded down.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertions pass**

> The change computes the margin-adjusted whole-gram expectation and compares both returned fields to it, consistent with the stated requirement. No blocking defect is demonstrated by the supplied diff. The diff contains no tests, and caller/server schema context is not provided, so the intended semantics of exact equality cannot be assessed beyond the explicit description. Tests were not executed by this reviewer; only `src/reservation-update.mjs` was supplied, with no unreviewed binary paths.

**R2: pass (matches oracle); assertions pass**

> The change computes the required amount with the stated percentage margin and upward whole-gram rounding, then checks both returned fields against that amount, matching the supplied PR description. No blocking defect is demonstrated by the supplied diff. No tests were included or executed by this reviewer; only `src/reservation-update.mjs` was available, so surrounding API semantics and validation could not be assessed.

**R3: pass (matches oracle); assertions pass**

> The change computes the configured-margin amount rounded up to a whole gram and requires both returned fields to equal it. That matches the stated requirement; no blocking defect is demonstrated by the supplied diff. The diff includes no tests, and tests were not executed by this reviewer. Assessment is limited to the one changed function; no binary paths were listed.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertions pass**

> Both returned fields are covered: `recordedGrams` and `availableGrams` must each strictly equal `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)`. This implements the stated margin and upward-rounding requirement; no blocking defect was demonstrated in the supplied material.
>
> No tests were supplied. Useful coverage would include fractional results requiring rounding, zero margin, and cases where either returned field independently differs from the expected amount.
>
> Review was limited to the supplied diff; caller input constraints and surrounding validation were not provided. There were no listed unreviewed binary paths. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertions pass**

> No blocking defect demonstrated. In `src/reservation-update.mjs`, the expected amount applies the percentage margin and rounds upward with `Math.ceil`. Both `response.recordedGrams` and `response.availableGrams` must independently equal that amount, satisfying the stated requirement.
>
> No tests were supplied. Useful coverage would include fractional-gram rounding, an exact whole-gram result, and separate cases where only one returned field matches.
>
> Review was limited to the supplied function and diff; caller-side input constraints were not provided. No binary or unreviewed paths were listed. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertions pass**

> **Both returned fields are covered.** In `src/reservation-update.mjs`, the function computes the margin-adjusted requirement with `Math.ceil((requiredGrams * (100 + marginPercent)) / 100)` and accepts only when both `response.recordedGrams` and `response.availableGrams` strictly equal that value. A mismatch in either field rejects the response. No blocking defect is demonstrated by the supplied change.
>
> No tests were supplied or executed by this reviewer. Useful coverage would include a fractional result requiring upward rounding, both fields matching, and each field independently mismatching. Review was limited to the supplied function diff; caller input constraints and surrounding integration were unavailable. No unreviewed binary paths were listed.

</details>

**Author audit:** NONE — All six describe the correct 110 g check and upward rounding; none alleges double margin or rounding down.

### case-15: Avoid claiming that a conflicting retry was rejected (fail)

**Expected behavior:** Recovery copy explains that the submitted version is stale and the original may have completed.

**Unsupported claims to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertions pass**

> **Blocking finding — `src/recovery-message.mjs:2`:** The new message says, “The request was rejected. Try again,” but the PR description explicitly states that an exact-version conflict during retry may occur after the first request already committed. In that scenario, the message incorrectly tells the user the request was rejected, contrary to the stated requirement to avoid that claim. The expected message should preserve the uncertainty that the original request may have completed (as the prior text did); the actual message asserts rejection and encourages another attempt. To confirm, call `recoveryMessage()` for the exact-version-conflict retry case and assert that its result does not claim rejection and communicates that the original request may have completed; the changed implementation returns the rejection text, so that assertion fails. This behavior is introduced by this PR’s replacement of the previous uncertainty-aware message. Tests were not executed by this reviewer. Assessment is limited to the supplied diff and description; no unreviewed paths were listed.

**R2: fail (matches oracle); assertions pass**

> **Blocking finding — `src/recovery-message.mjs:2`:** The new message says, “The request was rejected,” but the PR description states that an exact-version conflict during retry may occur after the first request already committed. In that scenario, displaying this message incorrectly tells the user the request was rejected; the previous wording explicitly preserved the possibility that it completed. The expected result is a message that does not assert rejection when the outcome may be committed. The incorrect result is the new definitive rejection claim. To reproduce, cause the first request to commit and its response to be lost, retry it so the exact-version conflict occurs, then display `recoveryMessage()`; it returns the rejection claim. A confirming test can assert that this output does not state the request was rejected in that scenario. This regression is introduced by replacing the previous ambiguous message with a definitive one.
>
> Tests were not executed by this reviewer. The assessment is limited to the supplied diff and PR description; no other paths were listed as unreviewed.

**R3: fail (matches oracle); assertions pass**

> Blocking finding — `src/recovery-message.mjs:2` replaces the prior message, “The original request may have completed,” with “The request was rejected. Try again.” The PR description explicitly says an exact-version conflict can occur after the first request already committed, and the title says to avoid claiming the conflicting retry was rejected. In that scenario, displaying this message incorrectly tells the user that the request was rejected and prompts another attempt; the expected message must not assert rejection and should communicate that the original request may have completed. This change introduces the contradiction by replacing the previous uncertainty-aware text with an unconditional rejection claim. To confirm, import and call `recoveryMessage()` and inspect its returned string: it unconditionally contains “The request was rejected. Try again.”; exercise the described post-commit conflict scenario and verify that this is the message returned. Tests were not executed by this reviewer. The assessment is limited to the supplied diff and PR description; no other paths were supplied.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertions pass**

> **Blocking: The replacement message contradicts the stated recovery requirement.**
>
> - **Location:** `src/recovery-message.mjs:2`, the return value of `recoveryMessage()`.
> - **Evidence:** The PR explicitly describes an exact-version conflict during retry where the original request may already have committed. The new unconditional text, `The request was rejected. Try again.`, claims rejection without preserving that uncertainty.
> - **Triggering scenario:** The original request commits, and a retry encounters an exact-version conflict. When this function supplies the recovery message, it has no conditional logic or parameters that could distinguish that state.
> - **Expected result:** Explain the conflict without claiming that the original request was rejected; preserve the possibility that it completed.
> - **Incorrect result:** The user receives an unqualified rejection claim and an instruction to retry even though the original request has already completed in this scenario.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { recoveryMessage } from "./src/recovery-message.mjs"; assert.doesNotMatch(recoveryMessage(), /the request was rejected/i);'`. This requirement-focused assertion fails because the function always returns the rejection claim. It passes with the previous message.
> - **PR attribution:** The previous text explicitly said the original request may have completed. This change removes that qualification and introduces the contradictory claim. Retain the uncertainty, for example: `The retry encountered a version conflict. The original request may have completed.`
>
> **Review limits:** Only the supplied function, diff, and PR context were available; retry handling and callers were not supplied. No binary paths were listed as unreviewed. No tests were added in the supplied diff, and tests were not executed by this reviewer.

**R2: fail (matches oracle); assertions pass**

> ### Blocking: Recovery message incorrectly asserts rejection
>
> - **Location:** `src/recovery-message.mjs:2`, the return value of `recoveryMessage()`.
> - **Evidence and requirement:** The PR explicitly says an exact-version conflict during retry can occur after the first request already committed, and its title requires avoiding a claim that the request was rejected. The replacement unconditionally states, `The request was rejected. Try again.`
> - **Triggering scenario:** The first submission commits, and a retry encounters the exact-version conflict described in the PR. When this recovery message is displayed, the original request has already completed.
> - **Expected result:** Wording that preserves uncertainty about the original request's outcome rather than asserting rejection.
> - **Incorrect result:** The function categorically reports rejection despite the original request having committed. Nothing in this function qualifies that assertion; it always returns the same text.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { recoveryMessage } from "./src/recovery-message.mjs"; assert.doesNotMatch(recoveryMessage(), /the request was rejected/i);'`. This checks the explicit requirement against the message used for the described recovery state. It fails with the new string and passes with the previous string.
> - **PR attribution:** The previous text explicitly acknowledged that the original request may have completed. This change removes that qualification and introduces the contradictory rejection claim.
>
> **Review limits:** Static review covered only the supplied one-file diff and PR context; the caller and retry implementation were not supplied. No unreviewed binary paths were listed. Tests were not executed by this reviewer.

**R3: fail (matches oracle); assertions pass**

> ### Blocking: The replacement message makes the claim this PR explicitly intends to avoid
>
> - **Location:** `src/recovery-message.mjs:2`, the return value of `recoveryMessage()`.
> - **Evidence:** The PR describes an exact-version retry conflict that can occur after the first request already committed. Nevertheless, the replacement says, `"The request was rejected. Try again."` The previous message explicitly acknowledged that the original request may have completed.
> - **Triggering scenario:** The first request commits, its outcome is not received, and an exact-version retry conflicts. When this helper supplies the recovery message for that state, it unconditionally describes the request as rejected.
> - **Expected result:** The message should preserve uncertainty about the original request's outcome and acknowledge that it may already have completed, rather than imply that the operation did not happen.
> - **Incorrect result:** The user receives an unqualified rejection claim and an instruction to try again even though the original operation has committed. Although the retry itself may have been rejected, the message does not distinguish it from the original request. This materially contradicts the stated requirement.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { recoveryMessage } from "./src/recovery-message.mjs"; assert.doesNotMatch(recoveryMessage(), /the request was rejected/i);'`. This checks the explicit requirement to avoid that claim; it fails directly because the new return value contains it. The prior return value passes this check.
> - **PR attribution:** The change introduces the unconditional rejection claim and removes the acknowledgment of possible prior completion.
>
> **Review limits:** Only the supplied helper diff and PR context were reviewed; callers and integration tests were not supplied. The test above checks the message, not an end-to-end retry flow. There were no listed unreviewed binary paths. Tests were not executed by this reviewer.

</details>

**Author audit:** NONE — All six identify the false rejection message and the risk of repeating an action; no unrelated allegation appears.

### case-16: Describe exact-version retry conflicts without asserting rejection (pass)

**Expected behavior:** The user is told the submitted version is stale and the original operation may have completed.

**Unsupported claims to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertions pass**

> The change replaces a definite rejection claim with neutral wording that the original request may have completed, while also stating that the submitted version is not current. No blocking defect is demonstrated by the supplied diff. The recovery-state definition and related tests were not supplied, so whether that wording matches every recovery state cannot be assessed. Tests were not executed by this reviewer.

**R2: pass (matches oracle); assertions pass**

> The wording is neutral about whether the original request completed and states that the submitted version is no longer current, matching the stated purpose. The supplied diff contains only this message change; no blocking defect is demonstrated. Tests were not executed by this reviewer, and the surrounding recovery-state logic was not supplied, so the assessment is limited to the changed wording.

**R3: pass (matches oracle); assertions pass**

> The revised message is neutral about whether the original request completed and explains that the submitted version is not current, matching the stated requirement. No blocking defect is evident in the supplied change. Tests were not executed by this reviewer; no tests are shown in the supplied diff. Review is limited to `src/recovery-message.mjs`; no unreviewed binary paths were listed, and broader recovery-state context was not provided.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertions pass**

> The replacement text matches the stated intent: it explains that the submitted version is no longer current without asserting that the original request was rejected or completed. The change preserves the function's interface and introduces no demonstrated blocking defect.
>
> Review was limited to the supplied text-only diff. Callers and recovery-state logic were not provided, so whether this message is shown exclusively for exact-version conflicts could not be assessed. No tests were supplied or executed by this reviewer. There were no unreviewed binary paths.

**R2: pass (matches oracle); assertions pass**

> No blocking defect is demonstrated. The replacement text matches the stated intent: it explains that the submitted version is no longer current without asserting rejection or definite completion of the original request. The function signature and return type remain unchanged.
>
> Review is limited to the supplied one-line message change. Call sites and recovery-state logic were not provided, so whether this message is displayed exclusively for exact-version conflicts cannot be verified. No tests were supplied or executed by this reviewer. There are no listed unreviewed binary paths.

**R3: pass (matches oracle); assertions pass**

> The replacement string in `src/recovery-message.mjs` matches the stated requirement: it explains that the submitted version is not current without asserting that the original request was rejected or completed. No blocking defect is demonstrated by the supplied diff.
>
> Assessment is limited to the wording change. Caller logic and recovery-state definitions were not supplied, so whether this message is displayed only for the appropriate conflict state could not be assessed. No tests were supplied or executed by this reviewer. There are no listed unreviewed binary paths.

</details>

**Author audit:** NONE — All six approve the careful wording and raise no unrelated claim.

### case-17: Keep a review action for a saved settlement after its source row is removed (fail)

**Expected behavior:** A session-level action remains available to reopen the saved settlement receipt.

**Unsupported claims to watch for:**

- Alleging unrelated vulnerabilities or claiming secret disclosure without evidence.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: fail (matches oracle); assertions pass**

> **Blocking finding — `src/settlement-actions.mjs`, `actions`**
>
> The change returns no actions when `_printExists` is false: `return _printExists ? ["review"] : [];`. This contradicts the PR description’s explicit requirement that saved settlement results remain reviewable after their source record is deleted. Reproduction: call `actions({}, false)` (for example, with `node --input-type=module -e 'import { actions } from "./src/settlement-actions.mjs"; console.log(actions({}, false))'`). Expected: `["review"]`, so the saved result can be reviewed; actual: `[]`, so the review action is unavailable. The changed conditional introduces this behavior; the prior implementation returned `["review"]` regardless of source existence. Tests were not executed by this reviewer.
>
> Assessment is limited to the supplied one-file diff; no unreviewed paths were listed.

**R2: fail (matches oracle); assertions pass**

> **Blocking — `src/settlement-actions.mjs`**: The change removes the review action when `_printExists` is false (`return _printExists ? ["review"] : [];`). This contradicts the stated requirement that saved settlement results remain reviewable after their source record is deleted. Calling `actions(savedResult, false)`—the condition after source deletion—should return `["review"]`, but this code returns `[]`. To reproduce, import `actions` and run `assert.deepEqual(actions({}, false), ["review"])`; the assertion fails because the actual result is an empty array. This regression is introduced by the changed conditional; the prior implementation always returned the review action. Tests were not executed by this reviewer. The supplied diff contains only this function, so surrounding call-site behavior could not be assessed.

**R3: fail (matches oracle); assertions pass**

> **Blocking — `src/settlement-actions.mjs`, `actions`**: The PR description says saved settlement results should remain reviewable after their source record is deleted. Before this change, `actions` always returned `["review"]`; the new condition returns `[]` when `_printExists` is false. For a saved result whose source print has been removed, the expected action is `["review"]`, but this implementation supplies no review action. This behavior is introduced by the PR. A confirming test is to call `actions(savedResult, false)` and assert that the result equals `["review"]`; the changed conditional instead returns `[]`. Tests were not executed by this reviewer. The assessment is limited to the supplied diff and paths.

#### gpt-6.1-sol

**R1: fail (matches oracle); assertions pass**

> ### Blocking: Removing the source print removes the required review action
>
> - **Location:** `src/settlement-actions.mjs:2`.
> - **Evidence:** The explicit requirement says saved settlement results must remain reviewable after source-record deletion. The new expression `_printExists ? ["review"] : []` returns no actions when the source print does not exist; `_result` provides no recovery branch.
> - **Trigger:** Request actions for a saved settlement after its source print has been deleted, passing `false` as `_printExists`.
> - **Expected:** The returned actions retain `"review"` so the saved result remains reviewable.
> - **Actual:** The function returns `[]`, removing the review action precisely in the required recovery case.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.ok(actions({ saved: true }, false).includes("review"));'` from the repository root. The assertion fails because the false branch returns an empty array regardless of the result object.
> - **PR attribution:** Previously, the function always returned `["review"]`, including when the source print was absent. This change introduces the loss of that action.
>
> The implementation is otherwise simple and idiomatic, but no tests were supplied for the recovery requirement. Review was limited to the supplied diff and PR context; callers, persistence behavior, and UI integration were not provided. There were no listed unreviewed binary paths. Tests were not executed by this reviewer.

**R2: fail (matches oracle); assertions pass**

> ### Blocking: Removing the source record removes the required review action
>
> - **Location:** `src/settlement-actions.mjs:2`, the new conditional return in `actions`.
> - **Evidence:** The explicit requirement says saved settlement results must remain reviewable after source-record deletion. However, `actions(_result, false)` now returns `[]`, whereas the previous implementation returned `["review"]` regardless of source existence.
> - **Trigger:** A saved settlement result remains available, but its source print has been deleted, so `_printExists` is `false`.
> - **Expected:** The returned actions include `"review"` so the saved result retains its review action.
> - **Actual:** The function returns no actions. There is no fallback or recovery branch in the supplied code; `_result` is ignored.
> - **Confirming test:** From the repository root, run `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.ok(actions({ saved: true }, false).includes("review"));'`. This assertion fails because the new false branch returns an empty array. It would pass before this change.
> - **PR attribution:** This change introduces the regression by replacing the unconditional review action with a source-existence check, directly contradicting the stated deleted-source recovery requirement.
>
> **Scope and validation:** Review was limited to the supplied diff and PR metadata; callers, UI behavior, and any separate recovery mechanisms were not supplied. No paths were listed as unreviewed binaries. No tests were supplied, and tests were not executed by this reviewer.

**R3: fail (matches oracle); assertions pass**

> ### Blocking: Source deletion removes the required review action
>
> - **Location:** `src/settlement-actions.mjs:2`.
> - **Evidence:** The explicit requirement says saved settlement results must remain reviewable after source-record deletion. The changed return statement produces `[]` whenever `_printExists` is false, instead of the previous `["review"]`.
> - **Trigger:** Call `actions(savedResult, false)` for a saved settlement whose source print has been deleted.
> - **Expected:** The returned actions include `"review"`, preserving access to review the saved result.
> - **Actual:** The function returns an empty array, removing the review action in precisely the recovery case this PR is intended to support.
> - **Confirming test:** Run `node --input-type=module -e 'import assert from "node:assert/strict"; import { actions } from "./src/settlement-actions.mjs"; assert.ok(actions({}, false).includes("review"));'`. This assertion fails because the new false branch returns `[]`; it passes with the previous implementation.
> - **PR attribution:** The new conditional introduces this regression; previously the review action was returned regardless of source existence.
>
> **Limits:** Review was limited to the supplied diff and description; callers and broader recovery behavior were not supplied. No binary paths were listed as unreviewed. Tests were not executed by this reviewer, and no test changes were supplied.

</details>

**Author audit:** NONE — All six say the review action disappears; none says the saved result itself is deleted.

### case-18: Preserve in-session access to a saved settlement receipt (pass)

**Expected behavior:** The user can reopen the saved settlement result for the current session.

**Unsupported claims to watch for:**

- Claiming the change bypasses an unstated policy or introduces unrelated risk.

<details>
<summary>Show all six model summaries</summary>

#### gpt-6-luna

**R1: pass (matches oracle); assertions pass**

> The change makes `actions` return `review` regardless of whether the source print exists, matching the stated goal for a saved settlement result. This function only returns an action list; the diff shows no settlement-state mutation. The supplied material does not establish that `actions` is called when there is no saved result, so an unintended action in that scenario is not demonstrated. Tests were not executed by this reviewer; no test files or additional context were supplied.

**R2: pass (matches oracle); assertions pass**

> The change makes `actions` always return `review`, matching the stated goal of keeping review available when a saved settlement’s source print is absent. The supplied material does not establish that this function is called for results other than saved settlement results, so unconditional availability is not a demonstrated defect. Tests were not executed by this reviewer. Assessment is limited to the supplied diff; no test changes or additional caller context were provided.

**R3: pass (matches oracle); assertions pass**

> The change unconditionally returns `review`, preserving the action when the source print is absent and leaving settlement state untouched in the supplied function. The diff provides no evidence that this function is called for results other than saved settlements, so broader action availability cannot be established as a defect. No tests were included, and tests were not executed by this reviewer; surrounding callers and behavior were not supplied.

#### gpt-6.1-sol

**R1: pass (matches oracle); assertions pass**

> The change makes `actions()` return `["review"]` regardless of source-print availability, matching the stated requirement. The function does not mutate either argument or any settlement state; it only returns a new array. No blocking defect is demonstrated by the supplied diff.
>
> No tests were supplied or executed by this reviewer. Useful regression coverage would assert that both `actions(savedResult, true)` and `actions(savedResult, false)` return `["review"]` without modifying `savedResult`.
>
> Review was limited to the supplied function and diff; callers, receipt retrieval, and the review handler were not provided, so end-to-end receipt access could not be assessed. No unreviewed binary paths were listed.

**R2: pass (matches oracle); assertions pass**

> No blocking defect is demonstrated. In `src/settlement-actions.mjs`, returning `["review"]` unconditionally preserves the review action when the source print is absent, while retaining the existing action when it is present. The function does not mutate either argument or settlement state.
>
> No tests are supplied. Useful coverage would assert `["review"]` for both values of `_printExists` and verify that the saved result remains unchanged.
>
> This assessment is limited to the supplied one-line change; callers and the review-action implementation are not shown, so end-to-end receipt access cannot be verified. No binary or unreviewed paths were listed. Tests were not executed by this reviewer.

**R3: pass (matches oracle); assertions pass**

> No blocking defect demonstrated. In `src/settlement-actions.mjs`, `actions()` now returns `["review"]` regardless of `_printExists`, preserving the review action when the source print is absent while leaving the existing action unchanged when it is present. The function does not mutate either argument or any settlement state.
>
> No tests were supplied or executed by this reviewer. Useful regression coverage would assert `["review"]` for both values of `_printExists` and confirm that the supplied result remains unchanged. Analysis is limited to the supplied function; callers, receipt persistence, and the review handler were not provided, so end-to-end receipt access cannot be established. No unreviewed binary paths were listed.

</details>

**Author audit:** NONE — All six confirm the review action remains available; none claims the saved result is changed or deleted.
