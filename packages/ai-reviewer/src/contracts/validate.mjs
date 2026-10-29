import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { readFileSync } from "node:fs";
import Ajv from "ajv";

export const reviewSchema = JSON.parse(readFileSync(new URL("./review.schema.json", import.meta.url), "utf8"));
const validate = new Ajv({ strict: true, allErrors: true }).compile(reviewSchema);
export const scoreFields = Object.freeze(
  Object.keys(reviewSchema.properties).filter((key) => !["summary", "verdict"].includes(key)),
);

export function validateReview(value) {
  if (!validate(value)) throw new Error("INVALID_REVIEW: result does not match the review contract");
  return value;
}

export function parseReview(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 64 * 1024)
    throw new Error("INVALID_REVIEW: output size");
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("INVALID_REVIEW: expected a JSON object");
  }
  return validateReview(value);
}

export function codePasses(review) {
  return validateReview(review).verdict === "pass";
}

const contextKeys = ["repository", "pr", "head", "base", "mergeBase", "runId", "runAttempt"];
export function validateContext(context) {
  if (
    !context ||
    typeof context !== "object" ||
    Array.isArray(context) ||
    Object.keys(context).some((key) => !contextKeys.includes(key))
  )
    throw new Error("INVALID_CONTEXT");
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(context.repository) ||
    !Number.isSafeInteger(context.pr) ||
    context.pr < 1
  )
    throw new Error("INVALID_CONTEXT");
  for (const key of ["head", "base", "mergeBase"])
    if (typeof context[key] !== "string" || !/^[a-f0-9]{40}$/i.test(context[key])) throw new Error("INVALID_CONTEXT");
  if (!/^\d+$/.test(String(context.runId)) || !Number.isSafeInteger(context.runAttempt) || context.runAttempt < 1)
    throw new Error("INVALID_CONTEXT");
  return context;
}

export function validateEnvelope(envelope, expectedContext) {
  const keys = ["version", "context", "model", "requestId", "prompt", "timing", "usage", "status", "review", "error"];
  if (
    !envelope ||
    typeof envelope !== "object" ||
    Array.isArray(envelope) ||
    Object.keys(envelope).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(envelope, key))
  )
    throw new Error("INVALID_ENVELOPE");
  const { version, context, model, requestId, prompt, timing, usage, status, review, error } = envelope;
  validateContext(context);
  if (expectedContext && contextKeys.some((key) => context[key] !== expectedContext[key]))
    throw new Error("CONTEXT_MISMATCH");
  if (
    version !== 1 ||
    typeof model !== "string" ||
    !model.trim() ||
    (requestId !== null && (typeof requestId !== "string" || !requestId.trim()))
  )
    throw new Error("INVALID_ENVELOPE");
  if (
    !prompt ||
    Object.keys(prompt).sort().join() !== "digest,id" ||
    prompt.id !== "code-review" ||
    !/^[a-f0-9]{64}$/.test(prompt.digest)
  )
    throw new Error("INVALID_PROMPT_IDENTITY");
  if (
    timing !== null &&
    (!timing ||
      Object.keys(timing).sort().join() !== "completedAt,startedAt" ||
      !Number.isFinite(Date.parse(timing.startedAt)) ||
      !Number.isFinite(Date.parse(timing.completedAt)) ||
      Date.parse(timing.completedAt) < Date.parse(timing.startedAt))
  )
    throw new Error("INVALID_TIMING");
  if (
    usage !== null &&
    (!usage ||
      typeof usage !== "object" ||
      Array.isArray(usage) ||
      Object.keys(usage).some((key) => !["inputTokens", "outputTokens", "totalTokens"].includes(key)) ||
      !Object.keys(usage).length ||
      Object.values(usage).some((value) => !Number.isSafeInteger(value) || value < 0))
  )
    throw new Error("INVALID_USAGE");
  if (!["completed", "error", "superseded"].includes(status)) throw new Error("INVALID_STATUS");
  if (status === "completed") {
    validateReview(review);
    if (error !== null) throw new Error("CONTRADICTORY_ENVELOPE");
  } else {
    if (
      review !== null ||
      !error ||
      Object.keys(error).sort().join() !== "code,message" ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ||
      typeof error.message !== "string" ||
      !error.message.trim() ||
      error.message.length > 500
    )
      throw new Error("CONTRADICTORY_ENVELOPE");
  }
  return envelope;
}
