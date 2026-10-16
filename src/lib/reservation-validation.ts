const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReservationFormResult<T> = { ok: true; value: T } | { ok: false; reason: "invalid" | "unexpected_field" };

export function isValidReservationId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function hasSupportedReservationFormContentType(request: Request): boolean {
  const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/x-www-form-urlencoded" || mediaType === "multipart/form-data";
}

export async function readReservationFormData(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

function singleText(form: FormData, key: string): string | undefined {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : undefined;
}

export function validateReserveForm(form: FormData): ReservationFormResult<{
  requestId: string;
  expectedVersion: number;
  spoolId: string;
  selectionMode: "best_fit" | "manual";
}> {
  const allowed = new Set(["requestId", "expectedVersion", "spoolId", "selectionMode"]);
  if (Array.from(form.keys()).some((key) => !allowed.has(key))) return { ok: false, reason: "unexpected_field" };
  const requestId = singleText(form, "requestId");
  const version = singleText(form, "expectedVersion");
  const spoolId = singleText(form, "spoolId");
  const selectionMode = singleText(form, "selectionMode");
  if (
    !requestId ||
    !isValidReservationId(requestId) ||
    !version ||
    !/^[0-9]+$/.test(version) ||
    !spoolId ||
    !isValidReservationId(spoolId)
  ) {
    return { ok: false, reason: "invalid" };
  }
  const expectedVersion = Number(version);
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !["best_fit", "manual"].includes(selectionMode ?? "")
  ) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    value: { requestId, expectedVersion, spoolId, selectionMode: selectionMode as "best_fit" | "manual" },
  };
}

export function validateReleaseForm(form: FormData): ReservationFormResult<{ reservationId: string }> {
  if (Array.from(form.keys()).some((key) => key !== "reservationId")) return { ok: false, reason: "unexpected_field" };
  const reservationId = singleText(form, "reservationId");
  return reservationId && isValidReservationId(reservationId)
    ? { ok: true, value: { reservationId } }
    : { ok: false, reason: "invalid" };
}
