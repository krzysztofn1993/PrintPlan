/* global Blob, FormData, Request */

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ACTUAL_GRAMS,
  hasSupportedSettlementFormContentType,
  readSettlementFormData,
  validateSettlementFormData,
} from "../src/lib/settlement-validation.ts";
import {
  readPrintSettlementDto,
  readSettlementCommandReceipt,
  readSettlementReceipt,
} from "../src/lib/settlement-dto.ts";
import { readPrintSettlement, settlePrintConsumption } from "../src/lib/settlements.ts";
import {
  createSettlementErrorResponse,
  createSettlementJsonResponse,
  createSettlementMethodNotAllowedResponse,
  createSettlementUnauthorizedResponse,
  mapSettlementFailure,
} from "../src/lib/settlement-response.ts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const PRINT_ID = "33333333-3333-4333-8333-333333333333";
const SPOOL_ID = "44444444-4444-4444-8444-444444444444";
const RESERVATION_ID = "55555555-5555-4555-8555-555555555555";
const REQUEST_ID = "66666666-6666-4666-8666-666666666666";
const SETTLEMENT_ID = "77777777-7777-4777-8777-777777777777";
const CANCELLED_PRINT_ID = "88888888-8888-4888-8888-888888888888";
const CANCELLED_RESERVATION_ID = "99999999-9999-4999-8999-999999999999";
const OLDER_CANCELLED_PRINT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OLDER_CANCELLED_RESERVATION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function form(entries) {
  const result = new FormData();
  for (const [key, value] of entries) result.append(key, value);
  return result;
}

function commandForm(overrides = {}) {
  return form([
    ["requestId", overrides.requestId ?? REQUEST_ID],
    ["expectedVersion", overrides.expectedVersion ?? "3"],
    ["reservationId", overrides.reservationId ?? RESERVATION_ID],
    ["actualGrams", overrides.actualGrams ?? "200"],
  ]);
}

function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    id: SETTLEMENT_ID,
    requestId: REQUEST_ID,
    printId: PRINT_ID,
    reservationId: RESERVATION_ID,
    expectedVersion: 3,
    actualGrams: 200,
    settledAt: "2026-10-17T10:00:00.000Z",
    exceededEstimate: false,
    print: { id: PRINT_ID, name: "Phone holder", material: "PLA", colour: "Blue", requiredGrams: 80 },
    spool: {
      id: SPOOL_ID,
      material: "PLA",
      colour: "Blue",
      recordedGramsBefore: 300,
      recordedGramsAfter: 100,
      reservedGramsAfter: 66,
      availableGramsAfter: 34,
    },
    releasedGrams: 88,
    cancelledReservations: [
      {
        reservationId: CANCELLED_RESERVATION_ID,
        printId: CANCELLED_PRINT_ID,
        printName: null,
        material: "PLA",
        colour: "Blue",
        releasedGrams: 44,
      },
      {
        reservationId: OLDER_CANCELLED_RESERVATION_ID,
        printId: OLDER_CANCELLED_PRINT_ID,
        printName: "Older print",
        material: "PLA",
        colour: "Blue",
        releasedGrams: 55,
      },
    ],
    ...overrides,
  };
}

function rpcClient(responses) {
  const calls = [];
  return {
    calls,
    client: {
      rpc(name, args) {
        calls.push({ name, args });
        return Promise.resolve(responses.shift() ?? { data: null, error: null, status: 200 });
      },
      from() {
        assert.fail("Settlement command and result contracts must not query product projections.");
      },
    },
  };
}

test("settlement input accepts zero and the maximum whole grams, and rejects invalid boundaries", () => {
  assert.equal(MAX_ACTUAL_GRAMS, 2_147_483_647);
  assert.deepEqual(validateSettlementFormData(commandForm({ actualGrams: "0" })), {
    ok: true,
    value: { requestId: REQUEST_ID, expectedVersion: 3, reservationId: RESERVATION_ID, actualGrams: 0 },
  });
  assert.deepEqual(validateSettlementFormData(commandForm({ actualGrams: String(MAX_ACTUAL_GRAMS) })).value, {
    requestId: REQUEST_ID,
    expectedVersion: 3,
    reservationId: RESERVATION_ID,
    actualGrams: MAX_ACTUAL_GRAMS,
  });
  for (const value of ["", "-1", "+1", "1.5", "1,000", "1e2", "Infinity", "NaN", " 1 ", "2147483648"]) {
    const result = validateSettlementFormData(commandForm({ actualGrams: value }));
    assert.equal(result.ok, false, `expected ${JSON.stringify(value)} to fail`);
    assert.ok(result.fieldErrors.actualGrams);
  }
  assert.equal(validateSettlementFormData(commandForm({ expectedVersion: "0" })).ok, false);
  assert.equal(validateSettlementFormData(commandForm({ expectedVersion: "1.0" })).ok, false);
  assert.equal(validateSettlementFormData(commandForm({ requestId: "not-a-uuid" })).ok, false);
  assert.equal(validateSettlementFormData(commandForm({ reservationId: "not-a-uuid" })).ok, false);

  const duplicate = commandForm();
  duplicate.append("actualGrams", "75");
  assert.equal(validateSettlementFormData(duplicate).ok, false);
  const file = commandForm();
  file.set("actualGrams", new Blob(["75"]));
  assert.equal(validateSettlementFormData(file).ok, false);
  assert.deepEqual(
    validateSettlementFormData(form([...[...commandForm().entries()], ["ownerId", OWNER_ID]])).reason,
    "unexpected_field",
  );
  assert.equal(validateSettlementFormData(form([])).ok, false);
});

test("settlement form transport accepts only URL-encoded and multipart forms", async () => {
  const supported = new Request("https://app.test/api/settlement", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: "actualGrams=0",
  });
  const unsupported = new Request("https://app.test/api/settlement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(hasSupportedSettlementFormContentType(supported), true);
  assert.equal(hasSupportedSettlementFormContentType(unsupported), false);
  assert.ok(await readSettlementFormData(supported));
  assert.equal(await readSettlementFormData(unsupported), null);
});

test("receipt decoder validates nested snapshots, arithmetic, IDs and cancellation order strictly", () => {
  assert.deepEqual(readSettlementReceipt(receipt()), receipt());
  const maximum = receipt({
    actualGrams: MAX_ACTUAL_GRAMS,
    spool: {
      id: SPOOL_ID,
      material: "PLA",
      colour: "Blue",
      recordedGramsBefore: MAX_ACTUAL_GRAMS,
      recordedGramsAfter: 0,
      reservedGramsAfter: 0,
      availableGramsAfter: 0,
    },
    exceededEstimate: false,
    cancelledReservations: [],
  });
  assert.equal(readSettlementReceipt(maximum)?.actualGrams, MAX_ACTUAL_GRAMS);
  const zero = receipt({
    actualGrams: 0,
    spool: {
      id: SPOOL_ID,
      material: "PLA",
      colour: "Blue",
      recordedGramsBefore: 150,
      recordedGramsAfter: 150,
      reservedGramsAfter: 0,
      availableGramsAfter: 150,
    },
    cancelledReservations: [],
  });
  assert.equal(readSettlementReceipt(zero)?.actualGrams, 0);
  assert.deepEqual(readSettlementCommandReceipt({ settlement: receipt(), replayed: true }), {
    settlement: receipt(),
    replayed: true,
  });
  assert.deepEqual(
    readPrintSettlementDto({ id: SETTLEMENT_ID, settledAt: "2026-10-17T10:00:00.000Z", actualGrams: 0 }),
    { id: SETTLEMENT_ID, settledAt: "2026-10-17T10:00:00.000Z", actualGrams: 0 },
  );
  assert.equal(readPrintSettlementDto({ id: SETTLEMENT_ID, settledAt: "bad-date", actualGrams: 0 }), undefined);

  const wrongArithmetic = receipt({
    spool: { ...receipt().spool, availableGramsAfter: 35 },
  });
  const wrongExceededFlag = receipt({ exceededEstimate: true });
  const missingCancellationField = receipt({
    cancelledReservations: [{ ...receipt().cancelledReservations[0], colour: undefined }],
  });
  const unexpectedField = { ...receipt(), extra: true };
  for (const invalid of [wrongArithmetic, wrongExceededFlag, missingCancellationField, unexpectedField]) {
    assert.equal(readSettlementReceipt(invalid), undefined);
  }
});

test("settlement command and result RPCs return durable receipts without projection reads", async (t) => {
  const command = rpcClient([{ data: { settlement: receipt(), replayed: false }, error: null, status: 200 }]);
  const result = await settlePrintConsumption(command.client, PRINT_ID, {
    requestId: REQUEST_ID,
    expectedVersion: 3,
    reservationId: RESERVATION_ID,
    actualGrams: 200,
  });
  assert.deepEqual(result, { ok: true, value: { settlement: receipt(), replayed: false } });
  assert.deepEqual(command.calls, [
    {
      name: "settle_print_consumption",
      args: {
        p_request_id: REQUEST_ID,
        p_print_id: PRINT_ID,
        p_expected_version: 3,
        p_reservation_id: RESERVATION_ID,
        p_actual_grams: 200,
      },
    },
  ]);

  const read = rpcClient([{ data: receipt(), error: null, status: 200 }]);
  assert.deepEqual(await readPrintSettlement(read.client, PRINT_ID), { ok: true, value: receipt() });
  assert.deepEqual(read.calls, [{ name: "read_print_settlement", args: { p_print_id: PRINT_ID } }]);
  const noResult = rpcClient([{ data: null, error: null, status: 200 }]);
  assert.deepEqual(await readPrintSettlement(noResult.client, PRINT_ID), { ok: true, value: null });

  const malformed = rpcClient([
    { data: { settlement: { ...receipt(), actualGrams: 1.5 }, replayed: false }, error: null, status: 200 },
  ]);
  const uncertain = await settlePrintConsumption(malformed.client, PRINT_ID, {
    requestId: REQUEST_ID,
    expectedVersion: 3,
    reservationId: RESERVATION_ID,
    actualGrams: 200,
  });
  assert.equal(uncertain.ok, false);
  assert.equal(uncertain.reason, "database_error");
  t.mock.method(console, "error", () => undefined);
  const uncertainResponse = mapSettlementFailure(uncertain, "mutation");
  assert.equal(uncertainResponse.status, 500);
  assert.equal((await uncertainResponse.json()).error.refreshRequired, true);
});

test("settlement business failures map to named 404, 409 and 422 outcomes", async () => {
  for (const code of [
    "already_settled",
    "idempotency_conflict",
    "edit_conflict",
    "reservation_changed",
    "reservation_required",
    "print_settled",
  ]) {
    const fixture = rpcClient([{ data: null, error: { message: code }, status: 409 }]);
    const failure = await settlePrintConsumption(fixture.client, PRINT_ID, {
      requestId: REQUEST_ID,
      expectedVersion: 3,
      reservationId: RESERVATION_ID,
      actualGrams: 0,
    });
    assert.deepEqual(failure, { ok: false, reason: code });
    const response = mapSettlementFailure(failure, "mutation");
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, code);
  }

  const alreadySettled = mapSettlementFailure({ ok: false, reason: "already_settled" }, "mutation");
  assert.match((await alreadySettled.json()).error.message, /review.*saved settlement result/i);
  assert.equal(mapSettlementFailure({ ok: false, reason: "not_found" }, "read").status, 404);
  assert.equal(mapSettlementFailure({ ok: false, reason: "invalid_input" }, "mutation").status, 422);
});

test("settlement responses are private and unexpected provider failures stay sanitized", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const success = createSettlementJsonResponse({ settlement: receipt() });
  assert.equal(success.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(success.headers.get("Expires"), "0");
  assert.equal(success.headers.get("Pragma"), "no-cache");
  const unauthorized = createSettlementUnauthorizedResponse();
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.signInUrl, "/auth/signin");
  const method = createSettlementMethodNotAllowedResponse("GET, POST");
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "GET, POST");
  const unsupported = createSettlementErrorResponse("unsupported_media_type", 415, "form only");
  assert.equal(unsupported.status, 415);

  const failure = mapSettlementFailure(
    {
      ok: false,
      reason: "database_error",
      error: Object.assign(new TypeError("Private provider body and URL"), { code: "42P01" }),
      status: 400,
    },
    "mutation",
  );
  assert.equal(failure.status, 500);
  assert.equal(failure.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  const body = await failure.json();
  assert.equal(body.error.code, "internal_error");
  assert.equal(body.error.refreshRequired, true);
  assert.doesNotMatch(JSON.stringify(body), /Private provider|Private URL|42P01/);
  assert.equal(log.mock.calls.length, 1);
  assert.equal(log.mock.calls[0].arguments[0], "Unexpected print database failure");
  assert.doesNotMatch(JSON.stringify(log.mock.calls.map((call) => call.arguments)), /Private provider|Private URL/);

  const outage = mapSettlementFailure(
    {
      ok: false,
      reason: "database_error",
      error: new TypeError("Private unavailable service response"),
      status: 503,
    },
    "mutation",
  );
  assert.equal(outage.status, 503);
  assert.equal(outage.headers.get("Retry-After"), "30");
  assert.equal((await outage.json()).error.code, "temporarily_unavailable");
});
