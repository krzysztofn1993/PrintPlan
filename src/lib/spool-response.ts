import type { SpoolFieldErrors, SpoolValidationResult } from "@/lib/spool-validation";

export const SPOOL_CACHE_CONTROL = "private, no-cache, no-store, must-revalidate, max-age=0";
export const SPOOL_SIGN_IN_DESTINATION = "/auth/signin";
export const SPOOL_RETRY_AFTER_SECONDS = 30;

export interface SpoolErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: SpoolFieldErrors;
    signInUrl?: string;
    retryAfter?: number;
  };
}

export interface MappedSpoolFailure {
  status: number;
  body: SpoolErrorBody;
  headers?: HeadersInit;
  /** Retains an unexpected server failure and its original cause without exposing either to the client. */
  cause?: Error;
}

export function applySpoolPrivateHeaders(headers: Headers): Headers {
  headers.set("Cache-Control", SPOOL_CACHE_CONTROL);
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  return headers;
}

export function createSpoolJsonResponse(body: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  applySpoolPrivateHeaders(headers);
  return Response.json(body, { status, headers });
}

export function createSpoolUnauthorizedResponse(): Response {
  return createSpoolJsonResponse(
    {
      error: {
        code: "unauthenticated",
        message: "Your session has expired. Sign in to continue.",
        signInUrl: SPOOL_SIGN_IN_DESTINATION,
      },
    },
    401,
  );
}

export function createSpoolUnavailableResponse(): Response {
  return createSpoolJsonResponse(
    {
      error: {
        code: "temporarily_unavailable",
        message: "Stock is temporarily unavailable. Please try again.",
        retryAfter: SPOOL_RETRY_AFTER_SECONDS,
      },
    },
    503,
    { "Retry-After": String(SPOOL_RETRY_AFTER_SECONDS) },
  );
}

export function createSpoolUnsupportedMediaTypeResponse(): Response {
  return createSpoolJsonResponse(
    { error: { code: "unsupported_media_type", message: "Submit stock changes as a form." } },
    415,
  );
}

export function createSpoolMalformedPayloadResponse(): Response {
  return createSpoolJsonResponse(
    { error: { code: "malformed_payload", message: "The submitted form could not be read. Review it and try again." } },
    422,
  );
}

export function createSpoolValidationResponse(validation: SpoolValidationResult): Response {
  if (validation.payloadError) {
    return createSpoolJsonResponse(
      { error: { code: "invalid_payload", message: "The request contains fields that cannot be edited." } },
      422,
    );
  }
  return createSpoolJsonResponse(
    {
      error: {
        code: "validation_failed",
        message: "Please review the highlighted fields and try again.",
        fieldErrors: validation.fieldErrors,
      },
    },
    422,
  );
}

export function createSpoolNotFoundResponse(): Response {
  return createSpoolJsonResponse({ error: { code: "not_found", message: "This spool is no longer available." } }, 404);
}

export function createSpoolInvalidIdResponse(): Response {
  return createSpoolJsonResponse(
    {
      error: {
        code: "validation_failed",
        message: "The spool identifier is invalid.",
        fieldErrors: { id: { code: "invalid", message: "Enter a valid spool identifier." } },
      },
    },
    422,
  );
}

export function createSpoolMethodNotAllowedResponse(allow: string): Response {
  return createSpoolJsonResponse(
    { error: { code: "method_not_allowed", message: "This method is not supported for this endpoint." } },
    405,
    { Allow: allow },
  );
}

function errorProperties(error: unknown): Record<string, unknown> {
  if (error === null || typeof error !== "object") return {};
  return error as Record<string, unknown>;
}

function namedConstraint(error: unknown, name: string): boolean {
  const properties = errorProperties(error);
  if (properties.constraint === name) return true;
  const text = [properties.message, properties.details].filter((value) => typeof value === "string").join(" ");
  return new RegExp(`constraint\\s+['"]?${name}['"]?`, "i").test(text);
}

function isTransientDatabaseError(error: unknown, responseStatus?: number): boolean {
  const properties = errorProperties(error);
  const status = responseStatus ?? properties.status;
  if (typeof status === "number" && (status === 0 || status === 429 || (status >= 500 && status <= 599))) {
    return true;
  }

  const code = properties.code;
  if (typeof code === "string") {
    if (code.startsWith("08")) return true;
    if (["40001", "40P01", "53300", "55P03", "57P01", "57P02", "57P03", "58030"].includes(code)) {
      return true;
    }
  }

  const cause = errorProperties(properties.cause);
  const causeCode = cause.code;
  if (
    typeof causeCode === "string" &&
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"].includes(causeCode)
  ) {
    return true;
  }
  return properties.name === "FetchError";
}

export function mapSpoolDatabaseError(error: unknown, responseStatus?: number): MappedSpoolFailure {
  const fieldErrors: SpoolFieldErrors = {};
  if (namedConstraint(error, "spools_material_length_check")) {
    fieldErrors.material = {
      code: "too_long",
      message: "The normalized material label is longer than 80 characters.",
    };
  } else if (namedConstraint(error, "spools_colour_length_check")) {
    fieldErrors.colour = { code: "too_long", message: "The colour label is longer than 80 characters." };
  } else if (namedConstraint(error, "spools_recorded_grams_valid")) {
    fieldErrors.recordedGrams = { code: "out_of_range", message: "Enter a valid whole-gram stock amount." };
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 422,
      body: {
        error: {
          code: "validation_failed",
          message: "Please review the highlighted fields and try again.",
          fieldErrors,
        },
      },
    };
  }

  if (isTransientDatabaseError(error, responseStatus)) {
    return {
      status: 503,
      body: {
        error: {
          code: "temporarily_unavailable",
          message: "Stock is temporarily unavailable. Please try again.",
          retryAfter: SPOOL_RETRY_AFTER_SECONDS,
        },
      },
      headers: { "Retry-After": String(SPOOL_RETRY_AFTER_SECONDS) },
    };
  }

  return {
    status: 500,
    body: { error: { code: "internal_error", message: "We couldn't complete the stock request. Please try again." } },
    cause: new Error("Unexpected spool database failure", { cause: error }),
  };
}

export function reportSpoolFailure(failure: MappedSpoolFailure, boundary: "api" | "page"): void {
  if (!failure.cause) return;

  const names = new Set([
    "Error",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "AggregateError",
    "FetchError",
    "PostgrestError",
    "AbortError",
  ]);
  const causes: { name: string; code?: string; frames: string[] }[] = [];
  const seen = new Set<unknown>();
  let cause: unknown = failure.cause;

  while (cause !== undefined && cause !== null && causes.length < 5 && !seen.has(cause)) {
    seen.add(cause);
    const properties = errorProperties(cause);
    const name = typeof properties.name === "string" && names.has(properties.name) ? properties.name : "UnknownError";
    const code =
      typeof properties.code === "string" && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(properties.code)
        ? properties.code
        : undefined;
    // Keep known code filenames and coordinates only; stack messages, URLs and arbitrary paths can contain secrets.
    const frames =
      typeof properties.stack === "string"
        ? properties.stack
            .split("\n")
            .slice(1, 13)
            .flatMap((frame) => {
              const match =
                /[/\\]((?:spool-response|spools|PostgrestBuilder|fetchWithRetry|index|update|delete|middleware|entry|worker)\.(?:[cm]?js|ts)):(\d+):(\d+)\)?$/.exec(
                  frame,
                );
              return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
            })
        : [];
    causes.push({ name, code, frames });
    cause = properties.cause;
  }

  // eslint-disable-next-line no-console -- Server diagnostic boundary; raw errors and request data are excluded.
  console.error("Unexpected spool database failure", { boundary, causes });
}

export function createMappedSpoolFailureResponse(failure: MappedSpoolFailure): Response {
  reportSpoolFailure(failure, "api");
  return createSpoolJsonResponse(failure.body, failure.status, failure.headers);
}

export function createSpoolDatabaseErrorResponse(error: unknown, responseStatus?: number): Response {
  return createMappedSpoolFailureResponse(mapSpoolDatabaseError(error, responseStatus));
}
