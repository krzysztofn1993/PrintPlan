import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { LIMITS } from "../config.mjs";
import { validateContext, validateEnvelope } from "../contracts/validate.mjs";
import { loadPrompt } from "../prompts/load.mjs";
import { requestReview, ReviewResponseError } from "../providers/openai.mjs";

export function assembleInput(input) {
  if (
    !input ||
    typeof input.title !== "string" ||
    typeof input.body !== "string" ||
    typeof input.diff !== "string" ||
    !Array.isArray(input.paths) ||
    !Array.isArray(input.unreviewedPaths)
  )
    throw new Error("INVALID_INPUT");
  if (
    input.paths.length > LIMITS.changedPaths ||
    input.paths.some((path) => typeof path !== "string" || !path) ||
    new Set(input.paths).size !== input.paths.length ||
    input.unreviewedPaths.some((path) => !input.paths.includes(path))
  )
    throw new Error("INPUT_PATHS");
  if (!input.diff.trim() || !input.paths.length || input.paths.every((path) => input.unreviewedPaths.includes(path)))
    throw new Error("UNREVIEWABLE_INPUT");
  const text = JSON.stringify({
    title: input.title,
    body: input.body,
    diff: input.diff,
    paths: input.paths,
    unreviewedPaths: input.unreviewedPaths,
  });
  if (Buffer.byteLength(text, "utf8") > LIMITS.inputBytes) throw new Error("INPUT_SIZE");
  return text;
}

const safeCodes = new Set([
  "CONFIG_REQUIRED",
  "INVALID_INPUT",
  "INPUT_PATHS",
  "UNREVIEWABLE_INPUT",
  "INPUT_SIZE",
  "TRANSPORT_FAILED",
  "DEADLINE_EXCEEDED",
  "INVALID_RESPONSE",
  "INCOMPLETE_RESPONSE",
  "EMPTY_RESPONSE",
  "UNEXPECTED_OUTPUT",
  "REFUSED_RESPONSE",
  "OUTPUT_SIZE",
]);
export function safeError(error) {
  const code =
    safeCodes.has(error?.message) || /^HTTP_(401|403|429|5\d\d)$/.test(error?.message)
      ? error.message
      : "REVIEW_FAILED";
  return { code, message: `Review operation failed (${code}). No code verdict is available.` };
}

export async function reviewChange({
  context,
  input,
  apiKey,
  model,
  fetchImpl,
  deadlineMs,
  promptId = "code-review",
  promptContents,
  onDiagnostic,
}) {
  validateContext(context);
  let prompt = await loadPrompt(promptId);
  if (promptContents !== undefined) {
    if (!promptContents || typeof promptContents.system !== "string" || typeof promptContents.criteria !== "string")
      throw new Error("INVALID_PROMPT");
    prompt = {
      id: promptId,
      system: promptContents.system,
      criteria: promptContents.criteria,
      digest: createHash("sha256")
        .update(JSON.stringify([promptContents.system, promptContents.criteria]))
        .digest("hex"),
    };
  }
  const startedAt = new Date().toISOString();
  const envelope = {
    version: 1,
    context,
    model: model?.trim() || "unconfigured",
    requestId: null,
    prompt: { id: prompt.id, digest: prompt.digest },
    timing: null,
    usage: null,
    status: "error",
    review: null,
    error: null,
  };
  let providerDiagnostics = null;
  try {
    const assembled = assembleInput(input);
    const result = await requestReview({ apiKey, model, prompt, input: assembled, fetchImpl, deadlineMs });
    const { diagnostics, ...reviewResult } = result;
    providerDiagnostics = diagnostics;
    Object.assign(envelope, reviewResult, { status: "completed", error: null });
    validateEnvelope(envelope, context);
    try {
      onDiagnostic?.(diagnostics);
    } catch {
      // Diagnostic consumers must not replace the original review result.
    }
  } catch (error) {
    const safe = safeError(error);
    Object.assign(envelope, {
      status: "error",
      review: null,
      requestId: error instanceof ReviewResponseError ? error.requestId : envelope.requestId,
      usage: error instanceof ReviewResponseError ? error.usage : envelope.usage,
      error: safe,
    });
    let diagnostics;
    if (error instanceof ReviewResponseError) diagnostics = error.diagnostics;
    else if (providerDiagnostics) {
      diagnostics = {
        ...providerDiagnostics,
        category: "review_operation",
        phase: "envelope_validation",
        errorCode: safe.code,
        internalCode: safe.code,
      };
    } else {
      diagnostics = {
        version: 1,
        category: "review_operation",
        phase: "preflight",
        errorCode: safe.code,
        internalCode: null,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - Date.parse(startedAt)),
        deadlineMs: deadlineMs ?? LIMITS.deadlineMs,
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        requestAttempted: false,
        request: null,
        http: null,
        provider: null,
        usage: null,
        causeChain: [],
        aborted: false,
      };
    }
    try {
      onDiagnostic?.(diagnostics);
    } catch {
      // Diagnostic consumers must not replace the original review result.
    }
  }
  envelope.timing = { startedAt, completedAt: new Date().toISOString() };
  return validateEnvelope(envelope, context);
}
