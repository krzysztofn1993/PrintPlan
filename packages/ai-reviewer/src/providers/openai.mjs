import { Buffer } from "node:buffer";
import { setTimeout, clearTimeout } from "node:timers";
import { URL } from "node:url";
import { ToolLoopAgent, Output, isStepCount, jsonSchema } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { LIMITS } from "../config.mjs";
import { reviewSchema, validateReview } from "../contracts/validate.mjs";

export class ReviewResponseError extends Error {
  constructor(message, { requestId, usage, diagnostics }) {
    super(message);
    this.requestId = requestId;
    this.usage = usage;
    this.diagnostics = diagnostics;
  }
}

const safeText = (value, pattern, maxLength = 128) =>
  typeof value === "string" && value.length <= maxLength && pattern.test(value) ? value : null;
const runtime = { node: process.version, platform: process.platform, arch: process.arch };
const diagnosticHeaderNames = [
  "content-type",
  "server",
  "via",
  "x-cache",
  "cf-ray",
  "x-envoy-upstream-service-time",
  "retry-after",
  "x-ratelimit-limit-requests",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-reset-requests",
  "x-ratelimit-limit-tokens",
  "x-ratelimit-remaining-tokens",
  "x-ratelimit-reset-tokens",
];

function safeHeader(value) {
  return typeof value === "string" && value.length <= 128 && /^[A-Za-z0-9_.:/,;+ =-]+$/.test(value) ? value : null;
}

function readResponseMetadata(response) {
  const header = (name) => {
    try {
      return safeHeader(response?.headers?.get?.(name) ?? null);
    } catch {
      return null;
    }
  };
  const headers = Object.fromEntries(
    diagnosticHeaderNames.map((name) => [name, header(name)]).filter(([, value]) => value !== null),
  );
  return {
    requestId: safeText(header("x-request-id"), /^[A-Za-z0-9_-]+$/),
    headers,
  };
}

function usageFrom(value) {
  const inputTokens = value?.inputTokens;
  const outputTokens = value?.outputTokens;
  const totalTokens = value?.totalTokens ?? inputTokens + outputTokens;
  if (
    !Number.isSafeInteger(inputTokens) ||
    inputTokens < 0 ||
    !Number.isSafeInteger(outputTokens) ||
    outputTokens < 0 ||
    !Number.isSafeInteger(totalTokens) ||
    totalTokens < 0
  )
    return null;
  return { inputTokens, outputTokens, totalTokens };
}

function responseBodyMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawUsage = value.usage;
  const usage = usageFrom({
    inputTokens: rawUsage?.input_tokens,
    outputTokens: rawUsage?.output_tokens,
    totalTokens: rawUsage?.total_tokens,
  });
  const messageStatuses = Array.isArray(value.output)
    ? value.output.filter((item) => item?.type === "message").map((item) => safeText(item.status, /^[A-Za-z_]+$/, 40))
    : [];
  return {
    requestId: safeText(value.id, /^resp_[A-Za-z0-9_-]+$/),
    status: safeText(value.status, /^[A-Za-z_]+$/, 40),
    incomplete: Boolean(value.incomplete_details),
    failed: Boolean(value.error),
    messageStatuses,
    usage,
  };
}

function readResponseBodyMetadata(response) {
  try {
    return response
      .clone()
      .json()
      .then(responseBodyMetadata)
      .catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

function applyResponseBodyMetadata(metadata, bodyMetadata) {
  if (!bodyMetadata) return;
  metadata.requestId ??= bodyMetadata.requestId;
  metadata.usage = bodyMetadata.usage;
}

function errorCode(error, signal) {
  if (signal.aborted) return "DEADLINE_EXCEEDED";
  const status = Number(error?.statusCode ?? error?.status);
  if (Number.isInteger(status) && [401, 403, 429].includes(status)) return `HTTP_${status}`;
  if (Number.isInteger(status) && status >= 500 && status <= 599) return `HTTP_${status}`;
  if (error?.name === "NoOutputGeneratedError") return "EMPTY_RESPONSE";
  if (error?.name === "TypeValidationError" || error?.name === "InvalidResponseDataError") return "INVALID_RESPONSE";
  return "REVIEW_FAILED";
}

function errorCategory(code, phase) {
  if (code === "DEADLINE_EXCEEDED") return "timeout";
  if (code.startsWith("HTTP_")) return "http";
  if (phase === "transport") return "transport";
  if (phase === "request_build") return "request_build";
  if (phase === "configuration") return "configuration";
  if (phase === "response_validation") return "response_validation";
  return "review_operation";
}

function allowlistedCause(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && typeof current === "object" && chain.length < 5 && !seen.has(current)) {
    seen.add(current);
    const status = Number(current.statusCode ?? current.status);
    const entry = {
      name: safeText(current.name, /^[A-Za-z][A-Za-z0-9_.-]*$/, 80),
      code: safeText(current.code, /^[A-Za-z0-9_.-]+$/, 80),
      status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    };
    if (Object.values(entry).some((value) => value !== null)) chain.push(entry);
    current = current.cause;
  }
  return chain;
}

function validateStructuredOutput(value) {
  try {
    return { success: true, value: validateReview(value) };
  } catch {
    return { success: false, error: new Error("INVALID_REVIEW") };
  }
}

export async function requestReview({
  apiKey,
  model,
  prompt,
  input,
  fetchImpl = fetch,
  deadlineMs = LIMITS.deadlineMs,
}) {
  if (!apiKey?.trim() || !model?.trim()) throw new Error("CONFIG_REQUIRED");
  const metadata = { requestId: null, usage: null };
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const controller = new globalThis.AbortController();
  let timer;
  let phase = "configuration";
  let requestAttempted = false;
  let callCount = 0;
  let http = null;
  let provider = null;
  let responseBodyMetadataPromise = null;
  const request = {
    method: "POST",
    host: "api.openai.com",
    path: "/v1/responses",
    model: safeText(model, /^[A-Za-z0-9._-]+$/, 128),
    maxOutputTokens: LIMITS.outputTokens,
    maxRetries: 0,
    inputBytes: Buffer.byteLength(input, "utf8"),
    promptDigest: prompt.digest,
    store: false,
  };
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("DEADLINE_EXCEEDED"));
    }, deadlineMs);
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        phase = "request_build";
        const instrumentedFetch = async (url, options = {}) => {
          callCount++;
          requestAttempted = true;
          if (callCount > 1) throw new Error("UNEXPECTED_REQUEST_COUNT");
          try {
            const target = new URL(url);
            request.host = safeText(target.hostname, /^[A-Za-z0-9.-]+$/, 253) ?? request.host;
            request.path = safeText(target.pathname, /^\/[A-Za-z0-9/_-]*$/, 256) ?? request.path;
            request.method = options.method ?? "GET";
            if (typeof options.body === "string") request.requestBodyBytes = Buffer.byteLength(options.body, "utf8");
          } catch {
            // URL validation diagnostics stay fixed to the expected provider endpoint.
          }
          phase = "transport";
          let response;
          try {
            response = await fetchImpl(url, { ...options, signal: controller.signal });
          } catch (cause) {
            throw new Error("TRANSPORT_FAILED", { cause });
          }
          const responseInfo = readResponseMetadata(response);
          if (responseInfo.requestId) metadata.requestId = responseInfo.requestId;
          http = {
            status: Number.isInteger(response.status) ? response.status : null,
            requestId: responseInfo.requestId,
            headers: responseInfo.headers,
          };
          responseBodyMetadataPromise = readResponseBodyMetadata(response);
          return response;
        };

        const openai = createOpenAI({ apiKey, fetch: instrumentedFetch });
        const agent = new ToolLoopAgent({
          model: openai.responses(model),
          instructions: `${prompt.system}\n\n${prompt.criteria}`,
          tools: {},
          toolChoice: "none",
          output: Output.object({
            schema: jsonSchema(reviewSchema, { validate: validateStructuredOutput }),
            name: "code_review",
            description: "A contract-validated code review verdict and six scores.",
          }),
          stopWhen: isStepCount(2),
          maxRetries: 0,
          maxOutputTokens: LIMITS.outputTokens,
          providerOptions: { openai: { store: false } },
          telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
        });
        phase = "review_request";
        const result = await agent.generate({ prompt: input, abortSignal: controller.signal });
        const responseBody = await responseBodyMetadataPromise;
        applyResponseBodyMetadata(metadata, responseBody);
        if (
          !responseBody ||
          responseBody.status !== "completed" ||
          responseBody.failed ||
          responseBody?.incomplete ||
          responseBody?.messageStatuses.some((status) => status !== "completed")
        )
          throw new Error("INCOMPLETE_RESPONSE");
        phase = "response_validation";
        if (result.toolCalls?.length) throw new Error("UNEXPECTED_OUTPUT");
        if (result.finishReason === "length") throw new Error("INCOMPLETE_RESPONSE");
        const review = validateReview(result.output);
        const serialized = JSON.stringify(review);
        if (!serialized || Buffer.byteLength(serialized, "utf8") > LIMITS.outputBytes) throw new Error("OUTPUT_SIZE");
        const sdkUsage = usageFrom(result.usage);
        if (!sdkUsage) throw new Error("UNKNOWN_USAGE");
        metadata.usage ??= sdkUsage;
        const responseId = safeText(result.response?.id, /^resp_[A-Za-z0-9_-]+$/);
        metadata.requestId ??= responseId;
        provider = {
          finishReason: safeText(result.finishReason, /^[A-Za-z0-9_.-]+$/, 80),
          responseModel: safeText(result.response?.modelId, /^[A-Za-z0-9_.-]+$/, 128),
          stepCount: Array.isArray(result.steps) ? result.steps.length : null,
        };
        return {
          review,
          ...metadata,
          diagnostics: {
            version: 1,
            category: "success",
            phase: "completed",
            errorCode: null,
            internalCode: null,
            startedAt: startedAtIso,
            completedAt: new Date().toISOString(),
            durationMs: Math.max(0, Date.now() - startedAt),
            deadlineMs,
            runtime,
            requestAttempted,
            request,
            http,
            provider,
            usage: metadata.usage,
            causeChain: [],
            aborted: controller.signal.aborted,
          },
        };
      })(),
    ]);
  } catch (error) {
    if (responseBodyMetadataPromise && !controller.signal.aborted) {
      const bodyMetadata = await Promise.race([
        responseBodyMetadataPromise,
        timeout.then(
          () => null,
          () => null,
        ),
      ]);
      applyResponseBodyMetadata(metadata, bodyMetadata);
    }
    const code = errorCode(error, controller.signal);
    const status = Number(error?.statusCode ?? error?.status);
    if (!http && Number.isInteger(status) && status >= 100 && status <= 599)
      http = { status, requestId: metadata.requestId, headers: {} };
    provider = {
      errorName: safeText(error?.name, /^[A-Za-z][A-Za-z0-9_.-]*$/, 80),
      status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    };
    throw new ReviewResponseError(code, {
      ...metadata,
      diagnostics: {
        version: 1,
        category: errorCategory(code, phase),
        phase,
        errorCode: code,
        internalCode: code,
        startedAt: startedAtIso,
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt),
        deadlineMs,
        runtime,
        requestAttempted,
        request,
        http,
        provider,
        causeChain: allowlistedCause(error?.cause ?? error),
        aborted: controller.signal.aborted,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
