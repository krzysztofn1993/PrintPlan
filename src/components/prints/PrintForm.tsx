import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/FormField";
import { MAX_REQUIRED_GRAMS, type PrintFieldErrors } from "@/lib/print-validation";
import { readPrintDto } from "@/lib/print-dto";
import { readPrintUpdateDto, type PrintUpdateDto } from "@/lib/print-update-dto";
import type { PrintDto } from "@/lib/prints";

export interface PrintUpdateCommand {
  readonly printId: string;
  readonly expectedVersion: number;
  readonly name: string;
  readonly material: string;
  readonly colour: string;
  readonly requiredGrams: string;
}

interface PrintFormProps {
  mode: "create" | "edit";
  print?: PrintDto;
  mutationPending: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: (print: PrintDto | PrintUpdateDto) => void;
  onCancel: () => void;
  onUncertain: (command?: PrintUpdateCommand) => void;
  onRefreshLatest: () => Promise<boolean>;
  mutationGuarded: boolean;
}

type RequestErrorKind = "unauthenticated" | "not_found" | "generic" | "uncertain" | "conflict";
type ApiFieldName = "name" | "material" | "colour" | "requiredGrams";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const materialSuggestions = ["PLA", "PETG", "ABS", "ASA", "TPU"];
const colourSuggestions = ["Black", "White", "Red", "Blue", "Black / Red / Gold"];

function fieldMessage(field: ApiFieldName, code: unknown): string | undefined {
  if (code === "required")
    return field === "requiredGrams" ? "Enter required grams as a whole number." : "Enter a value for this field.";
  if (code === "invalid")
    return field === "requiredGrams" ? "Enter a whole number using digits only." : "Enter a text value.";
  if (code === "too_long") {
    if (field === "name") return "Use no more than 80 characters for the name.";
    return `Use no more than 80 characters for the ${field} label.`;
  }
  if (field === "requiredGrams" && code === "out_of_range") {
    return `Enter a whole-gram amount from 1 to ${MAX_REQUIRED_GRAMS}.`;
  }
  return undefined;
}

function readFieldErrors(value: unknown): PrintFieldErrors {
  if (!isRecord(value)) return {};
  const errors: PrintFieldErrors = {};
  for (const field of ["name", "material", "colour", "requiredGrams"] as const) {
    const candidate = value[field];
    if (!isRecord(candidate)) continue;
    const message = fieldMessage(field, candidate.code);
    if (message)
      errors[field] = { code: candidate.code as NonNullable<PrintFieldErrors[typeof field]>["code"], message };
  }
  return errors;
}

function firstErrorField(errors: PrintFieldErrors): ApiFieldName | undefined {
  return (["name", "material", "colour", "requiredGrams"] as const).find((field) => Boolean(errors[field]));
}

export function PrintForm({
  mode,
  print,
  mutationPending,
  onPendingChange,
  onSaved,
  onCancel,
  onUncertain,
  onRefreshLatest,
  mutationGuarded,
}: PrintFormProps) {
  const prefix = mode === "create" ? "new-print" : `edit-print-${print?.id ?? "item"}`;
  const [name, setName] = useState(print?.name ?? "");
  const [material, setMaterial] = useState(print?.material ?? "");
  const [colour, setColour] = useState(print?.colour ?? "");
  const [requiredGrams, setRequiredGrams] = useState(print ? String(print.requiredGrams) : "");
  const [fieldErrors, setFieldErrors] = useState<PrintFieldErrors>({});
  const [requestError, setRequestError] = useState<{ kind: RequestErrorKind; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  function focusField(field: ApiFieldName | undefined) {
    if (field) window.requestAnimationFrame(() => document.getElementById(`${prefix}-${field}`)?.focus());
  }

  function clearFieldError(field: ApiFieldName) {
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    setRequestError((previous) => (previous?.kind === "uncertain" || previous?.kind === "conflict" ? previous : null));
  }

  function updatePending(nextPending: boolean) {
    setPending(nextPending);
    onPendingChange(nextPending);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      pending ||
      mutationPending ||
      mutationGuarded ||
      requestError?.kind === "uncertain" ||
      requestError?.kind === "conflict"
    )
      return;

    setFieldErrors({});
    setRequestError(null);
    updatePending(true);
    const command: PrintUpdateCommand | undefined =
      mode === "edit" && print
        ? Object.freeze({
            printId: print.id,
            expectedVersion: print.version,
            name,
            material,
            colour,
            requiredGrams,
          })
        : undefined;
    const payload = new URLSearchParams({ name, material, colour, requiredGrams });
    const endpoint = mode === "create" ? "/api/prints" : `/api/prints/${print?.id}/update`;
    if (command) payload.set("expectedVersion", String(command.expectedVersion));

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: payload,
      });
    } catch {
      onUncertain(command);
      setRequestError({
        kind: "uncertain",
        message: command
          ? "Your edit may have completed. Keep these entries while the collection resolves it."
          : "We couldn't confirm whether the save completed. Refresh the print list and review it before trying again.",
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
      const saved =
        response.status === expectedStatus && isRecord(body)
          ? mode === "create"
            ? readPrintDto(body.print)
            : command
              ? readPrintUpdateDto(body, command.printId, command.expectedVersion)
              : undefined
          : undefined;
      if (saved) {
        updatePending(false);
        onSaved(saved);
        return;
      }
      onUncertain(command);
      setRequestError({
        kind: "uncertain",
        message: command
          ? "Your edit may have completed, but its result could not be read. Keep these entries while the collection resolves it."
          : "The save may have completed, but its result could not be read. Refresh the print list before trying again.",
      });
      updatePending(false);
      return;
    }

    if (response.status >= 500 && response.status <= 599) {
      onUncertain(command);
      setRequestError({
        kind: "uncertain",
        message: command
          ? "The edit outcome is uncertain. Keep these entries while the collection resolves it."
          : "The save outcome may be uncertain. Refresh the print list and review it before trying again.",
      });
    } else if (response.status === 422) {
      const apiError = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      const errors = readFieldErrors(apiError?.fieldErrors);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        setRequestError({ kind: "generic", message: "Please review the highlighted fields and try again." });
        focusField(firstErrorField(errors));
      } else {
        setRequestError({ kind: "generic", message: "Please review the form and try again." });
      }
    } else if (response.status === 409 && mode === "edit") {
      const apiError = isRecord(body) && isRecord(body.error) ? body.error : undefined;
      const code = apiError?.code;
      setRequestError({
        kind: "conflict",
        message:
          code === "print_settled"
            ? "This print was settled before the edit could be saved. Your entries are still here; read the latest print before continuing."
            : "Another save changed this print after you opened it. Your entries are still here; read the latest print before saving again.",
      });
    } else if (response.status === 401) {
      setRequestError({ kind: "unauthenticated", message: "Your session has expired. Sign in to continue." });
    } else if (response.status === 404) {
      setRequestError({
        kind: "not_found",
        message: "This print is no longer available. Refresh the list to see the latest prints.",
      });
    } else if (response.status === 403) {
      setRequestError({ kind: "generic", message: "This request was rejected. Check the form and try again." });
    } else {
      setRequestError({
        kind: "generic",
        message: "We couldn't save this print. Please review the form and try again.",
      });
    }
    updatePending(false);
  }

  async function refreshLatest() {
    if (!window.confirm("Reading the latest print will discard the unsaved entries in this form. Continue?")) return;
    setPending(true);
    const refreshed = await onRefreshLatest();
    if (!refreshed) setPending(false);
    else setRequestError(null);
  }

  return (
    <form className="carbon-collection-form" onSubmit={handleSubmit} noValidate>
      <div className="carbon-form-grid">
        <FormField
          id={`${prefix}-name`}
          name="name"
          label="Name (optional)"
          value={name}
          inputRef={nameInputRef}
          onChange={(value) => {
            setName(value);
            clearFieldError("name");
          }}
          placeholder="Phone holder"
          autoComplete="off"
          maxLength={240}
          disabled={pending || mutationPending}
          hint="Leave blank to identify this print by its material and requirements."
          error={fieldErrors.name?.message}
        />
        <FormField
          id={`${prefix}-material`}
          name="material"
          label="Material"
          value={material}
          onChange={(value) => {
            setMaterial(value);
            clearFieldError("material");
          }}
          placeholder="PLA"
          list={`${prefix}-material-options`}
          required
          minLength={1}
          autoComplete="off"
          disabled={pending || mutationPending}
          hint="Suggestions are optional; a spool does not need to exist."
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
          disabled={pending || mutationPending}
          hint="Keep a multicolour label together, for example Black / Red / Gold."
          error={fieldErrors.colour?.message}
        />
        <datalist id={`${prefix}-colour-options`}>
          {colourSuggestions.map((suggestion) => (
            <option value={suggestion} key={suggestion} />
          ))}
        </datalist>
        <FormField
          id={`${prefix}-requiredGrams`}
          name="requiredGrams"
          label="Required filament (g)"
          type="number"
          inputMode="numeric"
          value={requiredGrams}
          onChange={(value) => {
            setRequiredGrams(value);
            clearFieldError("requiredGrams");
          }}
          required
          min={1}
          max={MAX_REQUIRED_GRAMS}
          step={1}
          disabled={pending || mutationPending}
          hint="Whole grams before any safety margin; this does not reserve stock."
          error={fieldErrors.requiredGrams?.message}
        />
      </div>

      {mode === "edit" && print?.reservation && (
        <div role="note" className="carbon-feedback carbon-feedback-warning">
          <p className="font-medium">This print has an active material reservation.</p>
          <p className="mt-1 text-sm leading-relaxed">
            Every save recalculates the held amount using the current safety margin, including a name-only save. The
            current manual spool is retained when it still fits; otherwise a best-fit spool is selected, or the print is
            saved without a reservation when no spool has enough available material.
          </p>
          <p className="mt-1 text-xs break-all">
            {print.reservation.reservedGrams} g held · reservation <code>{print.reservation.id}</code>
          </p>
        </div>
      )}

      {mode === "edit" && print && (
        <p className="text-muted-foreground text-xs break-all">
          Editing print <code className="font-mono">{print.id}</code>
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
          {requestError.kind === "not_found" && (
            <p className="mt-2 text-sm">Use the list refresh below to review the current saved prints.</p>
          )}
          {requestError.kind === "conflict" && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 whitespace-normal"
              onClick={() => {
                void refreshLatest();
              }}
              disabled={pending || mutationPending}
            >
              Read latest print
            </Button>
          )}
        </div>
      )}

      <div className="carbon-form-actions">
        <Button
          type="submit"
          disabled={
            pending ||
            mutationPending ||
            mutationGuarded ||
            requestError?.kind === "uncertain" ||
            requestError?.kind === "conflict"
          }
        >
          {pending ? "Saving…" : mode === "create" ? "Add print" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending || mutationPending}>
          Cancel
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {pending ? `${mode === "create" ? "Adding" : "Saving"} print.` : ""}
      </p>
    </form>
  );
}
