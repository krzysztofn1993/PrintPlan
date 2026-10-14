// Bounded stock smoke scenario shared by the existing authenticated HTTP smoke.

/* global Blob, setTimeout */

import {
  appFormData,
  assertPrivateHeaders,
  ensure,
  jwtExpiry,
  readAppJson,
  restRequest as sharedRestRequest,
  restoreCleanupSession,
  sessionIdentity,
  smokeStep,
  timestampInstant,
} from "./smoke-utils.mjs";

const step = (name, run) => smokeStep(name, run, "Stock");
const APP_STOCK_FIELDS = [
  ["material", "pla"],
  ["colour", "Black / Red / Gold"],
  ["recordedGrams", "150"],
];
const REST_COLUMNS = "id,user_id,material,colour,recorded_grams,created_at,updated_at";

function assertDto(spool, expected) {
  ensure(spool && typeof spool.id === "string", "The stock response did not include a spool identifier.");
  ensure(spool.material === expected.material, "The committed material label was not canonical.");
  ensure(spool.colour === expected.colour, "The complete colour label was not preserved.");
  ensure(spool.recordedGrams === expected.recordedGrams, "The recorded stock did not match the request.");
  ensure(spool.reservedGrams === 0, "Reserved stock was not reported as zero.");
  ensure(spool.availableGrams === expected.recordedGrams, "Available stock did not match recorded stock.");
}

function snapshotFromDto(spool) {
  return {
    id: spool.id,
    material: spool.material,
    colour: spool.colour,
    recordedGrams: spool.recordedGrams,
    createdAt: timestampInstant(spool.createdAt, "The API spool creation time"),
    updatedAt: timestampInstant(spool.updatedAt, "The API spool update time"),
  };
}

function snapshotFromRest(row, ownerId) {
  ensure(row.user_id === ownerId, "A restricted REST spool read returned a different owner.");
  return {
    id: row.id,
    material: row.material,
    colour: row.colour,
    recordedGrams: Number(row.recorded_grams),
    createdAt: timestampInstant(row.created_at, "The REST spool creation time"),
    updatedAt: timestampInstant(row.updated_at, "The REST spool update time"),
  };
}

function assertSnapshot(actual, expected, label) {
  ensure(actual.id === expected.id, label + " identifier changed.");
  for (const field of ["material", "colour", "recordedGrams", "createdAt", "updatedAt"]) {
    ensure(actual[field] === expected[field], label + " changed its " + field + ".");
  }
}

function assertExactCollection(actual, expectedById, label, ownerId) {
  ensure(Array.isArray(actual), label + " did not return a collection.");
  ensure(actual.length === expectedById.size, label + " returned an unexpected number of records.");
  const found = new Set();
  for (const row of actual) {
    const snapshot = ownerId ? snapshotFromRest(row, ownerId) : snapshotFromDto(row);
    ensure(!found.has(snapshot.id), label + " returned a duplicate identifier.");
    found.add(snapshot.id);
    const expected = expectedById.get(snapshot.id);
    ensure(expected, label + " returned an unexpected record.");
    assertSnapshot(snapshot, expected, label + " record " + snapshot.id);
  }
}

function removeReactTextSeparators(html) {
  return html.replace(/<!-- -->/g, "");
}

function restRequest(options) {
  return sharedRestRequest({ ...options, path: "/rest/v1/spools" });
}

function selectById(id) {
  const query = new URLSearchParams({ select: REST_COLUMNS, id: "eq." + id });
  return query.toString();
}

async function deleteRestSpool(config, requestSignal, token, id, ownerId) {
  return restRequest({
    config,
    requestSignal,
    token,
    method: "DELETE",
    query: new URLSearchParams({ select: REST_COLUMNS, id: "eq." + id, user_id: "eq." + ownerId }).toString(),
    prefer: "return=representation",
  });
}

function assertRestDenied(result, operation) {
  ensure(
    (result.status === 401 || result.status === 403) && result.data?.code === "42501",
    "Anonymous REST " + operation + " did not fail with the database authorization contract.",
  );
  ensure(
    !/jwt|token|malformed/i.test(String(result.data?.message ?? "")),
    "Anonymous REST " + operation + " failed because of a malformed token.",
  );
}

function trackReturnedRows(result, track) {
  if (!Array.isArray(result.data)) return;
  for (const row of result.data) if (typeof row?.id === "string") track(row.user_id, row.id);
}

async function verifyDirectRest({
  config,
  requestSignal,
  accountA,
  accountB,
  jarA,
  jarB,
  primary,
  spoolB,
  rememberRest,
  forget,
  assertPersisted,
  track,
}) {
  const { session: sessionA } = sessionIdentity(jarA, "account A");
  const { session: sessionB } = sessionIdentity(jarB, "account B");
  const ownInsert = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "POST",
    body: {
      user_id: accountA.id,
      material: "petg",
      colour: "Direct REST / Test",
      recorded_grams: 37,
    },
    prefer: "return=representation",
  });
  ensure(
    ownInsert.status === 201 && Array.isArray(ownInsert.data) && ownInsert.data.length === 1,
    "Account A could not create an owned spool through REST.",
  );
  const directSpool = ownInsert.data[0];
  ensure(typeof directSpool.id === "string", "The direct REST write did not return a spool identifier.");
  track(accountA.id, directSpool.id);
  rememberRest(accountA.id, directSpool);
  ensure(
    directSpool.user_id === accountA.id && directSpool.material === "PETG" && directSpool.recorded_grams === 37,
    "The database did not return canonical values for account A's direct REST write.",
  );

  const ownRead = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "GET",
    query: selectById(directSpool.id),
  });
  ensure(
    ownRead.ok && Array.isArray(ownRead.data) && ownRead.data.length === 1,
    "Account A could not read its spool through REST.",
  );
  assertExactCollection(
    ownRead.data,
    new Map([[directSpool.id, snapshotFromRest(directSpool, accountA.id)]]),
    "The direct REST reread",
    accountA.id,
  );

  const foreignRead = await restRequest({
    config,
    requestSignal,
    token: sessionB.access_token,
    method: "GET",
    query: selectById(directSpool.id),
  });
  ensure(
    foreignRead.ok && Array.isArray(foreignRead.data) && foreignRead.data.length === 0,
    "Account B could read account A's spool through REST.",
  );

  const foreignUpdate = await restRequest({
    config,
    requestSignal,
    token: sessionB.access_token,
    method: "PATCH",
    query: selectById(directSpool.id),
    body: { recorded_grams: 99 },
    prefer: "return=representation",
  });
  ensure(
    foreignUpdate.ok && Array.isArray(foreignUpdate.data) && foreignUpdate.data.length === 0,
    "Account B changed account A's spool through REST.",
  );
  const foreignDelete = await restRequest({
    config,
    requestSignal,
    token: sessionB.access_token,
    method: "DELETE",
    query: selectById(directSpool.id),
    prefer: "return=representation",
  });
  ensure(
    foreignDelete.ok && Array.isArray(foreignDelete.data) && foreignDelete.data.length === 0,
    "Account B deleted account A's spool through REST.",
  );
  await assertPersisted(accountA.id, jarA);

  const anonymousInsert = await restRequest({
    config,
    requestSignal,
    method: "POST",
    body: { user_id: accountA.id, material: "PLA", colour: "Anonymous REST", recorded_grams: 15 },
    prefer: "return=representation",
  });
  if (Array.isArray(anonymousInsert.data)) {
    for (const row of anonymousInsert.data) if (typeof row.id === "string") track(row.user_id, row.id);
  }
  assertRestDenied(anonymousInsert, "create");
  for (const [operation, method, body] of [
    ["read", "GET"],
    ["update", "PATCH", { recorded_grams: 99 }],
    ["delete", "DELETE"],
  ]) {
    const denied = await restRequest({
      config,
      requestSignal,
      method,
      query: selectById(primary.id),
      body,
      prefer: "return=representation",
    });
    assertRestDenied(denied, operation);
  }
  await assertPersisted(accountA.id, jarA);

  for (const [operation, method, body] of [
    ["read", "GET"],
    ["update", "PATCH", { recorded_grams: 99 }],
    ["delete", "DELETE"],
  ]) {
    const denied = await restRequest({
      config,
      requestSignal,
      token: sessionIdentity(jarA, "account A").session.access_token,
      method,
      query: selectById(spoolB.id),
      body,
      prefer: "return=representation",
    });
    ensure(
      denied.ok && Array.isArray(denied.data) && denied.data.length === 0,
      "Account A could " + operation + " account B's spool through REST.",
    );
  }
  await assertPersisted(accountB.id, jarB);
  await assertPersisted(accountA.id, jarA);

  const forgedOwner = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "POST",
    body: {
      user_id: accountB.id,
      material: "PLA",
      colour: "Forged Owner",
      recorded_grams: 10,
    },
    prefer: "return=representation",
  });
  trackReturnedRows(forgedOwner, track);
  ensure(!forgedOwner.ok, "The database accepted a forged owner on direct REST insert.");

  const reassignment = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "PATCH",
    query: selectById(directSpool.id),
    body: { user_id: accountB.id },
    prefer: "return=representation",
  });
  ensure(!reassignment.ok, "The database allowed ownership reassignment through direct REST.");

  const zeroInsert = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "POST",
    body: {
      user_id: accountA.id,
      material: "PLA",
      colour: "Zero Insert Must Fail",
      recorded_grams: 0,
    },
    prefer: "return=representation",
  });
  trackReturnedRows(zeroInsert, track);
  ensure(!zeroInsert.ok, "The database accepted a zero-gram spool insert through direct REST.");

  const fractionalInsert = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "POST",
    body: {
      user_id: accountA.id,
      material: "PLA",
      colour: "Fraction Must Fail",
      recorded_grams: 2.5,
    },
    prefer: "return=representation",
  });
  trackReturnedRows(fractionalInsert, track);
  ensure(!fractionalInsert.ok, "The database accepted fractional stock through direct REST.");

  const oversizedLabel = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "POST",
    body: {
      user_id: accountA.id,
      material: "M".repeat(81),
      colour: "Oversized Label",
      recorded_grams: 1,
    },
    prefer: "return=representation",
  });
  trackReturnedRows(oversizedLabel, track);
  ensure(!oversizedLabel.ok, "The database accepted an oversized material label through direct REST.");

  const stillOwned = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "GET",
    query: selectById(directSpool.id),
  });
  ensure(
    stillOwned.ok &&
      Array.isArray(stillOwned.data) &&
      stillOwned.data.length === 1 &&
      stillOwned.data[0].user_id === accountA.id,
    "A rejected foreign mutation changed account A's owner-scoped spool.",
  );
  assertSnapshot(
    snapshotFromRest(stillOwned.data[0], accountA.id),
    snapshotFromRest(directSpool, accountA.id),
    "The direct REST victim",
  );

  const ownUpdate = await restRequest({
    config,
    requestSignal,
    token: sessionA.access_token,
    method: "PATCH",
    query: selectById(directSpool.id),
    body: { recorded_grams: 0 },
    prefer: "return=representation",
  });
  ensure(
    ownUpdate.ok &&
      Array.isArray(ownUpdate.data) &&
      ownUpdate.data.length === 1 &&
      ownUpdate.data[0].recorded_grams === 0,
    "Account A could not correct its direct REST spool to zero grams.",
  );
  rememberRest(accountA.id, ownUpdate.data[0]);
  const ownDelete = await deleteRestSpool(config, requestSignal, sessionA.access_token, directSpool.id, accountA.id);
  ensure(
    ownDelete.ok && Array.isArray(ownDelete.data) && ownDelete.data.length === 1,
    "Account A could not delete its own spool through REST.",
  );
  track(accountA.id, directSpool.id, false);
  forget(accountA.id, directSpool.id);
}

export async function runSpoolSmoke({
  config,
  appRequest,
  CookieJar,
  accountA,
  accountB,
  activeJarA,
  activeJarB,
  requestSignal,
  cleanupRequestSignal,
  cleanupProbe,
}) {
  ensure(
    accountA && accountB && activeJarA && activeJarB,
    "The stock smoke needs both confirmed account fixtures and cookie jars.",
  );
  ensure(
    config && typeof config.url === "string" && typeof config.key === "string",
    "The stock smoke needs validated local Supabase configuration.",
  );
  const identityA = sessionIdentity(activeJarA, "account A");
  const identityB = sessionIdentity(activeJarB, "account B");
  accountA.id = identityA.userId;
  accountB.id = identityB.userId;
  const expectedByOwner = new Map([
    [accountA.id, new Map()],
    [accountB.id, new Map()],
  ]);
  const trackedByOwner = new Map([
    [accountA.id, new Set()],
    [accountB.id, new Set()],
  ]);
  let scenarioError;
  const cleanupErrors = [];

  const track = (ownerId, id, keep = true) => {
    if (typeof ownerId !== "string" || typeof id !== "string") return;
    const ids = trackedByOwner.get(ownerId);
    if (!ids) return;
    if (keep) ids.add(id);
    else ids.delete(id);
  };
  const rememberDto = (ownerId, spool) => expectedByOwner.get(ownerId).set(spool.id, snapshotFromDto(spool));
  const rememberRest = (ownerId, spool) => expectedByOwner.get(ownerId).set(spool.id, snapshotFromRest(spool, ownerId));
  const forget = (ownerId, id) => expectedByOwner.get(ownerId).delete(id);

  const appJsonRequest = async (path, options = {}, status = 200) => {
    const result = await appRequest(path, options);
    ensure(result.status === status, "Expected stock endpoint HTTP " + status + ".");
    assertPrivateHeaders(result, "json");
    return { result, payload: readAppJson(result) };
  };
  const createAppSpool = async (jar, ownerId = accountA.id, entries = APP_STOCK_FIELDS) => {
    const { payload } = await appJsonRequest("/api/spools", { method: "POST", jar, formEntries: entries }, 201);
    ensure(payload.spool && typeof payload.spool.id === "string", "The stock create response did not return a spool.");
    track(ownerId, payload.spool.id);
    rememberDto(ownerId, payload.spool);
    return payload.spool;
  };
  const listAppSpools = async (jar) => {
    const { payload } = await appJsonRequest("/api/spools", { jar });
    ensure(Array.isArray(payload.spools), "The stock list response did not include an inventory array.");
    return payload.spools;
  };
  const deleteAppSpool = async (jar, id) => {
    const { payload } = await appJsonRequest("/api/spools/" + id + "/delete", {
      method: "POST",
      jar,
      formEntries: [],
    });
    ensure(payload.id === id, "The stock delete response did not confirm the requested spool.");
    const ownerId = jar === activeJarB ? accountB.id : accountA.id;
    track(ownerId, id, false);
    forget(ownerId, id);
  };
  const listRestSpools = async (ownerId, jar) => {
    const token = sessionIdentity(jar, ownerId === accountA.id ? "account A" : "account B").session.access_token;
    const response = await restRequest({
      config,
      requestSignal,
      token,
      method: "GET",
      query: new URLSearchParams({ select: REST_COLUMNS, user_id: "eq." + ownerId }).toString(),
    });
    ensure(response.ok && Array.isArray(response.data), "The restricted REST collection read failed.");
    return response.data;
  };
  const assertPersisted = async (ownerId, jar) => {
    const expected = expectedByOwner.get(ownerId);
    assertExactCollection(await listAppSpools(jar), expected, "The owner API reread");
    assertExactCollection(await listRestSpools(ownerId, jar), expected, "The restricted REST reread", ownerId);
  };

  try {
    if (cleanupProbe) {
      await createAppSpool(activeJarA, accountA.id, [
        ["material", "PLA"],
        ["colour", "Cleanup Probe A"],
        ["recordedGrams", "7"],
      ]);
      await createAppSpool(activeJarB, accountB.id, [
        ["material", "PETG"],
        ["colour", "Cleanup Probe B"],
        ["recordedGrams", "9"],
      ]);
      if (cleanupProbe === "post-signout") {
        const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
        ensure(
          signout.status === 302 && activeJarA.authCookieNames().length === 0,
          "The cleanup probe could not sign out account A.",
        );
        throw new Error("Induced failure after signout before fresh signin");
      }
      const timeoutSignal = requestSignal(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      ensure(timeoutSignal.aborted, "The cleanup timeout probe did not exhaust its scenario signal.");
      throw new Error("Induced scenario timeout");
    }

    await step("anonymous stock API access is denied with private JSON", async () => {
      const result = await appRequest("/api/spools", { jar: new CookieJar() });
      ensure(result.status === 401, "Anonymous stock API access did not return HTTP 401.");
      assertPrivateHeaders(result, "json");
      const payload = readAppJson(result);
      ensure(payload.error?.code === "unauthenticated", "Anonymous stock API access returned an unexpected error.");
      const page = await appRequest("/dashboard/spools", { jar: new CookieJar() });
      ensure(
        page.status === 302 && page.location.includes("/auth/signin"),
        "Anonymous stock page access was not redirected to sign in.",
      );
    });

    await step("account A starts with an SSR-rendered empty inventory", async () => {
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(page.status === 200, "The authenticated stock page did not load.");
      assertPrivateHeaders(page, "html");
      ensure(page.body.includes("No spools yet"), "The empty stock state was not rendered by the server.");
    });

    const primary = await step("account A creates an uppercase-material three-colour spool", async () => {
      const spool = await createAppSpool(activeJarA);
      assertDto(spool, { material: "PLA", colour: "Black / Red / Gold", recordedGrams: 150 });
      return spool;
    });

    const duplicate = await step("duplicate spool labels remain separate records", async () => {
      const spool = await createAppSpool(activeJarA, accountA.id, [
        ["material", "PLA"],
        ["colour", "Black / Red / Gold"],
        ["recordedGrams", "150"],
      ]);
      assertDto(spool, { material: "PLA", colour: "Black / Red / Gold", recordedGrams: 150 });
      ensure(spool.id !== primary.id, "Duplicate spool labels did not receive separate identifiers.");
      const spools = await listAppSpools(activeJarA);
      ensure(
        spools.filter((item) => item.material === "PLA" && item.colour === "Black / Red / Gold").length === 2,
        "The duplicate labels were not both returned by the API.",
      );
      await assertPersisted(accountA.id, activeJarA);
      return spool;
    });

    await step("anonymous stock mutations are denied without changing the owner's record", async () => {
      for (const [operation, path, options] of [
        ["create", "/api/spools", { method: "POST", formEntries: APP_STOCK_FIELDS }],
        ["update", "/api/spools/" + primary.id + "/update", { method: "POST", formEntries: APP_STOCK_FIELDS }],
        ["delete", "/api/spools/" + primary.id + "/delete", { method: "POST", formEntries: [] }],
      ]) {
        const result = await appRequest(path, { ...options, jar: new CookieJar() });
        if (operation === "create" && result.status === 201) {
          try {
            const created = readAppJson(result).spool;
            if (created && typeof created.id === "string") track(accountA.id, created.id);
          } catch {
            // The assertion below reports the unexpected response while cleanup handles any trackable fixture.
          }
        }
        ensure(result.status === 401, "Anonymous stock " + operation + " did not return HTTP 401.");
        assertPrivateHeaders(result, "json");
        ensure(
          readAppJson(result).error?.code === "unauthenticated",
          "Anonymous stock " + operation + " returned an unexpected error.",
        );
      }
      await assertPersisted(accountA.id, activeJarA);
    });

    await step("invalid, repeated, file-valued, and JSON fields are rejected", async () => {
      const missing = await appJsonRequest("/api/spools", { method: "POST", jar: activeJarA, formEntries: [] }, 422);
      ensure(
        missing.payload.error?.code === "validation_failed",
        "Missing stock fields did not return field validation.",
      );
      const repeated = await appJsonRequest(
        "/api/spools",
        {
          method: "POST",
          jar: activeJarA,
          formEntries: [
            ["material", "PLA"],
            ["material", "PETG"],
            ["colour", "Repeated"],
            ["recordedGrams", "1"],
          ],
        },
        422,
      );
      ensure(
        repeated.payload.error?.code === "validation_failed",
        "Repeated stock fields did not return field validation.",
      );
      const fileValued = await appJsonRequest(
        "/api/spools",
        {
          method: "POST",
          jar: activeJarA,
          formData: appFormData([
            ["material", new Blob(["PLA"], { type: "text/plain" })],
            ["colour", "File-valued field"],
            ["recordedGrams", "1"],
          ]),
        },
        422,
      );
      ensure(
        fileValued.payload.error?.code === "validation_failed",
        "A file-valued stock field did not return field validation.",
      );
      const fractional = await appJsonRequest(
        "/api/spools",
        {
          method: "POST",
          jar: activeJarA,
          formEntries: [
            ["material", "PLA"],
            ["colour", "Fractional"],
            ["recordedGrams", "1.5"],
          ],
        },
        422,
      );
      ensure(
        fractional.payload.error?.fieldErrors?.recordedGrams,
        "Fractional grams did not produce a stock field error.",
      );
      const unsupported = await appJsonRequest(
        "/api/spools",
        {
          method: "POST",
          jar: activeJarA,
          body: JSON.stringify({ material: "PLA", colour: "JSON", recordedGrams: 1 }),
          contentType: "application/json",
        },
        415,
      );
      ensure(
        unsupported.payload.error?.code === "unsupported_media_type",
        "JSON stock writes did not return the documented media error.",
      );
    });

    await step("cross-origin form posts are rejected by the framework", async () => {
      const result = await appRequest("/api/spools", {
        method: "POST",
        jar: activeJarA,
        origin: "https://attacker.invalid",
        formEntries: APP_STOCK_FIELDS,
      });
      ensure(result.status === 403, "A hostile-origin stock form did not receive the framework HTTP 403.");
      ensure(
        !(result.headers.get("content-type") ?? "").toLowerCase().includes("application/json"),
        "The framework origin rejection was confused with the application's JSON contract.",
      );
    });

    await step("missing and foreign application targets cannot be changed", async () => {
      const missingId = "00000000-0000-4000-8000-000000000001";
      const missingUpdate = await appJsonRequest(
        "/api/spools/" + missingId + "/update",
        { method: "POST", jar: activeJarA, formEntries: APP_STOCK_FIELDS },
        404,
      );
      ensure(missingUpdate.payload.error?.code === "not_found", "An absent stock update did not return not found.");
      const missingDelete = await appJsonRequest(
        "/api/spools/" + missingId + "/delete",
        { method: "POST", jar: activeJarA, formEntries: [] },
        404,
      );
      ensure(missingDelete.payload.error?.code === "not_found", "An absent stock deletion did not return not found.");
      const foreignUpdate = await appJsonRequest(
        "/api/spools/" + primary.id + "/update",
        {
          method: "POST",
          jar: activeJarB,
          formEntries: [
            ["material", "PLA"],
            ["colour", "Attacker"],
            ["recordedGrams", "1"],
          ],
        },
        404,
      );
      ensure(
        foreignUpdate.payload.error?.code === "not_found",
        "Account B could update account A's spool through the app.",
      );
      const foreignDelete = await appJsonRequest(
        "/api/spools/" + primary.id + "/delete",
        { method: "POST", jar: activeJarB, formEntries: [] },
        404,
      );
      ensure(
        foreignDelete.payload.error?.code === "not_found",
        "Account B could delete account A's spool through the app.",
      );
      ensure((await listAppSpools(activeJarB)).length === 0, "Account B could list account A's stock through the app.");
      await assertPersisted(accountA.id, activeJarA);
      const spoolB = await createAppSpool(activeJarB, accountB.id, [
        ["material", "PETG"],
        ["colour", "Account B spool"],
        ["recordedGrams", "80"],
      ]);
      assertDto(spoolB, { material: "PETG", colour: "Account B spool", recordedGrams: 80 });
      await assertPersisted(accountB.id, activeJarB);
      for (const [operation, path, options] of [
        ["update", "/api/spools/" + spoolB.id + "/update", { method: "POST", formEntries: APP_STOCK_FIELDS }],
        ["delete", "/api/spools/" + spoolB.id + "/delete", { method: "POST", formEntries: [] }],
      ]) {
        const result = await appJsonRequest(path, { ...options, jar: activeJarA }, 404);
        ensure(
          result.payload.error?.code === "not_found",
          "Account A could " + operation + " account B's spool through the app.",
        );
      }
      await assertPersisted(accountB.id, activeJarB);
      await assertPersisted(accountA.id, activeJarA);
    });

    await step("application responses stay private without refreshing account A's session", async () => {
      const before = sessionIdentity(activeJarA, "account A").session;
      const api = await appRequest("/api/spools", { jar: activeJarA });
      assertPrivateHeaders(api, "json");
      ensure(api.cookieWrites.length === 0, "The stock API check unexpectedly refreshed account A's session.");
      const afterApi = sessionIdentity(activeJarA, "account A").session;
      ensure(afterApi.access_token === before.access_token, "The stock API check changed account A's access token.");
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      assertPrivateHeaders(page, "html");
      ensure(page.cookieWrites.length === 0, "The stock page check unexpectedly refreshed account A's session.");
      ensure(
        sessionIdentity(activeJarA, "account A").session.access_token === before.access_token,
        "The stock page check changed account A's access token.",
      );
    });

    await step("direct REST access enforces owner scope and database contracts", async () => {
      const spoolB = (await listAppSpools(activeJarB)).find((spool) => spool.colour === "Account B spool");
      ensure(spoolB, "The account B positive-control spool was missing.");
      await verifyDirectRest({
        config,
        requestSignal,
        accountA,
        accountB,
        jarA: activeJarA,
        jarB: activeJarB,
        primary,
        spoolB,
        rememberRest,
        forget,
        assertPersisted,
        track,
      });
    });

    await step("API correction to zero survives SSR rereads", async () => {
      const { payload } = await appJsonRequest("/api/spools/" + primary.id + "/update", {
        method: "POST",
        jar: activeJarA,
        formEntries: [
          ["material", "PLA"],
          ["colour", "Black / Red / Gold"],
          ["recordedGrams", "0"],
        ],
      });
      assertDto(payload.spool, { material: "PLA", colour: "Black / Red / Gold", recordedGrams: 0 });
      rememberDto(accountA.id, payload.spool);
      await assertPersisted(accountA.id, activeJarA);
      const reread = (await listAppSpools(activeJarA)).find((spool) => spool.id === primary.id);
      ensure(reread, "The corrected spool was missing from an API reread.");
      assertDto(reread, { material: "PLA", colour: "Black / Red / Gold", recordedGrams: 0 });
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(page.status === 200, "The stock SSR page did not render after correction.");
      assertPrivateHeaders(page, "html");
      ensure(
        page.body.includes("Black / Red / Gold") && page.body.includes("PLA"),
        "The SSR page did not show the complete corrected spool labels.",
      );
      ensure(
        removeReactTextSeparators(page.body).includes("0 g"),
        "The SSR page did not show the corrected zero-gram amount.",
      );
    });

    await step("logout and relogin preserve the owner's recorded stock", async () => {
      const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
      ensure(signout.status === 302, "Account A could not sign out during the stock persistence check.");
      ensure(activeJarA.authCookieNames().length === 0, "Account A signout retained its session cookies.");
      const anonymous = await appRequest("/api/spools", { jar: activeJarA });
      ensure(anonymous.status === 401, "The stock API remained available after account A signed out.");
      assertPrivateHeaders(anonymous, "json");
      const signin = await appRequest("/api/auth/signin", {
        method: "POST",
        jar: activeJarA,
        formEntries: [
          ["email", accountA.email],
          ["password", accountA.password],
        ],
      });
      ensure(
        signin.status === 302 && activeJarA.authCookieNames().length > 0,
        "Account A could not establish a fresh session after relogin.",
      );
      const afterRelogin = await listAppSpools(activeJarA);
      assertExactCollection(afterRelogin, expectedByOwner.get(accountA.id), "The fresh-session API reread");
      await assertPersisted(accountA.id, activeJarA);
      await assertPersisted(accountB.id, activeJarB);
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(
        page.status === 200 && removeReactTextSeparators(page.body).includes("0 g"),
        "The SSR stock page did not show persisted stock after relogin.",
      );
    });

    await step("selected duplicate deletion preserves the exact records for both owners", async () => {
      await deleteAppSpool(activeJarA, duplicate.id);
      await assertPersisted(accountA.id, activeJarA);
      await assertPersisted(accountB.id, activeJarB);
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes("PLA") && page.body.includes("Black / Red / Gold"),
        "The SSR page did not reread the remaining spool.",
      );
      ensure(!page.body.includes(duplicate.id.slice(0, 8)), "The SSR page still rendered the deleted spool.");
    });

    await step("final stock deletion leaves an SSR-rendered empty inventory", async () => {
      await deleteAppSpool(activeJarA, primary.id);
      await assertPersisted(accountA.id, activeJarA);
      await assertPersisted(accountB.id, activeJarB);
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes("No spools yet"),
        "The empty stock state was not rendered after deletion.",
      );
      assertPrivateHeaders(page, "html");
    });

    await step("both authenticated sessions remain valid for the existing expiry checks", async () => {
      for (const [label, account, jar] of [
        ["account A", accountA, activeJarA],
        ["account B", accountB, activeJarB],
      ]) {
        const page = await appRequest("/dashboard", { jar });
        ensure(
          page.status === 200 && page.body.includes(account.email),
          "The " + label + " session was not usable after stock scenarios.",
        );
        const identity = sessionIdentity(jar, label);
        const expiry = jwtExpiry(identity.session, label);
        ensure(
          expiry > Math.floor(Date.now() / 1000),
          "The " + label + " session did not have a confirmed future expiry.",
        );
      }
    });
  } catch (error) {
    scenarioError = error;
  } finally {
    for (const [ownerId, jar, account, label] of [
      [accountA.id, activeJarA, accountA, "account A"],
      [accountB.id, activeJarB, accountB, "account B"],
    ]) {
      const ids = trackedByOwner.get(ownerId);
      if (!ids?.size) continue;
      try {
        const session = await restoreCleanupSession({
          appRequest,
          jar,
          account,
          expectedUserId: ownerId,
          cleanupRequestSignal,
        });
        const cleanups = await Promise.all(
          [...ids].map((id) => deleteRestSpool(config, cleanupRequestSignal, session.access_token, id, ownerId)),
        );
        for (const cleanup of cleanups) {
          ensure(
            cleanup.ok &&
              Array.isArray(cleanup.data) &&
              cleanup.data.length === 1 &&
              cleanup.data[0].user_id === ownerId,
            "The " + label + " cleanup could not delete one of its tracked spools.",
          );
          ids.delete(cleanup.data[0].id);
        }
        if (cleanupProbe) console.log("PASS  " + label + " cleanup removed all owner-tracked stock probe records");
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  if (scenarioError && cleanupErrors.length > 0) {
    const cleanupMessage = cleanupErrors
      .map((error) => (error instanceof Error ? error.message : "unexpected cleanup failure"))
      .join("; ");
    throw new Error(
      "Stock scenario failed: " +
        (scenarioError instanceof Error ? scenarioError.message : "unexpected failure") +
        "; cleanup also failed: " +
        cleanupMessage,
      { cause: new AggregateError([scenarioError, ...cleanupErrors]) },
    );
  }
  if (scenarioError) throw scenarioError;
  if (cleanupErrors.length > 0) {
    throw new Error(
      "The stock smoke could not clean up every created spool: " +
        cleanupErrors
          .map((error) => (error instanceof Error ? error.message : "unexpected cleanup failure"))
          .join("; "),
    );
  }
}
