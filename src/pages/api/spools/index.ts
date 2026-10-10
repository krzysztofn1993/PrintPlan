import type { APIRoute } from "astro";
import {
  applySpoolPrivateHeaders,
  createSpoolDatabaseErrorResponse,
  createSpoolJsonResponse,
  createSpoolMalformedPayloadResponse,
  createSpoolMethodNotAllowedResponse,
  createSpoolUnsupportedMediaTypeResponse,
  createSpoolUnauthorizedResponse,
  createSpoolUnavailableResponse,
  createSpoolValidationResponse,
} from "@/lib/spool-response";
import { createSpool as insertSpool, listSpools } from "@/lib/spools";
import { hasSupportedSpoolFormContentType, readSpoolFormData, validateSpoolFormData } from "@/lib/spool-validation";

export const GET: APIRoute = async (context) => {
  applySpoolPrivateHeaders(context.locals.authResponseHeaders);
  const client = context.locals.supabase;
  if (context.locals.authUnavailable || !client) return createSpoolUnavailableResponse();
  const user = context.locals.user;
  if (!user) return createSpoolUnauthorizedResponse();

  const result = await listSpools(client, user.id);
  if (!result.ok) return createSpoolDatabaseErrorResponse(result.error);
  return createSpoolJsonResponse({ spools: result.value });
};

export const POST: APIRoute = async (context) => {
  applySpoolPrivateHeaders(context.locals.authResponseHeaders);
  const client = context.locals.supabase;
  if (context.locals.authUnavailable || !client) return createSpoolUnavailableResponse();
  const user = context.locals.user;
  if (!user) return createSpoolUnauthorizedResponse();
  if (!hasSupportedSpoolFormContentType(context.request)) {
    return createSpoolUnsupportedMediaTypeResponse();
  }

  const form = await readSpoolFormData(context.request);
  if (!form) return createSpoolMalformedPayloadResponse();
  const validation = validateSpoolFormData(form, "create");
  if (!validation.data || validation.payloadError) return createSpoolValidationResponse(validation);

  const result = await insertSpool(client, user.id, validation.data);
  if (!result.ok) return createSpoolDatabaseErrorResponse(result.error);
  return createSpoolJsonResponse({ spool: result.value }, 201);
};

export const ALL: APIRoute = (context) => {
  applySpoolPrivateHeaders(context.locals.authResponseHeaders);
  return createSpoolMethodNotAllowedResponse("GET, POST");
};
