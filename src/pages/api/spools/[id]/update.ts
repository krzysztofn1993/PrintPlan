import type { APIRoute } from "astro";
import {
  applySpoolPrivateHeaders,
  createSpoolDatabaseErrorResponse,
  createSpoolInvalidIdResponse,
  createSpoolMalformedPayloadResponse,
  createSpoolMethodNotAllowedResponse,
  createSpoolNotFoundResponse,
  createSpoolUnauthorizedResponse,
  createSpoolUnavailableResponse,
  createSpoolUnsupportedMediaTypeResponse,
  createSpoolValidationResponse,
  createSpoolJsonResponse,
} from "@/lib/spool-response";
import { updateSpool } from "@/lib/spools";
import {
  hasSupportedSpoolFormContentType,
  isValidSpoolId,
  readSpoolFormData,
  validateSpoolFormData,
} from "@/lib/spool-validation";

export const POST: APIRoute = async (context) => {
  applySpoolPrivateHeaders(context.locals.authResponseHeaders);
  const client = context.locals.supabase;
  if (context.locals.authUnavailable || !client) return createSpoolUnavailableResponse();
  const user = context.locals.user;
  if (!user) return createSpoolUnauthorizedResponse();

  const id = context.params.id ?? "";
  if (!isValidSpoolId(id)) return createSpoolInvalidIdResponse();
  if (!hasSupportedSpoolFormContentType(context.request)) {
    return createSpoolUnsupportedMediaTypeResponse();
  }
  const form = await readSpoolFormData(context.request);
  if (!form) return createSpoolMalformedPayloadResponse();

  const validation = validateSpoolFormData(form, "edit");
  if (!validation.data || validation.payloadError) return createSpoolValidationResponse(validation);

  const result = await updateSpool(client, user.id, id, validation.data);
  if (!result.ok) {
    if (result.reason === "not_found") return createSpoolNotFoundResponse();
    if (result.reason === "reserved_spool_change_requires_cancellation") {
      return createSpoolJsonResponse(
        {
          error: { code: result.reason, message: "Cancel reservations before changing this spool's matching labels." },
        },
        409,
      );
    }
    if (result.reason === "stock_below_reservations") {
      return createSpoolJsonResponse(
        {
          error: {
            code: result.reason,
            message: "Recorded stock cannot be lower than grams reserved from this spool.",
          },
        },
        409,
      );
    }
    return createSpoolDatabaseErrorResponse(result.error, result.status, "mutation");
  }
  return createSpoolJsonResponse({ spool: result.value });
};

export const ALL: APIRoute = (context) => {
  applySpoolPrivateHeaders(context.locals.authResponseHeaders);
  return createSpoolMethodNotAllowedResponse("POST");
};
