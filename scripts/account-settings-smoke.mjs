// Authenticated HTTP acceptance for account settings and reservation snapshots.

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

const step = (name, run) => smokeStep(name, run, "Account settings");

export async function runAccountSettingsSmoke({
  config,
  appRequest,
  CookieJar,
  accountA,
  activeJarA,
  activeJarB,
  requestSignal,
  cleanupRequestSignal,
}) {
  const trackedPrints = new Set();
  const trackedSpools = new Set();
  const cleanupErrors = [];
  let originalMarginPercent;
  let accountAUserId;
  let scenarioError;

  const appJson = async (path, options = {}, expectedStatus = 200, jar = activeJarA) => {
    const result = await appRequest(path, { ...options, jar });
    ensure(result.status === expectedStatus, `Expected HTTP ${expectedStatus} at ${path}, received ${result.status}.`);
    assertPrivateHeaders(result, "json", "Account settings");
    return { result, payload: readAppJson(result, "account settings") };
  };
  const readSettings = async (jar = activeJarA, signal = requestSignal()) =>
    (await appJson("/api/account/settings", { signal }, 200, jar)).payload.settings;
  const saveSettings = async (marginPercent, expectedVersion, signal = requestSignal()) => {
    const { payload } = await appJson(
      "/api/account/settings",
      {
        method: "POST",
        formEntries: [
          ["marginPercent", String(marginPercent)],
          ["expectedVersion", String(expectedVersion)],
        ],
        signal,
      },
      200,
    );
    ensure(
      payload.settings?.marginPercent === marginPercent && payload.settings?.version === expectedVersion + 1,
      "The settings save did not return its next version.",
    );
    return payload.settings;
  };
  const createSpool = async (colour, recordedGrams = 150) => {
    const { payload } = await appJson(
      "/api/spools",
      {
        method: "POST",
        formEntries: [
          ["material", "PLA"],
          ["colour", colour],
          ["recordedGrams", String(recordedGrams)],
        ],
      },
      201,
    );
    ensure(typeof payload.spool?.id === "string", "The settings smoke spool did not include an ID.");
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
    ensure(typeof payload.print?.id === "string", "The settings smoke print did not include an ID.");
    trackedPrints.add(payload.print.id);
    return payload.print;
  };
  const preview = async (printId) => (await appJson(`/api/prints/${printId}/reservation`)).payload;
  const reserve = async (print, spoolId, grams, selectionMode = "best_fit") => {
    const { payload } = await appJson(`/api/prints/${print.id}/reservation/reserve`, {
      method: "POST",
      formEntries: [
        ["requestId", randomUUID()],
        ["expectedVersion", String(print.version)],
        ["expectedReservationGrams", String(grams)],
        ["spoolId", spoolId],
        ["selectionMode", selectionMode],
      ],
    });
    ensure(typeof payload.reservationId === "string", "The settings smoke reservation was not committed.");
    return payload;
  };
  const listPrints = async () => (await appJson("/api/prints")).payload.prints;
  const listSpools = async () => (await appJson("/api/spools")).payload.spools;

  try {
    await step("anonymous settings page and API remain protected with private responses", async () => {
      const page = await appRequest("/dashboard/settings", { jar: new CookieJar() });
      ensure(
        page.status === 302 && page.location.split("?")[0] === "/auth/signin",
        "The settings page did not redirect anonymous users.",
      );
      const api = await appJson("/api/account/settings", {}, 401, new CookieJar());
      ensure(api.payload.error?.code === "unauthenticated", "The settings API did not reject anonymous access.");
      const signedInPage = await appRequest("/dashboard/settings", { jar: activeJarA });
      ensure(signedInPage.status === 200, "The signed-in settings page was unavailable.");
      assertPrivateHeaders(signedInPage, "html", "Account settings");
    });

    const initialSettings = await step("both accounts read the same isolated default setting", async () => {
      const [settingsA, settingsB] = await Promise.all([readSettings(activeJarA), readSettings(activeJarB)]);
      ensure(
        settingsA.marginPercent === 10 && settingsB.marginPercent === 10,
        "Smoke accounts did not begin at the 10% default.",
      );
      originalMarginPercent = settingsA.marginPercent;
      accountAUserId = sessionIdentity(activeJarA, "account A").userId;
      return settingsA;
    });

    const colour = `Settings smoke ${randomUUID()}`;
    const existingSpool = await createSpool(colour);
    const existingPrint = await createPrint("Settings smoke existing reservation", colour);
    const currentPreview = await preview(existingPrint.id);
    ensure(
      currentPreview.marginPercent === 10 && currentPreview.reservationGrams === 88,
      "The default-margin print did not preview 88 g.",
    );
    const existingReservation = await reserve(existingPrint, existingSpool.id, 88);
    const beforeSave = (await listSpools()).find((spool) => spool.id === existingSpool.id);
    ensure(
      beforeSave?.recordedGrams === 150 && beforeSave.reservedGrams === 88 && beforeSave.availableGrams === 62,
      "The original reservation did not leave 62 g available from recorded stock.",
    );

    await step("saving five percent preserves the original reservation and stock contribution", async () => {
      const saved = await saveSettings(5, initialSettings.version);
      const [prints, spools, settingsB] = await Promise.all([listPrints(), listSpools(), readSettings(activeJarB)]);
      ensure(saved.marginPercent === 5, "Account A did not save 5%.");
      ensure(settingsB.marginPercent === 10, "Account A's settings change affected account B.");
      ensure(
        prints.find((print) => print.id === existingPrint.id)?.reservation?.id === existingReservation.reservationId &&
          prints.find((print) => print.id === existingPrint.id)?.reservation?.reservedGrams === 88,
        "Saving a new margin changed the existing 88 g reservation.",
      );
      const unchanged = spools.find((spool) => spool.id === existingSpool.id);
      ensure(
        unchanged?.recordedGrams === 150 && unchanged.reservedGrams === 88 && unchanged.availableGrams === 62,
        "Saving a new margin changed the reservation's available-stock contribution.",
      );
    });

    await step("authenticated direct settings table writes remain denied", async () => {
      const identity = sessionIdentity(activeJarA, "account A");
      const writes = [
        {
          method: "POST",
          path: "/rest/v1/account_settings",
          body: { user_id: identity.userId, margin_percent: 15, version: 1 },
        },
        {
          method: "PATCH",
          path: "/rest/v1/account_settings?user_id=eq." + identity.userId,
          body: { margin_percent: 15 },
        },
        { method: "DELETE", path: "/rest/v1/account_settings?user_id=eq." + identity.userId },
      ];
      for (const write of writes) {
        const response = await restRequest({
          config,
          requestSignal,
          token: identity.session.access_token,
          ...write,
        });
        ensure(
          (response.status === 401 || response.status === 403) && response.data?.code === "42501",
          "Authenticated direct settings " + write.method + " was permitted.",
        );
      }
    });

    const bestFitSpool = await createSpool(colour);
    const bestFitPrint = await createPrint("Settings smoke five percent best fit", colour);
    await step("a new 80 g print reserves 84 g with the saved five percent setting", async () => {
      const current = await preview(bestFitPrint.id);
      ensure(
        current.marginPercent === 5 && current.reservationGrams === 84,
        "The current settings preview did not report 84 g.",
      );
      const reservation = await reserve(bestFitPrint, bestFitSpool.id, current.reservationGrams);
      ensure(reservation.print?.reservation?.reservedGrams === 84, "The new best-fit reservation did not store 84 g.");
    });

    const manualSpool = await createSpool(colour);
    const manualPrint = await createPrint("Settings smoke five percent manual", colour);
    await step("manual selection also reserves 84 g under the same setting", async () => {
      const current = await preview(manualPrint.id);
      ensure(current.marginPercent === 5 && current.reservationGrams === 84, "The manual preview did not report 84 g.");
      const reservation = await reserve(manualPrint, manualSpool.id, current.reservationGrams, "manual");
      ensure(
        reservation.print?.reservation?.spoolId === manualSpool.id &&
          reservation.print.reservation.reservedGrams === 84,
        "The manual reservation did not preserve its eligible spool and 84 g amount.",
      );
    });

    const directSpool = await createSpool(colour);
    const directPrint = await createPrint("Settings smoke direct RPC with witness", colour);
    const oldClientPrint = await createPrint("Settings smoke direct RPC without witness", colour);
    await step("authenticated RPC accepts a present witness and rejects a witness-less fresh request", async () => {
      const identity = sessionIdentity(activeJarA, "account A");
      const directPreview = await preview(directPrint.id);
      const present = await restRequest({
        config,
        requestSignal,
        token: identity.session.access_token,
        path: "/rest/v1/rpc/reserve_print_material",
        method: "POST",
        body: {
          p_request_id: randomUUID(),
          p_print_id: directPrint.id,
          p_expected_version: directPrint.version,
          p_spool_id: directSpool.id,
          p_selection_mode: "best_fit",
          p_expected_reservation_grams: directPreview.reservationGrams,
        },
      });
      ensure(
        present.status === 200 && present.data?.disposition === "active",
        "The direct witnessed reservation was not accepted.",
      );
      const directCommitted = (await listPrints()).find((print) => print.id === directPrint.id);
      ensure(directCommitted?.reservation?.reservedGrams === 84, "The direct witnessed reservation did not use 84 g.");

      const oldPreview = await preview(oldClientPrint.id);
      const omitted = await restRequest({
        config,
        requestSignal,
        token: identity.session.access_token,
        path: "/rest/v1/rpc/reserve_print_material",
        method: "POST",
        body: {
          p_request_id: randomUUID(),
          p_print_id: oldClientPrint.id,
          p_expected_version: oldClientPrint.version,
          p_spool_id: directSpool.id,
          p_selection_mode: "best_fit",
        },
      });
      ensure(
        omitted.status === 400 &&
          omitted.data?.code === "P0001" &&
          omitted.data?.message === "reservation_preview_required",
        "A witness-less direct RPC created or accepted a fresh reservation.",
      );
      ensure(
        oldPreview.reservationGrams === 84,
        "The witness-less request did not use the current setting's preview fixture.",
      );
      ensure(
        (await listPrints()).find((print) => print.id === oldClientPrint.id)?.reservation == null,
        "The witness-less direct RPC left an active reservation.",
      );
    });

    await step("fresh account A login reads the persisted five percent setting", async () => {
      const signout = await appRequest("/api/auth/signout", {
        method: "POST",
        jar: activeJarA,
        signal: requestSignal(),
      });
      ensure(
        signout.status === 302 && activeJarA.authCookieNames().length === 0,
        "Account A did not sign out before the fresh settings read.",
      );
      const signin = await appRequest("/api/auth/signin", {
        method: "POST",
        jar: activeJarA,
        formEntries: [
          ["email", accountA.email],
          ["password", accountA.password],
        ],
        signal: requestSignal(),
      });
      ensure(
        signin.status === 302 && activeJarA.authCookieNames().length > 0,
        "Account A could not establish a fresh login.",
      );
      const fresh = await readSettings(activeJarA);
      ensure(fresh.marginPercent === 5, "A fresh login did not read the saved 5% setting.");
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
          expectedUserId: accountAUserId,
          cleanupRequestSignal,
        });
        for (const id of trackedPrints) {
          const result = await appRequest(`/api/prints/${id}/delete`, {
            method: "POST",
            jar: activeJarA,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(result.status === 200 || result.status === 404, "Settings smoke could not clean up a print fixture.");
        }
        for (const id of trackedSpools) {
          const result = await appRequest(`/api/spools/${id}/delete`, {
            method: "POST",
            jar: activeJarA,
            formEntries: [],
            signal: cleanupRequestSignal(),
          });
          ensure(result.status === 200 || result.status === 404, "Settings smoke could not clean up a spool fixture.");
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      if (originalMarginPercent !== undefined) {
        await restoreCleanupSession({
          appRequest,
          jar: activeJarA,
          account: accountA,
          expectedUserId: accountAUserId,
          cleanupRequestSignal,
        });
        const current = await readSettings(activeJarA, cleanupRequestSignal());
        if (current.marginPercent !== originalMarginPercent) {
          await saveSettings(originalMarginPercent, current.version, cleanupRequestSignal());
        }
        const restored = await readSettings(activeJarA, cleanupRequestSignal());
        ensure(restored.marginPercent === originalMarginPercent, "Settings smoke did not restore the original margin.");
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
  }

  if (scenarioError && cleanupErrors.length > 0) {
    throw new AggregateError([scenarioError, ...cleanupErrors], "Account settings smoke scenario and cleanup failed.");
  }
  if (scenarioError) throw scenarioError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Account settings smoke cleanup failed.");
  }
}
