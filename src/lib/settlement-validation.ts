import { MAX_REQUIRED_GRAMS, isValidPrintId } from "./print-validation.ts";

export const MAX_ACTUAL_GRAMS = MAX_REQUIRED_GRAMS;

export type SettlementField = "requestId" | "expectedVersion" | "reservationId" | "actualGrams";
export type SettlementFieldErrors = Partial<
  Record<SettlementField, { code: "required" | "invalid" | "out_of_range"; message: string }>
>;

export interface SettlementCommandInput {
  requestId: string;
  expectedVersion: number;
  reservationId: string;
  actualGrams: number;
}

export type SettlementFormValidation =
  | { ok: true; value: SettlementCommandInput }
  | { ok: false; reason: "invalid" | "unexpected_field"; fieldErrors: SettlementFieldErrors };

const SETTLEMENT_FIELDS = ["requestId", "expectedVersion", "reservationId", "actualGrams"] as const;
const DECIMAL_DIGITS = /^[0-9]+$/;

function singleText(form: FormData, field: SettlementField): { value?: string; error?: "required" | "invalid" } {
  const values = form.getAll(field);
  if (values.length === 0) return { error: "required" };
  if (values.length !== 1 || typeof values[0] !== "string") return { error: "invalid" };
  return { value: values[0] };
}

function parseIdentifier(
  value: string | undefined,
  field: "requestId" | "reservationId",
  errors: SettlementFieldErrors,
): string | undefined {
  if (!value) {
    errors[field] = { code: "required", message: "Provide a valid settlement identifier." };
    return undefined;
  }
  if (!isValidPrintId(value)) {
    errors[field] = { code: "invalid", message: "Provide a valid settlement identifier." };
    return undefined;
  }
  return value;
}

function parsePositiveInteger(
  value: string | undefined,
  field: "expectedVersion",
  errors: SettlementFieldErrors,
): number | undefined {
  if (value === undefined || value.length === 0) {
    errors[field] = { code: "required", message: "The print version is required." };
    return undefined;
  }
  if (!DECIMAL_DIGITS.test(value)) {
    errors[field] = { code: "invalid", message: "Enter a valid whole-number print version." };
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_REQUIRED_GRAMS) {
    errors[field] = { code: "out_of_range", message: "Enter a valid whole-number print version." };
    return undefined;
  }
  return parsed;
}

function parseActualGrams(value: string | undefined, errors: SettlementFieldErrors): number | undefined {
  if (value === undefined || value.length === 0) {
    errors.actualGrams = { code: "required", message: "Enter actual consumption in whole grams." };
    return undefined;
  }
  if (!DECIMAL_DIGITS.test(value)) {
    errors.actualGrams = { code: "invalid", message: "Use digits only for whole grams, including 0." };
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_ACTUAL_GRAMS) {
    errors.actualGrams = {
      code: "out_of_range",
      message: `Enter a whole-gram value from 0 to ${MAX_ACTUAL_GRAMS}.`,
    };
    return undefined;
  }
  return parsed;
}

export function validateSettlementFormData(form: FormData): SettlementFormValidation {
  const errors: SettlementFieldErrors = {};
  const unexpectedField = Array.from(form.keys()).some(
    (field) => !SETTLEMENT_FIELDS.includes(field as (typeof SETTLEMENT_FIELDS)[number]),
  );
  const requestValue = singleText(form, "requestId");
  const versionValue = singleText(form, "expectedVersion");
  const reservationValue = singleText(form, "reservationId");
  const gramsValue = singleText(form, "actualGrams");

  for (const [field, extracted] of [
    ["requestId", requestValue],
    ["expectedVersion", versionValue],
    ["reservationId", reservationValue],
    ["actualGrams", gramsValue],
  ] as const) {
    if (!extracted.error) continue;
    if (field === "actualGrams") {
      errors.actualGrams = {
        code: extracted.error,
        message:
          extracted.error === "required" ? "Enter actual consumption in whole grams." : "Provide one text value.",
      };
    } else if (field === "expectedVersion") {
      errors.expectedVersion = {
        code: extracted.error,
        message: extracted.error === "required" ? "The print version is required." : "Provide one text value.",
      };
    } else {
      errors[field] = {
        code: extracted.error,
        message: extracted.error === "required" ? "Provide a valid settlement identifier." : "Provide one text value.",
      };
    }
  }

  const requestId = requestValue.error ? undefined : parseIdentifier(requestValue.value, "requestId", errors);
  const expectedVersion = versionValue.error
    ? undefined
    : parsePositiveInteger(versionValue.value, "expectedVersion", errors);
  const reservationId = reservationValue.error
    ? undefined
    : parseIdentifier(reservationValue.value, "reservationId", errors);
  const actualGrams = gramsValue.error ? undefined : parseActualGrams(gramsValue.value, errors);

  if (unexpectedField) return { ok: false, reason: "unexpected_field", fieldErrors: errors };
  if (
    Object.keys(errors).length > 0 ||
    requestId === undefined ||
    expectedVersion === undefined ||
    reservationId === undefined ||
    actualGrams === undefined
  ) {
    return { ok: false, reason: "invalid", fieldErrors: errors };
  }
  return { ok: true, value: { requestId, expectedVersion, reservationId, actualGrams } };
}

export function hasSupportedSettlementFormContentType(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data";
}

export async function readSettlementFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
