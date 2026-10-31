import test from "node:test";
import assert from "node:assert/strict";
import {
  validateReview,
  parseReview,
  codePasses,
  validateEnvelope,
  reviewSchema,
  scoreFields,
} from "../src/contracts/validate.mjs";
import { review, envelope, context } from "./fixtures/review.mjs";

test("review has exactly six course dimensions and eight fields", () => {
  assert.deepEqual(scoreFields, [
    "implementationCorrectness",
    "idiomaticity",
    "complexity",
    "testRiskCoverage",
    "documentation",
    "securitySafety",
  ]);
  assert.deepEqual(Object.keys(reviewSchema.properties), [...scoreFields, "verdict", "summary"]);
  for (const field of scoreFields) {
    for (const value of [1, 1.5, 10]) assert.equal(validateReview({ ...review, [field]: value })[field], value);
    for (const value of [0, 10.01, NaN, Infinity, -Infinity, null, "8"])
      assert.throws(() => validateReview({ ...review, [field]: value }));
  }
});

test("missing and extra fields, invalid verdict and summary fail closed", () => {
  for (const field of Object.keys(review)) {
    const invalid = { ...review };
    Reflect.deleteProperty(invalid, field);
    assert.throws(() => validateReview(invalid));
  }
  for (const invalid of [
    { ...review, extra: true },
    { ...review, verdict: "approved" },
    { ...review, summary: "" },
    { ...review, summary: " \n\t" },
    { ...review, summary: "x".repeat(12001) },
  ])
    assert.throws(() => validateReview(invalid));
  assert.equal(validateReview({ ...review, summary: "x".repeat(12000) }).summary.length, 12000);
  for (const text of [
    "```json\n" + JSON.stringify(review) + "\n```",
    JSON.stringify(review).slice(0, -1),
    "null",
    "[]",
    " ",
    "x".repeat(65537),
  ])
    assert.throws(() => parseReview(text));
  assert.deepEqual(parseReview(JSON.stringify(review)), review);
});

test("code gate uses verdict only after validation", () => {
  const low = { ...review, ...Object.fromEntries(scoreFields.map((field) => [field, 1])) };
  const high = { ...review, ...Object.fromEntries(scoreFields.map((field) => [field, 10])), verdict: "fail" };
  assert.equal(codePasses(low), true);
  assert.equal(codePasses(high), false);
  assert.throws(() => codePasses({ verdict: "pass" }));
});

test("envelopes bind reviews to expected immutable context", () => {
  assert.equal(validateEnvelope(envelope(), context).status, "completed");
  for (const field of Object.keys(context)) {
    const expected = { ...context, [field]: field === "pr" || field === "runAttempt" ? 2 : "other" };
    assert.throws(() => validateEnvelope(envelope(), expected), /CONTEXT_MISMATCH/);
  }
  for (const field of Object.keys(envelope())) {
    const value = envelope();
    Reflect.deleteProperty(value, field);
    assert.throws(() => validateEnvelope(value));
  }
  for (const patch of [
    { version: 2 },
    { model: "" },
    { requestId: "" },
    { status: "pass" },
    { prompt: { id: "../code-review", digest: "d".repeat(64) } },
    { usage: { inputTokens: -1 } },
    { timing: { startedAt: "invalid", completedAt: "invalid" } },
    { review: null },
    { error: { code: "ERROR", message: "safe" } },
  ])
    assert.throws(() => validateEnvelope({ ...envelope(), ...patch }));
  assert.throws(() => validateEnvelope({ ...envelope(), extra: true }));
  assert.throws(() => validateEnvelope({ ...envelope(), context: { ...context, head: "bad" } }));
  assert.equal(
    validateEnvelope({
      ...envelope(),
      timing: { startedAt: "2026-10-29T10:00:00Z", completedAt: "2026-10-29T10:01:00Z" },
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    }).status,
    "completed",
  );
});

test("operational errors and superseded runs never manufacture verdicts", () => {
  for (const status of ["error", "superseded"]) {
    const value = {
      ...envelope(),
      status,
      review: null,
      error: { code: "PREPARATION_FAILED", message: "Review input could not be prepared." },
    };
    assert.equal(validateEnvelope(value).review, null);
    assert.throws(() => validateEnvelope({ ...value, review }));
    assert.throws(() => validateEnvelope({ ...value, error: null }));
  }
});
