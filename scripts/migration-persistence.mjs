// Prove additive product and reservation migrations preserve committed rows in a disposable local database.

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
  "20261017000000_settle_print_consumption.sql",
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
      "  ('" + ownerA + "','Upgrade print B','pla','Black / Red / Gold',50);",
      "COMMIT;",
    ].join("\n");
    await psql(container, scratch, printSeed, { label: "Committed print rows before reservation migration" });
    const printBaselineA = await restrictedPrintRows(container, scratch, ownerA, "Owner A committed print baseline");
    const printBaselineB = await restrictedPrintRows(container, scratch, ownerB, "Owner B committed print baseline");
    const printBaseline = [...printBaselineA, ...printBaselineB].sort((left, right) => left.id.localeCompare(right.id));
    ensure(printBaseline.length === 2, "Committed print baseline did not contain both seeded prints.");

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
    ensure(upgradePrintA && upgradePrintB, "The populated reservation fixtures could not be identified by name.");
    const requestA = randomUUID();
    const requestB = randomUUID();
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
      "COMMIT;",
    ].join("\n");
    await psql(container, scratch, reserveBeforeSettlementMigration, {
      label: "Committed authenticated reservations before settlement migration",
    });
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
      settlementReservationBaseline.length === 2 &&
        settlementRequestBaseline.length === 2 &&
        settlementRequestBaseline.every((request) => request.state === "active"),
      "The pre-settlement snapshot did not contain both committed active reservations and their request evidence.",
    );

    const settlementMigration = await readFile(MIGRATIONS_DIR + "/" + KNOWN_MIGRATIONS[3], "utf8");
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
    ensure(
      JSON.stringify(stable(settlementRequestsAfter)) === JSON.stringify(stable(settlementRequestBaseline)),
      "The settlement migration altered committed reservation request evidence.",
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
        settlementResult.settlement.spool.reservedGramsAfter === 55,
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
        postSettlementRequests.find((request) => request.request_id === requestB)?.state === "active",
      "Settlement did not terminalize only the consumed reservation request.",
    );
    console.log("PASS  settlement succeeds against an active reservation preserved through the populated upgrade");
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
