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
import { deleteSpool } from "@/lib/spools";
import { hasSupportedSpoolFormContentType, isValidSpoolId, readSpoolFormData } from "@/lib/spool-validation";

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
  if (Array.from(form.keys()).length > 0) {
    return createSpoolValidationResponse({ fieldErrors: {}, payloadError: "unexpected_field" });
  }

  const result = await deleteSpool(client, user.id, id);
  if (!result.ok) {
    if (result.reason === "not_found") return createSpoolNotFoundResponse();
    return createSpoolDatabaseErrorResponse(result.error, result.status, "mutation");
  }
  return createSpoolJsonResponse(result.value);
};

export const ALL: APIRoute = (context) => {
  applySpoolPrivateHeaders(context.locals.authResponseHeaders);
  return createSpoolMethodNotAllowedResponse("POST");
};
