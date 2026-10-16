import type { PrintFieldErrors, PrintValidationResult } from "@/lib/print-validation";

export const PRINT_CACHE_CONTROL = "private, no-cache, no-store, must-revalidate, max-age=0";
export const PRINT_SIGN_IN_DESTINATION = "/auth/signin";
export const PRINT_RETRY_AFTER_SECONDS = 30;

export interface PrintErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: PrintFieldErrors;
    signInUrl?: string;
    retryAfter?: number;
    refreshRequired?: boolean;
  };
}

export interface MappedPrintFailure {
  status: number;
  body: PrintErrorBody;
  headers?: HeadersInit;
  /** Retains an unexpected server failure and its original cause without exposing either to the client. */
  cause?: Error;
}

type FailureOperation = "read" | "mutation";

export function applyPrintPrivateHeaders(headers: Headers): Headers {
  headers.set("Cache-Control", PRINT_CACHE_CONTROL);
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  return headers;
}

export function createPrintJsonResponse(body: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  applyPrintPrivateHeaders(headers);
  return Response.json(body, { status, headers });
}

export function createPrintUnauthorizedResponse(): Response {
  return createPrintJsonResponse(
    {
      error: {
        code: "unauthenticated",
        message: "Your session has expired. Sign in to continue.",
        signInUrl: PRINT_SIGN_IN_DESTINATION,
      },
    },
    401,
  );
}

export function createPrintUnavailableResponse(): Response {
  return createPrintJsonResponse(
    {
      error: {
        code: "temporarily_unavailable",
        message: "Prints are temporarily unavailable. Please try again.",
        retryAfter: PRINT_RETRY_AFTER_SECONDS,
      },
    },
    503,
    { "Retry-After": String(PRINT_RETRY_AFTER_SECONDS) },
  );
}

export function createPrintUnsupportedMediaTypeResponse(): Response {
  return createPrintJsonResponse(
    { error: { code: "unsupported_media_type", message: "Submit print changes as a form." } },
    415,
  );
}

export function createPrintMalformedPayloadResponse(): Response {
  return createPrintJsonResponse(
    { error: { code: "malformed_payload", message: "The submitted form could not be read. Review it and try again." } },
    422,
  );
}

export function createPrintValidationResponse(validation: PrintValidationResult): Response {
  if (validation.payloadError) {
    return createPrintJsonResponse(
      { error: { code: "invalid_payload", message: "The request contains fields that cannot be edited." } },
      422,
    );
  }
  return createPrintJsonResponse(
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

export function createPrintNotFoundResponse(): Response {
  return createPrintJsonResponse({ error: { code: "not_found", message: "This print is no longer available." } }, 404);
}

export function createPrintInvalidIdResponse(): Response {
  return createPrintJsonResponse(
    {
      error: {
        code: "validation_failed",
        message: "The print identifier is invalid.",
        fieldErrors: { id: { code: "invalid", message: "Enter a valid print identifier." } },
      },
    },
    422,
  );
}

export function createPrintMethodNotAllowedResponse(allow: string): Response {
  return createPrintJsonResponse(
    { error: { code: "method_not_allowed", message: "This method is not supported for this endpoint." } },
    405,
    { Allow: allow },
  );
}

export function createPrintConflictResponse(): Response {
  return createPrintJsonResponse(
    {
      error: {
        code: "edit_conflict",
        message: "This print changed after you opened it. Refresh the latest print before saving again.",
      },
    },
    409,
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
    if (["40001", "40P01", "53300", "55P03", "57P01", "57P02", "57P03", "58030"].includes(code)) return true;
  }
  const causeCode = errorProperties(properties.cause).code;
  if (
    typeof causeCode === "string" &&
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"].includes(causeCode)
  ) {
    return true;
  }
  return properties.name === "FetchError";
}

function uncertainMutationGuidance(
  operation: FailureOperation,
): Pick<PrintErrorBody["error"], "message" | "refreshRequired"> {
  return operation === "mutation"
    ? {
        message: "The outcome may be uncertain. Refresh your print list and review it before trying again.",
        refreshRequired: true,
      }
    : { message: "Prints are temporarily unavailable. Please try again." };
}

export function mapPrintDatabaseError(
  error: unknown,
  responseStatus?: number,
  operation: FailureOperation = "read",
): MappedPrintFailure {
  const fieldErrors: PrintFieldErrors = {};
  if (namedConstraint(error, "prints_name_length_check")) {
    fieldErrors.name = { code: "too_long", message: "The normalized name is longer than 80 characters." };
  } else if (namedConstraint(error, "prints_material_length_check")) {
    fieldErrors.material = {
      code: "too_long",
      message: "The normalized material label is longer than 80 characters.",
    };
  } else if (namedConstraint(error, "prints_colour_length_check")) {
    fieldErrors.colour = { code: "too_long", message: "The colour label is longer than 80 characters." };
  } else if (namedConstraint(error, "prints_required_grams_valid")) {
    fieldErrors.requiredGrams = { code: "out_of_range", message: "Enter a valid whole-gram print requirement." };
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

  const uncertain = uncertainMutationGuidance(operation);
  if (isTransientDatabaseError(error, responseStatus)) {
    return {
      status: 503,
      body: {
        error: {
          code: "temporarily_unavailable",
          ...uncertain,
          retryAfter: PRINT_RETRY_AFTER_SECONDS,
        },
      },
      headers: { "Retry-After": String(PRINT_RETRY_AFTER_SECONDS) },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message:
          operation === "mutation" ? uncertain.message : "We couldn't complete the print request. Please try again.",
        ...(operation === "mutation" ? { refreshRequired: true } : {}),
      },
    },
    cause: new Error("Unexpected print database failure", { cause: error }),
  };
}

export function reportPrintFailure(failure: MappedPrintFailure, boundary: "api" | "page"): void {
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
                /[/\\]((?:print-response|print-validation|prints|reservation-response|reservations|PostgrestBuilder|fetchWithRetry|index|update|delete|reserve|cancel|middleware|entry|worker)\.(?:[cm]?[jt]s)):(\d+):(\d+)\)?$/.exec(
                  frame,
                );
              return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
            })
        : [];
    causes.push({ name, code, frames });
    cause = properties.cause;
  }
  // eslint-disable-next-line no-console -- Server diagnostic boundary; raw errors and request data are excluded.
  console.error("Unexpected print database failure", { boundary, causes });
}

export function createMappedPrintFailureResponse(failure: MappedPrintFailure): Response {
  reportPrintFailure(failure, "api");
  return createPrintJsonResponse(failure.body, failure.status, failure.headers);
}

export function createPrintDatabaseErrorResponse(
  error: unknown,
  responseStatus?: number,
  operation: FailureOperation = "read",
): Response {
  return createMappedPrintFailureResponse(mapPrintDatabaseError(error, responseStatus, operation));
}
