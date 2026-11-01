import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { validateContext } from "../src/contracts/validate.mjs";

const sha = /^[a-f0-9]{64}$/;
export const REQUESTS_PER_CASE = 3;
export function digest(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export function validateApproval(approval, expected) {
  if (!approval || approval.enabled !== true || !Number.isFinite(approval.usdLimit) || approval.usdLimit <= 0)
    throw new Error("APPROVAL_REQUIRED");
  if (Date.parse(approval.expiresAt) <= Date.now()) throw new Error("APPROVAL_EXPIRED");
  for (const key of ["runnerDigest", "corpusDigest", "schemaDigest", "pricingDigest"])
    if (!sha.test(approval[key]) || approval[key] !== expected[key]) throw new Error("APPROVAL_MISMATCH");
  if (approval.repetitions !== REQUESTS_PER_CASE || !approval.approvalId?.trim()) throw new Error("APPROVAL_MISMATCH");
  if (expected.promptDigest && approval.promptDigest !== expected.promptDigest) throw new Error("APPROVAL_MISMATCH");
  if (approval.mode === "comparison") {
    if (
      !Number.isSafeInteger(approval.maxInputTokens) ||
      approval.maxInputTokens < 1 ||
      !Number.isSafeInteger(approval.maxOutputTokens) ||
      approval.maxOutputTokens < 1
    )
      throw new Error("APPROVAL_MISMATCH");
    if (![2, 3].includes(approval.models?.length) || new Set(approval.models).size !== approval.models.length)
      throw new Error("APPROVAL_MISMATCH");
    if (approval.requestCount !== 3 * approval.models.length * REQUESTS_PER_CASE) throw new Error("APPROVAL_MISMATCH");
  } else if (approval.mode === "gate") {
    if (
      approval.models?.length !== 1 ||
      approval.requestCount !== 9 ||
      approval.recurringAuthorized !== true ||
      !Number.isSafeInteger(approval.maxOutputTokens) ||
      approval.maxOutputTokens < 1
    )
      throw new Error("APPROVAL_MISMATCH");
    if (
      approval.candidatePaths?.join("\n") !==
      "packages/ai-reviewer/prompts/code-review/system.md\npackages/ai-reviewer/prompts/code-review/criteria.md"
    )
      throw new Error("APPROVAL_MISMATCH");
    if (
      !Number.isSafeInteger(approval.maxPromptBytes) ||
      approval.maxPromptBytes < 1 ||
      !Number.isSafeInteger(approval.maxInputTokens) ||
      approval.maxInputTokens < 1
    )
      throw new Error("APPROVAL_MISMATCH");
  } else throw new Error("APPROVAL_MISMATCH");
  if (!Number.isSafeInteger(approval.requestCount) || approval.requestCount > (approval.mode === "gate" ? 9 : 27))
    throw new Error("APPROVAL_MISMATCH");
  return approval;
}

export async function loadApproval(path, expected) {
  const approval = JSON.parse(await readFile(path, "utf8"));
  if (approval.enabled !== true) throw new Error("APPROVAL_REQUIRED");
  return validateApproval(approval, expected);
}

export function reserveCall({ approval, expected, model, caseId, promptDigest, used, usdReserved }) {
  validateApproval(approval, {
    ...expected,
    ...(approval.mode === "comparison" ? { promptDigest: approval.promptDigest } : {}),
  });
  if (!approval.models.includes(model) || !["case-01", "case-02", "case-03"].includes(caseId))
    throw new Error("UNTRUSTED_EVAL_INPUT");
  if (approval.mode === "comparison" && approval.promptDigest !== promptDigest) throw new Error("APPROVAL_MISMATCH");
  if (used >= approval.requestCount) throw new Error("REQUEST_LIMIT");
  const rate = expected.pricing?.models?.[model];
  if (!rate) throw new Error("UNKNOWN_RATE");
  const callReserve =
    (approval.maxInputTokens * rate.inputPerMillion + approval.maxOutputTokens * rate.outputPerMillion) / 1_000_000;
  if (!Number.isFinite(usdReserved) || usdReserved < 0 || usdReserved + callReserve > approval.usdLimit)
    throw new Error("BUDGET_LIMIT");
  return true;
}

export function validEvalContext() {
  return validateContext({
    repository: "printplan/eval-fixtures",
    pr: 1,
    head: "a".repeat(40),
    base: "b".repeat(40),
    mergeBase: "b".repeat(40),
    runId: "1",
    runAttempt: 1,
  });
}
