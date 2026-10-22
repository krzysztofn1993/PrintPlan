/* global Blob, FormData, Request */

import assert from "node:assert/strict";
import test from "node:test";
import {
  hasSupportedReservationFormContentType,
  isValidReservationId,
  readReservationFormData,
  validateReleaseForm,
  validateReserveForm,
} from "../src/lib/reservation-validation.ts";
import {
  createReservationErrorResponse,
  createReservationJsonResponse,
  mapReservationFailure,
} from "../src/lib/reservation-response.ts";
import { previewPrintReservation, reservePrintMaterial, releasePrintMaterial } from "../src/lib/reservations.ts";
import { toPrintDto } from "../src/lib/prints.ts";
import { toSpoolDto } from "../src/lib/spools.ts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PRINT_ID = "33333333-3333-4333-8333-333333333333";
const SPOOL_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_SPOOL_ID = "77777777-7777-4777-8777-777777777777";
const RESERVATION_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";

function form(entries) {
  const result = new FormData();
  for (const [key, value] of entries) result.append(key, value);
  return result;
}

function spoolRow(overrides = {}) {
  return {
    id: SPOOL_ID,
    user_id: OWNER_ID,
    material: "PLA",
    colour: "Blue",
    colour_key: "blue",
    created_at: "2026-10-10T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z",
    recorded_grams: 150,
    reserved_grams: 88,
    available_grams: 62,
    ...overrides,
  };
}

function printRow(overrides = {}) {
  return {
    id: PRINT_ID,
    user_id: OWNER_ID,
    name: "Test print",
    material: "PLA",
    colour: "Blue",
    colour_key: "blue",
    required_grams: 80,
    version: 2,
    created_at: "2026-10-10T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z",
    reservation_id: RESERVATION_ID,
    reservation_spool_id: SPOOL_ID,
    reserved_grams: 88,
    settlement_id: null,
    settled_at: null,
    actual_grams: null,
    ...overrides,
  };
}

test("reservation form validation rejects duplicates, files, unknown fields and malformed IDs", () => {
  assert.equal(isValidReservationId(REQUEST_ID), true);
  assert.equal(isValidReservationId("not-an-id"), false);
  const entries = [
    ["requestId", REQUEST_ID],
    ["expectedVersion", "2"],
    ["spoolId", SPOOL_ID],
    ["selectionMode", "best_fit"],
  ];
  assert.deepEqual(validateReserveForm(form(entries)), {
    ok: true,
    value: { requestId: REQUEST_ID, expectedVersion: 2, spoolId: SPOOL_ID, selectionMode: "best_fit" },
  });
  const witnessed = validateReserveForm(form([...entries, ["expectedReservationGrams", "88"]]));
  assert.deepEqual(witnessed, {
    ok: true,
    value: {
      requestId: REQUEST_ID,
      expectedVersion: 2,
      expectedReservationGrams: 88,
      spoolId: SPOOL_ID,
      selectionMode: "best_fit",
    },
  });
  for (const value of ["", "1.5", "Infinity", "0", "4294967295"]) {
    assert.deepEqual(
      validateReserveForm(form([...entries, ["expectedReservationGrams", value]])),
      { ok: false, reason: "invalid" },
      `expected invalid preview amount ${value}`,
    );
  }
  assert.deepEqual(
    validateReserveForm(form([...entries, ["expectedReservationGrams", "88"], ["expectedReservationGrams", "88"]])),
    { ok: false, reason: "invalid" },
  );
  const amountFile = form([...entries, ["expectedReservationGrams", "88"]]);
  amountFile.set("expectedReservationGrams", new Blob(["88"]));
  assert.deepEqual(validateReserveForm(amountFile), { ok: false, reason: "invalid" });
  const repeated = form([...entries, ["requestId", REQUEST_ID]]);
  assert.deepEqual(validateReserveForm(repeated), { ok: false, reason: "invalid" });
  const file = form(entries);
  file.set("spoolId", new Blob([SPOOL_ID]));
  assert.deepEqual(validateReserveForm(file), { ok: false, reason: "invalid" });
  assert.deepEqual(validateReserveForm(form([...entries, ["ownerId", OWNER_ID]])), {
    ok: false,
    reason: "unexpected_field",
  });
  assert.deepEqual(
    validateReleaseForm(
      form([
        ["reservationId", RESERVATION_ID],
        ["expectedVersion", "2"],
        ["grams", "88"],
      ]),
    ),
    { ok: false, reason: "unexpected_field" },
  );
  assert.deepEqual(
    validateReleaseForm(
      form([
        ["reservationId", RESERVATION_ID],
        ["expectedVersion", "2"],
      ]),
    ),
    {
      ok: true,
      value: { reservationId: RESERVATION_ID, expectedVersion: 2 },
    },
  );
  assert.deepEqual(
    validateReleaseForm(
      form([
        ["reservationId", RESERVATION_ID],
        ["expectedVersion", "2147483647"],
      ]),
    ),
    { ok: true, value: { reservationId: RESERVATION_ID, expectedVersion: 2_147_483_647 } },
  );
  for (const entries of [
    [["expectedVersion", "2"]],
    [["reservationId", RESERVATION_ID]],
    [
      ["reservationId", "bad"],
      ["expectedVersion", "2"],
    ],
    [
      ["reservationId", RESERVATION_ID],
      ["expectedVersion", "0"],
    ],
    [
      ["reservationId", RESERVATION_ID],
      ["expectedVersion", "2147483648"],
    ],
    [
      ["reservationId", RESERVATION_ID],
      ["expectedVersion", "1.5"],
    ],
    [
      ["reservationId", RESERVATION_ID],
      ["expectedVersion", " 2"],
    ],
    [
      ["reservationId", RESERVATION_ID],
      ["expectedVersion", "2"],
      ["expectedVersion", "3"],
    ],
    [
      ["reservationId", RESERVATION_ID],
      ["reservationId", RESERVATION_ID],
      ["expectedVersion", "2"],
    ],
  ]) {
    assert.deepEqual(validateReleaseForm(form(entries)), { ok: false, reason: "invalid" });
  }
  const releaseFile = form([
    ["reservationId", RESERVATION_ID],
    ["expectedVersion", "2"],
  ]);
  releaseFile.set("expectedVersion", new Blob(["2"]));
  assert.deepEqual(validateReleaseForm(releaseFile), { ok: false, reason: "invalid" });
  const releaseIdFile = form([
    ["reservationId", RESERVATION_ID],
    ["expectedVersion", "2"],
  ]);
  releaseIdFile.set("reservationId", new Blob([RESERVATION_ID]));
  assert.deepEqual(validateReleaseForm(releaseIdFile), { ok: false, reason: "invalid" });
});

test("reservation form transport accepts only supported form media types", async () => {
  assert.equal(
    hasSupportedReservationFormContentType(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: "reservationId=x",
      }),
    ),
    true,
  );
  assert.equal(
    hasSupportedReservationFormContentType(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    ),
    false,
  );
  assert.ok(
    await readReservationFormData(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "reservationId=x",
      }),
    ),
  );
  assert.equal(
    await readReservationFormData(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    ),
    null,
  );
});

test("shared DTO mappers retain real stock totals and strict nullable reservation state", () => {
  assert.deepEqual(toSpoolDto(spoolRow()), {
    id: SPOOL_ID,
    material: "PLA",
    colour: "Blue",
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
    recordedGrams: 150,
    reservedGrams: 88,
    availableGrams: 62,
  });
  assert.equal(toPrintDto(printRow()).reservation.reservedGrams, 88);
  assert.equal(
    toPrintDto(printRow({ reservation_id: null, reservation_spool_id: null, reserved_grams: null })).reservation,
    null,
  );
  const completed = toPrintDto(
    printRow({
      reservation_id: null,
      reservation_spool_id: null,
      reserved_grams: null,
      settlement_id: REQUEST_ID,
      settled_at: "2026-10-17T10:00:00.000Z",
      actual_grams: 0,
    }),
  );
  assert.deepEqual(completed.settlement, {
    id: REQUEST_ID,
    settledAt: "2026-10-17T10:00:00.000Z",
    actualGrams: 0,
  });
  assert.throws(
    () => toPrintDto(printRow({ settlement_id: REQUEST_ID, settled_at: "2026-10-17T10:00:00.000Z", actual_grams: 10 })),
    /cannot have an active reservation/,
  );
  assert.throws(() => toPrintDto(printRow({ actual_grams: 0 })), /incomplete settlement state/);
  assert.throws(() => toPrintDto(printRow({ reservation_spool_id: null })), /incomplete reservation state/);
});

test("preview RPC maps its advisory result and eligible spools through the shared DTO", async () => {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: {
          printId: PRINT_ID,
          expectedVersion: 2,
          marginPercent: 10,
          reservationGrams: 88,
          suggestedSpoolId: SPOOL_ID,
          eligibleSpools: [spoolRow({ reserved_grams: 0, available_grams: 150 })],
        },
        error: null,
        status: 200,
      });
    },
  };
  const result = await previewPrintReservation(client, OWNER_ID, PRINT_ID);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ name: "preview_print_reservation", args: { p_print_id: PRINT_ID } }]);
  assert.equal(result.value.eligibleSpools[0].availableGrams, 150);
  assert.equal(result.value.reservationGrams, 88);
});

test("preview RPC refuses fractional margins and out-of-range adjusted grams", async () => {
  for (const overrides of [{ marginPercent: 10.5 }, { marginPercent: 101 }, { reservationGrams: 4_294_967_295 }]) {
    const client = {
      rpc() {
        return Promise.resolve({
          data: {
            printId: PRINT_ID,
            expectedVersion: 2,
            marginPercent: 10,
            reservationGrams: 88,
            suggestedSpoolId: SPOOL_ID,
            eligibleSpools: [spoolRow({ reserved_grams: 0, available_grams: 150 })],
            ...overrides,
          },
          error: null,
          status: 200,
        });
      },
    };
    const result = await previewPrintReservation(client, OWNER_ID, PRINT_ID);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "database_error");
  }
});

test("reserve and release commands call exact RPCs and return the committed reservation-aware view", async () => {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      if (name === "reserve_print_material")
        return Promise.resolve({
          data: { reservationId: RESERVATION_ID, disposition: "active", replayed: false },
          error: null,
          status: 200,
        });
      return Promise.resolve({
        data: {
          reservationId: RESERVATION_ID,
          disposition: "released",
          print: { id: PRINT_ID },
          spool: { id: SPOOL_ID },
        },
        error: null,
        status: 200,
      });
    },
    from(table) {
      const columns = table === "planned_prints" ? [printRow()] : [spoolRow()];
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return Promise.resolve({ data: columns, error: null, status: 200 });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: columns, error: null, status: 200 }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const reserve = await reservePrintMaterial(client, OWNER_ID, {
    printId: PRINT_ID,
    requestId: REQUEST_ID,
    expectedVersion: 2,
    expectedReservationGrams: 88,
    spoolId: SPOOL_ID,
    selectionMode: "best_fit",
  });
  assert.equal(reserve.ok, true);
  assert.equal(reserve.value.print.reservation.id, RESERVATION_ID);
  assert.equal(reserve.value.spool.availableGrams, 62);
  assert.deepEqual(calls[0], {
    name: "reserve_print_material",
    args: {
      p_request_id: REQUEST_ID,
      p_print_id: PRINT_ID,
      p_expected_version: 2,
      p_expected_reservation_grams: 88,
      p_spool_id: SPOOL_ID,
      p_selection_mode: "best_fit",
    },
  });
  const legacyReplay = await reservePrintMaterial(client, OWNER_ID, {
    printId: PRINT_ID,
    requestId: REQUEST_ID,
    expectedVersion: 2,
    spoolId: SPOOL_ID,
    selectionMode: "best_fit",
  });
  assert.equal(legacyReplay.ok, true);
  assert.equal(calls[1].args.p_expected_reservation_grams, null);
  const release = await releasePrintMaterial(client, OWNER_ID, RESERVATION_ID, PRINT_ID, 2);
  assert.equal(release.ok, true);
  assert.equal(release.value.disposition, "released");
  assert.deepEqual(calls[2], {
    name: "release_print_material",
    args: { p_reservation_id: RESERVATION_ID, p_print_id: PRINT_ID, p_expected_version: 2 },
  });
});

test("reserve confirmation rejects a same-ID reassignment between its paired reads", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { reservationId: RESERVATION_ID, disposition: "active", replayed: false },
        error: null,
        status: 200,
      });
    },
    from(table) {
      const rows = table === "planned_prints" ? [printRow({ reservation_spool_id: OTHER_SPOOL_ID })] : [spoolRow()];
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return Promise.resolve({ data: rows, error: null, status: 200 });
        },
      };
      return builder;
    },
  };
  const result = await reservePrintMaterial(client, OWNER_ID, {
    printId: PRINT_ID,
    requestId: REQUEST_ID,
    expectedVersion: 2,
    expectedReservationGrams: 88,
    spoolId: SPOOL_ID,
    selectionMode: "best_fit",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "database_error");
  const response = mapReservationFailure(result, "mutation");
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.refreshRequired, true);
  assert.deepEqual(calls[0], {
    name: "reserve_print_material",
    args: {
      p_request_id: REQUEST_ID,
      p_print_id: PRINT_ID,
      p_expected_version: 2,
      p_expected_reservation_grams: 88,
      p_spool_id: SPOOL_ID,
      p_selection_mode: "best_fit",
    },
  });
});

test("original reserve replay survives settings-only changes and is rejected after recalculation", async () => {
  const input = {
    printId: PRINT_ID,
    requestId: REQUEST_ID,
    expectedVersion: 2,
    expectedReservationGrams: 88,
    spoolId: SPOOL_ID,
    selectionMode: "best_fit",
  };
  const recalculatedClient = {
    rpc(name, args) {
      assert.equal(name, "reserve_print_material");
      assert.equal(args.p_request_id, REQUEST_ID);
      return Promise.resolve({
        data: null,
        error: { message: "reservation_request_completed" },
        status: 409,
      });
    },
  };
  const recalculatedReplay = await reservePrintMaterial(recalculatedClient, OWNER_ID, input);
  assert.deepEqual(recalculatedReplay, { ok: false, reason: "reservation_request_completed" });

  const settingsOnlyClient = {
    rpc() {
      return Promise.resolve({
        data: { reservationId: RESERVATION_ID, disposition: "active", replayed: true },
        error: null,
        status: 200,
      });
    },
    from(table) {
      const rows = table === "planned_prints" ? [printRow()] : [spoolRow()];
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        order() {
          return builder;
        },
        range() {
          return Promise.resolve({ data: rows, error: null, status: 200 });
        },
      };
      return builder;
    },
  };
  const settingsOnlyReplay = await reservePrintMaterial(settingsOnlyClient, OWNER_ID, input);
  assert.equal(settingsOnlyReplay.ok, true);
  assert.equal(settingsOnlyReplay.value.reservationId, RESERVATION_ID);
});

test("stale active releases pass the reviewed version and map to cancellation refresh guidance", async () => {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: null, error: { message: "edit_conflict" }, status: 409 });
    },
  };
  const result = await releasePrintMaterial(client, OWNER_ID, RESERVATION_ID, PRINT_ID, 7);
  assert.deepEqual(calls, [
    {
      name: "release_print_material",
      args: { p_reservation_id: RESERVATION_ID, p_print_id: PRINT_ID, p_expected_version: 7 },
    },
  ]);
  assert.deepEqual(result, { ok: false, reason: "edit_conflict" });
  const response = mapReservationFailure(result, "cancellation");
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.refreshRequired, true);
});

test("reservation responses are private and business failures keep precise status codes", async () => {
  const response = createReservationJsonResponse({ preview: true });
  assert.equal(response.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.equal(
    (await createReservationErrorResponse("unauthenticated", 401, "expired").json()).error.code,
    "unauthenticated",
  );
  for (const code of [
    "already_reserved",
    "edit_conflict",
    "selection_stale",
    "insufficient_material",
    "reservation_amount_stale",
    "reservation_preview_required",
    "idempotency_conflict",
    "reservation_request_completed",
    "print_settled",
  ]) {
    const conflict = mapReservationFailure({ reason: code });
    assert.equal(conflict.status, 409);
    const body = await conflict.json();
    assert.equal(body.error.code, code);
    if (code === "reservation_amount_stale" || code === "reservation_preview_required") {
      assert.equal(body.error.refreshRequired, true);
    }
    assert.equal(conflict.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  }
  assert.equal(mapReservationFailure({ reason: "not_found" }).status, 404);
  const staleCancellation = mapReservationFailure({ reason: "edit_conflict" }, "cancellation");
  assert.equal(staleCancellation.status, 409);
  const staleCancellationBody = await staleCancellation.json();
  assert.equal(staleCancellationBody.error.code, "edit_conflict");
  assert.equal(staleCancellationBody.error.refreshRequired, true);
  assert.match(staleCancellationBody.error.message, /review its current reservation/);
  assert.equal(mapReservationFailure({ reason: "database_error", status: 503 }).status, 503);
});

test("reservation failures distinguish outages and internal errors while preserving private recovery guidance", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const error = Object.assign(new TypeError("private provider payload"), {
    code: "42P01",
    stack:
      "TypeError: private provider payload\n    at reservePrintMaterial (https://private-key:private-token@provider.test/src/lib/reservations.ts:150:3)\n    at caller (/private-path/private-form-value.js:1:2)",
    cause: new RangeError("private nested error"),
  });
  for (const operation of ["read", "mutation"]) {
    const response = mapReservationFailure({ reason: "database_error", error, status: 400 }, operation);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("Retry-After"), null);
    assert.equal(response.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
    const body = await response.json();
    assert.equal(body.error.code, "internal_error");
    assert.equal(body.error.refreshRequired, operation === "mutation" ? true : undefined);
    assert.doesNotMatch(JSON.stringify(body), /private-|provider payload|nested error/);
  }
  assert.equal(log.mock.calls.length, 2);
  const diagnostic = log.mock.calls[0].arguments[1];
  assert.equal(diagnostic.boundary, "api");
  assert.equal(diagnostic.causes[1].name, "TypeError");
  assert.equal(diagnostic.causes[1].code, "42P01");
  assert.deepEqual(diagnostic.causes[1].frames, ["reservations.ts:150:3"]);
  assert.equal(diagnostic.causes[2].name, "RangeError");
  assert.doesNotMatch(
    JSON.stringify(log.mock.calls.map((call) => call.arguments)),
    /private-|provider payload|nested error/,
  );

  for (const failure of [
    { reason: "database_error", status: 0, error: new TypeError("fetch failed") },
    { reason: "database_error", status: 503, error: new Error("unavailable") },
    { reason: "database_error", status: 400, error: { code: "08006" } },
  ]) {
    for (const operation of ["read", "mutation"]) {
      const response = mapReservationFailure(failure, operation);
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Retry-After"), "30");
      assert.equal(response.headers.get("Expires"), "0");
      assert.equal(response.headers.get("Pragma"), "no-cache");
      const body = await response.json();
      assert.equal(body.error.code, "temporarily_unavailable");
      assert.equal(body.error.refreshRequired, operation === "mutation" ? true : undefined);
    }
  }
  assert.equal(log.mock.calls.length, 2, "expected outages are not logged as internal failures");
});

test("a committed reservation preserves the original failure and status when its confirmation read fails", async () => {
  for (const failedTable of ["planned_prints", "spool_inventory"]) {
    const error = Object.assign(new Error("confirmation read failed"), { code: "08006" });
    const client = {
      rpc() {
        return Promise.resolve({
          data: { reservationId: RESERVATION_ID, disposition: "active" },
          error: null,
          status: 200,
        });
      },
      from(table) {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          order() {
            return builder;
          },
          range() {
            return Promise.resolve(
              table === failedTable
                ? { data: null, error, status: 0 }
                : { data: table === "planned_prints" ? [printRow()] : [spoolRow()], error: null, status: 200 },
            );
          },
        };
        return builder;
      },
    };
    const result = await reservePrintMaterial(client, OWNER_ID, {
      printId: PRINT_ID,
      requestId: REQUEST_ID,
      expectedVersion: 2,
      expectedReservationGrams: 88,
      spoolId: SPOOL_ID,
      selectionMode: "best_fit",
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "database_error");
    assert.equal(result.error, error);
    assert.equal(result.status, 0);
    const response = mapReservationFailure(result, "mutation");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.refreshRequired, true);
  }
});
