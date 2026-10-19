// Authenticated HTTP acceptance for persisted reservation behavior. The separate safety-margin smoke runs after
// this default-margin scenario has cleaned up its own fixtures.

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

const step = (name, run) => smokeStep(name, run, "Reservation");

export async function runReservationSmoke({
  config,
  appRequest,
  accountA,
  activeJarA,
  activeJarB,
  requestSignal,
  cleanupRequestSignal,
}) {
  const trackedPrints = new Set();
  const trackedSpools = new Set();
  let scenarioError;
  const cleanupErrors = [];

  const appJson = async (path, options = {}, expectedStatus = 200, jar = activeJarA) => {
    const result = await appRequest(path, { ...options, jar });
    ensure(result.status === expectedStatus, `Expected HTTP ${expectedStatus} at ${path}, received ${result.status}.`);
    assertPrivateHeaders(result, "json", "Reservation");
    return { result, payload: readAppJson(result, "reservation") };
  };
  const createSpool = async (colour) => {
    const { payload } = await appJson(
      "/api/spools",
      {
        method: "POST",
        formEntries: [
          ["material", "PLA"],
          ["colour", colour],
          ["recordedGrams", "150"],
        ],
      },
      201,
    );
    ensure(typeof payload.spool?.id === "string", "Spool creation did not return an ID.");
    trackedSpools.add(payload.spool.id);
    return payload.spool;
  };
  const createPrint = async (name, colour) => {
    const { payload } = await appJson(
      "/api/prints",
      {
        method: "POST",
        formEntries: [
          ["name", name],
          ["material", "PLA"],
          ["colour", colour],
          ["requiredGrams", "80"],
        ],
      },
      201,
    );
    ensure(typeof payload.print?.id === "string", "Print creation did not return an ID.");
    trackedPrints.add(payload.print.id);
    return payload.print;
  };
  const reserve = (
    print,
    spoolId,
    expectedReservationGrams,
    selectionMode = "best_fit",
    requestId = randomUUID(),
    expectedStatus = 200,
  ) =>
    appJson(
      `/api/prints/${print.id}/reservation/reserve`,
      {
        method: "POST",
        formEntries: [
          ["requestId", requestId],
          ["expectedVersion", String(print.version)],
          ["expectedReservationGrams", String(expectedReservationGrams)],
          ["spoolId", spoolId],
          ["selectionMode", selectionMode],
        ],
      },
      expectedStatus,
    );
  const listPrints = async (jar = activeJarA) => (await appJson("/api/prints", {}, 200, jar)).payload.prints;
  const listSpools = async (jar = activeJarA) => (await appJson("/api/spools", {}, 200, jar)).payload.spools;
  const release = async (printId, reservationId) =>
    appJson(`/api/prints/${printId}/reservation/cancel`, {
      method: "POST",
      formEntries: [["reservationId", reservationId]],
    });

  try {
    const colour = `Reservation smoke ${randomUUID()}`;
    const spool = await createSpool(colour);
    const first = await createPrint("Reservation smoke first", colour);
    const second = await createPrint("Reservation smoke second", colour);

    const firstPreview = await step(
      "best-fit preview applies the default margin and identifies the spool",
      async () => {
        const { payload } = await appJson(`/api/prints/${first.id}/reservation`);
        ensure(
          payload.reservationGrams === 88 && payload.marginPercent === 10,
          "The preview did not apply the 10% margin to 80 g.",
        );
        ensure(
          payload.suggestedSpoolId === spool.id && payload.eligibleSpools.some((item) => item.id === spool.id),
          "The matching spool was not suggested.",
        );
        return payload;
      },
    );

    let reservationId;
    await step("reserve, retry, and fresh reads preserve recorded stock", async () => {
      const requestId = randomUUID();
      const firstWrite = await reserve(first, spool.id, firstPreview.reservationGrams, "best_fit", requestId);
      ensure(firstWrite.payload.disposition === "active", "The confirmed reservation was not active.");
      reservationId = firstWrite.payload.reservationId;
      const replay = await reserve(first, spool.id, firstPreview.reservationGrams, "best_fit", requestId);
      ensure(
        replay.payload.reservationId === reservationId && replay.payload.disposition === "active",
        "Retry created a different reservation.",
      );
      const savedSpool = (await listSpools()).find((item) => item.id === spool.id);
      ensure(
        savedSpool?.recordedGrams === 150 && savedSpool.reservedGrams === 88 && savedSpool.availableGrams === 62,
        "Fresh stock did not report 150 recorded / 88 reserved / 62 available grams.",
      );
      ensure(
        (await listPrints()).find((item) => item.id === first.id)?.reservation?.id === reservationId,
        "Fresh print read omitted the committed reservation.",
      );
    });

    await step("second print is rejected until the first reservation is released", async () => {
      const secondPreview = (await appJson(`/api/prints/${second.id}/reservation`)).payload;
      const failed = await reserve(second, spool.id, secondPreview.reservationGrams, "best_fit", randomUUID(), 409);
      ensure(
        failed.result.status === 409 && failed.payload.error?.code === "insufficient_material",
        "The second print did not receive insufficient-material feedback.",
      );
    });

    await step("foreign reservation reads are indistinguishable from missing IDs", async () => {
      const foreign = await appJson(`/api/prints/${first.id}/reservation`, {}, 404, activeJarB);
      ensure(
        foreign.payload.error?.code === "not_found",
        "A foreign print reservation preview did not return not found.",
      );
    });

    await step("release and replacement are safe against stale cancellation", async () => {
      const released = await release(first.id, reservationId);
      ensure(released.payload.disposition === "released", "The reservation was not released.");
      const repeated = await release(first.id, reservationId);
      ensure(
        repeated.payload.disposition === "already_released",
        "Repeated release did not report its completed disposition.",
      );
      const afterRelease = (await listSpools()).find((item) => item.id === spool.id);
      ensure(
        afterRelease?.recordedGrams === 150 && afterRelease.reservedGrams === 0 && afterRelease.availableGrams === 150,
        "Release changed recorded stock or failed to restore availability.",
      );

      const firstRefresh = (await listPrints()).find((item) => item.id === first.id);
      ensure(firstRefresh, "The print disappeared after release.");
      const replacementPreview = (await appJson(`/api/prints/${firstRefresh.id}/reservation`)).payload;
      const replacement = await reserve(firstRefresh, spool.id, replacementPreview.reservationGrams, "best_fit");
      const replacementId = replacement.payload.reservationId;
      ensure(
        replacementId && replacementId !== reservationId,
        "Replacement did not receive a fresh reservation identity.",
      );
      const stale = await release(first.id, reservationId);
      ensure(stale.payload.disposition === "already_released", "A stale release did not remain an idempotent no-op.");
      ensure(
        (await listPrints()).find((item) => item.id === first.id)?.reservation?.id === replacementId,
        "A stale release removed the replacement reservation.",
      );
      reservationId = replacementId;
    });

    await step("stale print versions conflict and a new request can reserve after release", async () => {
      const staleEdit = await appJson(
        `/api/prints/${first.id}/update`,
        {
          method: "POST",
          formEntries: [
            ["name", "stale"],
            ["material", "PLA"],
            ["colour", colour],
            ["requiredGrams", "80"],
            ["expectedVersion", String(first.version)],
          ],
        },
        409,
      );
      ensure(staleEdit.payload.error?.code === "edit_conflict", "A stale pre-reservation print version was accepted.");
      await release(first.id, reservationId);
      const currentSecond = (await listPrints()).find((item) => item.id === second.id);
      ensure(currentSecond, "The second print disappeared before replacement reservation.");
      const secondPreview = (await appJson(`/api/prints/${currentSecond.id}/reservation`)).payload;
      const secondReservation = await reserve(currentSecond, spool.id, secondPreview.reservationGrams);
      ensure(secondReservation.payload.disposition === "active", "The second print could not reserve after release.");
      reservationId = secondReservation.payload.reservationId;
    });

    await step("logout and a fresh login retain reservation state", async () => {
      const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
      ensure(
        signout.status === 302 && activeJarA.authCookieNames().length === 0,
        "Account A did not sign out cleanly.",
      );
      const signin = await appRequest("/api/auth/signin", {
        method: "POST",
        jar: activeJarA,
        formEntries: [
          ["email", accountA.email],
          ["password", accountA.password],
        ],
      });
      ensure(signin.status === 302 && activeJarA.authCookieNames().length > 0, "Account A could not sign in again.");
      const persisted = (await listPrints()).find((item) => item.id === second.id);
      ensure(
        persisted?.reservation?.id === reservationId && persisted.reservation.reservedGrams === 88,
        "The fresh session did not retain the committed reservation.",
      );
    });

    await step("authenticated direct writes remain closed for product and reservation tables", async () => {
      const token = sessionIdentity(activeJarA, "account A").session.access_token;
      for (const table of ["spools", "prints", "print_reservations"]) {
        const response = await restRequest({
          config,
          requestSignal,
          token,
          path: "/rest/v1/" + table,
          method: "POST",
          body: {},
          prefer: "return=representation",
        });
        ensure(
          (response.status === 401 || response.status === 403) && response.data?.code === "42501",
          "Authenticated direct INSERT was permitted for " + table + ".",
        );
      }
    });
  } catch (error) {
    scenarioError = error;
  } finally {
    try {
      if (trackedPrints.size || trackedSpools.size) {
        await restoreCleanupSession({
          appRequest,
          jar: activeJarA,
          account: accountA,
          expectedUserId: accountA.id,
          cleanupRequestSignal,
        });
        for (const id of trackedPrints) {
          const result = await appRequest(`/api/prints/${id}/delete`, {
            method: "POST",
            jar: activeJarA,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(
            result.status === 200 || result.status === 404,
            "Reservation smoke could not clean up a print fixture.",
          );
        }
        for (const id of trackedSpools) {
          const result = await appRequest(`/api/spools/${id}/delete`, {
            method: "POST",
            jar: activeJarA,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(
            result.status === 200 || result.status === 404,
            "Reservation smoke could not clean up a spool fixture.",
          );
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (scenarioError && cleanupErrors.length)
    throw new AggregateError([scenarioError, ...cleanupErrors], "Reservation smoke scenario and cleanup failed.");
  if (scenarioError) throw scenarioError;
  if (cleanupErrors.length) throw cleanupErrors[0];
}
