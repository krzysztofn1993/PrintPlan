import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* global AbortSignal, Headers, URL, setTimeout */

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PROJECT_ID = "settle-print-consumption";
const DEFAULT_PORTS = {
  "api.port": "54321",
  "db.port": "54322",
  "db.shadow_port": "54320",
  "db.pooler.enabled": "false",
  "db.pooler.port": "54329",
  "studio.port": "54323",
  "inbucket.port": "54324",
  "inbucket.smtp_port": "54325",
  "inbucket.pop3_port": "54326",
  "edge_runtime.inspector_port": "8083",
  "analytics.port": "54327",
};
const MATERIALS = ["PLA", "PETG", "ABS", "ASA", "TPU"];
const FIXTURE_EMAIL = "test@test.com";
const FIXTURE_PASSWORD = "develop";
const FIXTURE_COLOUR = "Black";
const FIXTURE_PRINT_NAME = (material) => `Fixture: ${material} print reserving 40 g`;
const FIXTURE_REQUIRED_GRAMS = 36;
const FIXTURE_RESERVED_GRAMS = 40;

const supabase = resolve(ROOT, "node_modules", ".bin", "supabase");
const astro = resolve(ROOT, "node_modules", ".bin", "astro");

function printUsage() {
  console.log(
    [
      "Usage: npm run dev:reset",
      "",
      "Stops this worktree's Astro server and Supabase project, resets only its local database,",
      "creates the local test account and stock/print fixture, then starts Astro on 0.0.0.0:4321.",
      "The database reset removes existing rows for the local settle-print-consumption project.",
    ].join("\n"),
  );
}

function redact(text) {
  return text
    .replace(
      /"(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|JWT_SECRET|PUBLISHABLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)"\s*:\s*"[^"]*"/gi,
      '"$1":"[redacted]"',
    )
    .replace(
      /\b(ANON_KEY|SERVICE_ROLE_KEY|SECRET_KEY|JWT_SECRET|PUBLISHABLE_KEY|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET)\s*=\s*[^\s,]+/gi,
      "$1=[redacted]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted JWT]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[redacted key]");
}

function run(command, args, label, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => rejectRun(new Error(`${label} could not start: ${error.message}`)));
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      const detail = redact(`${stderr}\n${stdout}`).trim().slice(-5_000);
      rejectRun(
        new Error(
          `${label} failed${signal ? ` (${signal})` : ` (exit ${code ?? "unknown"})`}${detail ? `:\n${detail}` : "."}`,
        ),
      );
    });
  });
}

function readTomlSetting(contents, section, key) {
  let currentSection = "";
  for (const line of contents.split(/\r?\n/)) {
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (header) {
      currentSection = header[1];
      continue;
    }
    if (currentSection !== section) continue;
    const setting = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*(?:#.*)?$`));
    if (setting) return setting[1].replace(/^(["'])(.*)\1$/, "$2");
  }
  return undefined;
}

async function validateProject() {
  const nodeVersion = process.version.slice(1);
  const expectedNodeVersion = (await readFile(resolve(ROOT, ".nvmrc"), "utf8")).trim().replace(/^v/, "");
  if (nodeVersion !== expectedNodeVersion) {
    throw new Error(`Use Node ${expectedNodeVersion} from .nvmrc; this process is using ${nodeVersion}.`);
  }

  const config = await readFile(resolve(ROOT, "supabase", "config.toml"), "utf8");
  const projectId = readTomlSetting(config, "", "project_id");
  if (projectId !== PROJECT_ID) {
    throw new Error(`Refusing to reset Supabase project ${projectId ?? "<missing>"}; expected ${PROJECT_ID}.`);
  }
  for (const [qualifiedName, expectedValue] of Object.entries(DEFAULT_PORTS)) {
    const separator = qualifiedName.lastIndexOf(".");
    const section = qualifiedName.slice(0, separator);
    const key = qualifiedName.slice(separator + 1);
    const actualValue = readTomlSetting(config, section, key);
    if (actualValue !== expectedValue) {
      throw new Error(
        `Refusing to start with a non-default port: ${qualifiedName} is ${actualValue ?? "unset"}; expected ${expectedValue}.`,
      );
    }
  }

  for (const executable of [supabase, astro]) {
    try {
      await access(executable);
    } catch {
      throw new Error("Local CLI binaries are missing. Run npm ci with the Node version from .nvmrc first.");
    }
  }

  await run("docker", ["info", "--format", "{{.ServerVersion}}"], "Docker preflight");
}

async function updateEnvFile(name, value) {
  const envPath = resolve(ROOT, ".env");
  let contents = "";
  try {
    contents = await readFile(envPath, "utf8");
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") throw error;
  }
  const newline = contents.includes("\r\n") ? "\r\n" : "\n";
  const lines = contents ? contents.split(/\r?\n/) : [];
  let written = false;
  const updated = [];
  for (const line of lines) {
    if (new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`).test(line)) {
      if (!written) updated.push(`${name}=${value}`);
      written = true;
    } else {
      updated.push(line);
    }
  }
  if (!written) updated.push(`${name}=${value}`);
  while (updated.length > 0 && updated.at(-1) === "") updated.pop();
  await writeFile(envPath, updated.join(newline) + newline);
}

async function localSupabaseStatus() {
  const { stdout } = await run(supabase, ["status", "--output", "json"], "Supabase status");
  let status;
  try {
    status = JSON.parse(stdout);
  } catch {
    throw new Error("Supabase returned unreadable local status JSON.");
  }

  const api = new URL(status.API_URL ?? "");
  const database = new URL(status.DB_URL ?? "");
  if (api.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(api.hostname) || api.port !== "54321") {
    throw new Error("Supabase status is not the expected local API on port 54321.");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) || database.port !== "54322") {
    throw new Error("Supabase status is not the expected local database on port 54322.");
  }
  for (const name of ["ANON_KEY", "SERVICE_ROLE_KEY"]) {
    if (typeof status[name] !== "string" || status[name].length === 0) {
      throw new Error(`Supabase status did not return a local ${name}.`);
    }
  }
  return { apiUrl: api.origin, anonKey: status.ANON_KEY, serviceRoleKey: status.SERVICE_ROLE_KEY };
}

async function requestJson({ baseUrl, path, apiKey, bearer, method = "GET", body, label }) {
  const url = new URL(path, baseUrl);
  const headers = new Headers({ apikey: apiKey, accept: "application/json" });
  if (bearer) headers.set("authorization", `Bearer ${bearer}`);
  if (body !== undefined) headers.set("content-type", "application/json");

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : "network error";
    throw new Error(`${label} could not reach local Supabase (${reason}).`, { cause: error });
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${label} returned unreadable JSON (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    const code =
      data && typeof data === "object"
        ? (data.code ?? data.error_code ?? data.error ?? "request_failed")
        : "request_failed";
    throw new Error(`${label} failed with HTTP ${response.status} (${String(code).slice(0, 100)}).`);
  }
  return data;
}

async function callRpc(config, accessToken, name, args) {
  return requestJson({
    baseUrl: config.apiUrl,
    path: `/rest/v1/rpc/${name}`,
    apiKey: config.anonKey,
    bearer: accessToken,
    method: "POST",
    body: args,
    label: `Local ${name} RPC`,
  });
}

async function listRows(config, accessToken, table, userId, columns) {
  const query = new URLSearchParams({ select: columns, user_id: `eq.${userId}` });
  return requestJson({
    baseUrl: config.apiUrl,
    path: `/rest/v1/${table}?${query}`,
    apiKey: config.anonKey,
    bearer: accessToken,
    label: `Local ${table} verification`,
  });
}

async function provisionFixture(config) {
  const user = await requestJson({
    baseUrl: config.apiUrl,
    path: "/auth/v1/admin/users",
    apiKey: config.anonKey,
    bearer: config.serviceRoleKey,
    method: "POST",
    body: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD, email_confirm: true },
    label: "Local test account creation",
  });
  if (typeof user?.id !== "string") throw new Error("The local test account response did not include an ID.");

  const session = await requestJson({
    baseUrl: config.apiUrl,
    path: "/auth/v1/token?grant_type=password",
    apiKey: config.anonKey,
    method: "POST",
    body: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD },
    label: "Local test account sign-in",
  });
  if (typeof session?.access_token !== "string" || session.user?.id !== user.id) {
    throw new Error("Local test account sign-in did not return its authenticated session.");
  }

  const spools = new Map();
  for (const material of MATERIALS) {
    for (const grams of [50, 100]) {
      const spool = await callRpc(config, session.access_token, "create_spool", {
        p_material: material,
        p_colour: FIXTURE_COLOUR,
        p_recorded_grams: grams,
      });
      if (typeof spool?.id !== "string") throw new Error(`The ${material} ${grams} g spool was not created.`);
      spools.set(`${material}:${grams}`, spool);
    }
  }

  const fixturePrints = [];
  for (const material of MATERIALS) {
    const print = await callRpc(config, session.access_token, "create_print", {
      p_name: FIXTURE_PRINT_NAME(material),
      p_material: material,
      p_colour: FIXTURE_COLOUR,
      p_required_grams: FIXTURE_REQUIRED_GRAMS,
    });
    if (typeof print?.id !== "string" || !Number.isInteger(print.version)) {
      throw new Error(`The ${material} planned-print fixture did not return a valid identity and version.`);
    }

    let reservation = null;
    if (material === "PLA") {
      const preview = await callRpc(config, session.access_token, "preview_print_reservation", {
        p_print_id: print.id,
      });
      const expectedSmallSpool = spools.get(`${material}:50`);
      if (
        preview?.marginPercent !== 10 ||
        preview?.reservationGrams !== FIXTURE_RESERVED_GRAMS ||
        preview?.suggestedSpoolId !== expectedSmallSpool?.id
      ) {
        throw new Error(`The ${material} reservation preview did not select its 50 g spool for a 40 g reservation.`);
      }

      reservation = await callRpc(config, session.access_token, "reserve_print_material", {
        p_request_id: randomUUID(),
        p_print_id: print.id,
        p_expected_version: print.version,
        p_spool_id: expectedSmallSpool.id,
        p_selection_mode: "best_fit",
      });
      if (reservation?.disposition !== "active" || typeof reservation.reservationId !== "string") {
        throw new Error(`The ${material} print reservation was not activated.`);
      }
    }
    fixturePrints.push({ material, print, reservation });
  }

  const [inventory, prints] = await Promise.all([
    listRows(
      config,
      session.access_token,
      "spool_inventory",
      user.id,
      "id,user_id,material,colour,recorded_grams,reserved_grams,available_grams",
    ),
    listRows(
      config,
      session.access_token,
      "planned_prints",
      user.id,
      "id,user_id,name,material,colour,required_grams,reservation_id,reservation_spool_id,reserved_grams",
    ),
  ]);

  if (!Array.isArray(inventory) || inventory.length !== MATERIALS.length * 2) {
    throw new Error("The local fixture does not contain exactly ten spool records.");
  }
  if (!Array.isArray(prints) || prints.length !== MATERIALS.length) {
    throw new Error("The local fixture does not contain exactly one planned print per material type.");
  }

  for (const material of MATERIALS) {
    const rows = inventory
      .filter((row) => row.material === material)
      .map((row) => Number(row.recorded_grams))
      .sort((a, b) => a - b);
    if (rows.length !== 2 || rows[0] !== 50 || rows[1] !== 100) {
      throw new Error(`The local fixture is missing the expected 50 g and 100 g ${material} spools.`);
    }
  }

  for (const material of MATERIALS) {
    const smallSpool = spools.get(`${material}:50`);
    const savedSpool = inventory.find((row) => row.id === smallSpool.id);
    const materialPrints = prints.filter((row) => row.material === material);
    const fixture = fixturePrints.find((entry) => entry.material === material);
    const savedPrint = materialPrints[0];
    const isReserved = material === "PLA";
    if (
      !savedSpool ||
      Number(savedSpool.reserved_grams) !== (isReserved ? FIXTURE_RESERVED_GRAMS : 0) ||
      Number(savedSpool.available_grams) !== (isReserved ? 10 : 50) ||
      materialPrints.length !== 1 ||
      savedPrint.id !== fixture.print.id ||
      savedPrint.name !== FIXTURE_PRINT_NAME(material) ||
      Number(savedPrint.required_grams) !== FIXTURE_REQUIRED_GRAMS ||
      savedPrint.reservation_id !== (isReserved ? fixture.reservation.reservationId : null) ||
      savedPrint.reservation_spool_id !== (isReserved ? smallSpool.id : null) ||
      (isReserved ? Number(savedPrint.reserved_grams) !== FIXTURE_RESERVED_GRAMS : savedPrint.reserved_grams !== null)
    ) {
      throw new Error(`The saved ${material} planned print or spool does not match the fixture reservation state.`);
    }
  }

  return { userId: user.id, prints: fixturePrints };
}

async function verifyPublishedPorts() {
  const { stdout } = await run("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"], "Docker port verification");
  const required = [
    ["supabase_kong_", "0.0.0.0:54321->8000/tcp"],
    ["supabase_db_", "0.0.0.0:54322->5432/tcp"],
    ["supabase_studio_", "0.0.0.0:54323->3000/tcp"],
    ["supabase_inbucket_", "0.0.0.0:54324->8025/tcp"],
    ["supabase_inbucket_", "0.0.0.0:54325->1025/tcp"],
    ["supabase_inbucket_", "0.0.0.0:54326->1110/tcp"],
    ["supabase_analytics_", "0.0.0.0:54327->4000/tcp"],
  ];
  for (const [namePrefix, binding] of required) {
    const row = stdout.split(/\r?\n/).find((line) => line.startsWith(`${namePrefix}${PROJECT_ID}\t`));
    if (!row?.includes(binding))
      throw new Error(`The ${namePrefix.slice("supabase_".length)} service is not bound on ${binding}.`);
  }
}

async function waitForApp() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4321/", {
        redirect: "manual",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status > 0) return response.status;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw new Error("Astro did not answer on local port 4321 after startup.");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }
  if (process.argv.length > 2) throw new Error("Unknown option. Use --help for usage.");

  await validateProject();
  console.log(`Stopping Astro and only Supabase project ${PROJECT_ID}…`);
  await run(astro, ["dev", "stop"], "Astro dev stop");
  await run(supabase, ["stop", "--project-id", PROJECT_ID], "Supabase project stop");

  console.log("Starting the local Supabase stack on its default ports…");
  await run(supabase, ["start"], "Supabase local start");
  await run(supabase, ["db", "reset", "--local", "--yes", "--no-seed"], "Local database reset");

  const config = await localSupabaseStatus();
  const authHealth = await fetch(new URL("/auth/v1/health", config.apiUrl), { signal: AbortSignal.timeout(10_000) });
  if (!authHealth.ok) throw new Error(`Local Supabase Auth health check failed with HTTP ${authHealth.status}.`);
  const mailpitHealth = await fetch("http://127.0.0.1:54324/", { signal: AbortSignal.timeout(10_000) });
  if (!mailpitHealth.ok) throw new Error(`Local Mailpit health check failed with HTTP ${mailpitHealth.status}.`);

  await updateEnvFile("SUPABASE_URL", config.apiUrl);
  await updateEnvFile("SUPABASE_KEY", config.anonKey);
  console.log("Creating ten spools and five planned-print fixtures with one active reservation…");
  const fixture = await provisionFixture(config);
  await verifyPublishedPorts();

  console.log("Starting Astro on 0.0.0.0:4321…");
  await run(astro, ["dev", "--host", "0.0.0.0", "--port", "4321", "--background"], "Astro dev start");
  const appStatus = await waitForApp();

  console.log("Local test environment is ready.");
  console.log("App: http://localhost:4321 (bound to 0.0.0.0)");
  console.log("Supabase Studio: http://localhost:54323");
  console.log("Mailpit: http://localhost:54324");
  console.log(`Login: ${FIXTURE_EMAIL} / ${FIXTURE_PASSWORD}`);
  console.log("Fixture: 10 spools (50 g and 100 g each for PLA, PETG, ABS, ASA and TPU).");
  console.log(
    "Fixture: one 36 g planned print per material; the PLA print reserves 40 g from its 50 g spool (10% margin).",
  );
  console.log(
    `Fixture user and print/reservation IDs: ${fixture.userId} / ${fixture.prints.map(({ material, print, reservation }) => `${material} ${print.id}${reservation ? `:${reservation.reservationId}` : ""}`).join(" / ")}`,
  );
  console.log(`Astro readiness check: HTTP ${appStatus}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? redact(error.message) : "Unexpected local reset failure.";
  console.error(`Local dev reset stopped: ${message}`);
  process.exitCode = 1;
});
