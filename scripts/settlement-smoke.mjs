// Authenticated HTTP acceptance for persisted print settlement behavior.

import { randomUUID } from "node:crypto";
import {
  assertPrivateHeaders,
  ensure,
  readAppJson,
  restRequest,
  restoreCleanupSession,
  sessionIdentity,
  smokeStep,
} from "./smoke-utils.mjs";

const PRINT_REST_COLUMNS =
  "id,user_id,name,material,colour,required_grams,version,created_at,updated_at,settlement_id,settled_at,actual_grams";
const SPOOL_REST_COLUMNS = "id,user_id,material,colour,recorded_grams";
const step = (name, run) => smokeStep(name, run, "Settlement");

function jsonSnapshot(row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    material: row.material,
    colour: row.colour,
    requiredGrams: Number(row.required_grams),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settlementId: row.settlement_id,
    settledAt: row.settled_at,
    actualGrams: row.actual_grams === null ? null : Number(row.actual_grams),
  };
}

export async function runSettlementSmoke({
  config,
  appRequest,
  CookieJar,
  accountA,
  accountB,
  activeJarA,
  activeJarB,
  requestSignal,
  cleanupRequestSignal,
}) {
  ensure(
    accountA && accountB && activeJarA && activeJarB,
    "Settlement smoke needs both confirmed accounts and sessions.",
  );
  ensure(
    config && typeof config.url === "string" && typeof config.key === "string",
    "Settlement smoke needs local Supabase configuration.",
  );

  accountA.id = sessionIdentity(activeJarA, "account A").userId;
  accountB.id = sessionIdentity(activeJarB, "account B").userId;
  const trackedPrints = new Map([
    [accountA.id, new Set()],
    [accountB.id, new Set()],
  ]);
  const trackedSpools = new Map([
    [accountA.id, new Set()],
    [accountB.id, new Set()],
  ]);
  let scenarioError;
  const cleanupErrors = [];
  const anonymousJar = new CookieJar();

  const appJson = async (path, options = {}, expectedStatus = 200, jar = activeJarA) => {
    const result = await appRequest(path, { ...options, jar });
    ensure(
      result.status === expectedStatus,
      `Expected HTTP ${expectedStatus} at ${path}, received ${result.status}: ${result.body}`,
    );
    assertPrivateHeaders(result, "json", "Settlement");
    return { result, payload: readAppJson(result, "settlement") };
  };

  const createSpool = async (jar, ownerId, material, colour, recordedGrams) => {
    const { payload } = await appJson(
      "/api/spools",
      {
        method: "POST",
        formEntries: [
          ["material", material],
          ["colour", colour],
          ["recordedGrams", String(recordedGrams)],
        ],
      },
      201,
      jar,
    );
    ensure(typeof payload.spool?.id === "string", "Spool creation did not return an identifier.");
    trackedSpools.get(ownerId).add(payload.spool.id);
    return payload.spool;
  };

  const createPrint = async (jar, ownerId, name, material, colour, requiredGrams) => {
    const { payload } = await appJson(
      "/api/prints",
      {
        method: "POST",
        formEntries: [
          ["name", name],
          ["material", material],
          ["colour", colour],
          ["requiredGrams", String(requiredGrams)],
        ],
      },
      201,
      jar,
    );
    ensure(typeof payload.print?.id === "string", "Print creation did not return an identifier.");
    trackedPrints.get(ownerId).add(payload.print.id);
    return payload.print;
  };

  const listPrints = async (jar = activeJarA) => {
    const { payload } = await appJson("/api/prints", {}, 200, jar);
    ensure(Array.isArray(payload.prints), "The print list response did not include an array.");
    return payload.prints;
  };

  const listSpools = async (jar = activeJarA) => {
    const { payload } = await appJson("/api/spools", {}, 200, jar);
    ensure(Array.isArray(payload.spools), "The spool list response did not include an array.");
    return payload.spools;
  };

  const findPrint = async (printId, jar = activeJarA) => {
    const print = (await listPrints(jar)).find((item) => item.id === printId);
    ensure(print, "The expected print was missing from its owner collection.");
    return print;
  };

  const reserve = async (print, spoolId, jar = activeJarA) => {
    const { payload } = await appJson(
      `/api/prints/${print.id}/reservation/reserve`,
      {
        method: "POST",
        formEntries: [
          ["requestId", randomUUID()],
          ["expectedVersion", String(print.version)],
          ["spoolId", spoolId],
          ["selectionMode", "best_fit"],
        ],
      },
      200,
      jar,
    );
    ensure(typeof payload.reservationId === "string", "Reservation did not return its exact identity.");
    return payload.reservationId;
  };

  const submitSettlement = (printId, command, expectedStatus = 200, jar = activeJarA) =>
    appJson(
      `/api/prints/${printId}/settlement`,
      {
        method: "POST",
        formEntries: [
          ["requestId", command.requestId],
          ["expectedVersion", String(command.expectedVersion)],
          ["reservationId", command.reservationId],
          ["actualGrams", String(command.actualGrams)],
        ],
      },
      expectedStatus,
      jar,
    );

  const readSettlement = async (printId, jar = activeJarA, expectedStatus = 200) => {
    const { payload } = await appJson(`/api/prints/${printId}/settlement`, {}, expectedStatus, jar);
    return payload.settlement;
  };

  const readRestPrint = async (id, ownerId, jar) => {
    const token = sessionIdentity(jar, ownerId === accountA.id ? "account A" : "account B").session.access_token;
    const response = await restRequest({
      config,
      requestSignal,
      token,
      path: "/rest/v1/prints",
      method: "GET",
      query: new URLSearchParams({
        select: PRINT_REST_COLUMNS,
        id: "eq." + id,
        user_id: "eq." + ownerId,
      }).toString(),
    });
    ensure(
      response.ok && Array.isArray(response.data) && response.data.length === 1,
      "Restricted print reread failed.",
    );
    return response.data[0];
  };

  const readRestSpool = async (id, ownerId, jar) => {
    const token = sessionIdentity(jar, ownerId === accountA.id ? "account A" : "account B").session.access_token;
    const response = await restRequest({
      config,
      requestSignal,
      token,
      path: "/rest/v1/spools",
      method: "GET",
      query: new URLSearchParams({
        select: SPOOL_REST_COLUMNS,
        id: "eq." + id,
        user_id: "eq." + ownerId,
      }).toString(),
    });
    ensure(
      response.ok && Array.isArray(response.data) && response.data.length === 1,
      "Restricted spool reread failed.",
    );
    return response.data[0];
  };

  const deletePrint = async (id, jar, ownerId) => {
    const { payload } = await appJson(`/api/prints/${id}/delete`, { method: "POST", formEntries: [] }, 200, jar);
    ensure(payload.id === id, "Print deletion did not confirm the requested identity.");
    trackedPrints.get(ownerId).delete(id);
  };

  const assertBusinessFailure = async (result, code) => {
    ensure(result.payload.error?.code === code, `Expected settlement error ${code}.`);
  };

  try {
    const positiveColour = `Settlement smoke ${randomUUID()}`;
    const spool = await createSpool(activeJarA, accountA.id, "PLA", positiveColour, 300);
    const completed = await createPrint(
      activeJarA,
      accountA.id,
      "Settlement smoke completed",
      "PLA",
      positiveColour,
      80,
    );
    const oldest = await createPrint(activeJarA, accountA.id, "Settlement smoke oldest", "PLA", positiveColour, 60);
    const middle = await createPrint(activeJarA, accountA.id, "Settlement smoke middle", "PLA", positiveColour, 50);
    const newest = await createPrint(activeJarA, accountA.id, "Settlement smoke newest", "PLA", positiveColour, 40);
    const unrelatedA = await createPrint(
      activeJarA,
      accountA.id,
      "Settlement same-owner control",
      "PETG",
      `Settlement control ${randomUUID()}`,
      17,
    );
    const unrelatedB = await createPrint(
      activeJarB,
      accountB.id,
      "Settlement other-owner control",
      "ABS",
      `Settlement foreign control ${randomUUID()}`,
      19,
    );
    const oldestReservationId = await reserve(oldest, spool.id);
    const middleReservationId = await reserve(middle, spool.id);
    const newestReservationId = await reserve(newest, spool.id);
    const reservationId = await reserve(completed, spool.id);
    const commandPrint = await findPrint(completed.id);
    ensure(
      commandPrint.reservation?.id === reservationId,
      "The settlement command did not use the active reservation.",
    );

    await step("anonymous settlement results and mutations are denied", async () => {
      const anonymousRead = await appJson(`/api/prints/${completed.id}/settlement`, {}, 401, anonymousJar);
      await assertBusinessFailure(anonymousRead, "unauthenticated");
      const anonymousWrite = await submitSettlement(
        completed.id,
        {
          requestId: randomUUID(),
          expectedVersion: commandPrint.version,
          reservationId,
          actualGrams: 200,
        },
        401,
        anonymousJar,
      );
      await assertBusinessFailure(anonymousWrite, "unauthenticated");
      ensure((await readSettlement(completed.id)) === null, "Anonymous requests changed the owner settlement state.");
    });

    await step("a foreign owner cannot read or settle another account's print", async () => {
      const foreignRead = await appJson(`/api/prints/${completed.id}/settlement`, {}, 404, activeJarB);
      await assertBusinessFailure(foreignRead, "not_found");
      const foreignWrite = await submitSettlement(
        completed.id,
        {
          requestId: randomUUID(),
          expectedVersion: commandPrint.version,
          reservationId,
          actualGrams: 200,
        },
        404,
        activeJarB,
      );
      await assertBusinessFailure(foreignWrite, "not_found");
      ensure(
        !(await listPrints(activeJarB)).some((print) => print.id === completed.id),
        "Account B's collection exposed account A's print.",
      );
    });

    const requestId = randomUUID();
    const command = {
      requestId,
      expectedVersion: commandPrint.version,
      reservationId,
      actualGrams: 200,
    };
    const firstReceipt = await step(
      "positive settlement deducts stock and cancels only the newest fitting prefix",
      async () => {
        const first = await submitSettlement(completed.id, command);
        ensure(first.payload.replayed === false, "The first settlement was reported as a replay.");
        const receipt = first.payload.settlement;
        ensure(
          receipt.actualGrams === 200 && receipt.releasedGrams === 88,
          "The receipt did not retain actual and released grams.",
        );
        ensure(
          receipt.spool.recordedGramsBefore === 300 &&
            receipt.spool.recordedGramsAfter === 100 &&
            receipt.spool.reservedGramsAfter === 66 &&
            receipt.spool.availableGramsAfter === 34,
          "The settlement receipt reported incorrect historical stock arithmetic.",
        );
        ensure(
          receipt.cancelledReservations.length === 2 &&
            receipt.cancelledReservations[0].reservationId === newestReservationId &&
            receipt.cancelledReservations[0].releasedGrams === 44 &&
            receipt.cancelledReservations[1].reservationId === middleReservationId &&
            receipt.cancelledReservations[1].releasedGrams === 55,
          "Settlement did not report the 44 g then 55 g cancellation prefix.",
        );
        ensure(
          receipt.cancelledReservations.every((item) => item.printId !== oldest.id) &&
            receipt.cancelledReservations[0].printName === newest.name &&
            receipt.cancelledReservations[1].printName === middle.name,
          "The receipt lost the cancelled print identities or snapshots.",
        );
        return receipt;
      },
    );

    await step("same-key retry returns one immutable receipt and a new key conflicts", async () => {
      const replay = await submitSettlement(completed.id, command);
      ensure(replay.payload.replayed === true, "An identical settlement retry was not marked as replayed.");
      ensure(
        JSON.stringify(replay.payload.settlement) === JSON.stringify(firstReceipt),
        "The identical retry changed its immutable settlement receipt.",
      );
      const differentKey = await submitSettlement(completed.id, { ...command, requestId: randomUUID() }, 409);
      await assertBusinessFailure(differentKey, "already_settled");
      const saved = await readSettlement(completed.id);
      ensure(JSON.stringify(saved) === JSON.stringify(firstReceipt), "The saved settlement changed after retries.");
    });

    await step("settled print rejects edits at its current version without changing persisted fields", async () => {
      const before = await readRestPrint(completed.id, accountA.id, activeJarA);
      const current = await findPrint(completed.id);
      const rejected = await appJson(
        `/api/prints/${completed.id}/update`,
        {
          method: "POST",
          formEntries: [
            ["name", "Attempted completed-print edit"],
            ["material", current.material],
            ["colour", current.colour],
            ["requiredGrams", String(current.requiredGrams)],
            ["expectedVersion", String(current.version)],
          ],
        },
        409,
      );
      ensure(rejected.payload.error?.code === "print_settled", "A completed print edit did not return print_settled.");
      const after = await readRestPrint(completed.id, accountA.id, activeJarA);
      ensure(
        JSON.stringify(jsonSnapshot(after)) === JSON.stringify(jsonSnapshot(before)),
        "The rejected edit changed the persisted print.",
      );
    });

    await step("fresh reads preserve settlement and leave unrelated records unchanged", async () => {
      const printList = await listPrints();
      const completedDto = printList.find((print) => print.id === completed.id);
      const oldestDto = printList.find((print) => print.id === oldest.id);
      const middleDto = printList.find((print) => print.id === middle.id);
      const newestDto = printList.find((print) => print.id === newest.id);
      ensure(
        completedDto?.settlement?.actualGrams === 200 && completedDto.reservation === null,
        "A fresh print read omitted completed-print consumption.",
      );
      ensure(oldestDto?.reservation?.id === oldestReservationId, "The oldest surviving reservation was cancelled.");
      ensure(
        middleDto?.reservation === null && newestDto?.reservation === null,
        "Cancelled reservations remained active.",
      );
      const currentSpool = (await listSpools()).find((item) => item.id === spool.id);
      ensure(
        currentSpool?.recordedGrams === 100 && currentSpool.reservedGrams === 66 && currentSpool.availableGrams === 34,
        "The current spool read disagreed with settlement arithmetic.",
      );
      ensure(
        (await listPrints(activeJarB)).some((print) => print.id === unrelatedB.id),
        "Settlement affected the other owner's print collection.",
      );
      ensure(
        printList.some((print) => print.id === unrelatedA.id && print.settlement === null),
        "Settlement affected an unrelated same-owner print.",
      );
      const persisted = await readRestPrint(completed.id, accountA.id, activeJarA);
      ensure(
        persisted.settlement_id === firstReceipt.id &&
          persisted.settled_at === firstReceipt.settledAt &&
          Number(persisted.actual_grams) === 200,
        "Restricted REST did not independently confirm the completion columns.",
      );
      const spoolRow = await readRestSpool(spool.id, accountA.id, activeJarA);
      ensure(Number(spoolRow.recorded_grams) === 100, "Restricted REST did not confirm the deducted stock.");
    });

    await step("a fresh login retains the receipt, completion and exact stock", async () => {
      const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
      ensure(signout.status === 302 && activeJarA.authCookieNames().length === 0, "Account A could not sign out.");
      const signin = await appRequest("/api/auth/signin", {
        method: "POST",
        jar: activeJarA,
        formEntries: [
          ["email", accountA.email],
          ["password", accountA.password],
        ],
      });
      ensure(signin.status === 302 && activeJarA.authCookieNames().length > 0, "Account A could not sign in again.");
      ensure(
        sessionIdentity(activeJarA, "fresh account A").userId === accountA.id,
        "Fresh login changed account identity.",
      );
      ensure(
        JSON.stringify(await readSettlement(completed.id)) === JSON.stringify(firstReceipt),
        "Fresh login lost the saved receipt.",
      );
      ensure(
        (await findPrint(completed.id)).settlement?.actualGrams === 200 &&
          (await listSpools()).find((item) => item.id === spool.id)?.availableGrams === 34,
        "Fresh login did not retain completed print and stock state.",
      );
      const currentControlA = (await listPrints()).find((print) => print.id === unrelatedA.id);
      const currentControlB = (await listPrints(activeJarB)).find((print) => print.id === unrelatedB.id);
      ensure(
        currentControlA?.name === unrelatedA.name && currentControlA.version === unrelatedA.version,
        "Same-owner control data changed.",
      );
      ensure(
        currentControlB?.name === unrelatedB.name && currentControlB.version === unrelatedB.version,
        "Other-owner control data changed.",
      );
    });

    await step("deleting a completed print keeps the receipt and does not refund stock", async () => {
      const before = (await listSpools()).find((item) => item.id === spool.id);
      await deletePrint(completed.id, activeJarA, accountA.id);
      const after = (await listSpools()).find((item) => item.id === spool.id);
      ensure(
        before?.recordedGrams === 100 &&
          after?.recordedGrams === before.recordedGrams &&
          after.reservedGrams === before.reservedGrams &&
          after.availableGrams === before.availableGrams,
        "Deleting a completed print changed current stock.",
      );
      ensure(
        JSON.stringify(await readSettlement(completed.id)) === JSON.stringify(firstReceipt),
        "Deleting the print removed its retained receipt.",
      );
    });

    await step("zero-gram settlement completes a print without consuming estimated stock", async () => {
      const colour = `Settlement zero ${randomUUID()}`;
      const zeroSpool = await createSpool(activeJarA, accountA.id, "PETG", colour, 150);
      const zeroPrint = await createPrint(activeJarA, accountA.id, "Settlement zero print", "PETG", colour, 80);
      const zeroReservationId = await reserve(zeroPrint, zeroSpool.id);
      const current = await findPrint(zeroPrint.id);
      const zeroCommand = {
        requestId: randomUUID(),
        expectedVersion: current.version,
        reservationId: zeroReservationId,
        actualGrams: 0,
      };
      const result = await submitSettlement(zeroPrint.id, zeroCommand);
      const receipt = result.payload.settlement;
      const currentSpool = (await listSpools()).find((item) => item.id === zeroSpool.id);
      ensure(
        receipt.actualGrams === 0 &&
          !receipt.exceededEstimate &&
          currentSpool?.recordedGrams === 150 &&
          currentSpool.reservedGrams === 0 &&
          currentSpool.availableGrams === 150,
        "Zero grams did not complete the print while preserving recorded stock.",
      );
    });

    await step("consumption above recorded stock warns and cancels every other reservation", async () => {
      const colour = `Settlement exceeded ${randomUUID()}`;
      const exceededSpool = await createSpool(activeJarA, accountA.id, "ABS", colour, 150);
      const exceededPrint = await createPrint(activeJarA, accountA.id, "Settlement exceeded print", "ABS", colour, 80);
      const otherPrint = await createPrint(activeJarA, accountA.id, "Settlement exceeded other", "ABS", colour, 30);
      const exceededReservationId = await reserve(exceededPrint, exceededSpool.id);
      const otherReservationId = await reserve(otherPrint, exceededSpool.id);
      const current = await findPrint(exceededPrint.id);
      const result = await submitSettlement(exceededPrint.id, {
        requestId: randomUUID(),
        expectedVersion: current.version,
        reservationId: exceededReservationId,
        actualGrams: 151,
      });
      const receipt = result.payload.settlement;
      const currentSpool = (await listSpools()).find((item) => item.id === exceededSpool.id);
      ensure(
        receipt.exceededEstimate &&
          receipt.spool.recordedGramsAfter === 0 &&
          receipt.cancelledReservations.length === 1 &&
          receipt.cancelledReservations[0].reservationId === otherReservationId &&
          currentSpool?.recordedGrams === 0 &&
          currentSpool.reservedGrams === 0 &&
          currentSpool.availableGrams === 0,
        "Exceeded-estimate settlement did not warn, zero stock, and cancel the other reservation.",
      );
      ensure(
        JSON.stringify(await readSettlement(exceededPrint.id)) === JSON.stringify(receipt),
        "The exceeded-estimate receipt was not durable.",
      );
    });
  } catch (error) {
    scenarioError = error;
  } finally {
    for (const [ownerId, jar, account, label] of [
      [accountA.id, activeJarA, accountA, "account A"],
      [accountB.id, activeJarB, accountB, "account B"],
    ]) {
      const printIds = trackedPrints.get(ownerId);
      const spoolIds = trackedSpools.get(ownerId);
      if (!printIds?.size && !spoolIds?.size) continue;
      try {
        await restoreCleanupSession({
          appRequest,
          jar,
          account,
          expectedUserId: ownerId,
          cleanupRequestSignal,
        });
        for (const id of [...(printIds ?? [])]) {
          const response = await appRequest(`/api/prints/${id}/delete`, {
            method: "POST",
            jar,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(
            response.status === 200 || response.status === 404,
            `The ${label} settlement cleanup could not delete a print fixture.`,
          );
          printIds.delete(id);
        }
        for (const id of [...(spoolIds ?? [])]) {
          const response = await appRequest(`/api/spools/${id}/delete`, {
            method: "POST",
            jar,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(
            response.status === 200 || response.status === 404,
            `The ${label} settlement cleanup could not delete a spool fixture.`,
          );
          spoolIds.delete(id);
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (scenarioError && cleanupErrors.length > 0) {
    throw new AggregateError([scenarioError, ...cleanupErrors], "Settlement scenario and cleanup failed.");
  }
  if (scenarioError) throw scenarioError;
  if (cleanupErrors.length > 0) throw cleanupErrors[0];
}
