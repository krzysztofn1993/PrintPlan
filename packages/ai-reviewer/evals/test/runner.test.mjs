import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { runEvaluation } from "../runner.mjs";
import { digest } from "../policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pricing = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
const promptContents = { system: "trusted-system", criteria: "trusted-criteria" };
const promptDigest = digest(JSON.stringify([promptContents.system, promptContents.criteria]));
const models = ["gpt-5.4-mini", "gpt-5.4"];
const expected = {
  runnerDigest: "a".repeat(64),
  corpusDigest: "b".repeat(64),
  schemaDigest: "c".repeat(64),
  pricingDigest: digest(pricing),
  pricing,
};
function approved(mode, selected) {
  return {
    enabled: true,
    mode,
    models: selected,
    requestCount: selected.length * 9,
    repetitions: 3,
    usdLimit: 1,
    approvalId: "human-approval",
    expiresAt: "2999-01-01T00:00:00Z",
    ...expected,
    promptDigest,
    maxInputTokens: 1000,
    maxOutputTokens: 1000,
    ...(mode === "gate"
      ? {
          recurringAuthorized: true,
          candidatePaths: [
            "packages/ai-reviewer/prompts/code-review/system.md",
            "packages/ai-reviewer/prompts/code-review/criteria.md",
          ],
          maxPromptBytes: 65536,
        }
      : {}),
  };
}
function successfulReviewer(order) {
  return async ({ input, model }) => {
    const index = input.title.includes("case") ? input.title : input.paths[0];
    order.push({ model, path: input.paths[0] });
    return {
      status: "completed",
      review: {
        implementationCorrectness: 8,
        idiomaticity: 8,
        complexity: 8,
        testRiskCoverage: 8,
        documentation: 8,
        securitySafety: 8,
        verdict: "fail",
        summary: "getAvailableGrams adds reserved grams and inflates availability to 238 g.",
      },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      requestId: "resp_test",
      timing: null,
      index,
    };
  };
}

test("fake comparison runs exactly 18 or 27 calls in fixed model/case/repetition order", async () => {
  for (const selected of [models]) {
    const order = [];
    const result = await runEvaluation({
      approval: approved("comparison", selected),
      mode: "comparison",
      expected,
      promptContents,
      reviewer: successfulReviewer(order),
    });
    assert.equal(order.length, selected.length * 9);
    assert.equal(result.matrix.length, selected.length * 9);
    assert.equal(order[0].path, "src/spool-availability.mjs");
    assert.deepEqual(
      order.slice(0, 3).map((entry) => entry.path),
      Array(3).fill(order[0].path),
    );
    assert.equal(order[3].path, order[0].path);
    assert.notEqual(order[6].path, order[0].path);
    assert.deepEqual(
      order.slice(0, 9).map((entry) => entry.model),
      Array(9).fill(selected[0]),
    );
    assert.deepEqual(
      order.slice(9, 18).map((entry) => entry.model),
      Array(9).fill(selected[1]),
    );
  }
});

test("fake gate runs nine calls; first operational failure stops and marks remaining cells not-run", async () => {
  const order = [];
  const result = await runEvaluation({
    approval: approved("gate", [models[0]]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 9,
    reviewer: successfulReviewer(order),
  });
  assert.equal(order.length, 9);
  assert.equal(result.matrix.length, 9);
  let calls = 0;
  const failed = await runEvaluation({
    approval: approved("gate", [models[0]]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 9,
    reviewer: async () => {
      calls++;
      return { status: "error", error: { code: "HTTP_429" }, usage: null };
    },
  });
  assert.equal(calls, 1);
  assert.equal(failed.totals.errors, 1);
  assert.equal(failed.totals.notRun, 8);
});

test("unknown usage and unpriced models fail closed before further reviewer calls", async () => {
  let calls = 0;
  const missingUsage = await runEvaluation({
    approval: approved("gate", [models[0]]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 9,
    reviewer: async () => {
      calls++;
      return { status: "completed", review: { verdict: "pass", summary: "ok" }, usage: null };
    },
  });
  assert.equal(calls, 1);
  assert.equal(missingUsage.matrix[0].error, "UNKNOWN_USAGE");
  calls = 0;
  const unknownRate = await runEvaluation({
    approval: approved("gate", ["unpriced-model"]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 9,
    reviewer: async () => {
      calls++;
    },
  });
  assert.equal(calls, 0);
  assert.equal(unknownRate.totals.errors, 1);
  assert.equal(unknownRate.totals.notRun, 8);
});
