export function acceptsReservation(requiredGrams, marginPercent, response) {
  const expected = Math.ceil((requiredGrams * (100 + marginPercent)) / 100);
  return response.recordedGrams === expected && response.availableGrams === expected;
}
