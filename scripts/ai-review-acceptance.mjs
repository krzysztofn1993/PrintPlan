/**
 * Disposable acceptance fixture for the AI reviewer; not used by the application.
 * Available stock equals recorded stock minus reserved stock, in grams.
 * Example: 150 g recorded minus 88 g reserved leaves 62 g available for another print.
 * Both inputs must be finite nonnegative numbers, with reservations within stock.
 */
export function availableGrams(recordedGrams, reservedGrams) {
  for (const grams of [recordedGrams, reservedGrams]) {
    if (typeof grams !== "number" || !Number.isFinite(grams) || grams < 0) {
      throw new RangeError("Stock and reservations must be finite nonnegative numbers.");
    }
  }
  if (reservedGrams > recordedGrams) {
    throw new RangeError("Reservations cannot exceed recorded stock.");
  }
  return recordedGrams - reservedGrams;
}
