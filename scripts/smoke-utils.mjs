// Shared local configuration, response, session, and REST helpers for product smoke modules.

/* global Buffer, FormData, Headers, URL */

import { readFile } from "node:fs/promises";

const REQUEST_LIMIT_MS = 10_000;

export function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

export async function smokeStep(name, run, subject = "Product") {
  try {
    const result = await run();
    console.log("PASS  " + name);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/https?:\/\/\S+/gi, "[url]") : "unexpected failure";
    console.error("FAIL  " + name + " — " + message);
    throw new Error(subject + " smoke stopped after a failed prerequisite", { cause: error });
  }
}

export function safeSmokeError(error) {
  if (error instanceof Error && error.message) {
    return error.message
      .replace(/https?:\/\/\S+/gi, "[url]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(/token_hash=[^&\s]+/gi, "token_hash=[redacted]");
  }
  return "Unexpected smoke failure";
}

function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]] = value;
  }
  return values;
}

async function readEnvFile(path) {
  try {
    return parseEnvFile(await readFile(path, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return {};
    throw new Error("Could not read local Supabase configuration file " + path, { cause: error });
  }
}

function keyIsAnonOrPublishable(key) {
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_")) return false;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return claims.role === "anon";
  } catch {
    return false;
  }
}

export async function readLocalSupabaseConfig() {
  const [devVars, dotenv] = await Promise.all([readEnvFile(".dev.vars"), readEnvFile(".env")]);
  const sources = [process.env, devVars, dotenv];
  const collect = (name) => [...new Set(sources.map((source) => source[name]).filter((value) => value))];
  const urls = collect("SUPABASE_URL");
  const keys = collect("SUPABASE_KEY");
  ensure(
    urls.length > 0 && keys.length > 0,
    "Local Supabase REST checks need SUPABASE_URL and SUPABASE_KEY in the environment, .dev.vars, or .env.",
  );
  ensure(urls.length === 1 && keys.length === 1, "Local Supabase credential files contain conflicting app settings.");

  let url;
  try {
    url = new URL(urls[0]);
  } catch {
    throw new Error("SUPABASE_URL is not a valid local URL.");
  }
  ensure(
    url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname),
    "Direct REST isolation checks require a local HTTP Supabase URL.",
  );
  ensure(!url.username && !url.password && !url.search && !url.hash, "SUPABASE_URL contains unsupported URL parts.");
  ensure(
    keyIsAnonOrPublishable(keys[0]),
    "SUPABASE_KEY must be a local anon or publishable key; service-role and secret keys are not accepted.",
  );
  return { url: url.origin, key: keys[0] };
}

export function assertPrivateHeaders(result, expectedType, subject = "Application") {
  const directives = new Set(
    (result.headers.get("cache-control") ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const directive of ["private", "no-cache", "no-store", "must-revalidate", "max-age=0"]) {
    ensure(directives.has(directive), subject + " response is missing a private cache-control directive.");
  }
  ensure(result.headers.get("expires") === "0", subject + " response is missing Expires: 0.");
  ensure(
    (result.headers.get("pragma") ?? "").toLowerCase() === "no-cache",
    subject + " response is missing Pragma: no-cache.",
  );
  if (expectedType === "json") {
    ensure(
      (result.headers.get("content-type") ?? "").toLowerCase().includes("application/json"),
      subject + " JSON response has an unexpected content type.",
    );
  }
}

export function readAppJson(result, subject = "Application") {
  try {
    return JSON.parse(result.body);
  } catch {
    throw new Error("The " + subject + " endpoint did not return readable JSON.");
  }
}

export function appFormData(entries) {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

export function sessionIdentity(jar, label) {
  const session = jar.session();
  const userId = session.user?.id;
  ensure(
    typeof userId === "string" && userId.length > 0,
    "The " + label + " session did not include an account identity.",
  );
  return { session, userId };
}

export function jwtExpiry(session, label) {
  const parts = session.access_token.split(".");
  ensure(parts.length === 3, "The " + label + " access token was not a JWT.");
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("The " + label + " access token did not contain readable claims.");
  }
  ensure(Number.isInteger(claims.exp), "The " + label + " access token did not contain an expiry.");
  return claims.exp;
}

export async function restRequest({ config, requestSignal, token, path, method, query = "", body, prefer }) {
  const url = new URL(path + (query ? "?" + query : ""), config.url);
  const headers = new Headers({
    apikey: config.key,
    Accept: "application/json",
  });
  if (typeof token === "string" && token.length > 0) headers.set("Authorization", "Bearer " + token);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (prefer) headers.set("Prefer", prefer);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: requestSignal(REQUEST_LIMIT_MS),
    });
  } catch (error) {
    const kind = error instanceof Error ? error.name : "network error";
    throw new Error("Local Supabase REST request failed (" + kind + "). Check that the local stack is running.", {
      cause: error,
    });
  }
  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Local Supabase REST returned an incompatible response.");
    }
  }
  return { status: response.status, ok: response.ok, data };
}

export async function restoreCleanupSession({ appRequest, jar, account, expectedUserId, cleanupRequestSignal }) {
  if (jar.authCookieNames().length > 0) {
    try {
      const refreshed = await appRequest("/dashboard", { jar, signal: cleanupRequestSignal() });
      if (refreshed.status === 200 && jar.authCookieNames().length > 0) {
        const identity = sessionIdentity(jar, "cleanup");
        ensure(identity.userId === expectedUserId, "The cleanup session belongs to a different account.");
        return identity.session;
      }
    } catch {
      // A cleared, expired, or revoked session is re-established below.
    }
  }

  const signin = await appRequest("/api/auth/signin", {
    method: "POST",
    jar,
    formEntries: [
      ["email", account.email],
      ["password", account.password],
    ],
    signal: cleanupRequestSignal(),
  });
  ensure(
    signin.status === 302 && jar.authCookieNames().length > 0,
    "The cleanup session could not sign in again within its reserved window.",
  );
  const identity = sessionIdentity(jar, "cleanup");
  ensure(identity.userId === expectedUserId, "The fresh cleanup session belongs to a different account.");
  return identity.session;
}

export function timestampInstant(value, label) {
  const instant = Date.parse(value);
  ensure(Number.isFinite(instant), label + " was not a valid timestamp.");
  return instant;
}
