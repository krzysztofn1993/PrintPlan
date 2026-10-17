import type { AccountSettingsFieldErrors, AccountSettingsFormResult } from "./account-settings-validation.ts";

export const ACCOUNT_SETTINGS_CACHE_CONTROL = "private, no-cache, no-store, must-revalidate, max-age=0";
export const ACCOUNT_SETTINGS_RETRY_AFTER_SECONDS = 30;

type SettingsFailureOperation = "read" | "mutation";

interface AccountSettingsErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: AccountSettingsFieldErrors;
    signInUrl?: string;
    retryAfter?: number;
    refreshRequired?: boolean;
  };
}

interface MappedAccountSettingsFailure {
  status: number;
  body: AccountSettingsErrorBody;
  headers?: HeadersInit;
  cause?: Error;
}

export function applyAccountSettingsPrivateHeaders(headers: Headers): Headers {
  headers.set("Cache-Control", ACCOUNT_SETTINGS_CACHE_CONTROL);
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  return headers;
}

export function createAccountSettingsJsonResponse(
  body: unknown,
  status = 200,
  additionalHeaders?: HeadersInit,
): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  applyAccountSettingsPrivateHeaders(headers);
  return Response.json(body, { status, headers });
}

export function createAccountSettingsErrorResponse(
  code: string,
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  const retryAfter = status === 503 ? ACCOUNT_SETTINGS_RETRY_AFTER_SECONDS : undefined;
  return createAccountSettingsJsonResponse(
    { error: { code, message, ...(retryAfter ? { retryAfter } : {}), ...extra } },
    status,
    retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
  );
}

export function createAccountSettingsUnauthorizedResponse(): Response {
  return createAccountSettingsErrorResponse("unauthenticated", 401, "Your session has expired. Sign in to continue.", {
    signInUrl: "/auth/signin",
  });
}

export function createAccountSettingsUnavailableResponse(operation: SettingsFailureOperation = "read"): Response {
  return createAccountSettingsErrorResponse(
    "temporarily_unavailable",
    503,
    operation === "mutation"
      ? "The save outcome may be uncertain. Reload account settings before trying again."
      : "Account settings are temporarily unavailable. Please try again.",
    operation === "mutation" ? { refreshRequired: true } : {},
  );
}

export function createAccountSettingsUnsupportedMediaTypeResponse(): Response {
  return createAccountSettingsErrorResponse("unsupported_media_type", 415, "Submit account settings as a form.");
}

export function createAccountSettingsMalformedPayloadResponse(): Response {
  return createAccountSettingsErrorResponse(
    "malformed_payload",
    422,
    "The submitted settings could not be read. Review the form and try again.",
  );
}

export function createAccountSettingsValidationResponse(
  validation: Extract<AccountSettingsFormResult<unknown>, { ok: false }>,
): Response {
  if (validation.reason === "unexpected_field") {
    return createAccountSettingsErrorResponse(
      "invalid_payload",
      422,
      "The request contains fields that cannot be changed.",
    );
  }
  return createAccountSettingsJsonResponse(
    {
      error: {
        code: "validation_failed",
        message: "Please enter a whole percentage and the current settings version.",
        fieldErrors: validation.fieldErrors ?? {},
      },
    },
    422,
  );
}

export function createAccountSettingsMethodNotAllowedResponse(allow: string): Response {
  const response = createAccountSettingsErrorResponse(
    "method_not_allowed",
    405,
    "This method is not supported for this endpoint.",
  );
  response.headers.set("Allow", allow);
  return response;
}

export function createAccountSettingsConflictResponse(): Response {
  return createAccountSettingsErrorResponse(
    "settings_conflict",
    409,
    "Account settings changed in another session. Reload the saved setting before saving again.",
    { refreshRequired: true },
  );
}

function errorProperties(error: unknown): Record<string, unknown> {
  if (error === null || typeof error !== "object") return {};
  return error as Record<string, unknown>;
}

function isTransientFailure(error: unknown, responseStatus?: number): boolean {
  const properties = errorProperties(error);
  const status = responseStatus ?? properties.status;
  if (typeof status === "number" && (status === 0 || status === 429 || (status >= 500 && status <= 599))) {
    return true;
  }
  if (typeof properties.code === "string") {
    if (properties.code.startsWith("08")) return true;
    if (["40001", "40P01", "53300", "55P03", "57P01", "57P02", "57P03", "58030"].includes(properties.code)) {
      return true;
    }
  }
  const causeCode = errorProperties(properties.cause).code;
  return (
    (typeof causeCode === "string" &&
      ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN"].includes(causeCode)) ||
    properties.name === "FetchError"
  );
}

function uncertainSettingsGuidance(operation: SettingsFailureOperation): {
  message: string;
  refreshRequired?: boolean;
} {
  return operation === "mutation"
    ? {
        message: "The save outcome may be uncertain. Reload account settings before trying again.",
        refreshRequired: true,
      }
    : { message: "Account settings are temporarily unavailable. Please try again." };
}

function mapDatabaseFailure(
  error: unknown,
  responseStatus: number | undefined,
  operation: SettingsFailureOperation,
): MappedAccountSettingsFailure {
  const uncertain = uncertainSettingsGuidance(operation);
  if (isTransientFailure(error, responseStatus)) {
    return {
      status: 503,
      body: {
        error: {
          code: "temporarily_unavailable",
          ...uncertain,
          retryAfter: ACCOUNT_SETTINGS_RETRY_AFTER_SECONDS,
        },
      },
      headers: { "Retry-After": String(ACCOUNT_SETTINGS_RETRY_AFTER_SECONDS) },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: operation === "mutation" ? uncertain.message : "We couldn't load account settings. Please try again.",
        ...(operation === "mutation" ? { refreshRequired: true } : {}),
      },
    },
    cause: new Error("Unexpected account settings database failure", { cause: error }),
  };
}

export function mapAccountSettingsFailure(
  failure: { reason: string; error?: unknown; status?: number },
  operation: SettingsFailureOperation = "read",
): Response {
  if (failure.reason === "settings_conflict") return createAccountSettingsConflictResponse();
  const mapped = mapDatabaseFailure(failure.error, failure.status, operation);
  reportAccountSettingsFailure(mapped, "api");
  return createAccountSettingsJsonResponse(mapped.body, mapped.status, mapped.headers);
}

export function reportAccountSettingsFailure(failure: MappedAccountSettingsFailure, boundary: "api" | "page"): void {
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
    const frames =
      typeof properties.stack === "string"
        ? properties.stack
            .split("\n")
            .slice(1, 13)
            .flatMap((frame) => {
              const match =
                /[/\\]((?:account-settings(?:-response|-validation)?|PostgrestBuilder|fetchWithRetry|settings|middleware|entry|worker)\.(?:[cm]?[jt]s)):(\d+):(\d+)\)?$/.exec(
                  frame,
                );
              return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
            })
        : [];
    causes.push({ name, code, frames });
    cause = properties.cause;
  }
  // eslint-disable-next-line no-console -- Server diagnostics contain only safe error codes, names, and known frames.
  console.error("Unexpected account settings database failure", { boundary, causes });
}
