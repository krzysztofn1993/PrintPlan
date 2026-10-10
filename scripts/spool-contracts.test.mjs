/* global Blob, FormData, Request */

import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RECORDED_GRAMS,
  hasSupportedSpoolFormContentType,
  isValidSpoolId,
  normalizeSpoolLabel,
  readSpoolFormData,
  validateSpoolFormData,
  validateSpoolInput,
} from "../src/lib/spool-validation.ts";
import {
  SPOOL_CACHE_CONTROL,
  SPOOL_SIGN_IN_DESTINATION,
  createMappedSpoolFailureResponse,
  createSpoolDatabaseErrorResponse,
  createSpoolJsonResponse,
  createSpoolMalformedPayloadResponse,
  createSpoolMethodNotAllowedResponse,
  createSpoolUnsupportedMediaTypeResponse,
  createSpoolUnauthorizedResponse,
  createSpoolUnavailableResponse,
  createSpoolValidationResponse,
  mapSpoolDatabaseError,
} from "../src/lib/spool-response.ts";
import {
  createSpool,
  deleteSpool,
  listSpools,
  SPOOL_QUERY_BATCH_SIZE,
  toSpoolDto,
  updateSpool,
} from "../src/lib/spools.ts";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_OWNER_ID = "22222222-2222-4222-8222-222222222222";
const SPOOL_ID = "33333333-3333-4333-8333-333333333333";

function makeForm(entries) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

function validForm(overrides = {}) {
  return makeForm([
    ["material", overrides.material ?? "PLA"],
    ["colour", overrides.colour ?? "Blue"],
    ["recordedGrams", overrides.recordedGrams ?? "125"],
  ]);
}

function row(index, values = {}) {
  const suffix = index.toString(16).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    user_id: OWNER_ID,
    material: "PLA",
    colour: "Blue",
    colour_key: "blue",
    created_at: "2026-10-10T10:00:00.000Z",
    updated_at: "2026-10-10T10:00:00.000Z",
    recorded_grams: index + 1,
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

function makeSpoolClient({ rows = [], mutationResponses = [] } = {}) {
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, "spools");
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
          assert.equal(to - from + 1, SPOOL_QUERY_BATCH_SIZE, "queries must request one configured page");
          assert.equal(state.selection, "id, material, colour, created_at, updated_at, recorded_grams");
          assert.deepEqual(state.filters, [{ field: "user_id", value: OWNER_ID }]);
          assert.deepEqual(state.orders, [
            { field: "created_at", ascending: false },
            { field: "id", ascending: true },
          ]);
          state.range = { from, to };
          calls.push(state);
          const ownerFilter = state.filters.find(({ field }) => field === "user_id");
          const matchingRows = rows
            .filter((item) => item.user_id === ownerFilter.value)
            .sort((left, right) => compareRows(left, right, state.orders));
          return Promise.resolve({ data: matchingRows.slice(from, to + 1), error: null });
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
          return Promise.resolve(mutationResponses.shift() ?? { data: null, error: null });
        },
        then(_resolve, _reject) {
          assert.fail("A spool list query must use a bounded range before it is awaited.");
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

function cacheHeaders(response) {
  assert.equal(response.headers.get("Cache-Control"), SPOOL_CACHE_CONTROL);
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
}

test("stock form validation requires one text value for every editable field", () => {
  const missing = validateSpoolFormData(new FormData(), "create");
  assert.deepEqual(Object.keys(missing.fieldErrors).sort(), ["colour", "material", "recordedGrams"]);
  assert.equal(missing.fieldErrors.material.code, "required");

  const duplicate = makeForm([
    ["material", "PLA"],
    ["material", "PETG"],
    ["colour", "Blue"],
    ["recordedGrams", "10"],
  ]);
  assert.equal(validateSpoolFormData(duplicate, "create").fieldErrors.material.code, "invalid");

  for (const field of ["material", "colour", "recordedGrams"]) {
    const entries = [
      ["material", "PLA"],
      ["colour", "Blue"],
      ["recordedGrams", "10"],
    ].filter(([name]) => name !== field);
    entries.push([field, new Blob(["value"])]);
    assert.equal(validateSpoolFormData(makeForm(entries), "create").fieldErrors[field].code, "invalid");
  }

  const forged = validForm();
  forged.append("user_id", OTHER_OWNER_ID);
  const forgedResult = validateSpoolFormData(forged, "create");
  assert.equal(forgedResult.data, undefined);
  assert.equal(forgedResult.payloadError, "unexpected_field");
});

test("stock quantities accept decimal digits only and create/edit have distinct zero rules", () => {
  const base = { material: "PLA", colour: "Blue" };
  const createZero = validateSpoolInput({ ...base, recordedGrams: "0" }, "create");
  assert.equal(createZero.fieldErrors.recordedGrams.code, "out_of_range");
  assert.equal(validateSpoolInput({ ...base, recordedGrams: "0" }, "edit").data.recordedGrams, 0);
  assert.equal(
    validateSpoolInput({ ...base, recordedGrams: String(MAX_RECORDED_GRAMS) }, "create").data.recordedGrams,
    MAX_RECORDED_GRAMS,
  );

  for (const value of ["-1", "+1", "1.5", "1,000", "1e2", "Infinity", " 1 ", String(MAX_RECORDED_GRAMS + 1)]) {
    const result = validateSpoolInput({ ...base, recordedGrams: value }, "edit");
    assert.ok(result.fieldErrors.recordedGrams, `expected ${JSON.stringify(value)} to be rejected`);
  }
  assert.equal(validateSpoolInput({ ...base, recordedGrams: "001" }, "create").data.recordedGrams, 1);
});

test("label normalization uses the cross-layer whitespace set and preserves label meaning", () => {
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
    assert.equal(normalizeSpoolLabel(`${whitespace}Black${whitespace}`), "Black");

  const mixed = validateSpoolInput(
    { material: "\u00A0pla\u2002", colour: "Black\t\u0085Red", recordedGrams: "1" },
    "create",
  );
  assert.deepEqual(mixed.data, { material: "pla", colour: "Black Red", recordedGrams: 1 });
  assert.equal(
    validateSpoolInput({ material: "\uFEFF\u0085\u00A0", colour: "Blue", recordedGrams: "1" }, "create").fieldErrors
      .material.code,
    "required",
  );

  const multicolour = validateSpoolInput(
    { material: "PLA", colour: "Black   / Red / Gold", recordedGrams: "1" },
    "create",
  );
  const reordered = validateSpoolInput({ material: "PLA", colour: "Gold / Red / Black", recordedGrams: "1" }, "create");
  assert.equal(multicolour.data.colour, "Black / Red / Gold");
  assert.equal(reordered.data.colour, "Gold / Red / Black");
  assert.notEqual(multicolour.data.colour, reordered.data.colour);
  assert.equal(
    validateSpoolInput({ material: "PLA", colour: "Grey", recordedGrams: "1" }, "create").data.colour,
    "Grey",
  );
  assert.equal(
    validateSpoolInput({ material: "PLA", colour: "Gray", recordedGrams: "1" }, "create").data.colour,
    "Gray",
  );
  assert.equal(
    validateSpoolInput({ material: "Straße", colour: "İ", recordedGrams: "1" }, "create").data.material,
    "Straße",
  );
});

test("label bounds count Unicode code points and database canonicalization stays authoritative", () => {
  const supplementaryCharacter = "𐐷";
  assert.equal(
    validateSpoolInput({ material: "PLA", colour: supplementaryCharacter.repeat(80), recordedGrams: "1" }, "create")
      .data.colour.length,
    160,
  );
  assert.equal(
    validateSpoolInput({ material: "PLA", colour: supplementaryCharacter.repeat(81), recordedGrams: "1" }, "create")
      .fieldErrors.colour.code,
    "too_long",
  );
  const fortySharpS = validateSpoolInput({ material: "ß".repeat(40), colour: "Blue", recordedGrams: "1" }, "create");
  const fortyOneSharpS = validateSpoolInput({ material: "ß".repeat(41), colour: "Blue", recordedGrams: "1" }, "create");
  assert.equal(fortySharpS.data.material, "ß".repeat(40));
  assert.equal(fortyOneSharpS.data.material, "ß".repeat(41));
  assert.equal(fortyOneSharpS.data.material.length, 41);

  const caseExpansionError = mapSpoolDatabaseError({
    code: "23514",
    message: 'new row violates check constraint "spools_material_length_check"',
  });
  assert.equal(caseExpansionError.status, 422);
  assert.equal(caseExpansionError.body.error.fieldErrors.material.code, "too_long");

  const rowFromDatabase = toSpoolDto(row(1, { material: "STRASSE", colour: "İ", recorded_grams: 75 }));
  assert.equal(rowFromDatabase.material, "STRASSE");
  assert.equal(rowFromDatabase.colour, "İ");
  assert.equal(Object.hasOwn(rowFromDatabase, "colour_key"), false);
  assert.equal(rowFromDatabase.reservedGrams, 0);
  assert.equal(rowFromDatabase.availableGrams, 75);
  assert.equal(toSpoolDto(row(2, { material: "S".repeat(80) })).material, "S".repeat(80));
});

test("create returns committed canonical values and writes only server-owned identity plus editable fields", async () => {
  const canonicalRow = row(1, { id: SPOOL_ID, material: "STRASSE", colour: "Black / Red / Gold", recorded_grams: 12 });
  const { client, calls } = makeSpoolClient({ mutationResponses: [{ data: canonicalRow, error: null }] });
  const input = validateSpoolInput(
    { material: "Straße", colour: "Black / Red / Gold", recordedGrams: "12" },
    "create",
  ).data;
  const result = await createSpool(client, OWNER_ID, input);

  assert.equal(result.ok, true);
  assert.equal(result.value.material, "STRASSE");
  assert.equal(result.value.colour, "Black / Red / Gold");
  assert.deepEqual(calls[0].values, {
    user_id: OWNER_ID,
    material: "Straße",
    colour: "Black / Red / Gold",
    recorded_grams: 12,
  });
});

test("update and delete require a returned affected row", async () => {
  const updateFixture = makeSpoolClient({ mutationResponses: [{ data: null, error: null }] });
  const edit = validateSpoolInput({ material: "PLA", colour: "Blue", recordedGrams: "0" }, "edit").data;
  const updated = await updateSpool(updateFixture.client, OWNER_ID, SPOOL_ID, edit);
  assert.deepEqual(updated, { ok: false, reason: "not_found" });
  assert.deepEqual(updateFixture.calls[0].filters, [
    { field: "id", value: SPOOL_ID },
    { field: "user_id", value: OWNER_ID },
  ]);
  assert.deepEqual(updateFixture.calls[0].values, { material: "PLA", colour: "Blue", recorded_grams: 0 });

  const deleteFixture = makeSpoolClient({ mutationResponses: [{ data: null, error: null }] });
  const deleted = await deleteSpool(deleteFixture.client, OWNER_ID, SPOOL_ID);
  assert.deepEqual(deleted, { ok: false, reason: "not_found" });
  assert.deepEqual(deleteFixture.calls[0].filters, [
    { field: "id", value: SPOOL_ID },
    { field: "user_id", value: OWNER_ID },
  ]);

  const response = createSpoolDatabaseErrorResponse({ status: 503, message: "temporary" });
  assert.equal(response.status, 503);
});

test("list distinguishes empty inventory from database failure", async () => {
  const emptyFixture = makeSpoolClient();
  const empty = await listSpools(emptyFixture.client, OWNER_ID);
  assert.deepEqual(empty, { ok: true, value: [] });
  assert.equal(emptyFixture.calls.length, 1);

  const failedClient = {
    from() {
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
          return Promise.resolve({ data: null, error: { status: 503, message: "database unavailable" } });
        },
      };
      return builder;
    },
  };
  const failed = await listSpools(failedClient, OWNER_ID);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "database_error");
  const mapped = createSpoolDatabaseErrorResponse(failed.error);
  assert.equal(mapped.status, 503);
  assert.match((await mapped.json()).error.message, /temporarily unavailable/);
});

test("inventory pagination is bounded, complete, ordered and terminates at empty or exact pages", async () => {
  for (const count of [0, 1_000, 1_001]) {
    const rows = Array.from({ length: count }, (_, index) => row(count - index));
    const fixture = makeSpoolClient({ rows });
    const result = await listSpools(fixture.client, OWNER_ID);
    assert.equal(result.ok, true);
    assert.equal(result.value.length, count);
    assert.deepEqual(
      fixture.calls.map(({ range }) => range),
      count === 0
        ? [{ from: 0, to: 999 }]
        : count <= 1_000
          ? [
              { from: 0, to: 999 },
              { from: 1_000, to: 1_999 },
            ]
          : [
              { from: 0, to: 999 },
              { from: 1_000, to: 1_999 },
            ],
    );
    const ids = result.value.map(({ id }) => id);
    assert.equal(new Set(ids).size, count);
    assert.deepEqual(ids, [...ids].sort());
    for (const item of result.value) {
      assert.equal(item.reservedGrams, 0);
      assert.equal(item.availableGrams, item.recordedGrams);
    }
  }
});

test("a later page failure discards partial inventory and maps to an HTTP failure", async () => {
  const rows = Array.from({ length: 1_001 }, (_, index) => row(index));
  const calls = [];
  const failingClient = {
    from() {
      const state = { filters: [], orders: [] };
      const builder = {
        select() {
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
          calls.push({ from, to });
          if (from === 1_000)
            return Promise.resolve({ data: null, error: { status: 503, message: "later page failed" } });
          const ordered = [...rows].sort((left, right) => compareRows(left, right, state.orders));
          return Promise.resolve({ data: ordered.slice(from, to + 1), error: null });
        },
      };
      return builder;
    },
  };

  const result = await listSpools(failingClient, OWNER_ID);
  assert.deepEqual(calls, [
    { from: 0, to: 999 },
    { from: 1_000, to: 1_999 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(Object.hasOwn(result, "value"), false);
  const response = createSpoolDatabaseErrorResponse(result.error);
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).error.code, "temporarily_unavailable");
});

test("stock HTTP failures use stable authorization, validation, method and cache contracts", async () => {
  const unauthorized = createSpoolUnauthorizedResponse();
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error.signInUrl, SPOOL_SIGN_IN_DESTINATION);
  cacheHeaders(unauthorized);

  const unavailable = createSpoolUnavailableResponse();
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Retry-After"), "30");
  assert.equal((await unavailable.json()).error.retryAfter, 30);
  cacheHeaders(unavailable);

  const methodNotAllowed = createSpoolMethodNotAllowedResponse("GET, POST");
  assert.equal(methodNotAllowed.status, 405);
  assert.equal(methodNotAllowed.headers.get("Allow"), "GET, POST");
  cacheHeaders(methodNotAllowed);

  const unsupportedMedia = createSpoolUnsupportedMediaTypeResponse();
  assert.equal(unsupportedMedia.status, 415);
  cacheHeaders(unsupportedMedia);

  const malformed = createSpoolMalformedPayloadResponse();
  assert.equal(malformed.status, 422);
  cacheHeaders(malformed);

  const invalidFields = createSpoolValidationResponse(
    validateSpoolInput({ material: "PLA", colour: "Blue", recordedGrams: "0" }, "create"),
  );
  assert.equal(invalidFields.status, 422);
  assert.equal((await invalidFields.json()).error.fieldErrors.recordedGrams.code, "out_of_range");
  cacheHeaders(invalidFields);

  const json = createSpoolJsonResponse({ spools: [] });
  cacheHeaders(json);
  assert.equal(json.headers.get("Content-Type"), "application/json; charset=utf-8");

  const unexpected = mapSpoolDatabaseError({ message: "private database detail" });
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.cause.cause.message, "private database detail");
  const internalResponse = createMappedSpoolFailureResponse(unexpected);
  assert.equal(internalResponse.status, 500);
  assert.doesNotMatch(await internalResponse.text(), /private database detail/);
  cacheHeaders(internalResponse);
});

test("stock POST content types and malformed form bodies are handled at the boundary", async () => {
  assert.equal(
    hasSupportedSpoolFormContentType(
      new Request("https://app.test/api/spools", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      }),
    ),
    true,
  );
  assert.equal(
    hasSupportedSpoolFormContentType(
      new Request("https://app.test/api/spools", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=test" },
        body: "",
      }),
    ),
    true,
  );
  assert.equal(
    hasSupportedSpoolFormContentType(
      new Request("https://app.test/api/spools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    ),
    false,
  );
  assert.equal(
    await readSpoolFormData(
      new Request("https://app.test/api/spools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    ),
    null,
  );
  assert.equal(isValidSpoolId(SPOOL_ID), true);
  assert.equal(isValidSpoolId("not-a-uuid"), false);
});
