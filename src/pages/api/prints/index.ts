import type { APIRoute } from "astro";
import {
  applyPrintPrivateHeaders,
  createPrintDatabaseErrorResponse,
  createPrintJsonResponse,
  createPrintMalformedPayloadResponse,
  createPrintMethodNotAllowedResponse,
  createPrintUnauthorizedResponse,
  createPrintUnavailableResponse,
  createPrintUnsupportedMediaTypeResponse,
  createPrintValidationResponse,
} from "@/lib/print-response";
import { createPrint, listPrints } from "@/lib/prints";
import { hasSupportedPrintFormContentType, readPrintFormData, validatePrintFormData } from "@/lib/print-validation";

export const GET: APIRoute = async (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createPrintUnavailableResponse();
    const user = context.locals.user;
    if (!user) return createPrintUnauthorizedResponse();

    const result = await listPrints(client, user.id);
    if (!result.ok) return createPrintDatabaseErrorResponse(result.error, result.status, "read");
    return createPrintJsonResponse({ prints: result.value });
  } catch (error) {
    return createPrintDatabaseErrorResponse(
      new Error("Unexpected print API boundary failure", { cause: error }),
      undefined,
      "read",
    );
  }
};

export const POST: APIRoute = async (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createPrintUnavailableResponse();
    const user = context.locals.user;
    if (!user) return createPrintUnauthorizedResponse();
    if (!hasSupportedPrintFormContentType(context.request)) return createPrintUnsupportedMediaTypeResponse();

    const form = await readPrintFormData(context.request);
    if (!form) return createPrintMalformedPayloadResponse();
    const validation = validatePrintFormData(form, "create");
    if (!validation.data || validation.payloadError) return createPrintValidationResponse(validation);

    const result = await createPrint(client, user.id, validation.data);
    if (!result.ok) return createPrintDatabaseErrorResponse(result.error, result.status, "mutation");
    return createPrintJsonResponse({ print: result.value }, 201);
  } catch (error) {
    return createPrintDatabaseErrorResponse(
      new Error("Unexpected print API boundary failure", { cause: error }),
      undefined,
      "mutation",
    );
  }
};

export const ALL: APIRoute = (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  return createPrintMethodNotAllowedResponse("GET, POST");
};
