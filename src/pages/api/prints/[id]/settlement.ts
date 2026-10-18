import type { APIRoute } from "astro";
import { applyPrintPrivateHeaders } from "@/lib/print-response";
import { readPrintSettlement, settlePrintConsumption } from "@/lib/settlements";
import {
  createSettlementMalformedPayloadResponse,
  createSettlementMethodNotAllowedResponse,
  createSettlementNotFoundResponse,
  createSettlementUnauthorizedResponse,
  createSettlementUnavailableResponse,
  createSettlementUnsupportedMediaTypeResponse,
  createSettlementValidationResponse,
  mapSettlementFailure,
  createSettlementJsonResponse,
} from "@/lib/settlement-response";
import {
  hasSupportedSettlementFormContentType,
  readSettlementFormData,
  validateSettlementFormData,
} from "@/lib/settlement-validation";
import { isValidPrintId } from "@/lib/print-validation";

export const GET: APIRoute = async (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createSettlementUnavailableResponse();
    if (!context.locals.user) return createSettlementUnauthorizedResponse();

    const printId = context.params.id ?? "";
    if (!isValidPrintId(printId)) return createSettlementNotFoundResponse();

    const result = await readPrintSettlement(client, printId);
    if (!result.ok) return mapSettlementFailure(result, "read");
    return createSettlementJsonResponse({ settlement: result.value });
  } catch (error) {
    return mapSettlementFailure(
      {
        ok: false,
        reason: "database_error",
        error: new Error("Unexpected settlement read boundary failure", { cause: error }),
      },
      "read",
    );
  }
};

export const POST: APIRoute = async (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createSettlementUnavailableResponse();
    const user = context.locals.user;
    if (!user) return createSettlementUnauthorizedResponse();

    const printId = context.params.id ?? "";
    if (!isValidPrintId(printId)) return createSettlementNotFoundResponse();
    if (!hasSupportedSettlementFormContentType(context.request)) return createSettlementUnsupportedMediaTypeResponse();
    const form = await readSettlementFormData(context.request);
    if (!form) return createSettlementMalformedPayloadResponse();

    const validation = validateSettlementFormData(form);
    if (!validation.ok)
      return createSettlementValidationResponse(validation.fieldErrors, validation.reason === "unexpected_field");

    const result = await settlePrintConsumption(client, printId, validation.value);
    if (!result.ok) return mapSettlementFailure(result, "mutation");
    return createSettlementJsonResponse({ settlement: result.value.settlement, replayed: result.value.replayed });
  } catch (error) {
    return mapSettlementFailure(
      {
        ok: false,
        reason: "database_error",
        error: new Error("Unexpected settlement mutation boundary failure", { cause: error }),
      },
      "mutation",
    );
  }
};

export const ALL: APIRoute = (context) => {
  applyPrintPrivateHeaders(context.locals.authResponseHeaders);
  return createSettlementMethodNotAllowedResponse("GET, POST");
};
