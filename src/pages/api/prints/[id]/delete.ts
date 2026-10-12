import type { APIRoute } from "astro";
import {
  applyPrintPrivateHeaders,
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
import { deletePrint } from "@/lib/prints";
import { hasSupportedPrintFormContentType, isValidPrintId, readPrintFormData } from "@/lib/print-validation";

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
    if (Array.from(form.keys()).length > 0) {
      return createPrintValidationResponse({ fieldErrors: {}, payloadError: "unexpected_field" });
    }

    const result = await deletePrint(client, user.id, id);
    if (!result.ok) {
      if (result.reason === "not_found") return createPrintNotFoundResponse();
      return createPrintDatabaseErrorResponse(result.error, result.status, "mutation");
    }
    return createPrintJsonResponse({ id: result.value.id });
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
