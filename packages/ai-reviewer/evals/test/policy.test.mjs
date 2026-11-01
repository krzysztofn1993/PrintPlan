import assert from "node:assert/strict";
import test from "node:test";
import { reserveCall, validateApproval } from "../policy.mjs";

const approval = {
  enabled: true,
  mode: "comparison",
  models: ["m1", "m2"],
  requestCount: 18,
  repetitions: 3,
  usdLimit: 1,
  approvalId: "human-approved",
  expiresAt: "2999-01-01T00:00:00Z",
  runnerDigest: "a".repeat(64),
  corpusDigest: "b".repeat(64),
  schemaDigest: "c".repeat(64),
  pricingDigest: "d".repeat(64),
  promptDigest: "e".repeat(64),
  maxInputTokens: 1000,
  maxOutputTokens: 1000,
};
const expected = {
  runnerDigest: approval.runnerDigest,
  corpusDigest: approval.corpusDigest,
  schemaDigest: approval.schemaDigest,
  pricingDigest: approval.pricingDigest,
  pricing: {
    models: {
      m1: { inputPerMillion: 0.75, outputPerMillion: 4.5 },
      m2: { inputPerMillion: 0.75, outputPerMillion: 4.5 },
      "model-a": { inputPerMillion: 0.75, outputPerMillion: 4.5 },
      "model-b": { inputPerMillion: 0.75, outputPerMillion: 4.5 },
    },
  },
};

test("approval binds exact identities, prompt, models and request budget", () => {
  assert.equal(
    reserveCall({
      approval,
      expected,
      model: "m1",
      caseId: "case-01",
      promptDigest: approval.promptDigest,
      used: 0,
      usdReserved: 0,
    }),
    true,
  );
  assert.equal(validateApproval(approval, { ...expected, promptDigest: approval.promptDigest }), approval);
  assert.throws(() => validateApproval({ ...approval, enabled: false }, expected), /APPROVAL_REQUIRED/);
  assert.throws(
    () => validateApproval({ ...approval, expiresAt: "2000-01-01T00:00:00Z" }, expected),
    /APPROVAL_EXPIRED/,
  );
  assert.throws(
    () =>
      reserveCall({
        approval,
        expected,
        model: "m1",
        caseId: "case-01",
        promptDigest: "f".repeat(64),
        used: 0,
        usdReserved: 0,
      }),
    /APPROVAL_MISMATCH/,
  );
  assert.throws(
    () =>
      reserveCall({
        approval,
        expected,
        model: "untrusted",
        caseId: "case-01",
        promptDigest: approval.promptDigest,
        used: 0,
        usdReserved: 0,
      }),
    /UNTRUSTED_EVAL_INPUT/,
  );
  assert.throws(
    () =>
      reserveCall({
        approval,
        expected,
        model: "m1",
        caseId: "case-01",
        promptDigest: approval.promptDigest,
        used: 18,
        usdReserved: 0,
      }),
    /REQUEST_LIMIT/,
  );
  assert.throws(
    () =>
      reserveCall({
        approval,
        expected,
        model: "m1",
        caseId: "case-01",
        promptDigest: approval.promptDigest,
        used: 0,
        usdReserved: 2,
      }),
    /BUDGET_LIMIT/,
  );
});
