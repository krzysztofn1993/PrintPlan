// Bounded planned-print smoke scenario shared by the authenticated HTTP smoke.

/* global Blob */

import {
  appFormData,
  assertPrivateHeaders,
  ensure,
  jwtExpiry,
  readAppJson,
  restRequest,
  restoreCleanupSession,
  sessionIdentity,
  smokeStep,
  timestampInstant,
} from "./smoke-utils.mjs";

const PRINT_FIELDS = [
  ["name", ""],
  ["material", "pla"],
  ["colour", "Black / Red / Gold"],
  ["requiredGrams", "80"],
];
const REST_COLUMNS = "id,user_id,name,material,colour,required_grams,version,created_at,updated_at";
const step = (name, run) => smokeStep(name, run, "Print");

function assertPrint(print, expected) {
  ensure(print && typeof print.id === "string", "The print response did not include an identifier.");
  ensure(print.name === expected.name, "The committed print name did not match the request.");
  ensure(print.material === expected.material, "The committed material label was not canonical.");
  ensure(print.colour === expected.colour, "The complete colour label was not preserved.");
  ensure(print.requiredGrams === expected.requiredGrams, "The required grams did not match the request.");
  ensure(Number.isInteger(print.version) && print.version >= 1, "The committed print did not include a valid version.");
}

function snapshotFromDto(print) {
  return {
    id: print.id,
    name: print.name,
    material: print.material,
    colour: print.colour,
    requiredGrams: print.requiredGrams,
    version: print.version,
    createdAt: timestampInstant(print.createdAt, "The API print creation time"),
    updatedAt: timestampInstant(print.updatedAt, "The API print update time"),
  };
}

function snapshotFromRest(row, ownerId) {
  ensure(row.user_id === ownerId, "A restricted REST print read returned a different owner.");
  return {
    id: row.id,
    name: row.name,
    material: row.material,
    colour: row.colour,
    requiredGrams: Number(row.required_grams),
    version: row.version,
    createdAt: timestampInstant(row.created_at, "The REST print creation time"),
    updatedAt: timestampInstant(row.updated_at, "The REST print update time"),
  };
}

function assertSnapshot(actual, expected, label) {
  ensure(actual.id === expected.id, label + " identifier changed.");
  for (const field of ["name", "material", "colour", "requiredGrams", "version", "createdAt", "updatedAt"]) {
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

function printQuery(id, ownerId) {
  const query = new URLSearchParams({ select: REST_COLUMNS, id: "eq." + id });
  if (ownerId) query.set("user_id", "eq." + ownerId);
  return query.toString();
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
  cleanupRequestSignal,
  expireScenarioForCleanupProbe,
  cleanupProbe,
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
  const rememberDto = (ownerId, print) => expectedByOwner.get(ownerId).set(print.id, snapshotFromDto(print));
  const forget = (ownerId, id) => expectedByOwner.get(ownerId).delete(id);

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
  const createPrint = async (jar, ownerId = accountA.id, entries = PRINT_FIELDS) => {
    const { payload } = await appJsonRequest("/api/prints", { method: "POST", jar, formEntries: entries }, 201);
    ensure(
      payload.print && typeof payload.print.id === "string",
      "The create response did not return a planned print.",
    );
    track(ownerId, payload.print.id);
    rememberDto(ownerId, payload.print);
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
    const ownerId = jar === activeJarB ? accountB.id : accountA.id;
    track(ownerId, id, false);
    forget(ownerId, id);
  };
  const listRestPrints = async (ownerId, jar) => {
    const token = sessionIdentity(jar, ownerId === accountA.id ? "account A" : "account B").session.access_token;
    const response = await restRequest({
      config,
      requestSignal,
      token,
      path: "/rest/v1/prints",
      method: "GET",
      query: new URLSearchParams({ select: REST_COLUMNS, user_id: "eq." + ownerId }).toString(),
    });
    ensure(response.ok && Array.isArray(response.data), "The restricted REST print collection read failed.");
    return response.data;
  };
  const assertPersisted = async (ownerId, jar) => {
    assertExactCollection(await listPrints(jar), expectedByOwner.get(ownerId), "The owner print API reread");
    assertExactCollection(
      await listRestPrints(ownerId, jar),
      expectedByOwner.get(ownerId),
      "The restricted print REST reread",
      ownerId,
    );
  };

  try {
    if (cleanupProbe) {
      await createPrint(activeJarA, accountA.id, [
        ["name", "Cleanup Probe A"],
        ["material", "PLA"],
        ["colour", "Cleanup Probe A"],
        ["requiredGrams", "7"],
      ]);
      await createPrint(activeJarB, accountB.id, [
        ["name", "Cleanup Probe B"],
        ["material", "PETG"],
        ["colour", "Cleanup Probe B"],
        ["requiredGrams", "9"],
      ]);
      if (cleanupProbe === "post-signout") {
        const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
        ensure(
          signout.status === 302 && activeJarA.authCookieNames().length === 0,
          "The cleanup probe could not sign out account A.",
        );
        throw new Error("Induced failure after signout before fresh signin");
      }
      expireScenarioForCleanupProbe();
      throw new Error("Induced scenario timeout");
    }

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
      ensure(page.body.includes("No prints yet"), "The empty print state was not rendered by the server.");
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
      const first = await createPrint(activeJarA, accountA.id, [
        ["name", "  Phone   holder  "],
        ["material", "PLA"],
        ["colour", "Black / Red / Gold"],
        ["requiredGrams", "80"],
      ]);
      const second = await createPrint(activeJarA, accountA.id, [
        ["name", "Phone holder"],
        ["material", "PLA"],
        ["colour", "Black / Red / Gold"],
        ["requiredGrams", "80"],
      ]);
      assertPrint(first, { name: "Phone holder", material: "PLA", colour: "Black / Red / Gold", requiredGrams: 80 });
      assertPrint(second, { name: "Phone holder", material: "PLA", colour: "Black / Red / Gold", requiredGrams: 80 });
      ensure(
        first.id !== second.id && second.id !== primary.id,
        "Duplicate planned prints did not receive independent identifiers.",
      );
      const listed = await listPrints(activeJarA);
      ensure(
        listed.length === 3 && new Set(listed.map((item) => item.id)).size === 3,
        "The list did not preserve all independent prints.",
      );
      await assertPersisted(accountA.id, activeJarA);
      return first;
    });

    await step("anonymous planned-print mutations are denied without changing the owner's record", async () => {
      for (const [operation, path, options] of [
        ["create", "/api/prints", { method: "POST", formEntries: PRINT_FIELDS }],
        [
          "update",
          "/api/prints/" + primary.id + "/update",
          { method: "POST", formEntries: [...PRINT_FIELDS, ["expectedVersion", "1"]] },
        ],
        ["delete", "/api/prints/" + primary.id + "/delete", { method: "POST", formEntries: [] }],
      ]) {
        const result = await appRequest(path, { ...options, jar: new CookieJar() });
        if (operation === "create" && result.status === 201) {
          try {
            const created = readAppJson(result, "planned-print").print;
            if (created && typeof created.id === "string") track(accountA.id, created.id);
          } catch {
            // The assertion below reports the unexpected response while cleanup handles any trackable fixture.
          }
        }
        ensure(result.status === 401, "Anonymous print " + operation + " did not return HTTP 401.");
        assertPrivateHeaders(result, "json", "Planned-print");
        ensure(
          readAppJson(result, "planned-print").error?.code === "unauthenticated",
          "Anonymous print " + operation + " returned an unexpected error.",
        );
      }
      await assertPersisted(accountA.id, activeJarA);
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
        updated.print.id === duplicate.id &&
          timestampInstant(updated.print.createdAt, "The edited print creation time") ===
            timestampInstant(duplicate.createdAt, "The original print creation time"),
        "The API print edit changed its identifier or creation time.",
      );
      rememberDto(accountA.id, updated.print);
      await assertPersisted(accountA.id, activeJarA);
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
        foreignRead.status === 200 && foreignRead.body.includes("No prints yet"),
        "Account B's SSR page exposed account A's prints.",
      );
      const own = await createPrint(activeJarB, accountB.id, [
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
      await assertPersisted(accountB.id, activeJarB);
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
      await assertPersisted(accountA.id, activeJarA);
      await assertPersisted(accountB.id, activeJarB);
      for (const [operation, path, options] of [
        [
          "update",
          "/api/prints/" + own.id + "/update",
          { method: "POST", formEntries: [...PRINT_FIELDS, ["expectedVersion", "1"]] },
        ],
        ["delete", "/api/prints/" + own.id + "/delete", { method: "POST", formEntries: [] }],
      ]) {
        const denied = await appJsonRequest(path, { ...options, jar: activeJarA }, 404);
        ensure(
          denied.payload.error?.code === "not_found",
          "Account A could " + operation + " account B's print through the app.",
        );
      }
      await assertPersisted(accountB.id, activeJarB);
      await assertPersisted(accountA.id, activeJarA);
      const missingId = "00000000-0000-4000-8000-000000000001";
      const missingUpdate = await updatePrint(activeJarA, missingId, 1, PRINT_FIELDS, 404);
      ensure(missingUpdate.error?.code === "not_found", "An absent print update did not return not found.");
      const invalidId = await appJsonRequest(
        "/api/prints/not-a-uuid/delete",
        { method: "POST", jar: activeJarA, formEntries: [] },
        422,
      );
      ensure(invalidId.payload.error?.code === "validation_failed", "An invalid print identifier was not rejected.");
      // Keep account B's owned print as an unrelated-data control through account A's deletion checks.
    });

    await step(
      "direct REST reads stay owner-scoped and all authenticated writes require supported RPC routes",
      async () => {
        const tokenA = sessionIdentity(activeJarA, "account A").session.access_token;
        const tokenB = sessionIdentity(activeJarB, "account B").session.access_token;
        const accountBPrint = [...expectedByOwner.get(accountB.id).values()].find(
          (print) => print.name === "Account B print",
        );
        ensure(accountBPrint, "The account B print positive control was missing.");

        const foreignRead = await restRequest({
          config,
          requestSignal,
          token: tokenB,
          path: "/rest/v1/prints",
          method: "GET",
          query: printQuery(primary.id),
        });
        ensure(
          foreignRead.ok && Array.isArray(foreignRead.data) && foreignRead.data.length === 0,
          "Account B could read account A's print through REST.",
        );

        for (const [label, token, method, id, body] of [
          [
            "owner create",
            tokenA,
            "POST",
            "",
            { user_id: accountA.id, name: "Direct REST", material: "PLA", colour: "Direct", required_grams: 10 },
          ],
          ["owner update", tokenA, "PATCH", primary.id, { required_grams: 99 }],
          ["foreign update", tokenA, "PATCH", accountBPrint.id, { required_grams: 99 }],
          ["foreign delete", tokenA, "DELETE", accountBPrint.id, undefined],
        ]) {
          const denied = await restRequest({
            config,
            requestSignal,
            token,
            path: "/rest/v1/prints",
            method,
            query: id ? printQuery(id) : "",
            body,
            prefer: "return=representation",
          });
          ensure(
            (denied.status === 401 || denied.status === 403) && denied.data?.code === "42501",
            "REST " + label + " bypassed the supported mutation RPCs.",
          );
        }
        await assertPersisted(accountA.id, activeJarA);
        await assertPersisted(accountB.id, activeJarB);
      },
    );

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
        const requested = {
          name,
          material: "PLA",
          colour: "Black / Red / Gold",
          requiredGrams: Number(grams),
        };
        const response = await appRequest("/api/prints/" + current.id + "/update", {
          method: "POST",
          jar,
          formEntries: [
            ["name", requested.name],
            ["material", requested.material],
            ["colour", requested.colour],
            ["requiredGrams", String(requested.requiredGrams)],
            ["expectedVersion", String(current.version)],
          ],
        });
        assertPrivateHeaders(response, "json", "Planned-print");
        return { status: response.status, payload: readAppJson(response, "planned-print"), requested };
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
      assertPrint(winner, winners[0].requested);
      ensure(winner.version === current.version + 1, "The concurrent edit advanced the version more than once.");
      ensure(
        winner.id === current.id &&
          timestampInstant(winner.createdAt, "The winning print creation time") ===
            timestampInstant(current.createdAt, "The original race print creation time"),
        "The winning print edit changed its identifier or creation time.",
      );
      rememberDto(accountA.id, winner);
      const reread = (await listPrints(activeJarA)).find((print) => print.id === current.id);
      ensure(
        reread &&
          reread.name === winner.name &&
          reread.requiredGrams === winner.requiredGrams &&
          reread.version === winner.version,
        "The persisted concurrent winner did not match its committed response.",
      );
      await assertPersisted(accountA.id, activeJarA);
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
      assertExactCollection(persisted, expectedByOwner.get(accountA.id), "The fresh-session print API reread");
      await assertPersisted(accountA.id, activeJarA);
      await assertPersisted(accountB.id, activeJarB);
      const page = await appRequest("/dashboard/prints", { jar: activeJarA });
      ensure(
        page.status === 200 && page.body.includes(primary.id.slice(0, 8)),
        "SSR did not show persisted print data after relogin.",
      );
    });

    await step("deleted print is absent from API and SSR rereads", async () => {
      await deletePrint(activeJarA, duplicate.id);
      const afterDelete = await listPrints(activeJarA);
      ensure(!afterDelete.some((print) => print.id === duplicate.id), "The deleted print remained in the API list.");
      assertExactCollection(afterDelete, expectedByOwner.get(accountA.id), "The API survivors after targeted deletion");
      await assertPersisted(accountA.id, activeJarA);
      await assertPersisted(accountB.id, activeJarB);
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
    for (const [ownerId, jar, account, label] of [
      [accountA.id, activeJarA, accountA, "account A"],
      [accountB.id, activeJarB, accountB, "account B"],
    ]) {
      const ids = trackedByOwner.get(ownerId);
      if (!ids?.size) continue;
      try {
        await restoreCleanupSession({
          appRequest,
          jar,
          account,
          expectedUserId: ownerId,
          cleanupRequestSignal,
        });
        for (const id of [...ids]) {
          const result = await appRequest("/api/prints/" + id + "/delete", {
            method: "POST",
            jar,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(result.status === 200, "The " + label + " cleanup could not delete an owner-tracked print.");
          const payload = readAppJson(result, "planned-print cleanup");
          ensure(payload.id === id, "The " + label + " cleanup deleted an unexpected print.");
          ids.delete(id);
          forget(ownerId, id);
        }
        if (cleanupProbe) console.log("PASS  " + label + " cleanup removed all owner-tracked print probe records");
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
      "Print scenario failed: " +
        (scenarioError instanceof Error ? scenarioError.message : "unexpected failure") +
        "; cleanup also failed: " +
        cleanupMessage,
      { cause: new AggregateError([scenarioError, ...cleanupErrors]) },
    );
  }
  if (scenarioError) throw scenarioError;
  if (cleanupErrors.length > 0) {
    throw new Error(
      "The planned-print smoke could not clean up every created print: " +
        cleanupErrors
          .map((error) => (error instanceof Error ? error.message : "unexpected cleanup failure"))
          .join("; "),
    );
  }
}
