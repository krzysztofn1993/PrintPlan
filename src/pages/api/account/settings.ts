import type { APIRoute } from "astro";
import { getAccountSettings, saveAccountSafetyMargin } from "@/lib/account-settings";
import {
  applyAccountSettingsPrivateHeaders,
  createAccountSettingsJsonResponse,
  createAccountSettingsMalformedPayloadResponse,
  createAccountSettingsMethodNotAllowedResponse,
  createAccountSettingsUnauthorizedResponse,
  createAccountSettingsUnavailableResponse,
  createAccountSettingsUnsupportedMediaTypeResponse,
  createAccountSettingsValidationResponse,
  mapAccountSettingsFailure,
} from "@/lib/account-settings-response";
import {
  hasSupportedAccountSettingsFormContentType,
  readAccountSettingsFormData,
  validateAccountSettingsForm,
} from "@/lib/account-settings-validation";

function applyPrivateHeaders(context: Parameters<APIRoute>[0]): void {
  applyAccountSettingsPrivateHeaders(context.locals.authResponseHeaders);
}

export const GET: APIRoute = async (context) => {
  applyPrivateHeaders(context);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createAccountSettingsUnavailableResponse();
    if (!context.locals.user) return createAccountSettingsUnauthorizedResponse();

    const result = await getAccountSettings(client);
    if (!result.ok) return mapAccountSettingsFailure(result, "read");
    return createAccountSettingsJsonResponse({ settings: result.value });
  } catch (error) {
    return mapAccountSettingsFailure(
      {
        reason: "database_error",
        error: new Error("Unexpected account settings API boundary failure", { cause: error }),
      },
      "read",
    );
  }
};

export const POST: APIRoute = async (context) => {
  applyPrivateHeaders(context);
  try {
    const client = context.locals.supabase;
    if (context.locals.authUnavailable || !client) return createAccountSettingsUnavailableResponse("mutation");
    if (!context.locals.user) return createAccountSettingsUnauthorizedResponse();
    if (!hasSupportedAccountSettingsFormContentType(context.request)) {
      return createAccountSettingsUnsupportedMediaTypeResponse();
    }

    const form = await readAccountSettingsFormData(context.request);
    if (!form) return createAccountSettingsMalformedPayloadResponse();
    const validation = validateAccountSettingsForm(form);
    if (!validation.ok) return createAccountSettingsValidationResponse(validation);

    const result = await saveAccountSafetyMargin(client, validation.value);
    if (!result.ok) return mapAccountSettingsFailure(result, "mutation");
    return createAccountSettingsJsonResponse({ settings: result.value });
  } catch (error) {
    return mapAccountSettingsFailure(
      {
        reason: "database_error",
        error: new Error("Unexpected account settings API boundary failure", { cause: error }),
      },
      "mutation",
    );
  }
};

export const ALL: APIRoute = (context) => {
  applyPrivateHeaders(context);
  return createAccountSettingsMethodNotAllowedResponse("GET, POST");
};
