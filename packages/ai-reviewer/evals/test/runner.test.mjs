import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { cli, runEvaluation, runOfflineFakeMatrix } from "../runner.mjs";
import { digest } from "../policy.mjs";
import { ALL_CASE_IDS, HOLDOUT_CASE_IDS } from "../cases/catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pricing = JSON.parse(await readFile(resolve(root, "pricing.json"), "utf8"));
const promptContents = { system: "trusted-system", criteria: "trusted-criteria" };
const promptDigest = digest(JSON.stringify([promptContents.system, promptContents.criteria]));
const issuedAt = new Date().toISOString();
const models = ["gpt-6-luna", "gpt-6.1-sol"];
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
    caseIds: mode === "gate" ? ALL_CASE_IDS : HOLDOUT_CASE_IDS,
    requestCount: (mode === "gate" ? ALL_CASE_IDS.length : HOLDOUT_CASE_IDS.length) * selected.length * 3,
    repetitions: 3,
    usdLimit: 1,
    approvalId: "human-approval",
    invocationId: "invocation-runner-a1",
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + 24 * 60 * 60 * 1000).toISOString(),
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

test("fake holdout comparison runs exactly 72 or 108 calls in fixed model/case/repetition order", async () => {
  for (const selected of [models]) {
    const order = [];
    const result = await runEvaluation({
      approval: approved("comparison", selected),
      mode: "comparison",
      expected,
      promptContents,
      reviewer: successfulReviewer(order),
    });
    assert.equal(order.length, selected.length * 36);
    assert.equal(result.matrix.length, selected.length * 36);
    assert.equal(order[0].path, "src/lib/cookie-policy.mjs");
    assert.deepEqual(
      order.slice(0, 3).map((entry) => entry.path),
      Array(3).fill(order[0].path),
    );
    assert.equal(order[3].path, order[0].path);
    assert.notEqual(order[6].path, order[0].path);
    assert.deepEqual(
      order.slice(0, 36).map((entry) => entry.model),
      Array(36).fill(selected[0]),
    );
    assert.deepEqual(
      order.slice(36, 72).map((entry) => entry.model),
      Array(36).fill(selected[1]),
    );
  }
});

test("fake gate runs 54 calls; first operational failure stops and marks remaining cells not-run", async () => {
  const order = [];
  const result = await runEvaluation({
    approval: approved("gate", [models[0]]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 54,
    reviewer: successfulReviewer(order),
  });
  assert.equal(order.length, 54);
  assert.equal(result.matrix.length, 54);
  let calls = 0;
  const failed = await runEvaluation({
    approval: approved("gate", [models[0]]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 54,
    reviewer: async () => {
      calls++;
      return { status: "error", error: { code: "HTTP_429" }, usage: null };
    },
  });
  assert.equal(calls, 1);
  assert.equal(failed.totals.errors, 1);
  assert.equal(failed.totals.notRun, 53);
});

test("unknown usage and unpriced models fail closed before further reviewer calls", async () => {
  let calls = 0;
  const missingUsage = await runEvaluation({
    approval: approved("gate", [models[0]]),
    mode: "gate",
    expected,
    promptContents,
    maxCalls: 54,
    reviewer: async () => {
      calls++;
      return { status: "completed", review: { verdict: "pass", summary: "ok" }, usage: null };
    },
  });
  assert.equal(calls, 1);
  assert.equal(missingUsage.matrix[0].error, "UNKNOWN_USAGE");
  calls = 0;
  await assert.rejects(
    runEvaluation({
      approval: approved("gate", ["unpriced-model"]),
      mode: "gate",
      expected,
      promptContents,
      maxCalls: 54,
      reviewer: async () => {
        calls++;
      },
    }),
    /UNKNOWN_RATE/,
  );
  assert.equal(calls, 0);
});

test("holdout cap rejects a full-corpus comparison when aggregate conservative reserve is too high", async () => {
  let calls = 0;
  const approval = {
    ...approved("comparison", models),
    caseIds: ALL_CASE_IDS,
    requestCount: ALL_CASE_IDS.length * models.length * 3,
    maxInputTokens: 12_000,
    maxOutputTokens: 8_000,
    usdLimit: 4.5,
  };
  await assert.rejects(
    runEvaluation({ approval, mode: "comparison", expected, promptContents, reviewer: async () => calls++ }),
    /BUDGET_LIMIT/,
  );
  assert.equal(calls, 0);
});

test("saved 72-response matrix replays through Promptfoo offline without inference", async () => {
  const report = await cli(["replay"]);
  assert.equal(report.runType, "saved-matrix-replay");
  assert.equal(report.manifest.inferencePerformed, false);
  assert.equal(report.matrix.length, 72);
  assert.equal(report.totals.requestAttempts, 0);
  assert.equal(report.cost.estimatedUsd, 0);
  assert.ok(report.cost.sourceHistoricalUsd > 0);
  assert.equal(report.evaluationEngine.name, "Promptfoo CLI");
});

test("Promptfoo CLI executes offline fake comparison and full-corpus gate matrix sizes", async () => {
  const comparison = await runOfflineFakeMatrix();
  assert.equal(comparison.evaluationEngine.name, "Promptfoo CLI");
  assert.equal(comparison.runType, "offline-fake-execution");
  assert.equal(comparison.matrix.length, 72);
  assert.equal(comparison.totals.requestAttempts, 0);
  const gate = await runOfflineFakeMatrix({ mode: "gate", models: [models[0]] });
  assert.equal(gate.matrix.length, 54);
  assert.equal(gate.totals.requestAttempts, 0);
});
