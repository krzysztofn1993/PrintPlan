import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensure, readLocalSupabaseConfig } from "../../../scripts/smoke-utils.mjs";

export interface LocalTestAccount {
  userId: string;
  email: string;
  password: string;
  supabaseUrl: string;
}

export const AUTH_DIRECTORY = path.resolve("playwright/.auth");
export const CREDENTIALS_FILE = path.join(AUTH_DIRECTORY, "credentials.json");
export const STORAGE_STATE_FILE = path.join(AUTH_DIRECTORY, "user.json");
export const FIXTURE_LEDGER_FILE = path.join(AUTH_DIRECTORY, "fixtures.json");

const GENERATED_EMAIL_PREFIX = "printplan-e2e-";
const GENERATED_EMAIL_SUFFIX = "@example.test";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCliEnvironment(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z_]+)=(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function localAdminConfiguration() {
  const app = await readLocalSupabaseConfig();
  let statusOutput: string;
  try {
    statusOutput = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15_000,
    });
  } catch {
    throw new Error("Local Supabase status is unavailable; browser fixtures were not provisioned.");
  }

  const local = parseCliEnvironment(statusOutput);
  let localUrl: URL;
  const apiUrl = local.API_URL;
  if (typeof apiUrl !== "string") {
    throw new Error("Supabase CLI did not report a local API URL; browser fixtures were not provisioned.");
  }
  try {
    localUrl = new URL(apiUrl);
  } catch {
    throw new Error("Supabase CLI did not report a local API URL; browser fixtures were not provisioned.");
  }

  ensure(
    localUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(localUrl.hostname),
    "Account provisioning requires the Supabase CLI to target local HTTP Supabase.",
  );
  ensure(localUrl.origin === app.url, "App and provisioning settings target different Supabase instances.");
  ensure(
    typeof local.SERVICE_ROLE_KEY === "string" && local.SERVICE_ROLE_KEY.length > 0,
    "Local Supabase did not provide an account-provisioning key.",
  );

  return { url: app.url, key: local.SERVICE_ROLE_KEY };
}

function adminHeaders(key: string): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

function validateGeneratedAccount(account: LocalTestAccount, localUrl: string): void {
  ensure(account.supabaseUrl === localUrl, "The saved browser account belongs to a different Supabase instance.");
  ensure(UUID_PATTERN.test(account.userId), "The saved browser account identifier is invalid.");
  ensure(
    account.email.startsWith(GENERATED_EMAIL_PREFIX) && account.email.endsWith(GENERATED_EMAIL_SUFFIX),
    "Refusing to clean up an account that is not an E2E-generated account.",
  );
  ensure(account.password.length >= 24, "The saved browser account credentials are incomplete.");
}

export async function writeCredentials(account: LocalTestAccount): Promise<void> {
  await mkdir(AUTH_DIRECTORY, { recursive: true, mode: 0o700 });
  await writeFile(CREDENTIALS_FILE, `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 });
}

export async function readCredentials(): Promise<LocalTestAccount> {
  let account: LocalTestAccount;
  try {
    account = JSON.parse(await readFile(CREDENTIALS_FILE, "utf8")) as LocalTestAccount;
  } catch {
    throw new Error("Private browser account credentials are unavailable; rerun the E2E setup.");
  }
  const local = await readLocalSupabaseConfig();
  validateGeneratedAccount(account, local.url);
  return account;
}

export async function createLocalTestAccount(): Promise<LocalTestAccount> {
  const local = await localAdminConfiguration();
  const account = {
    userId: "",
    email: `${GENERATED_EMAIL_PREFIX}${randomUUID()}${GENERATED_EMAIL_SUFFIX}`,
    password: randomBytes(36).toString("base64url"),
    supabaseUrl: local.url,
  };

  let response: Response;
  try {
    response = await fetch(new URL("/auth/v1/admin/users", local.url), {
      method: "POST",
      headers: adminHeaders(local.key),
      body: JSON.stringify({ email: account.email, password: account.password, email_confirm: true }),
    });
  } catch {
    throw new Error("Local Supabase account provisioning request failed.");
  }
  if (!response.ok) {
    throw new Error(`Local Supabase account provisioning failed with status ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Local Supabase account provisioning returned unreadable data.");
  }
  const userId = typeof payload === "object" && payload !== null && "id" in payload ? payload.id : undefined;
  if (typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    throw new Error("Local Supabase did not return a valid generated account ID.");
  }

  const created = { ...account, userId };
  validateGeneratedAccount(created, local.url);
  try {
    await writeCredentials(created);
  } catch (error) {
    try {
      await deleteLocalTestAccount(created);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Could not save E2E credentials and account cleanup failed.", {
        cause: cleanupError,
      });
    }
    throw new Error("Could not save private E2E account credentials.", { cause: error });
  }
  return created;
}

export async function deleteLocalTestAccount(account: LocalTestAccount): Promise<void> {
  const local = await localAdminConfiguration();
  validateGeneratedAccount(account, local.url);

  let response: Response;
  try {
    response = await fetch(new URL(`/auth/v1/admin/users/${account.userId}`, local.url), {
      method: "DELETE",
      headers: adminHeaders(local.key),
    });
  } catch {
    throw new Error("Local Supabase account cleanup request failed.");
  }
  ensure(
    response.ok || response.status === 404,
    `Local Supabase account cleanup failed with status ${response.status}.`,
  );
}

export async function removePrivateAuthFiles(): Promise<void> {
  await rm(AUTH_DIRECTORY, { recursive: true, force: true });
}

export async function cleanPreviousGeneratedAccount(): Promise<void> {
  let contents: string;
  try {
    contents = await readFile(CREDENTIALS_FILE, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw new Error("Could not read prior private browser account credentials.", { cause: error });
  }

  let account: LocalTestAccount;
  try {
    account = JSON.parse(contents) as LocalTestAccount;
  } catch {
    throw new Error("Prior private browser account credentials are unreadable; no database cleanup was attempted.");
  }
  await deleteLocalTestAccount(account);
  await removePrivateAuthFiles();
}
