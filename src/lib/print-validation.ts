export const MAX_PRINT_LABEL_CODE_POINTS = 80;
export const MAX_REQUIRED_GRAMS = 2_147_483_647;

export type PrintField = "name" | "material" | "colour" | "requiredGrams" | "expectedVersion" | "id";
type PrintEditableField = Exclude<PrintField, "expectedVersion" | "id">;
export type PrintFieldErrorCode = "required" | "invalid" | "too_long" | "out_of_range";
export type PrintFieldErrors = Partial<Record<PrintField, { code: PrintFieldErrorCode; message: string }>>;
export type PrintWriteMode = "create" | "edit";

export interface PrintWriteInput {
  name: string | null;
  material: string;
  colour: string;
  requiredGrams: number;
}

export interface PrintValidationResult {
  data?: PrintWriteInput;
  expectedVersion?: number;
  fieldErrors: PrintFieldErrors;
  payloadError?: "unexpected_field";
}

// eslint-disable-next-line no-control-regex -- Match the database's explicit cross-layer whitespace set.
const LABEL_WHITESPACE = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/g;
const DECIMAL_DIGITS = /^[0-9]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_FIELDS = [
  "name",
  "material",
  "colour",
  "requiredGrams",
] as const satisfies readonly PrintEditableField[];

/** Normalize only the whitespace characters shared with the database trigger. */
export function normalizePrintText(value: string): string {
  return value.replace(LABEL_WHITESPACE, " ").replace(/^ +| +$/g, "");
}

export function isValidPrintId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function validateOptionalName(value: unknown, errors: PrintFieldErrors): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    errors.name = { code: "invalid", message: "Enter a text name." };
    return undefined;
  }
  const normalized = normalizePrintText(value);
  if (normalized.length === 0) return null;
  if (codePointLength(normalized) > MAX_PRINT_LABEL_CODE_POINTS) {
    errors.name = {
      code: "too_long",
      message: `Use no more than ${MAX_PRINT_LABEL_CODE_POINTS} characters.`,
    };
    return undefined;
  }
  return normalized;
}

function validateLabel(value: unknown, field: "material" | "colour", errors: PrintFieldErrors): string | undefined {
  if (typeof value !== "string") {
    errors[field] = {
      code: value === undefined || value === null ? "required" : "invalid",
      message: value === undefined || value === null ? "This field is required." : "Enter a text label.",
    };
    return undefined;
  }
  const normalized = normalizePrintText(value);
  if (normalized.length === 0) {
    errors[field] = { code: "required", message: "This field is required." };
    return undefined;
  }
  if (codePointLength(normalized) > MAX_PRINT_LABEL_CODE_POINTS) {
    errors[field] = {
      code: "too_long",
      message: `Use no more than ${MAX_PRINT_LABEL_CODE_POINTS} characters.`,
    };
    return undefined;
  }
  return normalized;
}

function validateRequiredGrams(value: unknown, errors: PrintFieldErrors): number | undefined {
  if (typeof value !== "string") {
    errors.requiredGrams = {
      code: value === undefined || value === null ? "required" : "invalid",
      message:
        value === undefined || value === null
          ? "Enter required grams as a whole number."
          : "Enter a whole number of grams.",
    };
    return undefined;
  }
  if (value.length === 0) {
    errors.requiredGrams = { code: "required", message: "Enter required grams as a whole number." };
    return undefined;
  }
  if (!DECIMAL_DIGITS.test(value)) {
    errors.requiredGrams = { code: "invalid", message: "Enter a whole number using digits only." };
    return undefined;
  }
  const grams = Number(value);
  if (!Number.isSafeInteger(grams) || grams < 1 || grams > MAX_REQUIRED_GRAMS) {
    errors.requiredGrams = {
      code: "out_of_range",
      message: `Enter a value from 1 to ${MAX_REQUIRED_GRAMS} g.`,
    };
    return undefined;
  }
  return grams;
}

function validateExpectedVersion(value: unknown, errors: PrintFieldErrors): number | undefined {
  if (typeof value !== "string") {
    errors.expectedVersion = {
      code: value === undefined || value === null ? "required" : "invalid",
      message: "The print version is required.",
    };
    return undefined;
  }
  if (!DECIMAL_DIGITS.test(value)) {
    errors.expectedVersion = { code: "invalid", message: "Enter a valid print version." };
    return undefined;
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1 || version > MAX_REQUIRED_GRAMS) {
    errors.expectedVersion = { code: "out_of_range", message: "Enter a valid print version." };
    return undefined;
  }
  return version;
}

export function validatePrintInput(
  input: { name?: unknown; material: unknown; colour: unknown; requiredGrams: unknown },
  _mode: PrintWriteMode,
): Omit<PrintValidationResult, "expectedVersion" | "payloadError"> {
  const fieldErrors: PrintFieldErrors = {};
  const name = validateOptionalName(input.name, fieldErrors);
  const material = validateLabel(input.material, "material", fieldErrors);
  const colour = validateLabel(input.colour, "colour", fieldErrors);
  const requiredGrams = validateRequiredGrams(input.requiredGrams, fieldErrors);

  if (
    Object.keys(fieldErrors).length > 0 ||
    name === undefined ||
    material === undefined ||
    colour === undefined ||
    requiredGrams === undefined
  ) {
    return { fieldErrors };
  }
  return { data: { name, material, colour, requiredGrams }, fieldErrors };
}

function readSingleValue(
  form: FormData,
  field: PrintEditableField | "expectedVersion",
  optional = false,
): { value?: string; error?: "required" | "invalid" } {
  const values = form.getAll(field);
  if (values.length === 0) return optional ? {} : { error: "required" };
  if (values.length !== 1 || typeof values[0] !== "string") return { error: "invalid" };
  return { value: values[0] };
}

export function validatePrintFormData(form: FormData, mode: PrintWriteMode): PrintValidationResult {
  const allowedFields = new Set<string>([...EDITABLE_FIELDS, ...(mode === "edit" ? ["expectedVersion"] : [])]);
  const unexpectedField = Array.from(form.keys()).some((field) => !allowedFields.has(field));
  const fieldValues = Object.fromEntries(
    EDITABLE_FIELDS.map((field) => [field, readSingleValue(form, field, field === "name")]),
  ) as Record<PrintEditableField, { value?: string; error?: "required" | "invalid" }>;
  const validation = validatePrintInput(
    {
      name: fieldValues.name.value,
      material: fieldValues.material.value,
      colour: fieldValues.colour.value,
      requiredGrams: fieldValues.requiredGrams.value,
    },
    mode,
  );

  for (const field of EDITABLE_FIELDS) {
    const extractionError = fieldValues[field].error;
    if (!extractionError) continue;
    validation.fieldErrors[field] =
      extractionError === "required"
        ? {
            code: "required",
            message: field === "requiredGrams" ? "Enter required grams as a whole number." : "This field is required.",
          }
        : { code: "invalid", message: "Provide exactly one text value for this field." };
  }

  let expectedVersion: number | undefined;
  if (mode === "edit") {
    const extracted = readSingleValue(form, "expectedVersion");
    if (extracted.error) {
      validation.fieldErrors.expectedVersion =
        extracted.error === "required"
          ? { code: "required", message: "The print version is required." }
          : { code: "invalid", message: "Provide exactly one text value for the print version." };
    } else {
      expectedVersion = validateExpectedVersion(extracted.value, validation.fieldErrors);
    }
  }

  if (unexpectedField) return { fieldErrors: validation.fieldErrors, payloadError: "unexpected_field" };
  if (Object.keys(validation.fieldErrors).length > 0 || !validation.data) return validation;
  return { data: validation.data, expectedVersion, fieldErrors: validation.fieldErrors };
}

export async function readPrintFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

export function hasSupportedPrintFormContentType(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data";
}
