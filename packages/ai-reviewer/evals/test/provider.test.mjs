import assert from "node:assert/strict";
import test from "node:test";
import { ReviewEvalProvider } from "../provider.mjs";

test("provider maps valid reviewer response and sanitized operational error", async () => {
  const approval = {
    enabled: true,
    mode: "comparison",
    models: ["model-a", "model-b"],
    requestCount: 18,
    repetitions: 3,
    usdLimit: 2,
    approvalId: "approved",
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
        "model-a": { inputPerMillion: 1, outputPerMillion: 1 },
        "model-b": { inputPerMillion: 1, outputPerMillion: 1 },
      },
    },
  };
  const response = {
    implementationCorrectness: 8,
    idiomaticity: 8,
    complexity: 8,
    testRiskCoverage: 8,
    documentation: 8,
    securitySafety: 8,
    verdict: "pass",
    summary: "Guarded subtraction preserves available stock.",
  };
  const provider = new ReviewEvalProvider({
    model: "model-a",
    approval,
    expected,
    promptDigest: approval.promptDigest,
    used: () => 0,
    usdReserved: () => 0,
    review: async () => ({
      status: "completed",
      review: response,
      requestId: "resp_abc",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      timing: null,
    }),
  });
  const result = await provider.callApi("ignored", {
    vars: { caseId: "case-01", input: {}, oracle: { expectedVerdict: "pass" } },
  });
  assert.equal(result.output, JSON.stringify(response));
  assert.deepEqual(result.tokenUsage, { prompt: 1, completion: 2, total: 3 });
  assert.equal(result.metadata.requestId, "resp_abc");
  const failed = new ReviewEvalProvider({
    model: "model-a",
    approval,
    expected,
    promptDigest: approval.promptDigest,
    review: async () => ({ status: "error", error: { code: "HTTP_429", message: "safe" }, usage: null }),
  });
  assert.equal(
    (await failed.callApi("ignored", { vars: { caseId: "case-01", input: {}, oracle: { expectedVerdict: "pass" } } }))
      .error,
    "safe",
  );
});
