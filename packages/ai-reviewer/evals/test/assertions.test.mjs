import assert from "node:assert/strict";
import test from "node:test";
import { assertCase, evaluateCase } from "../assertions.mjs";

const oracle = (expectedVerdict) => ({ expectedVerdict });
const review = (verdict, summary, overrides = {}) => ({
  implementationCorrectness: 8,
  idiomaticity: 7,
  complexity: 8,
  testRiskCoverage: 7,
  documentation: 7,
  securitySafety: 8,
  verdict,
  summary,
  ...overrides,
});

test("accepts correct known findings with bounded wording variants", () => {
  assert.equal(
    assertCase(
      "case-02",
      review("fail", "getAvailableGrams adds reserved grams; 238 g is overstated and permits over-reservation."),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-03",
      review(
        "fail",
        "reservation-capacity double counts this own hold; the 3 g capacity releases a valid reservation.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-01",
      review("pass", "The validation guards preserve the available stock calculation."),
      oracle("pass"),
    ).passed,
    true,
  );
});

test("accepts equivalent impact descriptions without accepting verdict-only findings", () => {
  assert.equal(
    assertCase(
      "case-02",
      review(
        "fail",
        "In getAvailableGrams, the calculation changes from recordedGrams - reservedGrams to recordedGrams + reservedGrams. A valid spool with 140 g recorded and 35 g reserved returns 175 g instead of 105 g, so a caller may treat reserved material as available.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-02",
      review(
        "fail",
        "getAvailableGrams replaces subtraction with addition, so reserved stock is counted as extra available stock.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-03",
      review(
        "fail",
        "reservation-capacity double-counts this print's own hold and returns the old 24 g hold instead of the requested 37 g, although the edited request fits.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-03",
      review(
        "fail",
        "resizeReservation subtracts ownHold from capacity and returns a release even though the existing 19 g reservation fits after other holds are excluded.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-05",
      review(
        "fail",
        "settlement-replay removes the existing receipt lookup and early return for state.receipts[requestId]. Every call subtracts actual, replaces the receipt, and returns replayed: false even when the same request ID already has a receipt.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    assertCase(
      "case-05",
      review(
        "fail",
        "settlement-replay removes the return of the existing receipt; on retry it replaces the saved receipt and reports replayed: false.",
      ),
      oracle("fail"),
    ).passed,
    true,
  );
});

test("requires a concrete consequence in addition to location and mechanism", () => {
  assert.equal(
    evaluateCase(
      "case-02",
      review("fail", "spool-availability getAvailableGrams adds the reserved grams."),
      oracle("fail"),
    ).passed,
    false,
  );
  assert.equal(
    evaluateCase("case-03", review("fail", "reservation-capacity double-counts this print's own hold."), oracle("fail"))
      .passed,
    false,
  );
  assert.equal(
    evaluateCase(
      "case-05",
      review("fail", "settlement-replay removes the existing receipt replay guard."),
      oracle("fail"),
    ).passed,
    false,
  );
  assert.equal(evaluateCase("case-02", review("fail", "A bug exists."), oracle("fail")).passed, false);
});

test("rejects verdict-only, unrelated, and incomplete finding summaries", () => {
  for (const summary of [
    "A bug exists.",
    "The test naming is inconsistent.",
    "getAvailableGrams adds reserved grams.",
  ]) {
    const result = evaluateCase("case-02", review("fail", summary), oracle("fail"));
    assert.equal(result.passed, false);
  }
  assert.equal(evaluateCase("case-02", review("pass", "No issue."), oracle("fail")).verdictMatches, false);
  assert.equal(evaluateCase("case-03", review("pass", "Looks good."), oracle("fail")).verdictMatches, false);
});

test("requires distinct settlement, retry, and cancellation findings in added cases", () => {
  assert.equal(
    evaluateCase(
      "case-04",
      review("fail", "remainingStock loses its zero clamp; 100 minus 130 leaves -30 g."),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    evaluateCase(
      "case-05",
      review("fail", "settle removes the idempotent replay check, deducting the same request again to 0 g."),
      oracle("fail"),
    ).passed,
    true,
  );
  assert.equal(
    evaluateCase(
      "case-06",
      review("fail", "cancelUntilFits sorts oldest-first, cancelling the wrong reservation."),
      oracle("fail"),
    ).passed,
    true,
  );
});

test("holdout defect anchors require location, mechanism, and concrete consequence", () => {
  const examples = [
    [
      "case-07",
      "cookieOptions disables Secure on HTTPS, so the session cookie may be sent over an unencrypted HTTP request.",
      "cookieOptions disables Secure when transport is HTTPS.",
    ],
    [
      "case-09",
      "retryListRefresh passes editingPrintId as conflictId, bypassing confirmDiscard; the refresh can discard the user's unsaved form edits.",
      "retryListRefresh bypasses confirmDiscard on Try again, but the finding does not describe a user-visible consequence.",
    ],
    [
      "case-11",
      "DIFF_LIMIT drops to 256 KiB, truncating a large patch; --no-renames can represent a move as delete/add.",
      "DIFF_LIMIT changes and rename detection is disabled for a move.",
    ],
    [
      "case-13",
      "acceptsReservation ignores the margin calculation and accepts 1 g in both fields instead of 110 g.",
      "acceptsReservation ignores the configured margin.",
    ],
    [
      "case-15",
      "recoveryMessage says the request was rejected even though the original write may have committed, inviting a duplicate action.",
      "recoveryMessage reports rejection after a version conflict.",
    ],
    [
      "case-17",
      "actions removes the review action after source deletion, leaving the saved settlement receipt unavailable.",
      "actions conditions the review action on printExists after source deletion.",
    ],
  ];
  for (const [caseId, summary, withoutConsequence] of examples) {
    assert.equal(assertCase(caseId, review("fail", summary), oracle("fail")).passed, true, caseId);
    assert.equal(evaluateCase(caseId, review("fail", withoutConsequence), oracle("fail")).passed, false, caseId);
  }
});

test("uses the production eight-field schema for object and JSON responses", () => {
  assert.throws(() => evaluateCase("case-01", "{not json", oracle("pass")), /INVALID_REVIEW/);
  assert.throws(() => evaluateCase("case-01", review("pass", "ok", { extra: true }), oracle("pass")), /INVALID_REVIEW/);
  assert.throws(
    () => evaluateCase("case-01", review("pass", "ok", { documentation: Number.NaN }), oracle("pass")),
    /INVALID_REVIEW/,
  );
  assert.throws(
    () => evaluateCase("case-01", review("pass", "ok", { documentation: 11 }), oracle("pass")),
    /INVALID_REVIEW/,
  );
  assert.throws(() => evaluateCase("case-01", review("pass", "   "), oracle("pass")), /INVALID_REVIEW/);
  assert.throws(() => evaluateCase("case-01", review("pass", "x".repeat(12001)), oracle("pass")), /INVALID_REVIEW/);
  assert.throws(() => evaluateCase("case-01", review("maybe", "ok"), oracle("pass")), /INVALID_REVIEW/);
});
