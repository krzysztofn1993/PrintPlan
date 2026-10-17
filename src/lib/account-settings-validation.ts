export const MAX_ACCOUNT_SETTINGS_VERSION = 2_147_483_647;

export type AccountSettingsField = "marginPercent" | "expectedVersion";
export type AccountSettingsFieldErrors = Partial<
  Record<AccountSettingsField, { code: "required" | "invalid" | "out_of_range"; message: string }>
>;

export type AccountSettingsFormResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid" | "unexpected_field"; fieldErrors?: AccountSettingsFieldErrors };

export interface AccountSettingsSaveInput {
  marginPercent: number;
  expectedVersion: number;
}

function singleText(form: FormData, key: AccountSettingsField, errors: AccountSettingsFieldErrors): string | undefined {
  const values = form.getAll(key);
  if (values.length === 0) return undefined;
  if (values.length !== 1 || typeof values[0] !== "string") {
    errors[key] = { code: "invalid", message: "Provide exactly one text value for this setting." };
    return undefined;
  }
  return values[0];
}

function readInteger(
  value: string | undefined,
  field: AccountSettingsField,
  min: number,
  max: number,
  errors: AccountSettingsFieldErrors,
): number | undefined {
  if (value === undefined || value.length === 0) {
    errors[field] = {
      code: value === undefined ? "required" : "invalid",
      message:
        field === "marginPercent"
          ? "Enter a whole percentage from 0 to 100."
          : "The saved settings version is required.",
    };
    return undefined;
  }
  if (!/^[0-9]+$/.test(value)) {
    errors[field] = {
      code: "invalid",
      message:
        field === "marginPercent" ? "Enter a whole percentage using digits only." : "Enter a valid settings version.",
    };
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    errors[field] = {
      code: "out_of_range",
      message: field === "marginPercent" ? "Enter a value from 0 to 100." : "Enter a valid settings version.",
    };
    return undefined;
  }
  return parsed;
}

export function validateAccountSettingsForm(form: FormData): AccountSettingsFormResult<AccountSettingsSaveInput> {
  const allowed = new Set<AccountSettingsField>(["marginPercent", "expectedVersion"]);
  if (Array.from(form.keys()).some((key) => !allowed.has(key as AccountSettingsField))) {
    return { ok: false, reason: "unexpected_field" };
  }

  const errors: AccountSettingsFieldErrors = {};
  const marginValue = singleText(form, "marginPercent", errors);
  const versionValue = singleText(form, "expectedVersion", errors);
  const marginPercent = errors.marginPercent ? undefined : readInteger(marginValue, "marginPercent", 0, 100, errors);
  const expectedVersion = errors.expectedVersion
    ? undefined
    : readInteger(versionValue, "expectedVersion", 0, MAX_ACCOUNT_SETTINGS_VERSION, errors);
  if (Object.keys(errors).length > 0 || marginPercent === undefined || expectedVersion === undefined) {
    return { ok: false, reason: "invalid", fieldErrors: errors };
  }
  return { ok: true, value: { marginPercent, expectedVersion } };
}

export async function readAccountSettingsFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

export function hasSupportedAccountSettingsFormContentType(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data";
}
