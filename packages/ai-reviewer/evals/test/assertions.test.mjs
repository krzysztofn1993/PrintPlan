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
