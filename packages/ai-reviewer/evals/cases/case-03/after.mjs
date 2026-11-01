export function resizeReservation({ recorded, otherHolds, ownHold, requested }) {
  const capacity = recorded - otherHolds - ownHold;
  if (requested <= capacity) return { status: "retained", grams: requested };
  if (ownHold <= capacity) return { status: "retained", grams: ownHold };
  return { status: "released", grams: 0 };
}
