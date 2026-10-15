/* global Blob, FormData, Request, Response */

import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import {
  MAX_PRINT_LABEL_CODE_POINTS,
  MAX_REQUIRED_GRAMS,
  hasSupportedPrintFormContentType,
  isValidPrintId,
  normalizePrintText,
  readPrintFormData,
  validatePrintFormData,
  validatePrintInput,
} from "../src/lib/print-validation.ts";
import {
  PRINT_CACHE_CONTROL,
  PRINT_SIGN_IN_DESTINATION,
  createMappedPrintFailureResponse,
  createPrintConflictResponse,
  createPrintDatabaseErrorResponse,
  createPrintJsonResponse,
  createPrintMalformedPayloadResponse,
  createPrintMethodNotAllowedResponse,
  createPrintUnsupportedMediaTypeResponse,
  createPrintUnauthorizedResponse,
  createPrintUnavailableResponse,
  createPrintValidationResponse,
  mapPrintDatabaseError,
  reportPrintFailure,
} from "../src/lib/print-response.ts";
import {
  PRINT_QUERY_BATCH_SIZE,
  createPrint,
  deletePrint,
  listPrints,
  toPrintDto,
  updatePrint,
} from "../src/lib/prints.ts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER_ID = "22222222-2222-4222-8222-222222222222";
const PRINT_ID = "33333333-3333-4333-8333-333333333333";

function makeForm(entries) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

function validForm(overrides = {}) {
  return makeForm([
    ...(Object.hasOwn(overrides, "name") ? [["name", overrides.name]] : []),
    ["material", overrides.material ?? "PLA"],
    ["colour", overrides.colour ?? "Blue"],
    ["requiredGrams", overrides.requiredGrams ?? "125"],
  ]);
}

function editForm(overrides = {}) {
  const form = validForm(overrides);
  form.append("expectedVersion", overrides.expectedVersion ?? "1");
  return form;
}

function row(index, values = {}) {
  const suffix = index.toString(16).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    user_id: OWNER_ID,
    name: null,
    material: "PLA",
    colour: "Blue",
    colour_key: "blue",
    required_grams: 125,
    version: 1,
    created_at: "2026-10-10T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z",
    ...values,
  };
}

function compareRows(left, right, orders) {
  for (const { field, ascending } of orders) {
    const a = String(left[field]);
    const b = String(right[field]);
    if (a === b) continue;
    const comparison = a < b ? -1 : 1;
    return ascending ? comparison : -comparison;
  }
  return 0;
}

function makePrintClient({ rows = [], mutationResponses = [], probeResponse, pageErrors = {} } = {}) {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "prints");
      const state = { table, filters: [], orders: [], selection: undefined, operation: "select" };
      const builder = {
        select(columns) {
          state.selection = columns;
          return builder;
        },
        eq(field, value) {
          state.filters.push({ field, value });
          return builder;
        },
        order(field, options) {
          state.orders.push({ field, ascending: options.ascending });
          return builder;
        },
        range(from, to) {
          assert.equal(to - from + 1, PRINT_QUERY_BATCH_SIZE);
          assert.equal(state.selection, "id, name, material, colour, required_grams, version, created_at, updated_at");
          assert.deepEqual(state.filters, [{ field: "user_id", value: OWNER_ID }]);
          assert.deepEqual(state.orders, [
            { field: "created_at", ascending: false },
            { field: "id", ascending: true },
          ]);
          state.range = { from, to };
          calls.push(state);
          if (pageErrors[from]) return Promise.resolve(pageErrors[from]);
          const matchingRows = rows
            .filter((item) => item.user_id === OWNER_ID)
            .sort((left, right) => compareRows(left, right, state.orders));
          return Promise.resolve({ data: matchingRows.slice(from, to + 1), error: null, status: 200 });
        },
        insert(values) {
          state.operation = "insert";
          state.values = values;
          return builder;
        },
        update(values) {
          state.operation = "update";
          state.values = values;
          return builder;
        },
        delete() {
          state.operation = "delete";
          return builder;
        },
        maybeSingle() {
          calls.push(state);
          if (state.operation === "select") {
            assert.equal(state.selection, "id");
            assert.deepEqual(state.filters, [
              { field: "id", value: PRINT_ID },
              { field: "user_id", value: OWNER_ID },
            ]);
            if (probeResponse) return Promise.resolve(probeResponse);
            const id = state.filters.find(({ field }) => field === "id").value;
            const ownerId = state.filters.find(({ field }) => field === "user_id").value;
            const ownedRow = rows.find((item) => item.id === id && item.user_id === ownerId);
            return Promise.resolve({ data: ownedRow ? { id: ownedRow.id } : null, error: null, status: 200 });
          }
          return Promise.resolve(mutationResponses.shift() ?? { data: null, error: null, status: 200 });
        },
        then() {
          assert.fail("Print list reads must use a bounded range before they are awaited.");
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

function cacheHeaders(response) {
  assert.equal(response.headers.get("Cache-Control"), PRINT_CACHE_CONTROL);
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
}

function makeSdkClient(fetch) {
  return createClient("https://prints.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

test("print forms normalize optional names, preserve Unicode, and enforce code-point bounds", () => {
  const omitted = validatePrintFormData(validForm(), "create");
  assert.equal(omitted.data.name, null);
  const blank = validatePrintFormData(validForm({ name: " \u00A0\u2002 " }), "create");
  assert.equal(blank.data.name, null);
  const named = validatePrintFormData(validForm({ name: "  Phone   holder  " }), "create");
  assert.equal(named.data.name, "Phone holder");
  assert.equal(named.expectedVersion, undefined);
  assert.equal(
    validatePrintInput({ name: "e\u0301", material: "PLA", colour: "Blue", requiredGrams: "1" }, "create").data.name,
    "e\u0301",
  );

  const supplementaryCharacter = "𐐷";
  assert.equal(MAX_PRINT_LABEL_CODE_POINTS, 80);
  assert.equal(
    validatePrintInput(
      { name: supplementaryCharacter.repeat(80), material: "PLA", colour: "Blue", requiredGrams: "1" },
      "create",
    ).data.name.length,
    160,
  );
  assert.equal(
    validatePrintInput(
      { name: supplementaryCharacter.repeat(81), material: "PLA", colour: "Blue", requiredGrams: "1" },
      "edit",
    ).fieldErrors.name.code,
    "too_long",
  );
});

test("print labels share the database whitespace set while preserving Unicode and multicolour order", () => {
  const expectedWhitespace = [
    "\u0009",
    "\u000A",
    "\u000B",
    "\u000C",
    "\u000D",
    "\u0020",
    "\u0085",
    "\u00A0",
    "\u1680",
    "\u2000",
    "\u2001",
    "\u2002",
    "\u2003",
    "\u2004",
    "\u2005",
    "\u2006",
    "\u2007",
    "\u2008",
    "\u2009",
    "\u200A",
    "\u2028",
    "\u2029",
    "\u202F",
    "\u205F",
    "\u3000",
    "\uFEFF",
  ];
  for (const whitespace of expectedWhitespace)
    assert.equal(normalizePrintText(`${whitespace}Black${whitespace}`), "Black");
  const valid = validatePrintFormData(
    validForm({ material: "\u00A0pla\u2002", colour: "Black\t\u0085Red", requiredGrams: "1" }),
    "create",
  );
  assert.deepEqual(valid.data, { name: null, material: "pla", colour: "Black Red", requiredGrams: 1 });
  assert.equal(
    validatePrintFormData(validForm({ material: "\uFEFF\u0085\u00A0" }), "create").fieldErrors.material.code,
    "required",
  );
  assert.equal(
    validatePrintFormData(validForm({ colour: "Black   / Red / Gold" }), "create").data.colour,
    "Black / Red / Gold",
  );
  assert.equal(
    validatePrintFormData(validForm({ colour: "Gold / Red / Black" }), "create").data.colour,
    "Gold / Red / Black",
  );
  assert.equal(
    validatePrintFormData(validForm({ material: "Straße" }), "create").data.material,
    "Straße",
    "database case conversion remains authoritative",
  );
});

test("print labels preserve non-whitespace characters and decomposed names and colours", () => {
  for (const mode of ["create", "edit"]) {
    for (const [input, expected] of [
      ["\u200BBlack\u200B", "\u200BBlack\u200B"],
      ["\u2060Black\u2060", "\u2060Black\u2060"],
      ["\u180EBlack\u180E", "\u180EBlack\u180E"],
      ["e\u0301", "e\u0301"],
      ["\u00E9", "\u00E9"],
      [" \t\u200BBlack\u0085\u00A0Red\u200B \t", "\u200BBlack Red\u200B"],
    ]) {
      const result = validatePrintInput({ name: input, material: "PLA", colour: input, requiredGrams: "1" }, mode);
      assert.equal(result.data.name, expected);
      assert.equal(result.data.colour, expected);
    }
  }
});

test("required grams are positive whole decimal digits on create and edit", () => {
  const base = { name: undefined, material: "PLA", colour: "Blue" };
  assert.equal(MAX_REQUIRED_GRAMS, 2_147_483_647);
  for (const mode of ["create", "edit"]) {
    assert.equal(validatePrintInput({ ...base, requiredGrams: "1" }, mode).data.requiredGrams, 1);
    assert.equal(validatePrintInput({ ...base, requiredGrams: "001" }, mode).data.requiredGrams, 1);
    assert.equal(
      validatePrintInput({ ...base, requiredGrams: String(MAX_REQUIRED_GRAMS) }, mode).data.requiredGrams,
      MAX_REQUIRED_GRAMS,
    );
    for (const value of [
      "0",
      "-1",
      "+1",
      "1.5",
      "1,000",
      "1e2",
      "Infinity",
      " 1 ",
      "",
      String(MAX_REQUIRED_GRAMS + 1),
    ]) {
      const validation = validatePrintInput({ ...base, requiredGrams: value }, mode);
      assert.ok(validation.fieldErrors.requiredGrams, `${mode}: expected ${JSON.stringify(value)} to fail`);
    }
  }
});

test("form extraction rejects repeated, file-valued, missing, and unknown fields", () => {
  assert.deepEqual(Object.keys(validatePrintFormData(new FormData(), "create").fieldErrors).sort(), [
    "colour",
    "material",
    "requiredGrams",
  ]);
  const duplicate = validForm();
  duplicate.append("material", "PETG");
  assert.equal(validatePrintFormData(duplicate, "create").fieldErrors.material.code, "invalid");
  for (const field of ["name", "material", "colour", "requiredGrams"]) {
    const form = validForm({ name: "Print" });
    form.delete(field);
    form.append(field, new Blob(["text"]));
    assert.equal(validatePrintFormData(form, "create").fieldErrors[field].code, "invalid");
  }
  const forged = validForm();
  forged.append("user_id", OTHER_OWNER_ID);
  assert.equal(validatePrintFormData(forged, "create").payloadError, "unexpected_field");
});

test("create rejects expectedVersion while edit requires one decimal-digit version in range", () => {
  const forgedCreate = validForm();
  forgedCreate.append("expectedVersion", "1");
  assert.equal(validatePrintFormData(forgedCreate, "create").payloadError, "unexpected_field");

  const missing = validatePrintFormData(validForm(), "edit");
  assert.equal(missing.fieldErrors.expectedVersion.code, "required");
  for (const value of ["", "-1", "+1", "1.0", "1e2", " 1 ", String(MAX_REQUIRED_GRAMS + 1)]) {
    assert.ok(validatePrintFormData(editForm({ expectedVersion: value }), "edit").fieldErrors.expectedVersion);
  }
  for (const value of ["1", "0001", String(MAX_REQUIRED_GRAMS)]) {
    const parsed = validatePrintFormData(editForm({ expectedVersion: value }), "edit");
    assert.equal(parsed.expectedVersion, Number(value));
  }
  const repeated = editForm();
  repeated.append("expectedVersion", "2");
  assert.equal(validatePrintFormData(repeated, "edit").fieldErrors.expectedVersion.code, "invalid");
  const file = validForm();
  file.append("expectedVersion", new Blob(["1"]));
  assert.equal(validatePrintFormData(file, "edit").fieldErrors.expectedVersion.code, "invalid");
  const clearsName = validatePrintFormData(editForm(), "edit");
  assert.equal(clearsName.data.name, null, "omitting name from an edit clears it");
});

test("print form content type, malformed body, and identifiers are constrained", async () => {
  assert.equal(
    hasSupportedPrintFormContentType(
      new Request("https://app.test/api/prints", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      }),
    ),
    true,
  );
  assert.equal(
    hasSupportedPrintFormContentType(
      new Request("https://app.test/api/prints", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=test" },
        body: "",
      }),
    ),
    true,
  );
  const jsonRequest = new Request("https://app.test/api/prints", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(hasSupportedPrintFormContentType(jsonRequest), false);
  assert.equal(await readPrintFormData(jsonRequest), null);
  assert.equal(isValidPrintId(PRINT_ID), true);
  assert.equal(isValidPrintId("not-a-uuid"), false);
});

test("create returns the committed canonical row and writes verified owner plus editable fields", async () => {
  const canonicalRow = row(1, {
    id: PRINT_ID,
    name: "Phone holder",
    material: "STRASSE",
    colour: "Black / Red / Gold",
    required_grams: 80,
    version: 1,
  });
  const fixture = makePrintClient({ mutationResponses: [{ data: canonicalRow, error: null, status: 201 }] });
  const input = validatePrintFormData(
    validForm({ name: " Phone   holder ", material: "Straße", colour: "Black / Red / Gold", requiredGrams: "80" }),
    "create",
  ).data;
  const result = await createPrint(fixture.client, OWNER_ID, input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    id: PRINT_ID,
    name: "Phone holder",
    material: "STRASSE",
    colour: "Black / Red / Gold",
    requiredGrams: 80,
    version: 1,
    createdAt: canonicalRow.created_at,
    updatedAt: canonicalRow.updated_at,
  });
  assert.deepEqual(fixture.calls[0].values, {
    user_id: OWNER_ID,
    name: "Phone holder",
    material: "Straße",
    colour: "Black / Red / Gold",
    required_grams: 80,
  });
  assert.equal(Object.hasOwn(result.value, "user_id"), false);
  assert.equal(Object.hasOwn(result.value, "colour_key"), false);
});

test("update is owner, ID, and expected-version scoped and returns the incremented committed row", async () => {
  const committed = row(1, {
    id: PRINT_ID,
    name: null,
    material: "PETG",
    colour: "Blue",
    required_grams: 250,
    version: 2,
    updated_at: "2026-10-12T12:00:00.000Z",
  });
  const fixture = makePrintClient({ mutationResponses: [{ data: committed, error: null, status: 200 }] });
  const input = validatePrintFormData(editForm({ material: "PETG", requiredGrams: "250" }), "edit").data;
  const result = await updatePrint(fixture.client, OWNER_ID, PRINT_ID, 1, input);
  assert.equal(result.ok, true);
  assert.equal(result.value.version, 2);
  assert.equal(result.value.requiredGrams, 250);
  assert.deepEqual(fixture.calls[0].filters, [
    { field: "id", value: PRINT_ID },
    { field: "user_id", value: OWNER_ID },
    { field: "version", value: 1 },
  ]);
  assert.deepEqual(fixture.calls[0].values, {
    name: null,
    material: "PETG",
    colour: "Blue",
    required_grams: 250,
  });
});

test("a zero-row update distinguishes owned conflict from absent or foreign targets", async () => {
  const input = { name: null, material: "PLA", colour: "Blue", requiredGrams: 125 };
  const owned = makePrintClient({
    mutationResponses: [{ data: null, error: null, status: 200 }],
    probeResponse: { data: { id: PRINT_ID }, error: null, status: 200 },
  });
  assert.deepEqual(await updatePrint(owned.client, OWNER_ID, PRINT_ID, 1, input), { ok: false, reason: "conflict" });
  assert.deepEqual(owned.calls[1].filters, [
    { field: "id", value: PRINT_ID },
    { field: "user_id", value: OWNER_ID },
  ]);

  const missing = makePrintClient({ mutationResponses: [{ data: null, error: null, status: 200 }] });
  assert.deepEqual(await updatePrint(missing.client, OWNER_ID, PRINT_ID, 1, input), { ok: false, reason: "not_found" });

  const foreign = makePrintClient({
    rows: [row(1, { id: PRINT_ID, user_id: OTHER_OWNER_ID })],
    mutationResponses: [{ data: null, error: null, status: 200 }],
  });
  assert.deepEqual(await updatePrint(foreign.client, OWNER_ID, PRINT_ID, 1, input), {
    ok: false,
    reason: "not_found",
  });
  assert.equal(foreign.calls[1].filters.find(({ field }) => field === "user_id").value, OWNER_ID);
});

test("a failed post-update ownership probe remains a database error", async () => {
  const fixture = makePrintClient({
    mutationResponses: [{ data: null, error: null, status: 200 }],
    probeResponse: { data: null, error: { code: "08006", message: "connection failed" }, status: 503 },
  });
  const result = await updatePrint(fixture.client, OWNER_ID, PRINT_ID, 1, {
    name: null,
    material: "PLA",
    colour: "Blue",
    requiredGrams: 125,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "database_error");
  assert.equal(result.status, 503);
});

test("delete requires a returned ID and remains owner/ID scoped without a version filter", async () => {
  const missing = makePrintClient({ mutationResponses: [{ data: null, error: null, status: 200 }] });
  assert.deepEqual(await deletePrint(missing.client, OWNER_ID, PRINT_ID), { ok: false, reason: "not_found" });
  assert.deepEqual(missing.calls[0].filters, [
    { field: "id", value: PRINT_ID },
    { field: "user_id", value: OWNER_ID },
  ]);

  const deleted = makePrintClient({ mutationResponses: [{ data: { id: PRINT_ID }, error: null, status: 200 }] });
  assert.deepEqual(await deletePrint(deleted.client, OWNER_ID, PRINT_ID), { ok: true, value: { id: PRINT_ID } });
  assert.equal(
    deleted.calls[0].filters.some(({ field }) => field === "version"),
    false,
  );
});

test("database canonicalization constraints map back to print fields", () => {
  const mapped = mapPrintDatabaseError({
    code: "23514",
    message: 'new row violates check constraint "prints_material_length_check"',
  });
  assert.equal(mapped.status, 422);
  assert.equal(mapped.body.error.fieldErrors.material.code, "too_long");
  assert.equal(
    mapPrintDatabaseError({ constraint: "prints_name_length_check" }).body.error.fieldErrors.name.code,
    "too_long",
  );
  assert.equal(
    mapPrintDatabaseError({ constraint: "prints_colour_length_check" }).body.error.fieldErrors.colour.code,
    "too_long",
  );
  assert.equal(
    mapPrintDatabaseError({ constraint: "prints_required_grams_valid" }).body.error.fieldErrors.requiredGrams.code,
    "out_of_range",
  );
});

test("installed SDK status stays separate and status-0 mutation errors return private 503 refresh guidance", async () => {
  const client = makeSdkClient(async () => {
    const cause = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
    throw new TypeError("fetch failed", { cause });
  });
  const result = await createPrint(client, OWNER_ID, {
    name: null,
    material: "PLA",
    colour: "Blue",
    requiredGrams: 125,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "database_error");
  assert.equal(result.status, 0);
  assert.equal(Object.hasOwn(result.error, "status"), false);

  const response = createPrintDatabaseErrorResponse(result.error, result.status, "mutation");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Retry-After"), "30");
  cacheHeaders(response);
  const body = await response.json();
  assert.equal(body.error.code, "temporarily_unavailable");
  assert.equal(body.error.retryAfter, 30);
  assert.equal(body.error.refreshRequired, true);
  assert.match(body.error.message, /outcome may be uncertain.*refresh your print list/i);
  assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED|fetch failed|Connection refused/);
});

test("installed SDK HTTP statuses map transient and unexpected failures without leaking diagnostics", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  for (const status of [429, 503, 520]) {
    const client = makeSdkClient(async () =>
      Response.json({ message: "Private upstream failure", code: "XX000", details: "Private diagnostic" }, { status }),
    );
    const result = await createPrint(client, OWNER_ID, {
      name: null,
      material: "PLA",
      colour: "Blue",
      requiredGrams: 125,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(Object.hasOwn(result.error, "status"), false);
    const response = createPrintDatabaseErrorResponse(result.error, result.status, "mutation");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), "30");
    cacheHeaders(response);
    assert.equal((await response.json()).error.refreshRequired, true);
  }

  const permanentClient = makeSdkClient(async () =>
    Response.json(
      { message: "Private provider detail", code: "XX001", details: "private material value", hint: "private URL" },
      { status: 400 },
    ),
  );
  const failed = await createPrint(permanentClient, OWNER_ID, {
    name: null,
    material: "PLA",
    colour: "Blue",
    requiredGrams: 125,
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 400);
  assert.equal(Object.hasOwn(failed.error, "status"), false);
  const mapped = createPrintDatabaseErrorResponse(failed.error, failed.status, "mutation");
  assert.equal(mapped.status, 500);
  cacheHeaders(mapped);
  const mappedBody = await mapped.json();
  assert.equal(mappedBody.error.refreshRequired, true);
  assert.doesNotMatch(JSON.stringify(mappedBody), /Private provider|private material|private URL/);
  assert.equal(log.mock.calls.length, 1);
  assert.equal(log.mock.calls[0].arguments[0], "Unexpected print database failure");
  assert.doesNotMatch(
    JSON.stringify(log.mock.calls.map((call) => call.arguments)),
    /Private provider|private material|private URL/,
  );
});

test("read failures are retryable while all generated response categories are private", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const unavailable = createPrintDatabaseErrorResponse({ message: "offline" }, 503, "read");
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Retry-After"), "30");
  assert.equal((await unavailable.json()).error.refreshRequired, undefined);
  cacheHeaders(unavailable);

  const unauthorized = createPrintUnauthorizedResponse();
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.signInUrl, PRINT_SIGN_IN_DESTINATION);
  cacheHeaders(unauthorized);
  const serviceUnavailable = createPrintUnavailableResponse();
  assert.equal(serviceUnavailable.status, 503);
  assert.equal(serviceUnavailable.headers.get("Retry-After"), "30");
  cacheHeaders(serviceUnavailable);
  const unsupported = createPrintUnsupportedMediaTypeResponse();
  assert.equal(unsupported.status, 415);
  cacheHeaders(unsupported);
  const malformed = createPrintMalformedPayloadResponse();
  assert.equal(malformed.status, 422);
  cacheHeaders(malformed);
  const invalid = createPrintValidationResponse(
    validatePrintInput({ material: "PLA", colour: "Blue", requiredGrams: "0" }, "create"),
  );
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error.fieldErrors.requiredGrams.code, "out_of_range");
  cacheHeaders(invalid);
  const unexpectedField = createPrintValidationResponse({ fieldErrors: {}, payloadError: "unexpected_field" });
  assert.equal((await unexpectedField.json()).error.code, "invalid_payload");
  cacheHeaders(unexpectedField);
  const notFound = createPrintJsonResponse({ error: { code: "not_found" } }, 404);
  cacheHeaders(notFound);
  assert.equal(notFound.headers.get("Content-Type"), "application/json; charset=utf-8");
  const method = createPrintMethodNotAllowedResponse("GET, POST");
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "GET, POST");
  cacheHeaders(method);
  const conflict = createPrintConflictResponse();
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "edit_conflict");
  cacheHeaders(conflict);

  reportPrintFailure(mapPrintDatabaseError({ message: 'violates constraint "prints_material_length_check"' }), "page");
  assert.equal(log.mock.calls.length, 0, "expected field errors are not logged as unexpected failures");
});

test("unexpected diagnostics allowlist only bounded safe causes and known source coordinates", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const original = Object.assign(new TypeError("private provider payload"), {
    code: "42P01",
    details: "private form value",
    stack:
      "TypeError: private provider payload\n    at query (https://private-key:private-token@provider.test/src/lib/prints.ts:91:4)\n    at private-caller (/private-path/private-form-value.js:1:2)",
    cause: new RangeError("private nested error"),
  });
  const failure = mapPrintDatabaseError(original);
  assert.equal(failure.status, 500);
  assert.equal(failure.cause.cause.message, "private provider payload");
  const response = createMappedPrintFailureResponse(failure);
  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /private provider|private form/);
  cacheHeaders(response);
  assert.equal(log.mock.calls.length, 1);
  const [message, diagnostic] = log.mock.calls[0].arguments;
  assert.equal(message, "Unexpected print database failure");
  assert.equal(diagnostic.boundary, "api");
  assert.equal(diagnostic.causes[1].name, "TypeError");
  assert.equal(diagnostic.causes[1].code, "42P01");
  assert.deepEqual(diagnostic.causes[1].frames, ["prints.ts:91:4"]);
  assert.equal(diagnostic.causes[2].name, "RangeError");
  assert.doesNotMatch(
    JSON.stringify(log.mock.calls.map((call) => call.arguments)),
    /private-|private provider|private form|private nested/,
  );
});

test("print list reads all ordered bounded pages and hides owner and matching-key columns", async () => {
  for (const count of [0, 1_000, 1_001]) {
    const rows = Array.from({ length: count }, (_, index) => row(count - index));
    const fixture = makePrintClient({ rows });
    const result = await listPrints(fixture.client, OWNER_ID);
    assert.equal(result.ok, true);
    assert.equal(result.value.length, count);
    assert.deepEqual(
      fixture.calls.map(({ range }) => range),
      count === 0
        ? [{ from: 0, to: 999 }]
        : [
            { from: 0, to: 999 },
            { from: 1_000, to: 1_999 },
          ],
    );
    const ids = result.value.map(({ id }) => id);
    assert.equal(new Set(ids).size, count);
    assert.deepEqual(ids, [...ids].sort(), "equal-time UUID ties sort ascending by ID");
    for (const item of result.value) {
      assert.equal(Object.hasOwn(item, "user_id"), false);
      assert.equal(Object.hasOwn(item, "colour_key"), false);
      assert.equal(Object.hasOwn(item, "reservedGrams"), false);
    }
  }
  const dto = toPrintDto(row(1, { colour_key: "private-key" }));
  assert.deepEqual(Object.keys(dto).sort(), [
    "colour",
    "createdAt",
    "id",
    "material",
    "name",
    "requiredGrams",
    "updatedAt",
    "version",
  ]);
});

test("a later page failure discards the entire accumulated print list", async () => {
  const rows = Array.from({ length: 1_001 }, (_, index) => row(index));
  const fixture = makePrintClient({
    rows,
    pageErrors: { 1_000: { data: null, error: { message: "later page failed" }, status: 503 } },
  });
  const result = await listPrints(fixture.client, OWNER_ID);
  assert.deepEqual(
    fixture.calls.map(({ range }) => range),
    [
      { from: 0, to: 999 },
      { from: 1_000, to: 1_999 },
    ],
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, "database_error");
  assert.equal(result.status, 503);
  assert.equal(Object.hasOwn(result, "value"), false);
});
