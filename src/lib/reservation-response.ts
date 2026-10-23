import { createPrintDatabaseErrorResponse } from "./print-response.ts";

const PRINT_CACHE_CONTROL = "private, no-cache, no-store, must-revalidate, max-age=0";

export function createReservationJsonResponse(body: unknown, status = 200, additionalHeaders?: HeadersInit): Response {
  const headers = new Headers(additionalHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", PRINT_CACHE_CONTROL);
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  return Response.json(body, { status, headers });
}

export function createReservationErrorResponse(
  code: string,
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return createReservationJsonResponse(
    { error: { code, message, ...extra } },
    status,
    status === 503 ? { "Retry-After": "30" } : undefined,
  );
}

export function mapReservationFailure(
  failure: { reason: string; error?: unknown; status?: number },
  operation: "read" | "mutation" | "cancellation" = "mutation",
): Response {
  if (failure.reason === "edit_conflict" && operation === "cancellation") {
    return createReservationErrorResponse(
      "edit_conflict",
      409,
      "This print changed before cancellation. Refresh the print and review its current reservation before trying again.",
      { refreshRequired: true },
    );
  }
  const messages: Partial<Record<string, { status: number; message: string }>> = {
    not_found: { status: 404, message: "This print or reservation is no longer available." },
    already_reserved: { status: 409, message: "This print already has an active reservation." },
    edit_conflict: { status: 409, message: "This print changed. Refresh the preview before reserving material." },
    selection_stale: { status: 409, message: "The best-fit spool changed. Review a fresh preview before confirming." },
    reservation_amount_stale: {
      status: 409,
      message: "The required amount changed. Review a fresh preview before confirming the reservation.",
    },
    reservation_preview_required: {
      status: 409,
      message: "Load a fresh reservation preview before confirming this request.",
    },
    insufficient_material: { status: 409, message: "No eligible spool has enough available material." },
    idempotency_conflict: {
      status: 409,
      message: "This request identifier was already used for a different reservation.",
    },
    reservation_request_completed: {
      status: 409,
      message: "This request was already completed. Refresh the current print and stock state.",
    },
    print_settled: { status: 409, message: "Completed prints cannot be reserved or edited." },
  };
  const result = messages[failure.reason];
  if (result) {
    const extra =
      failure.reason === "reservation_amount_stale" || failure.reason === "reservation_preview_required"
        ? { refreshRequired: true }
        : {};
    return createReservationErrorResponse(failure.reason, result.status, result.message, extra);
  }
  return createPrintDatabaseErrorResponse(failure.error, failure.status, operation === "read" ? "read" : "mutation");
}
