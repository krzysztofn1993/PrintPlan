import { createHash } from "node:crypto";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContext } from "../src/contracts/validate.mjs";
import { LIMITS } from "../src/config.mjs";
import { ALL_CASE_IDS, validCaseSet } from "./cases/catalog.mjs";

const sha = /^[a-f0-9]{64}$/;
export const REQUESTS_PER_CASE = 3;
export const MAX_APPROVAL_LIFETIME_MS = 24 * 60 * 60 * 1000;
const defaultLedgerDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "reports/consumed-approvals");
export function digest(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export function validateApproval(approval, expected) {
  if (!approval || approval.enabled !== true || !Number.isFinite(approval.usdLimit) || approval.usdLimit <= 0)
    throw new Error("APPROVAL_REQUIRED");
  const issuedAt = Date.parse(approval.issuedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  if (!Number.isFinite(issuedAt) || issuedAt > Date.now() + 60_000) throw new Error("APPROVAL_MISMATCH");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("APPROVAL_EXPIRED");
  if (expiresAt - issuedAt > MAX_APPROVAL_LIFETIME_MS) throw new Error("APPROVAL_MISMATCH");
  for (const key of ["runnerDigest", "corpusDigest", "schemaDigest", "pricingDigest"])
    if (!sha.test(approval[key]) || approval[key] !== expected[key]) throw new Error("APPROVAL_MISMATCH");
  if (
    approval.repetitions !== REQUESTS_PER_CASE ||
    !approval.approvalId?.trim() ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(approval.invocationId ?? "")
  )
    throw new Error("APPROVAL_MISMATCH");
  if (expected.promptDigest && approval.promptDigest !== expected.promptDigest) throw new Error("APPROVAL_MISMATCH");
  if (approval.mode === "comparison") {
    if (
      !Number.isSafeInteger(approval.maxInputTokens) ||
      approval.maxInputTokens < 1 ||
      !Number.isSafeInteger(approval.maxOutputTokens) ||
      approval.maxOutputTokens < 1 ||
      approval.maxOutputTokens > LIMITS.outputTokens
    )
      throw new Error("APPROVAL_MISMATCH");
    if (![2, 3].includes(approval.models?.length) || new Set(approval.models).size !== approval.models.length)
      throw new Error("APPROVAL_MISMATCH");
    if (!validCaseSet(approval.caseIds)) throw new Error("APPROVAL_MISMATCH");
    if (approval.requestCount !== approval.caseIds.length * approval.models.length * REQUESTS_PER_CASE)
      throw new Error("APPROVAL_MISMATCH");
  } else if (approval.mode === "gate") {
    if (
      approval.models?.length !== 1 ||
      !validCaseSet(approval.caseIds) ||
      approval.caseIds.length !== ALL_CASE_IDS.length ||
      approval.caseIds.join("\n") !== ALL_CASE_IDS.join("\n") ||
      approval.requestCount !== ALL_CASE_IDS.length * REQUESTS_PER_CASE ||
      approval.recurringAuthorized !== true ||
      !Number.isSafeInteger(approval.maxOutputTokens) ||
      approval.maxOutputTokens < 1 ||
      approval.maxOutputTokens > LIMITS.outputTokens
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
  if (!Number.isSafeInteger(approval.requestCount) || approval.requestCount > (approval.mode === "gate" ? 54 : 162))
    throw new Error("APPROVAL_MISMATCH");
  return approval;
}

/**
 * Atomically consume one local comparison approval before the Promptfoo process starts.
 * This filesystem ledger protects this local checkout across process restarts only; it
 * does not claim replay protection across isolated hosted workflow attempts.
 */
export async function consumeComparisonApproval(approval, { ledgerDirectory = defaultLedgerDirectory } = {}) {
  if (approval?.mode !== "comparison") throw new Error("APPROVAL_MISMATCH");
  const key = digest(`${approval.approvalId}\n${approval.invocationId}`);
  const directory = resolve(ledgerDirectory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory, `${key}.json`);
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("APPROVAL_CONSUMED", { cause: error });
    throw new Error("APPROVAL_LEDGER_UNAVAILABLE", { cause: error });
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({
        approvalId: approval.approvalId,
        invocationId: approval.invocationId,
        consumedAt: new Date().toISOString(),
      })}\n`,
    );
    await handle.sync();
  } catch (error) {
    throw new Error("APPROVAL_LEDGER_UNAVAILABLE", { cause: error });
  } finally {
    await handle.close();
  }
  let directoryHandle;
  try {
    directoryHandle = await open(directory, "r");
    await directoryHandle.sync();
  } catch (error) {
    throw new Error("APPROVAL_LEDGER_UNAVAILABLE", { cause: error });
  } finally {
    await directoryHandle?.close();
  }
  return true;
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
  if (!approval.models.includes(model) || !approval.caseIds.includes(caseId)) throw new Error("UNTRUSTED_EVAL_INPUT");
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
