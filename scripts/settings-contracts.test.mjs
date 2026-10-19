/* global Blob, FormData, Request */

import assert from "node:assert/strict";
import test from "node:test";
import { getAccountSettings, readAccountSettingsDto, saveAccountSafetyMargin } from "../src/lib/account-settings.ts";
import {
  createAccountSettingsConflictResponse,
  createAccountSettingsJsonResponse,
  createAccountSettingsMethodNotAllowedResponse,
  createAccountSettingsUnavailableResponse,
  createAccountSettingsValidationResponse,
  mapAccountSettingsFailure,
} from "../src/lib/account-settings-response.ts";
import {
  hasSupportedAccountSettingsFormContentType,
  MAX_ACCOUNT_SETTINGS_VERSION,
  readAccountSettingsFormData,
  validateAccountSettingsForm,
} from "../src/lib/account-settings-validation.ts";

const DEFAULT_SETTINGS = { marginPercent: 10, version: 0 };

function form(entries) {
  const result = new FormData();
  for (const [key, value] of entries) result.append(key, value);
  return result;
}

test("settings form accepts only whole in-range values and exactly one text value per field", async () => {
  assert.deepEqual(
    validateAccountSettingsForm(
      form([
        ["marginPercent", "0"],
        ["expectedVersion", "0"],
      ]),
    ),
    { ok: true, value: { marginPercent: 0, expectedVersion: 0 } },
  );
  assert.deepEqual(
    validateAccountSettingsForm(
      form([
        ["marginPercent", "100"],
        ["expectedVersion", String(MAX_ACCOUNT_SETTINGS_VERSION)],
      ]),
    ),
    { ok: true, value: { marginPercent: 100, expectedVersion: MAX_ACCOUNT_SETTINGS_VERSION } },
  );
  for (const entries of [
    [],
    [
      ["marginPercent", "5.5"],
      ["expectedVersion", "0"],
    ],
    [
      ["marginPercent", "Infinity"],
      ["expectedVersion", "0"],
    ],
    [
      ["marginPercent", "101"],
      ["expectedVersion", "0"],
    ],
    [
      ["marginPercent", "5"],
      ["expectedVersion", "2147483648"],
    ],
    [
      ["marginPercent", "5"],
      ["expectedVersion", ""],
    ],
    [
      ["marginPercent", "5"],
      ["marginPercent", "5"],
      ["expectedVersion", "0"],
    ],
  ]) {
    assert.equal(validateAccountSettingsForm(form(entries)).ok, false);
  }
  const file = form([
    ["marginPercent", "5"],
    ["expectedVersion", "0"],
  ]);
  file.set("marginPercent", new Blob(["5"]));
  assert.equal(validateAccountSettingsForm(file).ok, false);
  assert.deepEqual(
    validateAccountSettingsForm(
      form([
        ["marginPercent", "5"],
        ["expectedVersion", "0"],
        ["ownerId", "secret"],
      ]),
    ),
    { ok: false, reason: "unexpected_field" },
  );

  assert.equal(
    hasSupportedAccountSettingsFormContentType(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: "marginPercent=5&expectedVersion=0",
      }),
    ),
    true,
  );
  assert.equal(
    hasSupportedAccountSettingsFormContentType(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    ),
    false,
  );
  assert.ok(
    await readAccountSettingsFormData(
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "marginPercent=5&expectedVersion=0",
      }),
    ),
  );
});

test("shared settings DTO reader accepts only the exact bounded runtime shape", () => {
  assert.deepEqual(readAccountSettingsDto(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.deepEqual(readAccountSettingsDto({ marginPercent: 100, version: MAX_ACCOUNT_SETTINGS_VERSION }), {
    marginPercent: 100,
    version: MAX_ACCOUNT_SETTINGS_VERSION,
  });
  for (const value of [
    null,
    [],
    { marginPercent: 10 },
    { marginPercent: 10, version: 0, userId: "private" },
    { marginPercent: 5, version: 0 },
    { marginPercent: 10.5, version: 1 },
    { marginPercent: -1, version: 1 },
    { marginPercent: 101, version: 1 },
    { marginPercent: 10, version: -1 },
    { marginPercent: 10, version: 2_147_483_648 },
    { marginPercent: Number.NaN, version: 1 },
  ]) {
    assert.equal(readAccountSettingsDto(value), undefined);
  }
});

test("settings service separates the default preference from failed reads and preserves RPC errors", async () => {
  const calls = [];
  const defaultClient = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: DEFAULT_SETTINGS, error: null, status: 200 });
    },
  };
  assert.deepEqual(await getAccountSettings(defaultClient), { ok: true, value: DEFAULT_SETTINGS });
  assert.deepEqual(calls, [{ name: "get_account_settings", args: {} }]);

  const providerError = Object.assign(new Error("private database details"), { code: "08006" });
  const failedRead = await getAccountSettings({
    rpc() {
      return Promise.resolve({ data: null, error: providerError, status: 503 });
    },
  });
  assert.deepEqual(failedRead, { ok: false, reason: "database_error", error: providerError, status: 503 });

  const missingReceipt = await getAccountSettings({
    rpc() {
      return Promise.resolve({ data: null, error: null, status: 200 });
    },
  });
  assert.equal(missingReceipt.ok, false);
  assert.equal(missingReceipt.reason, "database_error");
  assert.match(missingReceipt.error.message, /invalid receipt/);
});

test("settings save calls the versioned RPC and validates its receipt", async () => {
  const calls = [];
  const client = {
    rpc(name, args) {
      calls.push({ name, args });
      return Promise.resolve({ data: { marginPercent: 5, version: 2 }, error: null, status: 200 });
    },
  };
  assert.deepEqual(await saveAccountSafetyMargin(client, { marginPercent: 5, expectedVersion: 1 }), {
    ok: true,
    value: { marginPercent: 5, version: 2 },
  });
  assert.deepEqual(calls, [
    {
      name: "save_account_safety_margin",
      args: { p_margin_percent: 5, p_expected_version: 1 },
    },
  ]);

  const providerError = Object.assign(new Error("settings_conflict"), { code: "P0001" });
  const conflict = await saveAccountSafetyMargin(
    {
      rpc() {
        return Promise.resolve({ data: null, error: providerError, status: 409 });
      },
    },
    { marginPercent: 9, expectedVersion: 1 },
  );
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, "settings_conflict");
  assert.equal(conflict.error, providerError);
  assert.equal(conflict.status, 409);

  const invalidReceipt = await saveAccountSafetyMargin(
    {
      rpc() {
        return Promise.resolve({ data: { marginPercent: 6, version: 2 }, error: null, status: 200 });
      },
    },
    { marginPercent: 5, expectedVersion: 1 },
  );
  assert.equal(invalidReceipt.ok, false);
  assert.equal(invalidReceipt.reason, "database_error");
});

test("settings responses are private and map version conflicts and sanitized failures", async (t) => {
  const success = createAccountSettingsJsonResponse({ settings: DEFAULT_SETTINGS });
  assert.equal(success.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(success.headers.get("Expires"), "0");
  assert.equal(success.headers.get("Pragma"), "no-cache");

  const conflict = createAccountSettingsConflictResponse();
  assert.equal(conflict.status, 409);
  assert.equal(conflict.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.deepEqual(await conflict.json(), {
    error: {
      code: "settings_conflict",
      message: "Account settings changed in another session. Reload the saved setting before saving again.",
      refreshRequired: true,
    },
  });

  const invalid = createAccountSettingsValidationResponse({
    ok: false,
    reason: "invalid",
    fieldErrors: { marginPercent: { code: "invalid", message: "Enter a whole percentage using digits only." } },
  });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error.fieldErrors.marginPercent.code, "invalid");
  const method = createAccountSettingsMethodNotAllowedResponse("GET, POST");
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("Allow"), "GET, POST");

  const unavailable = createAccountSettingsUnavailableResponse("mutation");
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Retry-After"), "30");
  assert.equal((await unavailable.json()).error.refreshRequired, true);

  const outage = mapAccountSettingsFailure(
    { reason: "database_error", status: 0, error: new TypeError("private provider response") },
    "mutation",
  );
  assert.equal(outage.status, 503);
  assert.equal(outage.headers.get("Retry-After"), "30");
  assert.equal((await outage.json()).error.refreshRequired, true);

  const log = t.mock.method(console, "error", () => undefined);
  const unexpectedError = Object.assign(new TypeError("private submitted margin and credential"), {
    code: "42P01",
    stack:
      "TypeError: private submitted margin and credential\n    at getAccountSettings (https://private-key:private-token@provider.test/src/lib/account-settings.ts:55:3)",
  });
  const unexpected = mapAccountSettingsFailure(
    { reason: "database_error", error: unexpectedError, status: 400 },
    "mutation",
  );
  assert.equal(unexpected.status, 500);
  const body = await unexpected.json();
  assert.equal(body.error.refreshRequired, true);
  assert.doesNotMatch(JSON.stringify(body), /private submitted margin|credential|provider/);
  assert.equal(log.mock.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(log.mock.calls[0].arguments), /private submitted margin|credential|provider/);
  assert.equal(log.mock.calls[0].arguments[1].causes[1].code, "42P01");
});
