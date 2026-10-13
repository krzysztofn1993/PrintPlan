// Bounded stock smoke scenario shared by the existing authenticated HTTP smoke.

/* global Blob */

import {
  appFormData,
  assertPrivateHeaders,
  ensure,
  jwtExpiry,
  readAppJson,
  restRequest as sharedRestRequest,
  sessionIdentity,
  smokeStep,
} from "./smoke-utils.mjs";

const step = (name, run) => smokeStep(name, run, "Stock");
const APP_STOCK_FIELDS = [
  ["material", "pla"],
  ["colour", "Black / Red / Gold"],
  ["recordedGrams", "150"],
];
const REST_COLUMNS = "id,user_id,material,colour,recorded_grams";

function assertDto(spool, expected) {
  ensure(spool && typeof spool.id === "string", "The stock response did not include a spool identifier.");
  ensure(spool.material === expected.material, "The committed material label was not canonical.");
  ensure(spool.colour === expected.colour, "The complete colour label was not preserved.");
  ensure(spool.recordedGrams === expected.recordedGrams, "The recorded stock did not match the request.");
  ensure(spool.reservedGrams === 0, "Reserved stock was not reported as zero.");
  ensure(spool.availableGrams === expected.recordedGrams, "Available stock did not match recorded stock.");
}

function restRequest(options) {
  return sharedRestRequest({ ...options, path: "/rest/v1/spools" });
}

function selectById(id) {
  const query = new URLSearchParams({ select: REST_COLUMNS, id: "eq." + id });
  return query.toString();
}

async function deleteRestSpool(config, requestSignal, token, id) {
  return restRequest({
    config,
    requestSignal,
    token,
    method: "DELETE",
    query: selectById(id),
    prefer: "return=representation",
  });
}

async function verifyDirectRest({ config, requestSignal, accountA, accountB, jarA, jarB, trackedIds }) {
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
  trackedIds.add(directSpool.id);
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
  if (forgedOwner.ok && Array.isArray(forgedOwner.data)) {
    for (const row of forgedOwner.data) if (typeof row.id === "string") trackedIds.add(row.id);
  }
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
  const ownDelete = await deleteRestSpool(config, requestSignal, sessionA.access_token, directSpool.id);
  ensure(
    ownDelete.ok && Array.isArray(ownDelete.data) && ownDelete.data.length === 1,
    "Account A could not delete its own spool through REST.",
  );
  trackedIds.delete(directSpool.id);
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
  const appIds = new Set();
  const restIds = new Set();
  let scenarioError;
  let cleanupFailed = false;

  const appJsonRequest = async (path, options = {}, status = 200) => {
    const result = await appRequest(path, options);
    ensure(result.status === status, "Expected stock endpoint HTTP " + status + ".");
    assertPrivateHeaders(result, "json");
    return { result, payload: readAppJson(result) };
  };
  const createAppSpool = async (jar, entries = APP_STOCK_FIELDS) => {
    const { payload } = await appJsonRequest("/api/spools", { method: "POST", jar, formEntries: entries }, 201);
    ensure(payload.spool && typeof payload.spool.id === "string", "The stock create response did not return a spool.");
    appIds.add(payload.spool.id);
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
    appIds.delete(id);
  };

  try {
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
      const spool = await createAppSpool(activeJarA, [
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
      return spool;
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
      await verifyDirectRest({
        config,
        requestSignal,
        accountA,
        accountB,
        jarA: activeJarA,
        jarB: activeJarB,
        trackedIds: restIds,
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
      ensure(page.body.includes("0 g"), "The SSR page did not show the corrected zero-gram amount.");
    });

    await step("duplicate deletion persists across API and SSR rereads", async () => {
      await deleteAppSpool(activeJarA, duplicate.id);
      const spools = await listAppSpools(activeJarA);
      ensure(
        spools.length === 1 && spools[0].id === primary.id,
        "Deleting a duplicate spool changed the wrong inventory record.",
      );
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes("PLA") && page.body.includes("Black / Red / Gold"),
        "The SSR page did not reread the remaining spool.",
      );
      ensure(!page.body.includes(duplicate.id.slice(0, 8)), "The SSR page still rendered the deleted spool.");
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
      ensure(
        afterRelogin.length === 1 && afterRelogin[0].id === primary.id && afterRelogin[0].recordedGrams === 0,
        "Account A's stock did not persist across logout and relogin.",
      );
      const page = await appRequest("/dashboard/spools", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes("0 g"),
        "The SSR stock page did not show persisted stock after relogin.",
      );
    });

    await step("final stock deletion leaves an SSR-rendered empty inventory", async () => {
      await deleteAppSpool(activeJarA, primary.id);
      ensure((await listAppSpools(activeJarA)).length === 0, "The deleted stock remained in the API inventory.");
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
    const identity = (() => {
      try {
        return sessionIdentity(activeJarA, "account A").session;
      } catch {
        return null;
      }
    })();
    if (identity) {
      for (const id of [...appIds, ...restIds]) {
        try {
          const cleanup = await deleteRestSpool(config, requestSignal, identity.access_token, id);
          if (!cleanup.ok) cleanupFailed = true;
        } catch {
          cleanupFailed = true;
        }
      }
    } else if (appIds.size + restIds.size > 0) {
      cleanupFailed = true;
    }
  }
  if (scenarioError) throw scenarioError;
  if (cleanupFailed) throw new Error("The stock smoke could not clean up every created spool.");
}
