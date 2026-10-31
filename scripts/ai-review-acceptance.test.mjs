import assert from "node:assert/strict";
import test from "node:test";
import { availableGrams } from "./ai-review-acceptance.mjs";

test("subtracts reservations from recorded stock", () => {
  assert.equal(availableGrams(150, 88), 62);
  assert.equal(availableGrams(100, 0), 100);
  assert.equal(availableGrams(100, 100), 0);
  assert.equal(availableGrams(0, 0), 0);
  assert.equal(availableGrams(10.5, 0.25), 10.25);
});

test("rejects invalid stock, invalid reservations, and overbooking", () => {
  for (const invalid of [-1, NaN, Infinity, -Infinity, "100", null, undefined]) {
    assert.throws(() => availableGrams(invalid, 0), RangeError);
    assert.throws(() => availableGrams(100, invalid), RangeError);
  }
  assert.throws(() => availableGrams(100, 101), RangeError);
});
