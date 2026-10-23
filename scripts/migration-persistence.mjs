// Prove product, reservation, settings, and settlement migrations preserve committed rows in a disposable local database.

/* global Buffer, setTimeout, clearTimeout */

import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const PROJECT_CONFIG = "supabase/config.toml";
const MIGRATIONS_DIR = "supabase/migrations";
const KNOWN_MIGRATIONS = [
  "20261010000000_create_spools.sql",
  "20261012000000_create_prints.sql",
  "20261016000000_reserve_and_release_material.sql",
  "20261017000000_account_safety_margin.sql",
  "20261018000000_settle_print_consumption.sql",
  "20261019000000_preserve_margin_with_settlements.sql",
  "20261022000000_recalculate_reserved_print.sql",
];
const COMMAND_TIMEOUT_MS = 45_000;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, { input, timeoutMs = COMMAND_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let captured = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, timeoutMs);
    timer.unref();

    const collect = (target) => (chunk) => {
      captured += chunk.length;
      if (captured > MAX_CAPTURE_BYTES) {
        child.kill("SIGTERM");
        reject(new Error("A local database command exceeded the bounded output size."));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error("Could not start the local database command " + command + ".", { cause: error }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("The local database command exceeded its " + timeoutMs + " ms bound."));
        return;
      }
      resolve({ code, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
    child.stdin.end(input);
  });
}

async function checked(command, args, options, label) {
  const result = await run(command, args, options);
  ensure(result.code === 0, label + " failed (exit " + result.code + "). " + safeDiagnostic(result.stderr));
  return result.stdout;
}

function safeDiagnostic(stderr) {
  const useful = stderr
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(-4)
    .join(" ")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[database url]");
  return useful ? "Local database diagnostic: " + useful : "No diagnostic was returned.";
}

async function resolveContainer() {
  const config = await readFile(PROJECT_CONFIG, "utf8");
  const match = config.match(/^project_id\s*=\s*["']([a-zA-Z0-9_-]+)["']\s*$/m);
  ensure(match, "Could not derive the local Supabase project ID from " + PROJECT_CONFIG + ".");
  const projectId = match[1];
  const container = "supabase_db_" + projectId;
  const names = (await checked("docker", ["ps", "--format", "{{.Names}}"], {}, "Docker container discovery"))
    .split(/\r?\n/)
    .filter(Boolean);
  ensure(names.includes(container), "The local Supabase database container derived from config is not running.");
  return container;
}

async function psql(container, database, sql, { user = "postgres", label = "PostgreSQL command" } = {}) {
  return checked(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      database,
      "-At",
      "-f",
      "-",
    ],
    { input: sql },
    label,
  );
}

async function queryValue(container, database, sql, { user = "postgres", label = "PostgreSQL query" } = {}) {
  const result = await psql(container, database, sql, { user, label });
  return result.trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable(value[key])]),
    );
  }
  return value;
}

function parseJsonRows(output, label) {
  try {
    const rows = JSON.parse(output);
    ensure(Array.isArray(rows), label + " did not return a row array.");
    return rows;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(label + " returned unreadable row data.", { cause: error });
    throw error;
  }
}

function assertBaseline(rows, ids, ownerA, ownerB) {
  ensure(rows.length === 3, "The committed baseline did not contain exactly three spool rows.");
  const byId = new Map(rows.map((row) => [row.id, row]));
  ensure(byId.size === 3, "The committed baseline returned duplicate spool identifiers.");
  const expectedColumns = [
    "colour",
    "colour_key",
    "created_at",
    "id",
    "material",
    "recorded_grams",
    "updated_at",
    "user_id",
  ].sort();
  for (const row of rows) {
    ensure(
      JSON.stringify(Object.keys(row).sort()) === JSON.stringify(expectedColumns),
      "A baseline spool row was incomplete.",
    );
    ensure(
      Number.isFinite(Date.parse(row.created_at)) && Number.isFinite(Date.parse(row.updated_at)),
      "A baseline spool timestamp was invalid.",
    );
  }
  const corrected = byId.get(ids.corrected);
  const duplicate = byId.get(ids.duplicate);
  const ownedByB = byId.get(ids.ownerB);
  ensure(
    corrected?.user_id === ownerA && corrected.recorded_grams === 0,
    "The committed A correction to zero was missing.",
  );
  ensure(
    duplicate?.user_id === ownerA &&
      duplicate.material === "PLA" &&
      duplicate.colour === "Black / Red / Gold" &&
      duplicate.recorded_grams === 250,
    "The unchanged duplicate A spool did not match its committed values.",
  );
  ensure(
    ownedByB?.user_id === ownerB &&
      ownedByB.material === "PETG" &&
      ownedByB.colour === "Blue" &&
      ownedByB.recorded_grams === 80,
    "The B-owned spool did not match its committed values.",
  );
  ensure(
    corrected.colour_key === "black / red / gold",
    "The corrected spool did not have the generated canonical colour key.",
  );
  ensure(
    duplicate.colour_key === "black / red / gold",
    "The duplicate spool did not have the generated canonical colour key.",
  );
  ensure(ownedByB.colour_key === "blue", "The B spool did not have the generated canonical colour key.");
}

async function restrictedRows(container, database, ownerId, label) {
  const sql = [
    "BEGIN;",
    "SET LOCAL ROLE authenticated;",
    "SET LOCAL request.jwt.claim.sub = '" + ownerId + "';",
    "SELECT COALESCE(jsonb_agg(to_jsonb(spool) ORDER BY spool.id), '[]'::jsonb)::text",
    "FROM public.spools AS spool;",
    "COMMIT;",
  ].join("\n");
  return parseJsonRows(await queryValue(container, database, sql, { label }), label);
}

async function restrictedPrintRows(container, database, ownerId, label) {
  const sql = [
    "BEGIN;",
    "SET LOCAL ROLE authenticated;",
    "SET LOCAL request.jwt.claim.sub = '" + ownerId + "';",
    "SELECT COALESCE(jsonb_agg(to_jsonb(record) ORDER BY record.id), '[]'::jsonb)::text",
    "FROM public.prints AS record;",
    "COMMIT;",
  ].join("\n");
  return parseJsonRows(await queryValue(container, database, sql, { label }), label);
}

async function restrictedReservationRows(container, database, ownerId, label) {
  const sql = [
    "BEGIN;",
    "SET LOCAL ROLE authenticated;",
    "SET LOCAL request.jwt.claim.sub = '" + ownerId + "';",
    "SELECT COALESCE(jsonb_agg(to_jsonb(record) ORDER BY record.print_id), '[]'::jsonb)::text",
    "FROM public.print_reservations AS record WHERE record.user_id = auth.uid();",
    "COMMIT;",
  ].join("\n");
  return parseJsonRows(await queryValue(container, database, sql, { label }), label);
}

async function ownerQuery(container, database, ownerId, command, label) {
  const sql = [
    "BEGIN;",
    "SET LOCAL ROLE authenticated;",
    "SET LOCAL request.jwt.claim.sub = '" + ownerId + "';",
    command,
    "COMMIT;",
  ].join("\n");
  return queryValue(container, database, sql, { label });
}

async function restrictedPlannedPrintRows(container, database, ownerId, label) {
  const sql = [
    "BEGIN;",
    "SET LOCAL ROLE authenticated;",
    "SET LOCAL request.jwt.claim.sub = '" + ownerId + "';",
    "SELECT COALESCE(jsonb_agg(to_jsonb(record) ORDER BY record.id), '[]'::jsonb)::text",
    "FROM public.planned_prints AS record WHERE record.user_id = auth.uid();",
    "COMMIT;",
  ].join("\n");
  return parseJsonRows(await queryValue(container, database, sql, { label }), label);
}

async function ownerRequestRows(container, database, ownerId, label) {
  const sql =
    "SELECT COALESCE(jsonb_agg(to_jsonb(record) ORDER BY record.request_id), '[]'::jsonb)::text " +
    "FROM private.reservation_requests AS record WHERE record.user_id = '" +
    ownerId +
    "';";
  return parseJsonRows(await queryValue(container, database, sql, { label }), label);
}

async function expectReservationError(container, database, ownerId, call, message, label) {
  const command = [
    "DO $block$",
    "BEGIN",
    "  PERFORM " + call + ";",
    "  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'expected_error_not_raised';",
    "EXCEPTION WHEN SQLSTATE 'P0001' THEN",
    "  IF SQLERRM <> '" + message + "' THEN RAISE; END IF;",
    "END",
    "$block$;",
  ].join("\n");
  await ownerQuery(container, database, ownerId, command, label);
}

async function expectUnchangedReservationError(container, database, ownerId, call, message, label) {
  async function snapshot() {
    const [spools, prints, reservations, requests] = await Promise.all([
      restrictedRows(container, database, ownerId, label + " spool snapshot"),
      restrictedPrintRows(container, database, ownerId, label + " print snapshot"),
      restrictedReservationRows(container, database, ownerId, label + " reservation snapshot"),
      ownerRequestRows(container, database, ownerId, label + " request snapshot"),
    ]);
    return JSON.stringify(stable({ spools, prints, reservations, requests }));
  }

  const before = await snapshot();
  await expectReservationError(container, database, ownerId, call, message, label);
  ensure((await snapshot()) === before, label + " changed product rows, reservations, or request evidence.");
}

async function main() {
  const migrations = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
  ensure(
    JSON.stringify(migrations) === JSON.stringify(KNOWN_MIGRATIONS),
    "Migration inventory changed; extend the populated-upgrade scenario before running it.",
  );

  const container = await resolveContainer();
  const scratch = "printplan_persistence_" + process.pid + "_" + randomUUID().replaceAll("-", "").slice(0, 12);
  ensure(/^[a-z][a-z0-9_]{0,62}$/.test(scratch), "The generated scratch database name was invalid.");
  const collision = await queryValue(
    container,
    "postgres",
    "SELECT count(*) FROM pg_catalog.pg_database WHERE datname = '" + scratch + "';",
    { user: "supabase_admin", label: "Scratch database collision check" },
  );
  ensure(collision === "0", "The generated scratch database name already exists; refusing to reuse it.");

  let created = false;
  let scenarioError;
  let cleanupError;
  try {
    await psql(container, "postgres", "CREATE DATABASE " + scratch + " OWNER postgres;", {
      user: "supabase_admin",
      label: "Scratch database creation",
    });
    created = true;
    const canCreate = await queryValue(
      container,
      scratch,
      "SELECT has_schema_privilege('postgres', 'public', 'CREATE');",
      { label: "Scratch public schema permission check" },
    );
    ensure(canCreate === "t", "The postgres role cannot create objects in the scratch public schema.");

    const authSchema = await checked(
      "docker",
      [
        "exec",
        container,
        "pg_dump",
        "--schema-only",
        "--schema=auth",
        "--dbname=postgres",
        "--username=supabase_admin",
      ],
      {},
      "Native auth schema dump",
    );
    await psql(container, scratch, authSchema, {
      user: "supabase_admin",
      label: "Native auth schema restore",
    });

    for (const migration of KNOWN_MIGRATIONS.slice(0, 1)) {
      const sql = await readFile(MIGRATIONS_DIR + "/" + migration, "utf8");
      await psql(container, scratch, sql, { label: "Applying " + migration });
    }

    const rlsRoles = await queryValue(
      container,
      scratch,
      "SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls);",
      { label: "Restricted role bypass check" },
    );
    ensure(rlsRoles === "0", "The anon or authenticated role can bypass row-level security.");

    const ownerA = randomUUID();
    const ownerB = randomUUID();
    const identities = [ownerA, ownerB]
      .map(
        (id, index) =>
          "('" +
          id +
          "', 'authenticated', 'authenticated', 'upgrade-owner-" +
          (index + 1) +
          "@example.test', '', now(), now(), now())",
      )
      .join(",\n");
    await psql(
      container,
      scratch,
      [
        "INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)",
        "VALUES " + identities + ";",
      ].join("\n"),
      { label: "Auth identity bootstrap" },
    );

    const seedA = [
      "BEGIN;",
      "SET LOCAL ROLE authenticated;",
      "SET LOCAL request.jwt.claim.sub = '" + ownerA + "';",
      "INSERT INTO public.spools (user_id, material, colour, recorded_grams) VALUES",
      "  ('" + ownerA + "', 'pla', 'Black / Red / Gold', 200),",
      "  ('" + ownerA + "', 'pla', 'Black / Red / Gold', 250);",
      "UPDATE public.spools SET recorded_grams = 0",
      "WHERE user_id = auth.uid() AND material = 'PLA' AND colour = 'Black / Red / Gold' AND recorded_grams = 200;",
      "COMMIT;",
    ].join("\n");
    await psql(container, scratch, seedA, { label: "Committed owner A spool writes" });
    const seedB = [
      "BEGIN;",
      "SET LOCAL ROLE authenticated;",
      "SET LOCAL request.jwt.claim.sub = '" + ownerB + "';",
      "INSERT INTO public.spools (user_id, material, colour, recorded_grams)",
      "VALUES ('" + ownerB + "', 'petg', 'Blue', 80);",
      "COMMIT;",
    ].join("\n");
    await psql(container, scratch, seedB, { label: "Committed owner B spool write" });

    const baselineA = await restrictedRows(container, scratch, ownerA, "Owner A restricted baseline read");
    const baselineB = await restrictedRows(container, scratch, ownerB, "Owner B restricted baseline read");
    ensure(baselineA.length === 2 && baselineB.length === 1, "Restricted baseline reads did not enforce owner scope.");
    const baseline = [...baselineA, ...baselineB].sort((left, right) => left.id.localeCompare(right.id));
    const correctedRows = baselineA.filter((row) => row.recorded_grams === 0);
    const duplicateRows = baselineA.filter((row) => row.recorded_grams === 250);
    ensure(
      correctedRows.length === 1 && duplicateRows.length === 1,
      "Committed A spool fixtures were not uniquely identifiable.",
    );
    const ids = { corrected: correctedRows[0].id, duplicate: duplicateRows[0].id, ownerB: baselineB[0].id };
    assertBaseline(baseline, ids, ownerA, ownerB);
    console.log("PASS  committed restricted baseline contains duplicate A spools, a zero correction, and B's spool");

    const printMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[1], "utf8");
    await psql(container, scratch, "BEGIN;\n" + printMigration + "\nCOMMIT;\n", {
      label: "Transactional populated print migration",
    });
    const printSeed = [
      "BEGIN;",
      "SET LOCAL ROLE authenticated;",
      "SET LOCAL request.jwt.claim.sub = '" + ownerA + "';",
      "INSERT INTO public.prints (user_id,name,material,colour,required_grams) VALUES",
      "  ('" + ownerA + "','Upgrade print A','pla','Black / Red / Gold',80),",
      "  ('" + ownerA + "','Upgrade print B','pla','Black / Red / Gold',50),",
      "  ('" + ownerA + "','Upgrade print C','pla','Black / Red / Gold',80),",
      "  ('" + ownerA + "','Upgrade print D','pla','Black / Red / Gold',1),",
      "  ('" + ownerA + "','Upgrade print E','pla','Black / Red / Gold',20),",
      "  ('" + ownerA + "','Upgrade print F','pla','Black / Red / Gold',10),",
      "  ('" + ownerA + "','Upgrade print G','pla','Black / Red / Gold',10);",
      "COMMIT;",
    ].join("\n");
    await psql(container, scratch, printSeed, { label: "Committed print rows before reservation migration" });
    const printBaselineA = await restrictedPrintRows(container, scratch, ownerA, "Owner A committed print baseline");
    const printBaselineB = await restrictedPrintRows(container, scratch, ownerB, "Owner B committed print baseline");
    const printBaseline = [...printBaselineA, ...printBaselineB].sort((left, right) => left.id.localeCompare(right.id));
    ensure(printBaseline.length === 7, "Committed print baseline did not contain all seeded prints.");

    const reservationMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[2], "utf8");
    await psql(container, scratch, "BEGIN;\n" + reservationMigration + "\nCOMMIT;\n", {
      label: "Transactional populated reservation migration",
    });
    const printAfterA = await restrictedPrintRows(container, scratch, ownerA, "Owner A post-migration print read");
    const printAfterB = await restrictedPrintRows(container, scratch, ownerB, "Owner B post-migration print read");
    const printAfter = [...printAfterA, ...printAfterB].sort((left, right) => left.id.localeCompare(right.id));
    ensure(
      JSON.stringify(stable(printAfter)) === JSON.stringify(stable(printBaseline)),
      "The populated reservation migration altered committed print rows.",
    );
    const upgradePrintA = printBaselineA.find((row) => row.name === "Upgrade print A");
    const upgradePrintB = printBaselineA.find((row) => row.name === "Upgrade print B");
    const upgradePrintC = printBaselineA.find((row) => row.name === "Upgrade print C");
    const upgradePrintD = printBaselineA.find((row) => row.name === "Upgrade print D");
    const upgradePrintE = printBaselineA.find((row) => row.name === "Upgrade print E");
    const upgradePrintF = printBaselineA.find((row) => row.name === "Upgrade print F");
    const upgradePrintG = printBaselineA.find((row) => row.name === "Upgrade print G");
    ensure(
      upgradePrintA &&
        upgradePrintB &&
        upgradePrintC &&
        upgradePrintD &&
        upgradePrintE &&
        upgradePrintF &&
        upgradePrintG,
      "The populated reservation fixtures could not be identified by name.",
    );
    const requestA = randomUUID();
    const requestB = randomUUID();
    const requestD = randomUUID();
    const requestE = randomUUID();
    const requestF = randomUUID();
    const requestG = randomUUID();
    const reserveBeforeSettlementMigration = [
      "BEGIN;",
      "SET LOCAL ROLE authenticated;",
      "SET LOCAL request.jwt.claim.sub = '" + ownerA + "';",
      "SELECT public.reserve_print_material('" +
        requestA +
        "','" +
        upgradePrintA.id +
        "',1,'" +
        ids.duplicate +
        "','manual');",
      "SELECT public.reserve_print_material('" +
        requestB +
        "','" +
        upgradePrintB.id +
        "',1,'" +
        ids.duplicate +
        "','manual');",
      "SELECT public.reserve_print_material('" +
        requestD +
        "','" +
        upgradePrintD.id +
        "',1,'" +
        ids.duplicate +
        "','manual');",
      "SELECT public.reserve_print_material('" +
        requestE +
        "','" +
        upgradePrintE.id +
        "',1,'" +
        ids.duplicate +
        "','best_fit');",
      "SELECT public.reserve_print_material('" +
        requestF +
        "','" +
        upgradePrintF.id +
        "',1,'" +
        ids.duplicate +
        "','manual');",
      "SELECT public.reserve_print_material('" +
        requestG +
        "','" +
        upgradePrintG.id +
        "',1,'" +
        ids.duplicate +
        "','manual');",
      "COMMIT;",
    ].join("\n");
    await psql(container, scratch, reserveBeforeSettlementMigration, {
      label: "Committed authenticated reservations before settlement migration",
    });
    const preSettlementReservations = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Reservations before creating terminal upgrade evidence",
    );
    const reservationF = preSettlementReservations.find((row) => row.print_id === upgradePrintF.id);
    ensure(reservationF, "The legacy manual reservation selected for release is missing.");
    await ownerQuery(
      container,
      scratch,
      ownerA,
      "SELECT public.release_print_material('" + reservationF.id + "','" + upgradePrintF.id + "')::text;",
      "Create a terminal released legacy reservation before settlement migration",
    );
    await ownerQuery(
      container,
      scratch,
      ownerA,
      "SELECT public.delete_print('" + upgradePrintG.id + "')::text;",
      "Create a terminal deleted legacy reservation before settlement migration",
    );
    const settlementPrintBaseline = await restrictedPrintRows(
      container,
      scratch,
      ownerA,
      "Pre-settlement print snapshot",
    );
    const settlementReservationBaseline = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Pre-settlement reservation snapshot",
    );
    const settlementRequestBaseline = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Pre-settlement request evidence snapshot",
    );
    ensure(
      settlementReservationBaseline.length === 4 &&
        settlementRequestBaseline.length === 6 &&
        settlementRequestBaseline.filter((request) => request.state === "active").length === 4 &&
        settlementRequestBaseline.find((request) => request.request_id === requestF)?.state === "released" &&
        settlementRequestBaseline.find((request) => request.request_id === requestG)?.state === "deleted" &&
        [upgradePrintA, upgradePrintB, upgradePrintD].every(
          (print) =>
            settlementReservationBaseline.find((row) => row.print_id === print.id)?.selection_mode === "manual",
        ) &&
        settlementReservationBaseline.find((row) => row.print_id === upgradePrintE.id)?.selection_mode === "best_fit",
      "The pre-settlement snapshot did not contain active manual and best-fit rows plus released and deleted request evidence.",
    );

    const accountSettingsMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[3], "utf8");
    await psql(container, scratch, "BEGIN;\n" + accountSettingsMigration + "\nCOMMIT;\n", {
      label: "Transactional populated account settings migration",
    });

    const settlementMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[4], "utf8");
    await psql(container, scratch, "BEGIN;\n" + settlementMigration + "\nCOMMIT;\n", {
      label: "Transactional populated settlement migration",
    });
    const afterA = await restrictedRows(container, scratch, ownerA, "Owner A fresh restricted upgrade read");
    const afterB = await restrictedRows(container, scratch, ownerB, "Owner B fresh restricted upgrade read");
    const after = [...afterA, ...afterB].sort((left, right) => left.id.localeCompare(right.id));
    assertBaseline(after, ids, ownerA, ownerB);
    ensure(
      JSON.stringify(stable(after)) === JSON.stringify(stable(baseline)),
      "The populated reservation migration altered committed spool rows.",
    );
    const completionColumns = ["actual_grams", "settled_at", "settlement_id"];
    const settledPrintsAfterMigration = await restrictedPrintRows(
      container,
      scratch,
      ownerA,
      "Post-settlement migration print read",
    );
    const priorFieldsAfterMigration = settledPrintsAfterMigration.map((row) => {
      ensure(
        completionColumns.every((column) => Object.hasOwn(row, column) && row[column] === null),
        "An existing print received non-null completion fields during the additive migration.",
      );
      return Object.fromEntries(Object.entries(row).filter(([column]) => !completionColumns.includes(column)));
    });
    ensure(
      JSON.stringify(stable(priorFieldsAfterMigration)) === JSON.stringify(stable(settlementPrintBaseline)),
      "The settlement migration changed a prior print field, version, or timestamp.",
    );
    const settlementReservationsAfter = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Post-settlement migration reservation read",
    );
    ensure(
      JSON.stringify(stable(settlementReservationsAfter)) === JSON.stringify(stable(settlementReservationBaseline)),
      "The settlement migration altered committed active reservations.",
    );
    const settlementRequestsAfter = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Post-settlement migration request evidence read",
    );
    const legacyRequestFieldsAfter = settlementRequestsAfter.map(
      ({ expected_reservation_grams, ...request }) => request,
    );
    ensure(
      JSON.stringify(stable(legacyRequestFieldsAfter)) === JSON.stringify(stable(settlementRequestBaseline)) &&
        settlementRequestsAfter.every((request) => request.expected_reservation_grams === null),
      "The settlement migration altered committed request evidence or failed to preserve legacy requests without a witness.",
    );
    const plannedAfter = await restrictedPlannedPrintRows(
      container,
      scratch,
      ownerA,
      "Post-settlement migration planned print read",
    );
    ensure(
      plannedAfter.length === settlementPrintBaseline.length &&
        plannedAfter.every((row) => row.settlement_id === null && row.settled_at === null && row.actual_grams === null),
      "The planned print view did not append null completion fields to existing prints.",
    );
    console.log(
      "PASS  additive settlement migration preserves stock, print timestamps, active reservations, and request evidence",
    );

    const compatibilityMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[5], "utf8");
    await psql(container, scratch, "BEGIN;\n" + compatibilityMigration + "\nCOMMIT;\n", {
      label: "Transactional margin and settlement compatibility migration",
    });
    const obsoleteReservationRpc = await queryValue(
      container,
      scratch,
      "SELECT to_regprocedure('public.reserve_print_material(uuid,uuid,integer,uuid,text)') IS NULL;",
      { label: "Single reservation RPC signature after compatibility migration" },
    );
    ensure(obsoleteReservationRpc === "t", "The historical five-argument RPC overload remained executable.");
    console.log("PASS  compatibility migration keeps one witnessed reservation RPC and settlement-aware preview");

    const settlementReservationId = settlementReservationBaseline.find((row) => row.print_id === upgradePrintA.id)?.id;
    ensure(settlementReservationId, "The upgraded settlement fixture did not retain its active reservation identity.");
    const settlementCommand = [
      "BEGIN;",
      "SET LOCAL ROLE authenticated;",
      "SET LOCAL request.jwt.claim.sub = '" + ownerA + "';",
      "SELECT public.settle_print_consumption('" +
        randomUUID() +
        "','" +
        upgradePrintA.id +
        "',2,'" +
        settlementReservationId +
        "',75)::text;",
      "COMMIT;",
    ].join("\n");
    const settlementResult = JSON.parse(
      await queryValue(container, scratch, settlementCommand, { label: "Settlement against upgraded reservation" }),
    );
    ensure(
      settlementResult.replayed === false &&
        settlementResult.settlement.actualGrams === 75 &&
        settlementResult.settlement.spool.recordedGramsBefore === 250 &&
        settlementResult.settlement.spool.recordedGramsAfter === 175 &&
        settlementResult.settlement.spool.reservedGramsAfter === 79,
      "Settlement did not complete with the expected receipt on the upgraded reservation.",
    );
    const postSettlementRequests = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Post-settlement upgraded request evidence read",
    );
    ensure(
      postSettlementRequests.find((request) => request.request_id === requestA)?.state === "released" &&
        postSettlementRequests.find((request) => request.request_id === requestB)?.state === "active" &&
        postSettlementRequests.find((request) => request.request_id === requestD)?.state === "active",
      "Settlement did not terminalize only the consumed reservation request.",
    );
    console.log("PASS  settlement succeeds against an active reservation preserved through the populated upgrade");

    const settingsBeforeSave = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.get_account_settings()::text;",
        "Absent settings default after compatibility migration",
      ),
    );
    ensure(
      settingsBeforeSave.marginPercent === 10 && settingsBeforeSave.version === 0,
      "An account without a settings row did not retain the effective 10 percent default.",
    );
    const reservationsBeforeSettingsSave = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Active reservation before settings save",
    );
    const requestsBeforeSettingsSave = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Active request evidence before settings save",
    );
    const settingsSave = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.save_account_safety_margin(5,0)::text;",
        "Save the populated-upgrade account margin",
      ),
    );
    ensure(
      settingsSave.marginPercent === 5 && settingsSave.version === 1,
      "The populated-upgrade account could not save its first 5 percent setting.",
    );
    ensure(
      JSON.stringify(
        stable(await restrictedReservationRows(container, scratch, ownerA, "Reservation after settings save")),
      ) === JSON.stringify(stable(reservationsBeforeSettingsSave)) &&
        JSON.stringify(
          stable(await ownerRequestRows(container, scratch, ownerA, "Request evidence after settings save")),
        ) === JSON.stringify(stable(requestsBeforeSettingsSave)),
      "Saving a margin changed an existing reservation or its request evidence.",
    );
    const ownerBSettings = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerB,
        "SELECT public.get_account_settings()::text;",
        "Other owner's absent settings default",
      ),
    );
    ensure(
      ownerBSettings.marginPercent === 10 && ownerBSettings.version === 0,
      "Saving owner A's margin changed owner B's effective setting.",
    );

    const legacyReplay = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.reserve_print_material('" +
          requestB +
          "','" +
          upgradePrintB.id +
          "',1,'" +
          ids.duplicate +
          "','manual')::text;",
        "Replay active legacy request after changing settings",
      ),
    );
    ensure(
      legacyReplay.replayed === true &&
        legacyReplay.reservationId ===
          settlementReservationBaseline.find((row) => row.print_id === upgradePrintB.id)?.id,
      "An exact active legacy request did not replay after the settings change.",
    );
    const legacyReserveArgs = [
      "'" + requestB + "'",
      "'" + upgradePrintB.id + "'",
      "1",
      "'" + ids.duplicate + "'",
      "'manual'",
    ];
    for (const [label, index, value] of [
      ["changed print", 1, "'" + upgradePrintC.id + "'"],
      ["changed expected version", 2, "2"],
      ["changed spool", 3, "'" + ids.corrected + "'"],
      ["changed selection mode", 4, "'best_fit'"],
      ["added amount witness", 5, "55"],
    ]) {
      const changedArgs = [...legacyReserveArgs];
      changedArgs[index] = value;
      await expectUnchangedReservationError(
        container,
        scratch,
        ownerA,
        "public.reserve_print_material(" + changedArgs.join(",") + ")",
        "idempotency_conflict",
        "Legacy replay with " + label,
      );
    }
    console.log(
      "PASS  changed legacy payloads and a non-NULL witness conflict without changing product or request state",
    );
    await expectReservationError(
      container,
      scratch,
      ownerA,
      "public.reserve_print_material('70000000-0000-0000-0000-000000000003','" +
        upgradePrintC.id +
        "',1,'" +
        ids.duplicate +
        "','best_fit')",
      "reservation_preview_required",
      "Fresh witness-less reservation rejection after settlement migration",
    );

    const freshPreview = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.preview_print_reservation('" + upgradePrintC.id + "')::text;",
        "Current margin preview after settlement migration",
      ),
    );
    ensure(
      freshPreview.marginPercent === 5 && freshPreview.reservationGrams === 84,
      "The post-settlement preview did not preserve the saved 5 percent margin and 84 gram demand.",
    );
    const freshReservationRequestId = "70000000-0000-0000-0000-000000000004";
    const freshWitnessedReservation = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.reserve_print_material('" +
          freshReservationRequestId +
          "','" +
          upgradePrintC.id +
          "',1,'" +
          ids.duplicate +
          "','best_fit',84)::text;",
        "Fresh witnessed reservation after settlement migration",
      ),
    );
    const freshReservation = JSON.parse(
      await queryValue(
        container,
        scratch,
        "SELECT to_jsonb(reservation)::text FROM public.print_reservations AS reservation WHERE reservation.print_id = '" +
          upgradePrintC.id +
          "';",
        { label: "Fresh post-settlement reservation snapshot" },
      ),
    );
    ensure(
      freshWitnessedReservation.replayed === false &&
        freshReservation.reserved_grams === 84 &&
        freshReservation.margin_percent === 5,
      "A fresh post-settlement 80 gram reservation did not use the saved 5 percent margin and 84 gram demand.",
    );
    await expectReservationError(
      container,
      scratch,
      ownerA,
      "public.preview_print_reservation('" + upgradePrintA.id + "')",
      "print_settled",
      "Settled print preview remains unavailable",
    );
    await expectReservationError(
      container,
      scratch,
      ownerA,
      "public.reserve_print_material('70000000-0000-0000-0000-000000000005','" +
        upgradePrintA.id +
        "',2,'" +
        ids.duplicate +
        "','best_fit',84)",
      "print_settled",
      "Settled print cannot be reserved after settings migration",
    );
    console.log(
      "PASS  saved margins, legacy replay, witness enforcement, and settled-print guards survive both migrations",
    );

    const historicalRename = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.update_print('" +
          upgradePrintB.id +
          "',2,'Historically renamed reserved print','PLA','Black / Red / Gold',50)::text;",
        "Rename a reserved legacy print before S-05",
      ),
    );
    ensure(
      historicalRename.version === 3 && historicalRename.name === "Historically renamed reserved print",
      "The historical name-only edit did not advance the legacy print version before S-05.",
    );
    const printsBeforeRecalculationMigration = await restrictedPrintRows(
      container,
      scratch,
      ownerA,
      "Prints before recalculation migration",
    );
    const reservationsBeforeRecalculationMigration = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Reservations before recalculation migration",
    );
    const requestsBeforeRecalculationMigration = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Request evidence before recalculation migration",
    );
    const historicalRequestBefore = requestsBeforeRecalculationMigration.find(
      (request) => request.request_id === requestB,
    );
    const historicalReservationBefore = reservationsBeforeRecalculationMigration.find(
      (reservation) => reservation.print_id === upgradePrintB.id,
    );
    ensure(
      historicalRequestBefore?.expected_version === 1 &&
        historicalRequestBefore.expected_reservation_grams === null &&
        historicalReservationBefore?.id === legacyReplay.reservationId,
      "The pre-S-05 historical replay fixture did not retain its original command and reservation evidence.",
    );

    const recalculationMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[6], "utf8");
    await psql(container, scratch, "BEGIN;\n" + recalculationMigration + "\nCOMMIT;\n", {
      label: "Transactional populated reserved-print recalculation migration",
    });
    const releaseSignatures = await queryValue(
      container,
      scratch,
      "SELECT to_regprocedure('public.release_print_material(uuid,uuid)') IS NULL " +
        "AND to_regprocedure('public.release_print_material(uuid,uuid,integer)') IS NOT NULL;",
      { label: "Versioned release RPC signature after S-05 migration" },
    );
    ensure(releaseSignatures === "t", "The populated upgrade retained an unversioned release overload.");
    const printsAfterRecalculationMigration = await restrictedPrintRows(
      container,
      scratch,
      ownerA,
      "Prints after recalculation migration",
    );
    const reservationsAfterRecalculationMigration = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Reservations after recalculation migration",
    );
    const requestsAfterRecalculationMigration = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Request evidence after recalculation migration",
    );
    const priorRequestFieldsAfter = requestsAfterRecalculationMigration.map(
      ({ allocation_spool_id, recalculated_at, ...request }) => request,
    );
    ensure(
      JSON.stringify(stable(printsAfterRecalculationMigration)) ===
        JSON.stringify(stable(printsBeforeRecalculationMigration)) &&
        JSON.stringify(stable(reservationsAfterRecalculationMigration)) ===
          JSON.stringify(stable(reservationsBeforeRecalculationMigration)) &&
        JSON.stringify(stable(priorRequestFieldsAfter)) ===
          JSON.stringify(stable(requestsBeforeRecalculationMigration)),
      "The recalculation migration changed populated print, reservation, or original request fields.",
    );
    ensure(
      requestsAfterRecalculationMigration.every(
        (request) => request.allocation_spool_id === request.spool_id && request.recalculated_at === null,
      ) &&
        requestsAfterRecalculationMigration
          .filter((request) => request.request_id !== freshReservationRequestId)
          .every((request) => request.expected_reservation_grams === null) &&
        requestsAfterRecalculationMigration.find((request) => request.request_id === freshReservationRequestId)
          ?.expected_reservation_grams === 84 &&
        requestsAfterRecalculationMigration.find((request) => request.request_id === requestB)?.recalculated_at ===
          null &&
        requestsAfterRecalculationMigration.find((request) => request.request_id === requestF)?.state === "released" &&
        requestsAfterRecalculationMigration.find((request) => request.request_id === requestG)?.state === "deleted" &&
        "The populated upgrade did not backfill active and terminal current-spool evidence, preserve the fresh 84 gram witness, and initialize legacy recalculation markers, including the historically renamed print.",
    );
    const allocationEvidenceForeignKeys = await queryValue(
      container,
      scratch,
      "SELECT count(*) FROM pg_catalog.pg_constraint AS constraint_row " +
        "WHERE constraint_row.conrelid = 'private.reservation_requests'::regclass " +
        "AND constraint_row.contype = 'f' " +
        "AND pg_get_constraintdef(constraint_row.oid) ILIKE '%allocation_spool_id%';",
      { label: "Current allocation evidence foreign-key check" },
    );
    ensure(allocationEvidenceForeignKeys === "0", "Current-spool evidence received a spool foreign key.");

    const beforeLegacyReplay = JSON.stringify(
      stable({
        prints: printsAfterRecalculationMigration,
        reservations: reservationsAfterRecalculationMigration,
        requests: requestsAfterRecalculationMigration,
      }),
    );
    const upgradedLegacyReplay = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.reserve_print_material(" + legacyReserveArgs.join(",") + ")::text;",
        "Replay historically renamed legacy reservation after S-05 upgrade",
      ),
    );
    ensure(
      upgradedLegacyReplay.replayed === true && upgradedLegacyReplay.reservationId === legacyReplay.reservationId,
      "The exact legacy reserve replay did not survive the S-05 migration before recalculation.",
    );
    const afterLegacyReplay = JSON.stringify(
      stable({
        prints: await restrictedPrintRows(container, scratch, ownerA, "Prints after legacy replay"),
        reservations: await restrictedReservationRows(container, scratch, ownerA, "Reservations after legacy replay"),
        requests: await ownerRequestRows(container, scratch, ownerA, "Requests after legacy replay"),
      }),
    );
    ensure(afterLegacyReplay === beforeLegacyReplay, "The legacy replay changed populated product or request state.");

    const recalculatedLegacyEdit = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.update_print('" +
          upgradePrintB.id +
          "',3,'S-05 recalculated reserved print','PLA','Black / Red / Gold',50)::text;",
        "Recalculate the historically renamed reservation",
      ),
    );
    const reservationAfterLegacyEdit = (
      await restrictedReservationRows(container, scratch, ownerA, "Recalculated legacy reservation")
    ).find((reservation) => reservation.print_id === upgradePrintB.id);
    const requestAfterLegacyEdit = (
      await ownerRequestRows(container, scratch, ownerA, "Recalculated legacy request evidence")
    ).find((request) => request.request_id === requestB);
    const fingerprintFields = [
      "user_id",
      "request_id",
      "print_id",
      "spool_id",
      "expected_version",
      "selection_mode",
      "reservation_id",
      "created_at",
      "expected_reservation_grams",
    ];
    const fingerprintBefore = Object.fromEntries(
      fingerprintFields.map((field) => [field, historicalRequestBefore[field]]),
    );
    const fingerprintAfter = Object.fromEntries(
      fingerprintFields.map((field) => [field, requestAfterLegacyEdit?.[field]]),
    );
    ensure(
      recalculatedLegacyEdit.print.version === 4 &&
        recalculatedLegacyEdit.print.reservation?.id === legacyReplay.reservationId &&
        recalculatedLegacyEdit.print.reservation.reservedGrams === 53 &&
        recalculatedLegacyEdit.recalculation.outcome === "manual_retained" &&
        recalculatedLegacyEdit.recalculation.previousReservation.reservedGrams === 55 &&
        reservationAfterLegacyEdit?.created_at === historicalReservationBefore.created_at &&
        reservationAfterLegacyEdit?.reserved_grams === 53 &&
        requestAfterLegacyEdit?.allocation_spool_id === ids.duplicate &&
        typeof requestAfterLegacyEdit?.recalculated_at === "string" &&
        JSON.stringify(stable(fingerprintAfter)) === JSON.stringify(stable(fingerprintBefore)),
      "The first S-05 edit did not preserve reservation identity, age, and original command fingerprint while updating current evidence.",
    );
    await expectUnchangedReservationError(
      container,
      scratch,
      ownerA,
      "public.reserve_print_material(" + legacyReserveArgs.join(",") + ")",
      "reservation_request_completed",
      "Legacy replay after its first S-05 recalculation",
    );
    console.log(
      "PASS  populated upgrade backfills evidence, preserves renamed legacy replay, and supersedes it only after S-05 recalculation",
    );

    const releasedLegacy = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.release_print_material('" +
          legacyReplay.reservationId +
          "','" +
          upgradePrintB.id +
          "'," +
          recalculatedLegacyEdit.print.version +
          ")::text;",
        "Release the migrated legacy reservation",
      ),
    );
    ensure(releasedLegacy.disposition === "released", "The active legacy reservation was not released.");
    await expectUnchangedReservationError(
      container,
      scratch,
      ownerA,
      "public.reserve_print_material(" + legacyReserveArgs.join(",") + ")",
      "reservation_request_completed",
      "Legacy replay after explicit release",
    );
    for (const [print, requestId, label] of [
      [upgradePrintF, requestF, "released"],
      [upgradePrintG, requestG, "deleted"],
    ]) {
      await expectUnchangedReservationError(
        container,
        scratch,
        ownerA,
        "public.reserve_print_material('" + requestId + "','" + print.id + "',1,'" + ids.duplicate + "','manual')",
        "reservation_request_completed",
        "Legacy " + label + " terminal replay after S-05 migration",
      );
    }

    const deletedLegacy = JSON.parse(
      await ownerQuery(
        container,
        scratch,
        ownerA,
        "SELECT public.delete_print('" + upgradePrintD.id + "')::text;",
        "Delete a print with an active migrated legacy reservation",
      ),
    );
    ensure(
      deletedLegacy.releasedReservationId ===
        settlementReservationBaseline.find((row) => row.print_id === upgradePrintD.id)?.id &&
        deletedLegacy.releasedGrams === 2,
      "Deleting the legacy print did not release its original active reservation.",
    );
    await expectUnchangedReservationError(
      container,
      scratch,
      ownerA,
      "public.reserve_print_material('" + requestD + "','" + upgradePrintD.id + "',1,'" + ids.duplicate + "','manual')",
      "reservation_request_completed",
      "Legacy replay after deleting its reserved print",
    );
    const terminalLegacyRequests = await ownerRequestRows(
      container,
      scratch,
      ownerA,
      "Terminal legacy request evidence",
    );
    ensure(
      [
        [requestB, "released"],
        [requestD, "deleted"],
      ].every(([requestId, state]) =>
        terminalLegacyRequests.some(
          (request) =>
            request.request_id === requestId &&
            request.state === state &&
            request.expected_reservation_grams === null &&
            Number.isFinite(Date.parse(request.completed_at)),
        ),
      ),
      "Release and deletion did not retain completed legacy request identities with NULL witnesses.",
    );
    const remainingReservations = await restrictedReservationRows(
      container,
      scratch,
      ownerA,
      "Reservations after terminal legacy replay attempts",
    );
    const remainingPrints = await restrictedPrintRows(
      container,
      scratch,
      ownerA,
      "Prints after terminal legacy replay attempts",
    );
    ensure(
      remainingReservations.every(
        (reservation) => ![upgradePrintB.id, upgradePrintD.id].includes(reservation.print_id),
      ) && remainingPrints.every((print) => print.id !== upgradePrintD.id),
      "A terminal legacy replay recreated a reservation or its deleted print.",
    );
    console.log("PASS  released and deleted legacy requests cannot recreate reservations or change committed state");

    const hasPrints = await queryValue(container, scratch, "SELECT to_regclass('public.prints') IS NOT NULL;", {
      label: "Print table upgrade check",
    });
    ensure(hasPrints === "t", "The print migration did not add public.prints to the populated database.");
    console.log("PASS  fresh restricted connections confirm complete spool and print row preservation");
  } catch (error) {
    scenarioError = error;
  } finally {
    if (created && scratch !== "postgres" && /^printplan_persistence_[a-z0-9_]+$/.test(scratch)) {
      try {
        await psql(container, "postgres", "DROP DATABASE " + scratch + " WITH (FORCE);", {
          user: "supabase_admin",
          label: "Scratch database cleanup",
        });
        console.log("PASS  scratch database cleaned up");
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (scenarioError && cleanupError) {
    throw new Error("Populated migration check failed and scratch cleanup also failed.", {
      cause: new AggregateError([scenarioError, cleanupError]),
    });
  }
  if (scenarioError) throw scenarioError;
  if (cleanupError) throw cleanupError;
}

main().catch((error) => {
  console.error(
    "Migration persistence check failed: " + (error instanceof Error ? error.message : "unexpected failure"),
  );
  process.exitCode = 1;
});
