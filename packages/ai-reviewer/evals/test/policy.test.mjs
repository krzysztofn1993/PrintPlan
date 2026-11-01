import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import { reserveCall, validateApproval } from "../policy.mjs";
import { ALL_CASE_IDS } from "../cases/catalog.mjs";

const issuedAt = new Date().toISOString();
const approval = {
  enabled: true,
  mode: "comparison",
  models: ["m1", "m2"],
  caseIds: Array.from({ length: 12 }, (_, index) => `case-${String(index + 7).padStart(2, "0")}`),
  requestCount: 72,
  repetitions: 3,
  usdLimit: 1,
  approvalId: "human-approved",
  invocationId: "invocation-20261101-a1",
  issuedAt,
  expiresAt: new Date(Date.parse(issuedAt) + 24 * 60 * 60 * 1000).toISOString(),
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
      caseId: "case-07",
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
      validateApproval(
        { ...approval, expiresAt: new Date(Date.parse(issuedAt) + 25 * 60 * 60 * 1000).toISOString() },
        expected,
      ),
    /APPROVAL_MISMATCH/,
  );
  assert.throws(
    () =>
      reserveCall({
        approval,
        expected,
        model: "m1",
        caseId: "case-07",
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
        caseId: "case-07",
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
        caseId: "case-07",
        promptDigest: approval.promptDigest,
        used: 72,
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
        caseId: "case-07",
        promptDigest: approval.promptDigest,
        used: 0,
        usdReserved: 2,
      }),
    /BUDGET_LIMIT/,
  );
  assert.throws(() => validateApproval({ ...approval, requestCount: 36 }, expected), /APPROVAL_MISMATCH/);
  assert.throws(
    () => validateApproval({ ...approval, caseIds: ["case-08", ...approval.caseIds.slice(1)] }, expected),
    /APPROVAL_MISMATCH/,
  );
});

test("local comparison approval replay is rejected in a new process before a provider call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reviewer-approval-ledger-"));
  try {
    const policyUrl = new URL("../policy.mjs", import.meta.url).href;
    const script = `
      import { consumeComparisonApproval } from ${JSON.stringify(policyUrl)};
      const [approvalJson, ledgerDirectory] = process.argv.slice(1);
      const approval = JSON.parse(approvalJson);
      let fetchCalls = 0;
      const fakeFetch = async () => { fetchCalls += 1; };
      try {
        await consumeComparisonApproval(approval, { ledgerDirectory });
        await fakeFetch();
        process.stdout.write(JSON.stringify({ status: "accepted", fetchCalls, pid: process.pid }));
      } catch (error) {
        process.stdout.write(JSON.stringify({ status: error.message, fetchCalls, pid: process.pid }));
      }
    `;
    const runProcess = () => {
      const child = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", script, JSON.stringify(approval), directory],
        { encoding: "utf8", timeout: 5_000 },
      );
      assert.equal(child.status, 0, child.stderr);
      return JSON.parse(child.stdout);
    };

    const first = runProcess();
    const replay = runProcess();
    assert.equal(first.status, "accepted");
    assert.equal(first.fetchCalls, 1);
    assert.equal(replay.status, "APPROVAL_CONSUMED");
    assert.equal(replay.fetchCalls, 0);
    assert.notEqual(first.pid, replay.pid);

    const files = await import("node:fs/promises").then(({ readdir }) => readdir(directory));
    const marker = JSON.parse(await readFile(join(directory, files[0]), "utf8"));
    assert.equal(marker.approvalId, approval.approvalId);
    assert.equal(marker.invocationId, approval.invocationId);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("gate approval is limited to the ordered full 18-case corpus and 54 calls", () => {
  const gate = {
    ...approval,
    mode: "gate",
    models: ["m1"],
    caseIds: [...ALL_CASE_IDS],
    requestCount: 54,
    recurringAuthorized: true,
    candidatePaths: [
      "packages/ai-reviewer/prompts/code-review/system.md",
      "packages/ai-reviewer/prompts/code-review/criteria.md",
    ],
    maxPromptBytes: 65536,
  };
  assert.equal(validateApproval(gate, expected), gate);
  assert.throws(
    () => validateApproval({ ...gate, caseIds: [...ALL_CASE_IDS].reverse() }, expected),
    /APPROVAL_MISMATCH/,
  );
  assert.throws(() => validateApproval({ ...gate, requestCount: 18 }, expected), /APPROVAL_MISMATCH/);
});
