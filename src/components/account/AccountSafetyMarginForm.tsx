import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { FormField } from "@/components/ui/FormField";
import { Button } from "@/components/ui/button";
import { readAccountSettingsDto, type AccountSettingsDto } from "@/lib/account-settings";

interface AccountSafetyMarginFormProps {
  initialSettings: AccountSettingsDto;
}

type PendingAction = "save" | "recover" | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSettingsEnvelope(value: unknown): AccountSettingsDto | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !Object.hasOwn(value, "settings")) return undefined;
  return readAccountSettingsDto(value.settings);
}

function validateDraft(value: string): string | undefined {
  if (!/^[0-9]+$/.test(value)) return "Enter a whole percentage using digits only.";
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 100) return "Enter a value from 0 to 100.";
  return undefined;
}

export function AccountSafetyMarginForm({ initialSettings }: AccountSafetyMarginFormProps) {
  const [settings, setSettings] = useState(initialSettings);
  const [draft, setDraft] = useState(String(initialSettings.marginPercent));
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState<PendingAction>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);
  const pendingRef = useRef(false);
  const focusTarget = useRef<"margin" | "recovery" | null>(null);

  useEffect(() => {
    const target = focusTarget.current;
    if (!target) return;
    document.getElementById(target === "margin" ? "account-safety-margin" : "settings-recovery-button")?.focus();
    focusTarget.current = null;
  }, [error, fieldError, pending, recoveryRequired, status]);

  async function recoverSavedSettings(reason: "conflict" | "uncertain" | "manual"): Promise<boolean> {
    let response: Response;
    try {
      response = await fetch("/api/account/settings", { method: "GET", cache: "no-store" });
    } catch {
      setRecoveryRequired(true);
      setSignInRequired(false);
      setError("The current saved setting could not be reached. Your draft is still here; try reading it again.");
      setStatus("");
      focusTarget.current = "recovery";
      return false;
    }

    if (response.status === 401) {
      setRecoveryRequired(true);
      setSignInRequired(true);
      setError("Your session has expired. Sign in before checking or saving account settings.");
      setStatus("");
      focusTarget.current = "margin";
      return false;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const current = response.ok ? readSettingsEnvelope(body) : undefined;
    if (!current) {
      setRecoveryRequired(true);
      setSignInRequired(false);
      setError("The current saved setting could not be read. Your draft is still here; try again before saving.");
      setStatus("");
      focusTarget.current = "recovery";
      return false;
    }

    setSettings(current);
    setRecoveryRequired(false);
    setSignInRequired(false);
    setError("");
    setStatus(
      reason === "conflict"
        ? "The current saved setting is " +
            String(current.marginPercent) +
            "%. Your draft is unchanged; save again only if you want to apply it."
        : "The current saved setting is " +
            String(current.marginPercent) +
            "%. Your draft is unchanged; review it before choosing whether to save again.",
    );
    focusTarget.current = "margin";
    return true;
  }

  async function readCurrentSettings() {
    if (pendingRef.current || !recoveryRequired) return;
    pendingRef.current = true;
    setPending("recover");
    setError("");
    setStatus("Reading the current saved setting…");
    try {
      await recoverSavedSettings("manual");
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || recoveryRequired) return;
    const validationError = validateDraft(draft);
    if (validationError) {
      setFieldError(validationError);
      setError("");
      setStatus("");
      focusTarget.current = "margin";
      return;
    }
    setFieldError(undefined);
    setError("");
    setStatus("");
    const marginPercent = Number(draft);
    const expectedVersion = settings.version;
    pendingRef.current = true;
    setPending("save");

    try {
      let response: Response;
      try {
        response = await fetch("/api/account/settings", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({ marginPercent: String(marginPercent), expectedVersion: String(expectedVersion) }),
        });
      } catch {
        setRecoveryRequired(true);
        setError("The save outcome could not be confirmed. Checking the current saved setting…");
        await recoverSavedSettings("uncertain");
        return;
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }

      if (response.status === 409) {
        setRecoveryRequired(true);
        setError("Settings changed in another session. Reading the current saved value; your draft will be kept.");
        await recoverSavedSettings("conflict");
        return;
      }

      if (response.status === 401) {
        setSignInRequired(true);
        setError("Your session has expired. Sign in to continue. Your draft is still here.");
        setStatus("");
        focusTarget.current = "margin";
        return;
      }

      if (response.ok) {
        const saved = readSettingsEnvelope(body);
        if (saved?.marginPercent === marginPercent && saved.version === expectedVersion + 1) {
          setSettings(saved);
          setDraft(String(saved.marginPercent));
          setRecoveryRequired(false);
          setSignInRequired(false);
          setStatus(
            "Safety margin saved at " +
              String(saved.marginPercent) +
              "%. New reservations use this setting; existing reserved grams remain unchanged.",
          );
          focusTarget.current = "margin";
          return;
        }
        setRecoveryRequired(true);
        setError("The save receipt could not be verified. Checking the current saved setting…");
        await recoverSavedSettings("uncertain");
        return;
      }

      if (response.status >= 500) {
        setRecoveryRequired(true);
        setError("The save outcome may be uncertain. Checking the current saved setting…");
        await recoverSavedSettings("uncertain");
        return;
      }

      setSignInRequired(false);
      setError("We couldn't save this safety margin. Review the value and try again.");
      setStatus("");
      focusTarget.current = "margin";
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    setFieldError(undefined);
    if (!recoveryRequired) {
      setError("");
      setSignInRequired(false);
    }
  }

  return (
    <section aria-labelledby="account-safety-margin-heading" className="carbon-inline-panel">
      <h2 id="account-safety-margin-heading" className="text-lg font-semibold">
        Safety margin
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        The margin applies to new reservations. Existing reserved grams stay unchanged.
      </p>
      <p className="mt-4 text-sm">
        Current saved margin: <strong>{settings.marginPercent}%</strong>
      </p>

      <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
        <FormField
          id="account-safety-margin"
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          label="New safety margin (%)"
          value={draft}
          onChange={handleDraftChange}
          hint="Enter a whole percentage from 0 to 100. This draft is saved only when you choose Save safety margin."
          error={fieldError}
          disabled={pending !== null}
        />

        {error && (
          <div role="alert" className="carbon-feedback carbon-feedback-error">
            <p>{error}</p>
            {signInRequired && (
              <a className="carbon-feedback-link" href="/auth/signin">
                Sign in
              </a>
            )}
          </div>
        )}
        <p role="status" aria-live="polite" className="carbon-status-message">
          {status}
        </p>

        <div className="carbon-form-actions">
          <Button type="submit" disabled={pending !== null || recoveryRequired || Boolean(fieldError)}>
            {pending === "save" ? "Saving…" : "Save safety margin"}
          </Button>
          {recoveryRequired && (
            <Button
              id="settings-recovery-button"
              type="button"
              variant="outline"
              onClick={() => void readCurrentSettings()}
              disabled={pending !== null}
            >
              {pending === "recover" ? "Reading saved setting…" : "Read current saved setting"}
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
