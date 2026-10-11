import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import {
  isValidSpoolId,
  MAX_RECORDED_GRAMS,
  validateSpoolInput,
  type SpoolField,
  type SpoolFieldErrors,
} from "@/lib/spool-validation";
import type { SpoolDto } from "@/lib/spools";

interface SpoolFormProps {
  mode: "create" | "edit";
  spool?: SpoolDto;
  onSaved: (spool: SpoolDto) => void;
  onCancel: () => void;
}

type RequestErrorKind = "retryable" | "unauthenticated" | "uncertain" | "generic";

type ApiFieldName = Exclude<SpoolField, "id">;

const materialSuggestions = ["PLA", "PETG", "ABS", "ASA", "TPU"];
const colourSuggestions = ["Black", "White", "Red", "Blue", "Black / Red / Gold"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readSpool(value: unknown): SpoolDto | undefined {
  if (!isRecord(value)) return undefined;
  const { id, material, colour, createdAt, updatedAt, recordedGrams, reservedGrams, availableGrams } = value;
  if (
    typeof id !== "string" ||
    !isValidSpoolId(id) ||
    typeof material !== "string" ||
    typeof colour !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string" ||
    typeof recordedGrams !== "number" ||
    !Number.isSafeInteger(recordedGrams) ||
    typeof reservedGrams !== "number" ||
    !Number.isSafeInteger(reservedGrams) ||
    typeof availableGrams !== "number" ||
    !Number.isSafeInteger(availableGrams)
  ) {
    return undefined;
  }
  return { id, material, colour, createdAt, updatedAt, recordedGrams, reservedGrams, availableGrams };
}

function messageForFieldError(field: ApiFieldName, code: unknown): string | undefined {
  if (code === "required") {
    return field === "recordedGrams" ? "Enter a stock amount in whole grams." : "Enter a label for this field.";
  }
  if (code === "invalid") {
    return field === "recordedGrams" ? "Enter a whole number using digits only." : "Enter a text label.";
  }
  if (code === "too_long") {
    return field === "material"
      ? "The normalized material label must be no longer than 80 characters."
      : "Use no more than 80 characters for the colour label.";
  }
  if (field === "recordedGrams" && code === "out_of_range") {
    return "Enter a whole-gram amount within the allowed range.";
  }
  return undefined;
}

function readFieldErrors(value: unknown): SpoolFieldErrors {
  if (!isRecord(value)) return {};
  const errors: SpoolFieldErrors = {};
  for (const field of ["material", "colour", "recordedGrams"] as const) {
    const candidate = value[field];
    if (!isRecord(candidate)) continue;
    const message = messageForFieldError(field, candidate.code);
    if (message)
      errors[field] = { code: candidate.code as NonNullable<SpoolFieldErrors[typeof field]>["code"], message };
  }
  return errors;
}

function firstErrorField(errors: SpoolFieldErrors): ApiFieldName | undefined {
  return (["material", "colour", "recordedGrams"] as const).find((field) => Boolean(errors[field]));
}

function describeField(field: ApiFieldName): string {
  if (field === "recordedGrams") return "Stock amount";
  return field === "material" ? "Material" : "Colour";
}

export function SpoolForm({ mode, spool, onSaved, onCancel }: SpoolFormProps) {
  const prefix = mode === "create" ? "new-spool" : `edit-spool-${spool?.id ?? "item"}`;
  const [material, setMaterial] = useState(spool?.material ?? "");
  const [colour, setColour] = useState(spool?.colour ?? "");
  const [recordedGrams, setRecordedGrams] = useState(spool ? String(spool.recordedGrams) : "");
  const [fieldErrors, setFieldErrors] = useState<SpoolFieldErrors>({});
  const [requestError, setRequestError] = useState<{ kind: RequestErrorKind; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const materialInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    materialInputRef.current?.focus();
  }, []);

  function focusField(field: ApiFieldName | undefined) {
    if (field) window.requestAnimationFrame(() => document.getElementById(`${prefix}-${field}`)?.focus());
  }

  function clearFieldError(field: ApiFieldName) {
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setRequestError(null);
  }

  function receiveValidationErrors(errors: SpoolFieldErrors) {
    setFieldErrors(errors);
    setRequestError({ kind: "generic", message: "Please review the highlighted fields and try again." });
    focusField(firstErrorField(errors));
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || requestError?.kind === "uncertain") return;

    const validation = validateSpoolInput({ material, colour, recordedGrams }, mode);
    if (!validation.data) {
      receiveValidationErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    setRequestError(null);
    setPending(true);

    const payload = new URLSearchParams({ material, colour, recordedGrams });
    const endpoint = mode === "create" ? "/api/spools" : `/api/spools/${spool?.id}/update`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload,
      });
    } catch {
      setRequestError({
        kind: "uncertain",
        message: "We couldn't confirm whether the save reached the server. Refresh stock before trying again.",
      });
      setPending(false);
      return;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    const expectedStatus = mode === "create" ? 201 : 200;
    if (response.ok) {
      if (response.status === expectedStatus) {
        const saved = isRecord(body) ? readSpool(body.spool) : undefined;
        if (saved) {
          onSaved(saved);
          return;
        }
      }
      setRequestError({
        kind: "uncertain",
        message: "The save may have completed, but its result could not be read. Refresh stock before trying again.",
      });
      setPending(false);
      return;
    }

    if (response.status === 422) {
      const apiError = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      const errors = readFieldErrors(apiError?.fieldErrors);
      if (Object.keys(errors).length > 0) {
        receiveValidationErrors(errors);
      } else {
        setRequestError({ kind: "generic", message: "Please review the form and try again." });
      }
    } else if (response.status === 401) {
      setRequestError({ kind: "unauthenticated", message: "Your session has expired. Sign in to continue." });
    } else if (response.status === 404) {
      setRequestError({
        kind: "generic",
        message: "This spool is no longer available. Refresh stock to see the latest inventory.",
      });
    } else if (response.status === 503) {
      setRequestError({
        kind: "retryable",
        message: "Stock is temporarily unavailable. Review the form and try again.",
      });
    } else if (response.status === 403) {
      setRequestError({ kind: "generic", message: "This request was rejected. Check the form and try again." });
    } else {
      setRequestError({ kind: "generic", message: "We couldn't save your changes. Please try again." });
    }
    setPending(false);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <FormField
          id={`${prefix}-material`}
          name="material"
          label="Material"
          value={material}
          inputRef={materialInputRef}
          onChange={(value) => {
            setMaterial(value);
            clearFieldError("material");
          }}
          placeholder="PLA"
          list={`${prefix}-material-options`}
          required
          minLength={1}
          autoComplete="off"
          disabled={pending}
          hint="Suggestions are optional. Enter any valid material label, up to 80 characters."
          error={fieldErrors.material?.message}
        />
        <datalist id={`${prefix}-material-options`}>
          {materialSuggestions.map((suggestion) => (
            <option value={suggestion} key={suggestion} />
          ))}
        </datalist>
        <FormField
          id={`${prefix}-colour`}
          name="colour"
          label="Colour"
          value={colour}
          onChange={(value) => {
            setColour(value);
            clearFieldError("colour");
          }}
          placeholder="Black / Red / Gold"
          list={`${prefix}-colour-options`}
          required
          minLength={1}
          autoComplete="off"
          disabled={pending}
          hint="Keep multicolour names together, for example Black / Red / Gold."
          error={fieldErrors.colour?.message}
        />
        <datalist id={`${prefix}-colour-options`}>
          {colourSuggestions.map((suggestion) => (
            <option value={suggestion} key={suggestion} />
          ))}
        </datalist>
        <FormField
          id={`${prefix}-recordedGrams`}
          name="recordedGrams"
          label="Recorded stock (g)"
          type="number"
          inputMode="numeric"
          value={recordedGrams}
          onChange={(value) => {
            setRecordedGrams(value);
            clearFieldError("recordedGrams");
          }}
          required
          min={mode === "create" ? 1 : 0}
          max={MAX_RECORDED_GRAMS}
          step={1}
          disabled={pending}
          hint={
            mode === "create"
              ? "Enter 1 g or more in whole grams."
              : "Enter a whole-gram estimate; 0 g keeps this spool."
          }
          error={fieldErrors.recordedGrams?.message}
        />
      </div>

      {mode === "edit" && spool && (
        <p className="text-muted-foreground text-xs break-all">
          Editing spool ID <code>{spool.id}</code>
        </p>
      )}

      {requestError && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
        >
          <p>{requestError.message}</p>
          {requestError.kind === "unauthenticated" && (
            <a
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              href="/auth/signin"
            >
              Sign in
            </a>
          )}
          {requestError.kind === "uncertain" && (
            <a
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              href="/dashboard/spools"
            >
              Refresh stock
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <Button type="submit" disabled={pending || requestError?.kind === "uncertain"}>
          {pending ? "Saving…" : mode === "create" ? "Add spool" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? `Saving ${describeField("material").toLowerCase()} and stock.` : ""}
      </p>
    </form>
  );
}
