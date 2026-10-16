/* global Blob, FormData, Request, Response */

import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
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
  reportSpoolFailure,
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
    reserved_grams: 0,
    available_grams: index + 1,
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
    rpc(name, args) {
      calls.push({ operation: "rpc", name, args });
      const response = mutationResponses.shift() ?? { data: null, error: null, status: 200 };
      if (response.data && typeof response.data === "object" && response.data.id) rows.push(response.data);
      return Promise.resolve(response);
    },
    from(table) {
      assert.equal(table, "spool_inventory");
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
          assert.equal(
            state.selection,
            "id, material, colour, created_at, updated_at, recorded_grams, reserved_grams, available_grams",
          );
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
          return Promise.resolve({ data: matchingRows.slice(from, to + 1), error: null, status: 200 });
        },
        maybeSingle() {
          calls.push(state);
          const id = state.filters.find(({ field }) => field === "id")?.value;
          const ownerId = state.filters.find(({ field }) => field === "user_id")?.value;
          const ownedRow = rows.find((item) => item.id === id && item.user_id === ownerId);
          return Promise.resolve({ data: ownedRow ?? null, error: null, status: 200 });
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

function makeSdkClient(fetch) {
  return createClient("https://spools.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch },
  });
}

function stockOperations() {
  const input = { material: "PLA", colour: "Blue", recordedGrams: 125 };
  return [
    ["list", (client) => listSpools(client, OWNER_ID)],
    ["create", (client) => createSpool(client, OWNER_ID, input)],
    ["update", (client) => updateSpool(client, OWNER_ID, SPOOL_ID, input)],
    ["delete", (client) => deleteSpool(client, OWNER_ID, SPOOL_ID)],
  ];
}

test("installed SDK connection failures retain transport status and produce private retryable responses", async () => {
  for (const [operation, run] of stockOperations()) {
    const client = makeSdkClient(async () => {
      const cause = Object.assign(new Error("Connection refused"), { code: "ECONNREFUSED" });
      throw new TypeError("fetch failed", { cause });
    });
    const result = await run(client);
    assert.equal(result.ok, false, operation);
    assert.equal(result.reason, "database_error", operation);
    assert.equal(result.status, 0, operation);
    assert.equal(result.error.code, "", operation);
    assert.equal(Object.hasOwn(result.error, "status"), false, operation);

    const response = createSpoolDatabaseErrorResponse(result.error, result.status);
    assert.equal(response.status, 503, operation);
    assert.equal(response.headers.get("Retry-After"), "30", operation);
    cacheHeaders(response);
    const body = await response.json();
    assert.equal(body.error.code, "temporarily_unavailable", operation);
    assert.equal(body.error.retryAfter, 30, operation);
    assert.doesNotMatch(JSON.stringify(body), /ECONNREFUSED|fetch failed|Connection refused/, operation);
  }
});

test("installed SDK gateway statuses survive every operation without hiding permanent failures", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  for (const status of [429, 503, 520, 400]) {
    for (const [operation, run] of stockOperations()) {
      const client = makeSdkClient(async () =>
        Response.json(
          { message: "Private upstream failure", code: "", details: "Private diagnostic", hint: "" },
          { status, headers: { "Retry-After": "0" } },
        ),
      );
      const result = await run(client);
      const context = `${operation}, upstream ${status}`;
      assert.equal(result.ok, false, context);
      assert.equal(result.status, status, context);
      assert.equal(Object.hasOwn(result.error, "status"), false, context);
      const response = createSpoolDatabaseErrorResponse(result.error, result.status);
      assert.equal(response.status, status === 400 ? 500 : 503, context);
      assert.equal(response.headers.get("Retry-After"), status === 400 ? null : "30", context);
      cacheHeaders(response);
      const body = await response.json();
      assert.equal(body.error.code, status === 400 ? "internal_error" : "temporarily_unavailable", context);
      assert.doesNotMatch(JSON.stringify(body), /Private upstream|Private diagnostic/, context);
    }
  }
  assert.equal(log.mock.calls.length, 4);
  assert.doesNotMatch(
    JSON.stringify(log.mock.calls.map((call) => call.arguments)),
    /Private upstream|Private diagnostic/,
  );
});

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
  assert.equal(MAX_RECORDED_GRAMS, 2_147_483_647);
  for (const mode of ["create", "edit"]) {
    for (const [value, expected] of [
      ["1", 1],
      ["001", 1],
      ["2147483647", 2_147_483_647],
    ]) {
      assert.equal(validateSpoolInput({ ...base, recordedGrams: value }, mode).data.recordedGrams, expected);
    }
    for (const value of ["-1", "+1", "1.5", "1,000", "1e2", "NaN", "Infinity", "-Infinity", " 1 ", "2147483648"]) {
      const result = validateSpoolInput({ ...base, recordedGrams: value }, mode);
      assert.equal(result.data, undefined);
      assert.ok(result.fieldErrors.recordedGrams, `expected ${mode} ${JSON.stringify(value)} to be rejected`);
    }
  }
});

test("stock labels preserve non-whitespace characters and decomposed colour spelling", () => {
  for (const mode of ["create", "edit"]) {
    for (const [input, expected] of [
      ["\u200BBlack\u200B", "\u200BBlack\u200B"],
      ["\u2060Black\u2060", "\u2060Black\u2060"],
      ["\u180EBlack\u180E", "\u180EBlack\u180E"],
      ["e\u0301", "e\u0301"],
      ["\u00E9", "\u00E9"],
      [" \t\u200BBlack\u0085\u00A0Red\u200B \t", "\u200BBlack Red\u200B"],
    ]) {
      const result = validateSpoolInput({ material: "PLA", colour: input, recordedGrams: "1" }, mode);
      assert.equal(result.data.colour, expected);
    }
  }
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

  const rowFromDatabase = toSpoolDto(
    row(1, { material: "STRASSE", colour: "İ", recorded_grams: 75, available_grams: 75 }),
  );
  assert.equal(rowFromDatabase.material, "STRASSE");
  assert.equal(rowFromDatabase.colour, "İ");
  assert.equal(Object.hasOwn(rowFromDatabase, "colour_key"), false);
  assert.equal(rowFromDatabase.reservedGrams, 0);
  assert.equal(rowFromDatabase.availableGrams, 75);
  assert.equal(toSpoolDto(row(2, { material: "S".repeat(80) })).material, "S".repeat(80));
});

test("create returns committed canonical values through the RPC and shared read view", async () => {
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
  assert.deepEqual(calls[0], {
    operation: "rpc",
    name: "create_spool",
    args: { p_material: "Straße", p_colour: "Black / Red / Gold", p_recorded_grams: 12 },
  });
});

test("update and delete use owner-checked RPC receipts", async () => {
  const edit = validateSpoolInput({ material: "PLA", colour: "Blue", recordedGrams: "0" }, "edit").data;
  const updateFixture = makeSpoolClient({
    mutationResponses: [{ data: null, error: { message: "not_found" }, status: 404 }],
  });
  assert.deepEqual(await updateSpool(updateFixture.client, OWNER_ID, SPOOL_ID, edit), {
    ok: false,
    reason: "not_found",
  });
  assert.deepEqual(updateFixture.calls[0], {
    operation: "rpc",
    name: "update_spool",
    args: { p_spool_id: SPOOL_ID, p_material: "PLA", p_colour: "Blue", p_recorded_grams: 0 },
  });

  const deleteFixture = makeSpoolClient({
    mutationResponses: [{ data: null, error: { message: "not_found" }, status: 404 }],
  });
  const deleted = await deleteSpool(deleteFixture.client, OWNER_ID, SPOOL_ID);
  assert.deepEqual(deleted, { ok: false, reason: "not_found" });
  assert.deepEqual(deleteFixture.calls[0], { operation: "rpc", name: "delete_spool", args: { p_spool_id: SPOOL_ID } });

  const response = createSpoolDatabaseErrorResponse({ message: "temporary" }, 503);
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
          return Promise.resolve({ data: null, error: { message: "database unavailable" }, status: 503 });
        },
      };
      return builder;
    },
  };
  const failed = await listSpools(failedClient, OWNER_ID);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, "database_error");
  const mapped = createSpoolDatabaseErrorResponse(failed.error, failed.status);
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
            return Promise.resolve({ data: null, error: { message: "later page failed" }, status: 503 });
          const ordered = [...rows].sort((left, right) => compareRows(left, right, state.orders));
          return Promise.resolve({ data: ordered.slice(from, to + 1), error: null, status: 200 });
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
  const response = createSpoolDatabaseErrorResponse(result.error, result.status);
  assert.equal(response.status, 503);
  assert.deepEqual((await response.json()).error.code, "temporarily_unavailable");
});

test("stock HTTP failures use stable authorization, validation, method and cache contracts", async (t) => {
  const log = t.mock.method(console, "error", () => undefined);
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

  const original = Object.assign(new TypeError("private database detail"), {
    code: "42P01",
    details: "private form value",
    stack:
      "TypeError: private database detail\n    at query (https://private-key:private-token@provider.test/src/lib/spools.ts:91:4)\n    at private-caller (/private-path/private-form-value.js:1:2)",
    cause: new RangeError("private nested error"),
  });
  const unexpected = mapSpoolDatabaseError(original);
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.cause.cause.message, "private database detail");
  const internalResponse = createMappedSpoolFailureResponse(unexpected);
  assert.equal(internalResponse.status, 500);
  assert.doesNotMatch(await internalResponse.text(), /private database detail/);
  cacheHeaders(internalResponse);
  assert.equal(log.mock.calls.length, 1);
  const [message, diagnostic] = log.mock.calls[0].arguments;
  assert.equal(message, "Unexpected spool database failure");
  assert.equal(diagnostic.boundary, "api");
  assert.equal(diagnostic.causes[1].name, "TypeError");
  assert.equal(diagnostic.causes[1].code, "42P01");
  assert.deepEqual(diagnostic.causes[1].frames, ["spools.ts:91:4"]);
  assert.equal(diagnostic.causes[2].name, "RangeError");
  assert.doesNotMatch(
    JSON.stringify(log.mock.calls.map((call) => call.arguments)),
    /private-|private database|private form|private nested/,
  );
});

test("page diagnostics retain safe database causes, stop at cycles, and skip expected failures", (t) => {
  const log = t.mock.method(console, "error", () => undefined);
  const hidden = { name: "private-user-name", code: "private-api-key", message: "private payload" };
  hidden.cause = hidden;
  const original = { code: "42501", message: "private database values", cause: hidden };
  reportSpoolFailure(mapSpoolDatabaseError(original, 403), "page");
  reportSpoolFailure(mapSpoolDatabaseError({ status: 503 }), "page");
  reportSpoolFailure(mapSpoolDatabaseError({ message: 'violates constraint "spools_material_length_check"' }), "page");

  assert.equal(log.mock.calls.length, 1);
  const diagnostic = log.mock.calls[0].arguments[1];
  assert.equal(diagnostic.boundary, "page");
  assert.equal(diagnostic.causes.length, 3);
  assert.equal(diagnostic.causes[1].code, "42501");
  assert.equal(diagnostic.causes[2].name, "UnknownError");
  assert.equal(diagnostic.causes[2].code, undefined);
  assert.doesNotMatch(JSON.stringify(log.mock.calls.map((call) => call.arguments)), /private/);
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
