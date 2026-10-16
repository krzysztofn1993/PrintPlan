// Exercise owner serialization through independent PostgreSQL sessions with bounded cleanup.
/* global Buffer, setTimeout, clearTimeout */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const TIMEOUT_MS = 10_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args, input, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error("Database command failed (" + code + "): " + err.slice(-1_000)));
      else resolve(out.trim());
    });
    child.stdin.end(input);
  });
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const config = await readFile("supabase/config.toml", "utf8");
  const projectId = config.match(/^project_id\s*=\s*["']([a-zA-Z0-9_-]+)["']\s*$/m)?.[1];
  ensure(projectId, "Could not derive the local Supabase database container.");
  const container = "supabase_db_" + projectId;
  const owner = randomUUID();
  const otherOwner = randomUUID();
  const request = randomUUID();
  let fixtureCreated = false;

  const psql = (sql) =>
    run(
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
        "postgres",
        "-d",
        "postgres",
        "-At",
        "-f",
        "-",
      ],
      sql,
    );

  try {
    await psql(
      [
        "INSERT INTO auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) VALUES",
        "('" +
          owner +
          "','authenticated','authenticated','reservation-concurrency-a@example.test','',now(),now(),now()),",
        "('" +
          otherOwner +
          "','authenticated','authenticated','reservation-concurrency-b@example.test','',now(),now(),now());",
      ].join("\n"),
    );
    fixtureCreated = true;
    await psql(
      [
        "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='" + owner + "';",
        "SELECT public.create_spool('PLA','Black',150);",
        "SELECT public.create_print('Race','PLA','Black',80); COMMIT;",
        "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='" + otherOwner + "';",
        "SELECT public.create_print('Independent','PLA','Black',80); COMMIT;",
      ].join("\n"),
    );
    const rows = await psql(
      [
        "SELECT id FROM public.spools WHERE user_id='" + owner + "' AND material='PLA' AND colour='Black' LIMIT 1;",
        "SELECT id FROM public.prints WHERE user_id='" + owner + "' AND name='Race' LIMIT 1;",
        "SELECT id FROM public.prints WHERE user_id='" + otherOwner + "' AND name='Independent' LIMIT 1;",
      ].join("\n"),
    );
    const [spoolId, printId, otherPrintId] = rows.split(/\r?\n/);
    ensure(spoolId && printId && otherPrintId, "Concurrency fixtures were not created.");

    const holder = psql(
      [
        "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='" + owner + "';",
        "SELECT public.update_spool('" + spoolId + "','PLA','Black',150);",
        "SELECT pg_sleep(1.8); COMMIT;",
      ].join("\n"),
    );
    await sleep(250);
    const started = Date.now();
    const competitor = psql(
      [
        "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='" + owner + "';",
        "SELECT public.reserve_print_material('" +
          request +
          "','" +
          printId +
          "',1,'" +
          spoolId +
          "','best_fit'); COMMIT;",
      ].join("\n"),
    );
    const independentStarted = Date.now();
    await psql(
      [
        "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='" + otherOwner + "';",
        "SELECT public.update_print('" + otherPrintId + "',1,'Independent','PLA','Black',80); COMMIT;",
      ].join("\n"),
    );
    const independentElapsed = Date.now() - independentStarted;
    ensure(independentElapsed < 900, "An unrelated owner's mutation was serialized behind the first owner.");
    console.log("PASS  another owner's mutation proceeds while the first owner is locked");
    await competitor;
    const elapsed = Date.now() - started;
    await holder;
    ensure(elapsed >= 900, "A same-owner mutation did not wait for the outstanding owner lock.");
    console.log("PASS  same-owner reservation waited for the first transaction and used committed state");

    const state = await psql(
      [
        "SELECT recorded_grams::text || ':' || reserved_grams::text || ':' || available_grams::text",
        "FROM public.spool_inventory WHERE id='" + spoolId + "';",
      ].join("\n"),
    );
    ensure(state === "150:88:62", "Committed reservation totals were unexpected: " + state);
    console.log("PASS  reserved stock reconciles to 150 recorded, 88 reserved, and 62 available grams");
  } finally {
    if (fixtureCreated) {
      await psql("DELETE FROM auth.users WHERE id IN ('" + owner + "','" + otherOwner + "');");
    }
  }
}

main().catch((error) => {
  console.error(
    "Reservation concurrency check failed: " + (error instanceof Error ? error.message : "unexpected failure"),
  );
  process.exitCode = 1;
});
