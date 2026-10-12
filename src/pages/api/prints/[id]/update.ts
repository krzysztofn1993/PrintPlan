import type { APIRoute } from "astro";
import {
  applyPrintPrivateHeaders,
  createPrintConflictResponse,
  createPrintDatabaseErrorResponse,
  createPrintInvalidIdResponse,
  createPrintJsonResponse,
  createPrintMalformedPayloadResponse,
  createPrintMethodNotAllowedResponse,
  createPrintNotFoundResponse,
  createPrintUnauthorizedResponse,
  createPrintUnavailableResponse,
  createPrintUnsupportedMediaTypeResponse,
  createPrintValidationResponse,
} from "@/lib/print-response";
import { updatePrint } from "@/lib/prints";
import {
  hasSupportedPrintFormContentType,
  isValidPrintId,
  readPrintFormData,
  validatePrintFormData,
} from "@/lib/print-validation";

export const POST: APIRoute = async (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createPrintUnavailableResponse();
    const user = context.locals.user;
    if (!user) return createPrintUnauthorizedResponse();

    const id = context.params.id ?? "";
    if (!isValidPrintId(id)) return createPrintInvalidIdResponse();
    if (!hasSupportedPrintFormContentType(context.request)) return createPrintUnsupportedMediaTypeResponse();
    const form = await readPrintFormData(context.request);
    if (!form) return createPrintMalformedPayloadResponse();

    const validation = validatePrintFormData(form, "edit");
    if (!validation.data || validation.expectedVersion === undefined || validation.payloadError) {
      return createPrintValidationResponse(validation);
    }

    const result = await updatePrint(client, user.id, id, validation.expectedVersion, validation.data);
    if (!result.ok) {
      if (result.reason === "not_found") return createPrintNotFoundResponse();
      if (result.reason === "conflict") return createPrintConflictResponse();
      return createPrintDatabaseErrorResponse(result.error, result.status, "mutation");
    }
    return createPrintJsonResponse({ print: result.value });
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
  return createPrintMethodNotAllowedResponse("POST");
};
