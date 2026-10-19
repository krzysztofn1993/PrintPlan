const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_EXPECTED_RESERVATION_GRAMS = 4_294_967_294;

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
  expectedReservationGrams?: number;
  spoolId: string;
  selectionMode: "best_fit" | "manual";
}> {
  const allowed = new Set(["requestId", "expectedVersion", "expectedReservationGrams", "spoolId", "selectionMode"]);
  if (Array.from(form.keys()).some((key) => !allowed.has(key))) return { ok: false, reason: "unexpected_field" };
  const requestId = singleText(form, "requestId");
  const version = singleText(form, "expectedVersion");
  const amountValues = form.getAll("expectedReservationGrams");
  const amountWasSubmitted = amountValues.length > 0;
  const amountText = amountValues.length === 1 && typeof amountValues[0] === "string" ? amountValues[0] : undefined;
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
  let expectedReservationGrams: number | undefined;
  if (amountWasSubmitted) {
    if (amountText === undefined || !/^[0-9]+$/.test(amountText)) return { ok: false, reason: "invalid" };
    const parsedAmount = Number(amountText);
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > MAX_EXPECTED_RESERVATION_GRAMS) {
      return { ok: false, reason: "invalid" };
    }
    expectedReservationGrams = parsedAmount;
  }
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !["best_fit", "manual"].includes(selectionMode ?? "")
  ) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    value: {
      requestId,
      expectedVersion,
      ...(expectedReservationGrams === undefined ? {} : { expectedReservationGrams }),
      spoolId,
      selectionMode: selectionMode as "best_fit" | "manual",
    },
  };
}

export function validateReleaseForm(form: FormData): ReservationFormResult<{ reservationId: string }> {
  if (Array.from(form.keys()).some((key) => key !== "reservationId")) return { ok: false, reason: "unexpected_field" };
  const reservationId = singleText(form, "reservationId");
  return reservationId && isValidReservationId(reservationId)
    ? { ok: true, value: { reservationId } }
    : { ok: false, reason: "invalid" };
}
