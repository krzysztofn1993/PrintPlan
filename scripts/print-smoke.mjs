// Bounded planned-print smoke scenario shared by the authenticated HTTP smoke.

/* global Blob */

import {
  appFormData,
  assertPrivateHeaders,
  ensure,
  jwtExpiry,
  readAppJson,
  restRequest,
  sessionIdentity,
  smokeStep,
} from "./smoke-utils.mjs";

const PRINT_FIELDS = [
  ["name", ""],
  ["material", "pla"],
  ["colour", "Black / Red / Gold"],
  ["requiredGrams", "80"],
];
const REST_COLUMNS = "id,user_id,name,material,colour,required_grams,version";
const step = (name, run) => smokeStep(name, run, "Print");

function assertPrint(print, expected) {
  ensure(print && typeof print.id === "string", "The print response did not include an identifier.");
  ensure(print.name === expected.name, "The committed print name did not match the request.");
  ensure(print.material === expected.material, "The committed material label was not canonical.");
  ensure(print.colour === expected.colour, "The complete colour label was not preserved.");
  ensure(print.requiredGrams === expected.requiredGrams, "The required grams did not match the request.");
  ensure(Number.isInteger(print.version) && print.version >= 1, "The committed print did not include a valid version.");
}

function printQuery(id) {
  return new URLSearchParams({ select: REST_COLUMNS, id: "eq." + id }).toString();
}

export async function runPrintSmoke({
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
    "Print smoke needs both confirmed accounts and cookie jars.",
  );
  ensure(
    config && typeof config.url === "string" && typeof config.key === "string",
    "Print smoke needs local Supabase configuration.",
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
    ensure(
      result.status === status,
      "Expected planned-print endpoint HTTP " +
        status +
        ", received " +
        result.status +
        " at " +
        path +
        " for " +
        JSON.stringify(options.formEntries ?? []) +
        "; response " +
        result.body,
    );
    assertPrivateHeaders(result, "json", "Planned-print");
    return { result, payload: readAppJson(result, "planned-print") };
  };
  const createPrint = async (jar, entries = PRINT_FIELDS) => {
    const { payload } = await appJsonRequest("/api/prints", { method: "POST", jar, formEntries: entries }, 201);
    ensure(
      payload.print && typeof payload.print.id === "string",
      "The create response did not return a planned print.",
    );
    appIds.add(payload.print.id);
    return payload.print;
  };
  const listPrints = async (jar) => {
    const { payload } = await appJsonRequest("/api/prints", { jar });
    ensure(Array.isArray(payload.prints), "The planned-print list response did not include an array.");
    return payload.prints;
  };
  const updatePrint = async (jar, id, version, entries, status = 200) => {
    const { payload } = await appJsonRequest(
      "/api/prints/" + id + "/update",
      { method: "POST", jar, formEntries: [...entries, ["expectedVersion", String(version)]] },
      status,
    );
    return payload;
  };
  const deletePrint = async (jar, id) => {
    const { payload } = await appJsonRequest("/api/prints/" + id + "/delete", { method: "POST", jar, formEntries: [] });
    ensure(payload.id === id, "The delete response did not confirm the requested print.");
    appIds.delete(id);
  };

  try {
    await step("anonymous planned-print API is denied and page redirects to sign in", async () => {
      const result = await appRequest("/api/prints", { jar: new CookieJar() });
      ensure(result.status === 401, "Anonymous planned-print API access did not return HTTP 401.");
      assertPrivateHeaders(result, "json", "Planned-print");
      ensure(
        readAppJson(result, "planned-print").error?.code === "unauthenticated",
        "Anonymous API returned an unexpected error.",
      );
      const page = await appRequest("/dashboard/prints", { jar: new CookieJar() });
      ensure(
        page.status === 302 && page.location.includes("/auth/signin"),
        "Anonymous print page access was not redirected.",
      );
    });

    await step("account A starts with a private SSR empty list", async () => {
      const page = await appRequest("/dashboard/prints", { jar: activeJarA });
      ensure(page.status === 200, "The authenticated planned-print page did not load.");
      assertPrivateHeaders(page, "html", "Planned-print");
      ensure(page.body.includes("No planned prints yet"), "The empty print state was not rendered by the server.");
    });

    const primary = await step("unnamed print saves canonical labels without requiring stock", async () => {
      const print = await createPrint(activeJarA);
      assertPrint(print, { name: null, material: "PLA", colour: "Black / Red / Gold", requiredGrams: 80 });
      const page = await appRequest("/dashboard/prints", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes("Black / Red / Gold") && page.body.includes("80 g"),
        "SSR did not show the saved print requirements.",
      );
      ensure(page.body.includes(print.id.slice(0, 8)), "SSR did not show a visible print identifier.");
      return print;
    });

    const duplicate = await step("identical and normalized named prints remain independent", async () => {
      const first = await createPrint(activeJarA, [
        ["name", "  Phone   holder  "],
        ["material", "PLA"],
        ["colour", "Black / Red / Gold"],
        ["requiredGrams", "80"],
      ]);
      const second = await createPrint(activeJarA, [
        ["name", "Phone holder"],
        ["material", "PLA"],
        ["colour", "Black / Red / Gold"],
        ["requiredGrams", "80"],
      ]);
      assertPrint(first, { name: "Phone holder", material: "PLA", colour: "Black / Red / Gold", requiredGrams: 80 });
      ensure(
        first.id !== second.id && second.id !== primary.id,
        "Duplicate planned prints did not receive independent identifiers.",
      );
      const listed = await listPrints(activeJarA);
      ensure(
        listed.length === 3 && new Set(listed.map((item) => item.id)).size === 3,
        "The list did not preserve all independent prints.",
      );
      return first;
    });

    await step("strict payload, media, method, and grams validation is enforced", async () => {
      const missing = await appJsonRequest(
        "/api/prints",
        {
          method: "POST",
          jar: activeJarA,
          formEntries: [
            ["material", ""],
            ["colour", ""],
            ["requiredGrams", ""],
          ],
        },
        422,
      );
      ensure(missing.payload.error?.code === "validation_failed", "Missing print fields were not rejected.");
      ensure(
        missing.payload.error?.fieldErrors?.material && missing.payload.error?.fieldErrors?.requiredGrams,
        "Missing required print values did not produce field errors.",
      );
      const unexpected = await appJsonRequest(
        "/api/prints",
        { method: "POST", jar: activeJarA, formEntries: [...PRINT_FIELDS, ["ownerId", "forged"]] },
        422,
      );
      ensure(unexpected.payload.error?.code === "invalid_payload", "Unknown print fields were not rejected.");
      const repeated = await appJsonRequest(
        "/api/prints",
        { method: "POST", jar: activeJarA, formEntries: [...PRINT_FIELDS, ["material", "PETG"]] },
        422,
      );
      ensure(repeated.payload.error?.code === "validation_failed", "Repeated print fields were not rejected.");
      const fileValued = await appJsonRequest(
        "/api/prints",
        {
          method: "POST",
          jar: activeJarA,
          formData: appFormData([
            ["name", ""],
            ["material", new Blob(["PLA"], { type: "text/plain" })],
            ["colour", "File-valued material"],
            ["requiredGrams", "80"],
          ]),
        },
        422,
      );
      ensure(fileValued.payload.error?.code === "validation_failed", "File-valued print fields were not rejected.");
      for (const grams of ["0", "1.5"]) {
        const invalid = await appJsonRequest(
          "/api/prints",
          {
            method: "POST",
            jar: activeJarA,
            formEntries: [
              ["material", "PLA"],
              ["colour", "Invalid grams"],
              ["requiredGrams", grams],
            ],
          },
          422,
        );
        ensure(
          invalid.payload.error?.fieldErrors?.requiredGrams,
          "Invalid create grams did not produce a field error.",
        );
      }
      for (const grams of ["0", "1.5"]) {
        const invalidEdit = await updatePrint(
          activeJarA,
          primary.id,
          primary.version,
          [
            ["name", ""],
            ["material", "PLA"],
            ["colour", "Invalid edit"],
            ["requiredGrams", grams],
          ],
          422,
        );
        ensure(invalidEdit.error?.fieldErrors?.requiredGrams, "Invalid edit grams did not produce a field error.");
      }
      const unsupported = await appJsonRequest(
        "/api/prints",
        { method: "POST", jar: activeJarA, body: JSON.stringify({ material: "PLA" }), contentType: "application/json" },
        415,
      );
      ensure(
        unsupported.payload.error?.code === "unsupported_media_type",
        "JSON print writes were not rejected as unsupported media.",
      );
      const method = await appJsonRequest("/api/prints", { method: "PUT", jar: activeJarA }, 405);
      ensure(
        method.payload.error?.code === "method_not_allowed",
        "Unsupported print collection methods were not rejected.",
      );
      const hostile = await appRequest("/api/prints", {
        method: "POST",
        jar: activeJarA,
        origin: "https://attacker.invalid",
        formEntries: PRINT_FIELDS,
      });
      ensure(hostile.status === 403, "A hostile-origin planned-print form was not rejected.");
    });

    await step("API updates clear optional names and preserve creation order", async () => {
      const oldOrder = (await listPrints(activeJarA)).map((item) => item.id);
      const updated = await updatePrint(activeJarA, duplicate.id, duplicate.version, [
        ["name", ""],
        ["material", "pla"],
        ["colour", " Black / Red / Gold "],
        ["requiredGrams", "90"],
      ]);
      assertPrint(updated.print, { name: null, material: "PLA", colour: "Black / Red / Gold", requiredGrams: 90 });
      ensure(updated.print.version === duplicate.version + 1, "A committed edit did not advance its version.");
      ensure(
        (await listPrints(activeJarA)).map((item) => item.id).join(",") === oldOrder.join(","),
        "Editing changed the creation order.",
      );
      const page = await appRequest("/dashboard/prints", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes("90 g") && page.body.includes("Black / Red / Gold"),
        "SSR did not reread edited print data.",
      );
      return updated.print;
    });

    await step("account B cannot read or mutate account A prints through the app", async () => {
      ensure((await listPrints(activeJarB)).length === 0, "Account B could list account A's planned prints.");
      const foreignRead = await appRequest("/dashboard/prints", { jar: activeJarB });
      ensure(
        foreignRead.status === 200 && foreignRead.body.includes("No planned prints yet"),
        "Account B's SSR page exposed account A's prints.",
      );
      const own = await createPrint(activeJarB, [
        ["name", "Account B print"],
        ["material", "PETG"],
        ["colour", "Blue"],
        ["requiredGrams", "25"],
      ]);
      assertPrint(own, { name: "Account B print", material: "PETG", colour: "Blue", requiredGrams: 25 });
      ensure(
        (await listPrints(activeJarB)).some((print) => print.id === own.id),
        "Account B could not reread its own print.",
      );
      const foreignUpdate = await updatePrint(activeJarB, primary.id, primary.version, PRINT_FIELDS.slice(0), 404);
      ensure(foreignUpdate.error?.code === "not_found", "Account B could update account A's print through the app.");
      const foreignDelete = await appJsonRequest(
        "/api/prints/" + primary.id + "/delete",
        { method: "POST", jar: activeJarB, formEntries: [] },
        404,
      );
      ensure(
        foreignDelete.payload.error?.code === "not_found",
        "Account B could delete account A's print through the app.",
      );
      const missingId = "00000000-0000-4000-8000-000000000001";
      const missingUpdate = await updatePrint(activeJarA, missingId, 1, PRINT_FIELDS, 404);
      ensure(missingUpdate.error?.code === "not_found", "An absent print update did not return not found.");
      const invalidId = await appJsonRequest(
        "/api/prints/not-a-uuid/delete",
        { method: "POST", jar: activeJarA, formEntries: [] },
        422,
      );
      ensure(invalidId.payload.error?.code === "validation_failed", "An invalid print identifier was not rejected.");
      await deletePrint(activeJarB, own.id);
    });

    await step("direct REST enforces print ownership, constraints, and version triggers", async () => {
      const tokenA = sessionIdentity(activeJarA, "account A").session.access_token;
      const tokenB = sessionIdentity(activeJarB, "account B").session.access_token;
      const inserted = await restRequest({
        config,
        requestSignal,
        token: tokenA,
        path: "/rest/v1/prints",
        method: "POST",
        body: {
          user_id: accountA.id,
          name: "Direct REST",
          material: "petg",
          colour: "Direct / REST",
          required_grams: 30,
        },
        prefer: "return=representation",
      });
      ensure(
        inserted.status === 201 && Array.isArray(inserted.data) && inserted.data.length === 1,
        "Account A could not insert an owned print through REST.",
      );
      const direct = inserted.data[0];
      ensure(typeof direct.id === "string", "The direct REST insert did not return a print identifier.");
      restIds.add(direct.id);
      ensure(
        direct.user_id === accountA.id &&
          direct.material === "PETG" &&
          direct.required_grams === 30 &&
          direct.version === 1,
        "The database did not canonicalize the direct print insert.",
      );
      const readOwn = await restRequest({
        config,
        requestSignal,
        token: tokenA,
        path: "/rest/v1/prints",
        method: "GET",
        query: printQuery(direct.id),
      });
      ensure(
        readOwn.ok && Array.isArray(readOwn.data) && readOwn.data.length === 1,
        "Account A could not read its print through REST.",
      );
      const readForeign = await restRequest({
        config,
        requestSignal,
        token: tokenB,
        path: "/rest/v1/prints",
        method: "GET",
        query: printQuery(direct.id),
      });
      ensure(
        readForeign.ok && Array.isArray(readForeign.data) && readForeign.data.length === 0,
        "Account B could read account A's print through REST.",
      );
      const foreignUpdate = await restRequest({
        config,
        requestSignal,
        token: tokenB,
        path: "/rest/v1/prints",
        method: "PATCH",
        query: printQuery(direct.id),
        body: { required_grams: 99 },
        prefer: "return=representation",
      });
      ensure(
        foreignUpdate.ok && Array.isArray(foreignUpdate.data) && foreignUpdate.data.length === 0,
        "Account B changed account A's print through REST.",
      );
      const foreignDelete = await restRequest({
        config,
        requestSignal,
        token: tokenB,
        path: "/rest/v1/prints",
        method: "DELETE",
        query: printQuery(direct.id),
        prefer: "return=representation",
      });
      ensure(
        foreignDelete.ok && Array.isArray(foreignDelete.data) && foreignDelete.data.length === 0,
        "Account B deleted account A's print through REST.",
      );
      const forgedOwner = await restRequest({
        config,
        requestSignal,
        token: tokenA,
        path: "/rest/v1/prints",
        method: "POST",
        body: { user_id: accountB.id, material: "PLA", colour: "Forged", required_grams: 10 },
        prefer: "return=representation",
      });
      ensure(!forgedOwner.ok, "The database accepted a forged print owner.");
      const reassignment = await restRequest({
        config,
        requestSignal,
        token: tokenA,
        path: "/rest/v1/prints",
        method: "PATCH",
        query: printQuery(direct.id),
        body: { user_id: accountB.id },
        prefer: "return=representation",
      });
      ensure(!reassignment.ok, "The database allowed print ownership reassignment.");
      for (const grams of [0, 2.5]) {
        const invalid = await restRequest({
          config,
          requestSignal,
          token: tokenA,
          path: "/rest/v1/prints",
          method: "POST",
          body: { user_id: accountA.id, material: "PLA", colour: "Invalid REST", required_grams: grams },
          prefer: "return=representation",
        });
        ensure(!invalid.ok, "The database accepted invalid required grams through REST.");
      }
      const edit = await restRequest({
        config,
        requestSignal,
        token: tokenA,
        path: "/rest/v1/prints",
        method: "PATCH",
        query: printQuery(direct.id),
        body: { required_grams: 31 },
        prefer: "return=representation",
      });
      ensure(
        edit.ok && Array.isArray(edit.data) && edit.data.length === 1 && edit.data[0].version === 2,
        "A direct edit did not increment the print version.",
      );
      const staleApp = await updatePrint(
        activeJarA,
        direct.id,
        1,
        [
          ["name", "Stale"],
          ["material", "PETG"],
          ["colour", "Direct / REST"],
          ["requiredGrams", "32"],
        ],
        409,
      );
      ensure(
        staleApp.error?.code === "edit_conflict",
        "An app form with a stale direct-REST version did not conflict.",
      );
      const cleanup = await restRequest({
        config,
        requestSignal,
        token: tokenA,
        path: "/rest/v1/prints",
        method: "DELETE",
        query: printQuery(direct.id),
        prefer: "return=representation",
      });
      ensure(
        cleanup.ok && Array.isArray(cleanup.data) && cleanup.data.length === 1,
        "Account A could not delete its own REST fixture.",
      );
      restIds.delete(direct.id);
    });

    await step("competing updates with one expected version produce exactly one winner", async () => {
      const before = await listPrints(activeJarA);
      const current = before.find((print) => print.id === primary.id);
      ensure(current, "The concurrency fixture was missing from the owned list.");
      const jarOne = activeJarA.clone();
      const jarTwo = activeJarA.clone();
      ensure(
        jwtExpiry(jarOne.session(), "concurrent writer one") > Math.floor(Date.now() / 1000),
        "Writer one session was expired before the race.",
      );
      ensure(
        jwtExpiry(jarTwo.session(), "concurrent writer two") > Math.floor(Date.now() / 1000),
        "Writer two session was expired before the race.",
      );
      const concurrentUpdate = async (jar, name, grams) => {
        const response = await appRequest("/api/prints/" + current.id + "/update", {
          method: "POST",
          jar,
          formEntries: [
            ["name", name],
            ["material", "PLA"],
            ["colour", "Black / Red / Gold"],
            ["requiredGrams", grams],
            ["expectedVersion", String(current.version)],
          ],
        });
        assertPrivateHeaders(response, "json", "Planned-print");
        return { status: response.status, payload: readAppJson(response, "planned-print") };
      };
      const competing = await Promise.all([
        concurrentUpdate(jarOne, "Winner one", "81"),
        concurrentUpdate(jarTwo, "Winner two", "82"),
      ]);
      const winners = competing.filter((entry) => entry.status === 200);
      const conflicts = competing.filter((entry) => entry.status === 409);
      ensure(
        winners.length === 1 && conflicts.length === 1,
        "Competing edits did not produce exactly one HTTP 200 and one HTTP 409.",
      );
      ensure(
        conflicts[0].payload.error?.code === "edit_conflict",
        "The losing concurrent write did not return the conflict contract.",
      );
      const winner = winners[0].payload.print;
      ensure(["Winner one", "Winner two"].includes(winner.name), "The winning edit returned an unexpected value.");
      ensure(winner.version === current.version + 1, "The concurrent edit advanced the version more than once.");
      const reread = (await listPrints(activeJarA)).find((print) => print.id === current.id);
      ensure(
        reread &&
          reread.name === winner.name &&
          reread.requiredGrams === winner.requiredGrams &&
          reread.version === winner.version,
        "The persisted concurrent winner did not match its committed response.",
      );
      const staleRetry = await updatePrint(
        activeJarA,
        current.id,
        current.version,
        [
          ["name", "Stale retry"],
          ["material", "PLA"],
          ["colour", "Black / Red / Gold"],
          ["requiredGrams", "83"],
        ],
        409,
      );
      ensure(staleRetry.error?.code === "edit_conflict", "A sequential stale retry did not return conflict.");
    });

    await step("logout and relogin preserve print data and private responses do not refresh cookies", async () => {
      const before = sessionIdentity(activeJarA, "account A").session;
      const api = await appRequest("/api/prints", { jar: activeJarA });
      assertPrivateHeaders(api, "json", "Planned-print");
      ensure(api.cookieWrites.length === 0, "A print API read unexpectedly refreshed the account session.");
      ensure(
        sessionIdentity(activeJarA, "account A").session.access_token === before.access_token,
        "A print API read changed the session token.",
      );
      const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
      ensure(
        signout.status === 302 && activeJarA.authCookieNames().length === 0,
        "Account A could not sign out for print persistence.",
      );
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
        "Account A could not sign in again for print persistence.",
      );
      const persisted = await listPrints(activeJarA);
      ensure(
        persisted.length === 3 && persisted.some((print) => print.id === primary.id),
        "Account A's prints did not persist across logout and relogin.",
      );
      const page = await appRequest("/dashboard/prints", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes(primary.id.slice(0, 8)),
        "SSR did not show persisted print data after relogin.",
      );
    });

    await step("deleted print is absent from API and SSR rereads", async () => {
      await deletePrint(activeJarA, duplicate.id);
      const afterDelete = await listPrints(activeJarA);
      ensure(
        afterDelete.length === 2 && !afterDelete.some((print) => print.id === duplicate.id),
        "Deleting a print changed the wrong list entry.",
      );
      const page = await appRequest("/dashboard/prints", { jar: activeJarA });
      ensure(
        page.status === 200 && !page.body.includes(duplicate.id.slice(0, 8)),
        "SSR still rendered the deleted print.",
      );
      const deletedRetry = await appJsonRequest(
        "/api/prints/" + duplicate.id + "/delete",
        { method: "POST", jar: activeJarA, formEntries: [] },
        404,
      );
      ensure(
        deletedRetry.payload.error?.code === "not_found",
        "Deleting an already deleted print did not return not found.",
      );
    });

    await step("both account sessions remain usable with future expiry before auth expiry checks", async () => {
      for (const [label, account, jar] of [
        ["account A", accountA, activeJarA],
        ["account B", accountB, activeJarB],
      ]) {
        const session = sessionIdentity(jar, label).session;
        ensure(
          jwtExpiry(session, label) > Math.floor(Date.now() / 1000),
          "The " + label + " session expired before the existing auth checks.",
        );
        const page = await appRequest("/dashboard", { jar });
        ensure(
          page.status === 200 && page.body.includes(account.email),
          "The " + label + " session was not usable after print scenarios.",
        );
      }
    });
  } catch (error) {
    scenarioError = error;
  } finally {
    let token;
    try {
      token = sessionIdentity(activeJarA, "account A cleanup").session.access_token;
    } catch {
      token = null;
    }
    if (token) {
      for (const id of [...appIds, ...restIds]) {
        try {
          const cleanup = await restRequest({
            config,
            requestSignal,
            token,
            path: "/rest/v1/prints",
            method: "DELETE",
            query: printQuery(id),
            prefer: "return=representation",
          });
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
  if (cleanupFailed) throw new Error("The planned-print smoke could not clean up every created print.");
}
