export const MAX_SPOOL_LABEL_CODE_POINTS = 80;
export const MAX_RECORDED_GRAMS = 2_147_483_647;

export type SpoolField = "material" | "colour" | "recordedGrams" | "id";
type SpoolFormField = Exclude<SpoolField, "id">;
export type SpoolFieldErrorCode = "required" | "invalid" | "too_long" | "out_of_range";
export type SpoolFieldErrors = Partial<Record<SpoolField, { code: SpoolFieldErrorCode; message: string }>>;
export type SpoolWriteMode = "create" | "edit";

export interface SpoolWriteInput {
  material: string;
  colour: string;
  recordedGrams: number;
}

export interface SpoolValidationResult {
  data?: SpoolWriteInput;
  fieldErrors: SpoolFieldErrors;
  payloadError?: "unexpected_field";
}

// eslint-disable-next-line no-control-regex -- Match the database's explicit cross-layer whitespace set.
const LABEL_WHITESPACE = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;
const DECIMAL_GRAMS = /^[0-9]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORM_FIELDS = ["material", "colour", "recordedGrams"] as const satisfies readonly SpoolFormField[];
const ALLOWED_FIELDS = new Set<string>(FORM_FIELDS);

/** Normalize only the whitespace characters shared with the database trigger. */
export function normalizeSpoolLabel(value: string): string {
  return value.replace(LABEL_WHITESPACE, " ").replace(/^ +| +$/g, "");
}

export function isValidSpoolId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function validateLabel(value: unknown, field: "material" | "colour", errors: SpoolFieldErrors): string | undefined {
  if (typeof value !== "string") {
    errors[field] = {
      code: value === undefined || value === null ? "required" : "invalid",
      message: value === undefined || value === null ? "This field is required." : "Enter a text label.",
    };
    return undefined;
  }

  const normalized = normalizeSpoolLabel(value);
  if (normalized.length === 0) {
    errors[field] = { code: "required", message: "This field is required." };
    return undefined;
  }
  if (codePointLength(normalized) > MAX_SPOOL_LABEL_CODE_POINTS) {
    errors[field] = {
      code: "too_long",
      message: `Use no more than ${MAX_SPOOL_LABEL_CODE_POINTS} characters.`,
    };
    return undefined;
  }
  return normalized;
}

function validateRecordedGrams(value: unknown, mode: SpoolWriteMode, errors: SpoolFieldErrors): number | undefined {
  if (typeof value !== "string") {
    errors.recordedGrams = {
      code: value === undefined || value === null ? "required" : "invalid",
      message:
        value === undefined || value === null
          ? "Enter a stock amount in whole grams."
          : "Enter a whole number of grams.",
    };
    return undefined;
  }
  if (value.length === 0) {
    errors.recordedGrams = { code: "required", message: "Enter a stock amount in whole grams." };
    return undefined;
  }
  if (!DECIMAL_GRAMS.test(value)) {
    errors.recordedGrams = { code: "invalid", message: "Enter a whole number using digits only." };
    return undefined;
  }

  const grams = Number(value);
  const minimum = mode === "create" ? 1 : 0;
  if (!Number.isFinite(grams) || grams < minimum || grams > MAX_RECORDED_GRAMS) {
    errors.recordedGrams = {
      code: "out_of_range",
      message:
        mode === "create"
          ? `Enter a value from 1 to ${MAX_RECORDED_GRAMS} g.`
          : `Enter a value from 0 to ${MAX_RECORDED_GRAMS} g.`,
    };
    return undefined;
  }
  return grams;
}

export function validateSpoolInput(
  input: { material: unknown; colour: unknown; recordedGrams: unknown },
  mode: SpoolWriteMode,
): SpoolValidationResult {
  const fieldErrors: SpoolFieldErrors = {};
  const material = validateLabel(input.material, "material", fieldErrors);
  const colour = validateLabel(input.colour, "colour", fieldErrors);
  const recordedGrams = validateRecordedGrams(input.recordedGrams, mode, fieldErrors);

  if (
    Object.keys(fieldErrors).length > 0 ||
    material === undefined ||
    colour === undefined ||
    recordedGrams === undefined
  ) {
    return { fieldErrors };
  }
  return { data: { material, colour, recordedGrams }, fieldErrors };
}

function getSingleFormValue(form: FormData, field: SpoolFormField): { value?: string; error?: "required" | "invalid" } {
  const values = form.getAll(field);
  if (values.length === 0) return { error: "required" };
  if (values.length !== 1 || typeof values[0] !== "string") return { error: "invalid" };
  return { value: values[0] };
}

export function validateSpoolFormData(form: FormData, mode: SpoolWriteMode): SpoolValidationResult {
  const unexpectedField = Array.from(form.keys()).some((field) => !ALLOWED_FIELDS.has(field));
  const fieldValues = Object.fromEntries(
    FORM_FIELDS.map((field) => [field, getSingleFormValue(form, field)]),
  ) as Record<SpoolFormField, { value?: string; error?: "required" | "invalid" }>;
  const validation = validateSpoolInput(
    {
      material: fieldValues.material.value,
      colour: fieldValues.colour.value,
      recordedGrams: fieldValues.recordedGrams.value,
    },
    mode,
  );

  for (const field of FORM_FIELDS) {
    const extractionError = fieldValues[field].error;
    if (extractionError) {
      validation.fieldErrors[field] =
        extractionError === "required"
          ? {
              code: "required",
              message: field === "recordedGrams" ? "Enter a stock amount in whole grams." : "This field is required.",
            }
          : { code: "invalid", message: "Provide exactly one text value for this field." };
    }
  }

  if (unexpectedField) return { fieldErrors: validation.fieldErrors, payloadError: "unexpected_field" };
  if (Object.keys(validation.fieldErrors).length > 0) return validation;
  return validation;
}

export async function readSpoolFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

export function hasSupportedSpoolFormContentType(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data";
}
