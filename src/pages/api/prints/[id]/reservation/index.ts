import type { APIRoute } from "astro";
import { previewPrintReservation } from "@/lib/reservations";
import {
  createReservationErrorResponse,
  createReservationJsonResponse,
  mapReservationFailure,
} from "@/lib/reservation-response";
import { isValidPrintId } from "@/lib/print-validation";

export const GET: APIRoute = async (context) => {
  const headers = context.locals.authResponseHeaders;
  headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  headers.set("Expires", "0");
  headers.set("Pragma", "no-cache");
  const client = context.locals.supabase;
  if (context.locals.authUnavailable || !client)
    return createReservationErrorResponse(
      "temporarily_unavailable",
      503,
      "Reservations are temporarily unavailable. Try again.",
      { retryAfter: 30 },
    );
  if (!context.locals.user)
    return createReservationErrorResponse("unauthenticated", 401, "Your session has expired. Sign in to continue.", {
      signInUrl: "/auth/signin",
    });
  const id = context.params.id ?? "";
  if (!isValidPrintId(id))
    return createReservationErrorResponse("not_found", 404, "This print is no longer available.");
  const result = await previewPrintReservation(client, context.locals.user.id, id);
  if (!result.ok) {
    if (result.reason === "already_reserved" && result.current) {
      return createReservationErrorResponse(
        "already_reserved",
        409,
        "This print already has an active reservation.",
        result.current,
      );
    }
    return mapReservationFailure(result, "read");
  }
  return createReservationJsonResponse(result.value);
};

export const ALL: APIRoute = () =>
  createReservationErrorResponse("method_not_allowed", 405, "This method is not supported for this endpoint.", {
    allow: "GET",
  });
