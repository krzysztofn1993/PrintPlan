import { createPrintDatabaseErrorResponse, createPrintJsonResponse } from "./print-response.ts";
import type { SettlementFailure } from "./settlements.ts";
import type { SettlementFieldErrors } from "./settlement-validation.ts";

export function createSettlementJsonResponse(body: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  return createPrintJsonResponse(body, status, additionalHeaders);
}

export function createSettlementErrorResponse(
  code: string,
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return createSettlementJsonResponse(
    { error: { code, message, ...extra } },
    status,
    status === 503 ? { "Retry-After": "30" } : undefined,
  );
}

export function createSettlementUnauthorizedResponse(): Response {
  return createSettlementErrorResponse("unauthenticated", 401, "Your session has expired. Sign in to continue.", {
    signInUrl: "/auth/signin",
  });
}

export function createSettlementUnavailableResponse(): Response {
  return createSettlementErrorResponse(
    "temporarily_unavailable",
    503,
    "Settlement results are temporarily unavailable. Please try again.",
    { retryAfter: 30 },
  );
}

export function createSettlementNotFoundResponse(): Response {
  return createSettlementErrorResponse("not_found", 404, "This print or settlement result is no longer available.");
}

export function createSettlementUnsupportedMediaTypeResponse(): Response {
  return createSettlementErrorResponse("unsupported_media_type", 415, "Submit settlement changes as a form.");
}

export function createSettlementMalformedPayloadResponse(): Response {
  return createSettlementErrorResponse(
    "malformed_payload",
    422,
    "The submitted form could not be read. Review it and try again.",
  );
}

export function createSettlementValidationResponse(
  fieldErrors: SettlementFieldErrors,
  unexpectedField = false,
): Response {
  if (unexpectedField) {
    return createSettlementErrorResponse("invalid_payload", 422, "The request contains unsupported settlement fields.");
  }
  return createSettlementErrorResponse("validation_failed", 422, "Review the settlement details and try again.", {
    fieldErrors,
  });
}

export function createSettlementMethodNotAllowedResponse(allow: string): Response {
  return createSettlementJsonResponse(
    { error: { code: "method_not_allowed", message: "This method is not supported for this endpoint." } },
    405,
    { Allow: allow },
  );
}

export function mapSettlementFailure(failure: SettlementFailure, operation: "read" | "mutation"): Response {
  if (failure.reason === "not_found") return createSettlementNotFoundResponse();
  if (failure.reason === "invalid_input") {
    return createSettlementErrorResponse("validation_failed", 422, "Review the settlement details and try again.");
  }
  if (failure.reason === "database_error") {
    return createPrintDatabaseErrorResponse(failure.error, failure.status, operation);
  }

  const messages: Record<
    Exclude<SettlementFailure["reason"], "database_error" | "not_found" | "invalid_input">,
    string
  > = {
    already_settled: "This print is already completed. Review its saved settlement result.",
    idempotency_conflict: "This request identifier was already used for a different settlement command.",
    edit_conflict: "This print changed. Refresh the current print before settling it.",
    reservation_changed: "This reservation changed. Refresh the print and review its current reservation.",
    reservation_required: "Reserve material for this print before settling its consumption.",
    print_settled: "Completed prints cannot be settled again. Review the saved settlement result.",
  };
  return createSettlementErrorResponse(failure.reason, 409, messages[failure.reason]);
}
