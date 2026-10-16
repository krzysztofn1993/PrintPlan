import type { APIRoute } from "astro";
import { releasePrintMaterial } from "@/lib/reservations";
import {
  createReservationErrorResponse,
  createReservationJsonResponse,
  mapReservationFailure,
} from "@/lib/reservation-response";
import {
  hasSupportedReservationFormContentType,
  readReservationFormData,
  validateReleaseForm,
} from "@/lib/reservation-validation";

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
  if (!hasSupportedReservationFormContentType(context.request))
    return createReservationErrorResponse("unsupported_media_type", 415, "Submit cancellation as a form.");
  const form = await readReservationFormData(context.request);
  if (!form) return createReservationErrorResponse("malformed_payload", 422, "The submitted form could not be read.");
  const validation = validateReleaseForm(form);
  if (!validation.ok)
    return createReservationErrorResponse(
      validation.reason === "unexpected_field" ? "invalid_payload" : "validation_failed",
      422,
      "Provide one valid reservation ID.",
    );
  const result = await releasePrintMaterial(client, user.id, validation.value.reservationId);
  if (!result.ok) return mapReservationFailure(result.reason);
  return createReservationJsonResponse(result.value);
};

export const ALL: APIRoute = () =>
  createReservationErrorResponse("method_not_allowed", 405, "This method is not supported for this endpoint.", {
    allow: "POST",
  });
