import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { readSpoolDto } from "@/lib/spool-dto";
import { MAX_RECORDED_GRAMS, validateSpoolInput, type SpoolField, type SpoolFieldErrors } from "@/lib/spool-validation";
import type { SpoolDto } from "@/lib/spools";

interface SpoolFormProps {
  mode: "create" | "edit";
  spool?: SpoolDto;
  mutationPending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: (spool: SpoolDto) => void;
  onCancel: () => void;
  onUncertain: () => void;
  onRefreshLatest: () => Promise<boolean>;
  mutationGuarded: boolean;
}

type RequestErrorKind = "retryable" | "unauthenticated" | "uncertain" | "generic";

type ApiFieldName = Exclude<SpoolField, "id">;

const materialSuggestions = ["PLA", "PETG", "ABS", "ASA", "TPU"];
const colourSuggestions = ["Black", "White", "Red", "Blue", "Black / Red / Gold"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

export function SpoolForm({
  mode,
  spool,
  mutationPending,
  onPendingChange,
  onSaved,
  onCancel,
  onUncertain,
  onRefreshLatest,
  mutationGuarded,
}: SpoolFormProps) {
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
    setRequestError((previous) => (previous?.kind === "uncertain" ? previous : null));
  }

  function receiveValidationErrors(errors: SpoolFieldErrors) {
    setFieldErrors(errors);
    setRequestError({ kind: "generic", message: "Please review the highlighted fields and try again." });
    focusField(firstErrorField(errors));
  }

  function updatePending(nextPending: boolean) {
    setPending(nextPending);
    onPendingChange(nextPending);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || mutationPending || mutationGuarded || requestError?.kind === "uncertain") return;

    const validation = validateSpoolInput({ material, colour, recordedGrams }, mode);
    if (!validation.data) {
      receiveValidationErrors(validation.fieldErrors);
      return;
    }

    setFieldErrors({});
    setRequestError(null);
    updatePending(true);

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
      onUncertain();
      setRequestError({
        kind: "uncertain",
        message: "We couldn't confirm whether the save reached the server. Refresh stock before trying again.",
      });
      updatePending(false);
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
        const saved = isRecord(body) ? readSpoolDto(body.spool) : undefined;
        if (saved) {
          updatePending(false);
          onSaved(saved);
          return;
        }
      }
      setRequestError({
        kind: "uncertain",
        message: "The save may have completed, but its result could not be read. Refresh stock before trying again.",
      });
      onUncertain();
      updatePending(false);
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
    } else if (response.status === 409) {
      const apiError = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      const code = apiError?.code;
      setRequestError({
        kind: "generic",
        message:
          code === "reserved_spool_change_requires_cancellation"
            ? "Cancel this spool's reservations before changing its matching material or colour."
            : code === "stock_below_reservations"
              ? `Recorded stock must stay at or above ${spool?.reservedGrams ?? 0} g while reservations are active.`
              : "This spool changed. Refresh stock and review its current reservation amounts.",
      });
    } else if (response.status >= 500) {
      onUncertain();
      setRequestError({
        kind: "uncertain",
        message: "The save outcome may be uncertain. Refresh stock and review it before trying again.",
      });
    } else if (response.status === 403) {
      setRequestError({ kind: "generic", message: "This request was rejected. Check the form and try again." });
    } else {
      setRequestError({ kind: "generic", message: "We couldn't save your changes. Please try again." });
    }
    updatePending(false);
  }

  async function refreshLatest() {
    if (!window.confirm("Refreshing stock will discard unsaved form entries. Continue?")) return;
    setPending(true);
    const refreshed = await onRefreshLatest();
    if (!refreshed) setPending(false);
    else setRequestError(null);
  }

  return (
    <form className="carbon-collection-form" onSubmit={handleSubmit} noValidate>
      <div className="carbon-form-grid">
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
          disabled={pending || mutationPending || Boolean(spool?.reservedGrams)}
          hint={
            spool?.reservedGrams
              ? "Cancel this spool's reservations before changing its matching material."
              : "Suggestions are optional. Enter any valid material label, up to 80 characters."
          }
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
          disabled={pending || mutationPending || Boolean(spool?.reservedGrams)}
          hint={
            spool?.reservedGrams
              ? "Cancel this spool's reservations before changing its matching colour."
              : "Keep multicolour names together, for example Black / Red / Gold."
          }
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
          min={mode === "create" ? 1 : (spool?.reservedGrams ?? 0)}
          max={MAX_RECORDED_GRAMS}
          step={1}
          disabled={pending || mutationPending}
          hint={
            mode === "create"
              ? "Enter 1 g or more in whole grams."
              : spool?.reservedGrams
                ? `Enter at least ${spool.reservedGrams} g to cover active reservations.`
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
        <div role="alert" className="carbon-feedback carbon-feedback-error">
          <p>{requestError.message}</p>
          {requestError.kind === "unauthenticated" && (
            <a className="carbon-feedback-link" href="/auth/signin">
              Sign in
            </a>
          )}
          {requestError.kind === "uncertain" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshLatest()}
              disabled={pending || mutationPending}
            >
              Refresh and review stock
            </Button>
          )}
        </div>
      )}

      <div className="carbon-form-actions">
        <Button
          type="submit"
          disabled={pending || mutationPending || mutationGuarded || requestError?.kind === "uncertain"}
        >
          {pending ? "Saving…" : mode === "create" ? "Add spool" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending || mutationPending}>
          Cancel
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? `Saving ${describeField("material").toLowerCase()} and stock.` : ""}
      </p>
    </form>
  );
}
