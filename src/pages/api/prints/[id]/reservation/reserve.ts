import type { APIRoute } from "astro";
import { reservePrintMaterial } from "@/lib/reservations";
import {
  createReservationErrorResponse,
  createReservationJsonResponse,
  mapReservationFailure,
} from "@/lib/reservation-response";
import {
  hasSupportedReservationFormContentType,
  readReservationFormData,
  validateReserveForm,
} from "@/lib/reservation-validation";
import { isValidPrintId } from "@/lib/print-validation";

export const POST: APIRoute = async (context) => {
  const client = context.locals.supabase;
  if (context.locals.authUnavailable || !client)
    return createReservationErrorResponse(
      "temporarily_unavailable",
      503,
      "Reservations are temporarily unavailable. Refresh before trying again.",
      { refreshRequired: true, retryAfter: 30 },
    );
  const user = context.locals.user;
  if (!user)
    return createReservationErrorResponse("unauthenticated", 401, "Your session has expired. Sign in to continue.", {
      signInUrl: "/auth/signin",
    });
  const printId = context.params.id ?? "";
  if (!isValidPrintId(printId))
    return createReservationErrorResponse("not_found", 404, "This print is no longer available.");
  if (!hasSupportedReservationFormContentType(context.request))
    return createReservationErrorResponse("unsupported_media_type", 415, "Submit reservation changes as a form.");
  const form = await readReservationFormData(context.request);
  if (!form) return createReservationErrorResponse("malformed_payload", 422, "The submitted form could not be read.");
  const validation = validateReserveForm(form);
  if (!validation.ok)
    return createReservationErrorResponse(
      validation.reason === "unexpected_field" ? "invalid_payload" : "validation_failed",
      422,
      "Provide one valid request ID, print version, spool ID and selection mode.",
    );
  const result = await reservePrintMaterial(client, user.id, { printId, ...validation.value });
  if (!result.ok) return mapReservationFailure(result, "mutation");
  return createReservationJsonResponse(result.value);
};

export const ALL: APIRoute = () =>
  createReservationErrorResponse("method_not_allowed", 405, "This method is not supported for this endpoint.", {
    allow: "POST",
  });
