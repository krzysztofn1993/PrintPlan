// Smoke test for the built app, Cloudflare adapter, Supabase Auth, and Mailpit.
// Run against a live preview: BASE_URL=http://localhost:4321 npm run smoke

/* global AbortSignal, Blob, Buffer, FormData, Headers, URL, setTimeout */

import { randomUUID } from "node:crypto";
import { runAccountSettingsSmoke } from "./account-settings-smoke.mjs";
import { runPrintSmoke } from "./print-smoke.mjs";
import { runReservationSmoke } from "./reservation-smoke.mjs";
import { runSettlementSmoke } from "./settlement-smoke.mjs";
import { runSpoolSmoke } from "./spool-smoke.mjs";
import { readLocalSupabaseAuthSiteOrigin, readLocalSupabaseConfig, safeSmokeError } from "./smoke-utils.mjs";

const APP_URL = new URL(process.env.BASE_URL ?? "http://localhost:4321");
const MAILPIT_URL = new URL(process.env.MAILPIT_URL ?? "http://127.0.0.1:54324");
const STARTED_AT = Date.now();
const TOTAL_LIMIT_MS = 300_000;
const CLEANUP_WINDOW_MS = 30_000;
let scenarioDeadlineAt = STARTED_AT + TOTAL_LIMIT_MS - CLEANUP_WINDOW_MS;
let cleanupDeadlineAt = STARTED_AT + TOTAL_LIMIT_MS;
const REFRESH_WAIT_LIMIT_MS = 180_000;
const MAIL_WAIT_LIMIT_MS = 30_000;
const REQUEST_LIMIT_MS = 10_000;
const APP_ORIGIN = APP_URL.origin;
const MAILPIT_ORIGIN = MAILPIT_URL.origin;
const PASSWORD = "Smoke-Test-Passw0rd!";
const COOKIE_PREFIX = "sb-";
const AUTH_COOKIE_SUFFIX = "-auth-token";

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function remainingMs() {
  const remaining = scenarioDeadlineAt - Date.now();
  ensure(remaining > 0, "The reserved smoke scenario window was exceeded");
  return remaining;
}

function requestSignal(limit = REQUEST_LIMIT_MS) {
  return AbortSignal.timeout(Math.max(1, Math.min(limit, remainingMs())));
}

function cleanupRequestSignal(limit = REQUEST_LIMIT_MS) {
  const remaining = cleanupDeadlineAt - Date.now();
  ensure(remaining > 0, "The reserved smoke cleanup window was exceeded");
  return AbortSignal.timeout(Math.max(1, Math.min(limit, remaining)));
}

function expireScenarioForCleanupProbe() {
  const now = Date.now();
  scenarioDeadlineAt = now - 1;
  cleanupDeadlineAt = Math.min(cleanupDeadlineAt, now + CLEANUP_WINDOW_MS);
  let scenarioError;
  try {
    requestSignal();
  } catch (error) {
    scenarioError = error;
  }
  ensure(
    scenarioError instanceof Error && scenarioError.message === "The reserved smoke scenario window was exceeded",
    "The cleanup timeout probe did not block ordinary scenario requests.",
  );
  ensure(!cleanupRequestSignal().aborted, "The cleanup timeout probe exhausted the cleanup window.");
  console.log("PASS  shared scenario deadline expired; ordinary requests blocked and cleanup window remains usable");
}

const safeError = safeSmokeError;

async function step(name, run) {
  try {
    const result = await run();
    console.log("PASS  " + name);
    return result;
  } catch (error) {
    console.error("FAIL  " + name + " — " + safeError(error));
    throw new Error("Smoke stopped after a failed prerequisite", { cause: error });
  }
}

function normalizeHeaders(rawHeaders = {}) {
  const headers = new Headers(rawHeaders);
  if (!headers.has("Accept")) headers.set("Accept", "text/html,application/json;q=0.9,*/*;q=0.8");
  return headers;
}

function assertSdkCacheHeaders(headers) {
  const directives = new Set(
    (headers.get("cache-control") ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const directive of ["private", "no-cache", "no-store", "must-revalidate", "max-age=0"]) {
    ensure(
      directives.has(directive),
      "A cookie-writing response is missing the SDK cache-control directive " + directive,
    );
  }
  ensure(headers.get("expires") === "0", "A cookie-writing response is missing Expires: 0");
  ensure(
    (headers.get("pragma") ?? "").toLowerCase() === "no-cache",
    "A cookie-writing response is missing Pragma: no-cache",
  );
}

function parseSetCookie(raw) {
  const [pair = "", ...rawAttributes] = raw.split(";");
  const separator = pair.indexOf("=");
  ensure(separator > 0, "The response contained a malformed Set-Cookie header");
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  const attributes = new Map();

  for (const rawAttribute of rawAttributes) {
    const attribute = rawAttribute.trim();
    if (!attribute) continue;
    const equals = attribute.indexOf("=");
    const key = (equals < 0 ? attribute : attribute.slice(0, equals)).trim().toLowerCase();
    const attributeValue = equals < 0 ? true : attribute.slice(equals + 1).trim();
    attributes.set(key, attributeValue);
  }

  const maxAge = Number(attributes.get("max-age"));
  const expiry = attributes.has("expires") ? Date.parse(String(attributes.get("expires"))) : NaN;
  const deleted = (Number.isFinite(maxAge) && maxAge <= 0) || (Number.isFinite(expiry) && expiry <= Date.now());

  return { name, value, attributes, deleted, raw };
}

class CookieJar {
  constructor(entries = []) {
    this.cookies = new Map(
      entries.map(([name, cookie]) => [name, { ...cookie, attributes: new Map(cookie.attributes) }]),
    );
    this.lastWrites = [];
  }

  clone() {
    return new CookieJar([...this.cookies.entries()]);
  }

  header() {
    return [...this.cookies.entries()].map(([name, cookie]) => name + "=" + cookie.value).join("; ");
  }

  apply(response) {
    ensure(
      typeof response.headers.getSetCookie === "function",
      "This Node runtime cannot preserve separate Set-Cookie headers",
    );
    const writes = response.headers.getSetCookie().map(parseSetCookie);
    for (const cookie of writes) {
      if (cookie.deleted) this.cookies.delete(cookie.name);
      else {
        this.cookies.set(cookie.name, {
          value: cookie.value,
          attributes: new Map(cookie.attributes),
          raw: cookie.raw,
        });
      }
    }
    this.lastWrites = writes;
    return writes;
  }

  authCookieNames() {
    return [...this.cookies.keys()].filter(
      (name) => name.startsWith(COOKIE_PREFIX) && new RegExp(AUTH_COOKIE_SUFFIX + "(?:\\.\\d+)?$").test(name),
    );
  }

  session() {
    const names = this.authCookieNames();
    ensure(names.length > 0, "No Supabase auth cookie was present");
    const bases = new Set(names.map((name) => name.replace(/\.\d+$/, "")));
    ensure(bases.size === 1, "More than one Supabase auth cookie group was present");
    const base = [...bases][0];
    const chunks = names
      .map((name) => ({
        name,
        index: name === base ? 0 : Number(name.slice(base.length + 1)),
        value: this.cookies.get(name).value,
      }))
      .sort((left, right) => left.index - right.index);
    const encoded = decodeURIComponent(chunks.map((chunk) => chunk.value).join(""));
    let session;
    try {
      if (encoded.startsWith("base64-")) {
        session = JSON.parse(Buffer.from(encoded.slice("base64-".length), "base64url").toString("utf8"));
      } else {
        session = JSON.parse(encoded);
      }
    } catch {
      throw new Error("The Supabase auth cookie did not contain a readable session");
    }
    ensure(
      session && typeof session.access_token === "string",
      "The Supabase auth cookie did not contain an access token",
    );
    ensure(
      typeof session.refresh_token === "string" && session.refresh_token.length > 0,
      "The Supabase auth cookie did not contain a refresh token",
    );
    return session;
  }
}

function assertDeletedCookies(result, expectedNames) {
  const deletedNames = new Set(result.cookieWrites.filter((cookie) => cookie.deleted).map((cookie) => cookie.name));
  for (const name of expectedNames) {
    ensure(deletedNames.has(name), "The response did not delete auth cookie " + name);
  }
}

function assertNoAuthCookies(jar, description) {
  ensure(jar.authCookieNames().length === 0, description);
}

function makeRecipient(label) {
  return "smoke-" + label + "-" + Date.now() + "-" + randomUUID().slice(0, 8) + "@example.com";
}

function formEncoded(entries) {
  const form = new URLSearchParams();
  for (const [name, value] of entries) form.append(name, value);
  return form.toString();
}

async function appRequest(path, options = {}) {
  ensure(path.startsWith("/") && !path.startsWith("//"), "The app request path must be local");
  const url = new URL(path, APP_URL);
  ensure(url.origin === APP_ORIGIN, "The app request escaped the configured app origin");

  const jar = options.jar ?? new CookieJar();
  const headers = normalizeHeaders(options.headers);
  headers.set("Origin", options.origin ?? APP_ORIGIN);
  if (jar.header()) headers.set("Cookie", jar.header());

  let body;
  if (options.formEntries) {
    body = formEncoded(options.formEntries);
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  } else if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    body = options.body;
    if (options.contentType) headers.set("Content-Type", options.contentType);
  }

  let response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body,
      redirect: "manual",
      signal: options.signal ?? requestSignal(),
    });
  } catch (error) {
    throw new Error("App request failed (" + (error instanceof Error ? error.name : "network error") + ")", {
      cause: error,
    });
  }

  const cookieWrites = jar.apply(response);
  if (cookieWrites.length > 0) assertSdkCacheHeaders(response.headers);
  let responseBody;
  try {
    responseBody = await response.text();
  } catch {
    throw new Error("The app response body could not be read");
  }

  return {
    status: response.status,
    headers: response.headers,
    body: responseBody,
    location: response.headers.get("location") ?? "",
    cookieWrites,
    jar,
  };
}

async function mailpitJson(path, query = {}) {
  const url = new URL(path, MAILPIT_URL);
  ensure(url.origin === MAILPIT_ORIGIN, "The Mailpit request escaped the configured Mailpit origin");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  let response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal: requestSignal() });
  } catch (error) {
    throw new Error("Mailpit request failed (" + (error instanceof Error ? error.name : "network error") + ")", {
      cause: error,
    });
  }
  ensure(response.ok, "Mailpit returned HTTP " + response.status + " for " + path);
  try {
    return await response.json();
  } catch {
    throw new Error("Mailpit returned an incompatible JSON response for " + path);
  }
}

function assertRedirect(result, expected) {
  ensure(result.status === 302, "Expected an HTTP 302 redirect");
  ensure(result.location.length > 0, "The response did not include a redirect destination");

  let destination;
  try {
    destination = new URL(result.location, APP_URL);
  } catch {
    throw new Error("The response contained an invalid redirect destination");
  }
  ensure(destination.origin === APP_ORIGIN, "The response redirected outside the configured app origin");
  ensure(destination.pathname === expected.path, "Expected redirect path " + expected.path);

  const required = expected.query ?? {};
  const allowed = new Set([...(expected.allowedQueryKeys ?? []), ...Object.keys(required)]);
  for (const [key, value] of Object.entries(required)) {
    const values = destination.searchParams.getAll(key);
    ensure(values.length === 1 && values[0] === value, "The redirect query did not contain the expected " + key);
  }
  for (const key of destination.searchParams.keys()) {
    ensure(allowed.has(key), "The redirect contained an unexpected query parameter");
  }
  for (const key of allowed) {
    if (!Object.hasOwn(required, key)) {
      ensure(destination.searchParams.getAll(key).length <= 1, "The redirect repeated a query parameter");
    }
  }
  ensure(destination.hash === "", "The redirect contained an unexpected fragment");
  return destination;
}

function assertHttpStatus(result, status) {
  ensure(result.status === status, "Expected HTTP " + status + " from the app");
}

function assertBodyContains(result, content, description) {
  ensure(result.body.includes(content), description);
}

function mailAddresses(message) {
  const recipients = message?.To ?? message?.to ?? [];
  if (!Array.isArray(recipients)) return [];
  return recipients
    .map((recipient) => recipient?.Address ?? recipient?.address)
    .filter((address) => typeof address === "string");
}

function messageId(message) {
  return message?.ID ?? message?.Id ?? message?.id ?? message?.MessageID ?? message?.messageId ?? null;
}

async function searchMail(recipient) {
  const result = await mailpitJson("/api/v1/search", { query: "to:" + recipient });
  ensure(result && Array.isArray(result.messages), "Mailpit search did not include a messages array");
  const matches = [];

  for (const summary of result.messages) {
    const id = messageId(summary);
    ensure(typeof id === "string" && id.length > 0, "Mailpit search returned a message without an ID");
    const detail = await mailpitJson("/api/v1/message/" + encodeURIComponent(id));
    if (mailAddresses(detail).includes(recipient)) matches.push(detail);
  }
  return matches;
}

function decodeHtmlEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code) => {
    if (code.toLowerCase() === "amp") return "&";
    if (code.toLowerCase() === "quot") return '"';
    if (code.toLowerCase() === "apos") return "'";
    if (code.toLowerCase() === "lt") return "<";
    if (code.toLowerCase() === "gt") return ">";
    const numeric =
      code[1].toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity;
  });
}

function confirmationUrlFromHtml(html, allowedOrigins) {
  const anchors = [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi)];
  for (const match of anchors) {
    const href = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "");
    let url;
    try {
      url = new URL(href, APP_URL);
    } catch {
      continue;
    }
    if (allowedOrigins.has(url.origin) && url.pathname === "/auth/confirm") return url;
  }
  throw new Error("The delivered email did not contain an app confirmation link");
}

function validateConfirmationUrl(url, allowedOrigins) {
  ensure(allowedOrigins.has(url.origin), "The confirmation link did not target a configured local callback origin");
  ensure(!url.username && !url.password, "The confirmation link contained URL credentials");
  ensure(url.pathname === "/auth/confirm", "The confirmation link did not target the confirmation endpoint");
  ensure(
    url.searchParams.getAll("type").length === 1 && url.searchParams.get("type") === "email",
    "The confirmation link did not use the email OTP type",
  );
  ensure(
    url.searchParams.getAll("token_hash").length === 1 && Boolean(url.searchParams.get("token_hash")),
    "The confirmation link did not include one token hash",
  );
  ensure(url.hash === "", "The confirmation link contained an unexpected fragment");
  return url;
}

async function waitForConfirmation(recipient, authSiteOrigin) {
  const allowedOrigins = new Set([APP_ORIGIN, authSiteOrigin]);
  const deadline = Math.min(Date.now() + MAIL_WAIT_LIMIT_MS, scenarioDeadlineAt);
  let lastCount = 0;

  while (Date.now() < deadline) {
    const matches = await searchMail(recipient);
    lastCount = matches.length;
    if (matches.length > 0) {
      const message = matches[0];
      const html = message?.HTML ?? message?.Html ?? message?.html;
      ensure(typeof html === "string" && html.length > 0, "The delivered Mailpit message did not include HTML");
      return validateConfirmationUrl(confirmationUrlFromHtml(html, allowedOrigins), allowedOrigins);
    }

    const wait = Math.min(500, deadline - Date.now(), remainingMs());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  throw new Error(
    "Mailpit did not receive the confirmation email within 30 seconds (matching messages: " + lastCount + ")",
  );
}

function assertJwtExpiry(session, label) {
  const parts = session.access_token.split(".");
  ensure(parts.length === 3, "The " + label + " access token was not a JWT");
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("The " + label + " access token did not contain readable JWT claims");
  }
  ensure(
    Number.isInteger(claims.exp) && Number.isInteger(claims.iat),
    "The " + label + " JWT did not include integer iat and exp claims",
  );
  const lifetime = claims.exp - claims.iat;
  ensure(
    lifetime >= 110 && lifetime <= 130,
    "The " + label + " JWT lifetime did not match the selected 120-second local setting",
  );
  return claims.exp;
}

function formData(entries) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

async function runSmoke() {
  ensure(["http:", "https:"].includes(APP_URL.protocol), "BASE_URL must use HTTP or HTTPS");
  ensure(
    !APP_URL.username && !APP_URL.password && APP_URL.pathname === "/" && !APP_URL.search && !APP_URL.hash,
    "BASE_URL must be an app origin without credentials, path, query, or fragment",
  );
  ensure(["http:", "https:"].includes(MAILPIT_URL.protocol), "MAILPIT_URL must use HTTP or HTTPS");
  ensure(!MAILPIT_URL.username && !MAILPIT_URL.password, "MAILPIT_URL must not contain credentials");
  ensure(
    process.versions.node === "24.21.0",
    "Run the smoke with the repository-pinned Node 24.21.0 version from .nvmrc",
  );
  ensure(
    typeof Headers.prototype.getSetCookie === "function",
    "Use Node 24.21.0 from .nvmrc to preserve separate Set-Cookie headers",
  );
  const localSupabase = await readLocalSupabaseConfig();
  const authSiteOrigin = await readLocalSupabaseAuthSiteOrigin();
  const cleanupProbe = process.env.PRINTPLAN_SMOKE_CLEANUP_PROBE;
  ensure(
    cleanupProbe === undefined ||
      ["spool-timeout", "spool-post-signout", "print-timeout", "print-post-signout"].includes(cleanupProbe),
    "PRINTPLAN_SMOKE_CLEANUP_PROBE must identify spool or print and timeout or post-signout",
  );

  await step("local preview responds", async () => {
    const redirect = await appRequest("/");
    assertRedirect(redirect, { path: "/auth/signin" });

    const response = await appRequest(redirect.location);
    assertHttpStatus(response, 200);
    assertBodyContains(response, "<html", "The preview did not render an HTML page");
  });

  await step("Mailpit v1 JSON API is available", async () => {
    const info = await mailpitJson("/api/v1/info");
    ensure(
      info && typeof info.Version === "string" && info.Version.length > 0,
      "Mailpit info did not include a version",
    );
    const search = await mailpitJson("/api/v1/search", { query: "to:probe@example.com" });
    ensure(search && Array.isArray(search.messages), "Mailpit search did not include a messages array");
    ensure(
      ["count", "messages_count", "total"].some((key) => Number.isInteger(search[key])),
      "Mailpit search did not include a message count",
    );
  });

  await step("anonymous dashboard access redirects to sign in", async () => {
    const result = await appRequest("/dashboard", { jar: new CookieJar() });
    assertRedirect(result, { path: "/auth/signin" });
  });

  const malformedCases = [
    {
      name: "missing signup confirmation is rejected",
      entries: [
        ["email", makeRecipient("missing-confirmation")],
        ["password", PASSWORD],
      ],
    },
    {
      name: "mismatched signup passwords are rejected",
      entries: [
        ["email", makeRecipient("mismatched-password")],
        ["password", PASSWORD],
        ["confirmPassword", PASSWORD + "-different"],
      ],
    },
    {
      name: "non-string signup password is rejected",
      formData: formData([
        ["email", makeRecipient("non-string")],
        ["password", new Blob([PASSWORD])],
        ["confirmPassword", PASSWORD],
      ]),
    },
    {
      name: "invalid signup email is rejected",
      entries: [
        ["email", "not-an-email"],
        ["password", PASSWORD],
        ["confirmPassword", PASSWORD],
      ],
    },
  ];

  for (const malformed of malformedCases) {
    await step(malformed.name, async () => {
      const jar = new CookieJar();
      const result = await appRequest("/api/auth/signup", {
        method: "POST",
        jar,
        formEntries: malformed.entries,
        formData: malformed.formData,
      });
      assertRedirect(result, { path: "/auth/signup", query: { error: "validation" }, allowedQueryKeys: ["fields"] });
      assertNoAuthCookies(jar, "A rejected signup unexpectedly established an auth session");
    });
  }

  await step("malformed signup requests do not send confirmation email", async () => {
    const addresses = malformedCases
      .filter((item) => item.entries && item.entries[0][1] !== "not-an-email")
      .map((item) => item.entries[0][1]);
    addresses.push(malformedCases.find((item) => item.formData)?.formData.get("email"));
    for (const address of addresses) {
      ensure(typeof address === "string", "The malformed signup fixture did not have a string recipient");
      ensure((await searchMail(address)).length === 0, "A rejected signup unexpectedly sent a confirmation email");
    }
  });

  await step("missing confirmation type is rejected", async () => {
    const result = await appRequest("/auth/confirm?token_hash=missing-type-token", { jar: new CookieJar() });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "invalid" } });
  });

  await step("unsupported confirmation type is rejected without establishing a session", async () => {
    const jar = new CookieJar();
    const result = await appRequest("/auth/confirm?token_hash=unsupported-type-token&type=recovery", { jar });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "invalid" } });
    assertNoAuthCookies(jar, "An unsupported confirmation type unexpectedly established an auth session");

    const dashboard = await appRequest("/dashboard", { jar });
    assertRedirect(dashboard, { path: "/auth/signin" });
  });

  await step("missing confirmation token is rejected", async () => {
    const result = await appRequest("/auth/confirm?type=email", { jar: new CookieJar() });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "invalid" } });
  });

  await step("malformed confirmation token is rejected", async () => {
    const result = await appRequest("/auth/confirm?token_hash=not-a-valid-token&type=email", { jar: new CookieJar() });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "invalid" } });
    const resultPage = await appRequest(result.location, { jar: new CookieJar() });
    assertHttpStatus(resultPage, 200);
    assertBodyContains(
      resultPage,
      "This confirmation link is no longer valid",
      "The invalid-link result message was missing",
    );
  });

  const accountA = {
    email: makeRecipient("account-a"),
    password: PASSWORD,
  };
  const signupJarA = new CookieJar();

  await step("account A signup returns pending confirmation", async () => {
    const result = await appRequest("/api/auth/signup", {
      method: "POST",
      jar: signupJarA,
      formEntries: [
        ["email", accountA.email],
        ["password", accountA.password],
        ["confirmPassword", accountA.password],
      ],
    });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "pending" } });
    assertNoAuthCookies(signupJarA, "A pending signup unexpectedly created a session");
  });

  await step("pending signup page explains email confirmation", async () => {
    const page = await appRequest("/auth/confirm-email?status=pending", { jar: signupJarA });
    assertHttpStatus(page, 200);
    assertBodyContains(page, "Check your email", "The pending signup heading was missing");
    assertBodyContains(page, "If an account can be created", "The pending signup explanation was missing");
  });

  await step("unconfirmed account A cannot access protected pages", async () => {
    const result = await appRequest("/dashboard", { jar: signupJarA.clone() });
    assertRedirect(result, { path: "/auth/signin" });
  });

  const preconfirmationJarA = new CookieJar();
  await step("correct password is denied before account A confirmation", async () => {
    const result = await appRequest("/api/auth/signin", {
      method: "POST",
      jar: preconfirmationJarA,
      formEntries: [
        ["email", accountA.email],
        ["password", accountA.password],
      ],
    });
    assertRedirect(result, { path: "/auth/signin", query: { error: "signin-failed" } });
    assertNoAuthCookies(preconfirmationJarA, "Unconfirmed password signin unexpectedly established a session");
    const protectedPage = await appRequest("/dashboard", { jar: preconfirmationJarA });
    assertRedirect(protectedPage, { path: "/auth/signin" });
  });

  const deliveredLinkA = await step("Mailpit receives account A confirmation", () =>
    waitForConfirmation(accountA.email, authSiteOrigin),
  );
  const callbackJarA = new CookieJar();
  await step("account A confirmation callback establishes a fresh session", async () => {
    const result = await appRequest(deliveredLinkA.pathname + deliveredLinkA.search, { jar: callbackJarA });
    assertRedirect(result, { path: "/" });
    ensure(result.cookieWrites.length > 0, "The successful confirmation callback did not set session cookies");
    const dashboard = await appRequest("/dashboard", { jar: callbackJarA });
    assertHttpStatus(dashboard, 200);
    assertBodyContains(dashboard, accountA.email, "The dashboard did not show account A identity after confirmation");
  });

  await step("consumed account A confirmation link cannot establish another session", async () => {
    const replayJar = new CookieJar();
    const result = await appRequest(deliveredLinkA.pathname + deliveredLinkA.search, { jar: replayJar });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "invalid" } });
    assertNoAuthCookies(replayJar, "A consumed confirmation link established a new session");
  });

  await step("consumed confirmation result page explains the invalid link", async () => {
    const page = await appRequest("/auth/confirm-email?status=invalid", { jar: new CookieJar() });
    assertHttpStatus(page, 200);
    assertBodyContains(page, "This confirmation link is no longer valid", "The consumed-link message was missing");
    assertBodyContains(page, "Go to sign in", "The invalid-link page did not offer sign in");
  });

  const confirmedWrongPasswordJar = new CookieJar();
  await step("wrong password for confirmed account A is rejected independently", async () => {
    const result = await appRequest("/api/auth/signin", {
      method: "POST",
      jar: confirmedWrongPasswordJar,
      formEntries: [
        ["email", accountA.email],
        ["password", "Definitely-Wrong-Password!"],
      ],
    });
    assertRedirect(result, { path: "/auth/signin", query: { error: "signin-failed" } });
    assertNoAuthCookies(confirmedWrongPasswordJar, "Wrong-password signin unexpectedly established a session");
    const protectedPage = await appRequest("/dashboard", { jar: confirmedWrongPasswordJar });
    assertRedirect(protectedPage, { path: "/auth/signin" });
  });

  const accountB = {
    email: makeRecipient("account-b"),
    password: PASSWORD,
  };
  const signupJarB = new CookieJar();

  await step("account B signup returns pending confirmation", async () => {
    const result = await appRequest("/api/auth/signup", {
      method: "POST",
      jar: signupJarB,
      formEntries: [
        ["email", accountB.email],
        ["password", accountB.password],
        ["confirmPassword", accountB.password],
      ],
    });
    assertRedirect(result, { path: "/auth/confirm-email", query: { status: "pending" } });
    assertNoAuthCookies(signupJarB, "A pending signup unexpectedly created a session");
  });

  const deliveredLinkB = await step("Mailpit receives account B confirmation", () =>
    waitForConfirmation(accountB.email, authSiteOrigin),
  );
  const callbackJarB = new CookieJar();
  await step("account B confirmation callback establishes a fresh session", async () => {
    const result = await appRequest(deliveredLinkB.pathname + deliveredLinkB.search, { jar: callbackJarB });
    assertRedirect(result, { path: "/" });
    ensure(result.cookieWrites.length > 0, "The successful confirmation callback did not set session cookies");
    const dashboard = await appRequest("/dashboard", { jar: callbackJarB });
    assertHttpStatus(dashboard, 200);
    assertBodyContains(dashboard, accountB.email, "The dashboard did not show account B identity after confirmation");
  });

  const activeJarA = new CookieJar();
  await step("account A can sign in from an empty cookie jar", async () => {
    const result = await appRequest("/api/auth/signin", {
      method: "POST",
      jar: activeJarA,
      formEntries: [
        ["email", accountA.email],
        ["password", accountA.password],
      ],
    });
    assertRedirect(result, { path: "/" });
    ensure(result.cookieWrites.length > 0, "Successful password signin did not set session cookies");
    const firstPage = await appRequest("/dashboard", { jar: activeJarA });
    assertHttpStatus(firstPage, 200);
    assertBodyContains(firstPage, accountA.email, "The dashboard did not show account A identity after signin");
    const repeatedPage = await appRequest("/dashboard", { jar: activeJarA });
    assertHttpStatus(repeatedPage, 200);
    assertBodyContains(repeatedPage, accountA.email, "Account A identity did not persist across repeated requests");
  });

  const activeJarB = new CookieJar();
  await step("account B can sign in from a separate empty cookie jar", async () => {
    const result = await appRequest("/api/auth/signin", {
      method: "POST",
      jar: activeJarB,
      formEntries: [
        ["email", accountB.email],
        ["password", accountB.password],
      ],
    });
    assertRedirect(result, { path: "/" });
    ensure(result.cookieWrites.length > 0, "Successful password signin did not set session cookies");
    const dashboard = await appRequest("/dashboard", { jar: activeJarB });
    assertHttpStatus(dashboard, 200);
    assertBodyContains(dashboard, accountB.email, "The dashboard did not show account B identity after signin");
  });

  await runSpoolSmoke({
    config: localSupabase,
    appRequest,
    CookieJar,
    accountA,
    accountB,
    activeJarA,
    activeJarB,
    requestSignal,
    cleanupRequestSignal,
    expireScenarioForCleanupProbe,
    cleanupProbe: cleanupProbe?.startsWith("spool-") ? cleanupProbe.slice("spool-".length) : undefined,
  });

  await runPrintSmoke({
    config: localSupabase,
    appRequest,
    CookieJar,
    accountA,
    accountB,
    activeJarA,
    activeJarB,
    requestSignal,
    cleanupRequestSignal,
    expireScenarioForCleanupProbe,
    cleanupProbe: cleanupProbe?.startsWith("print-") ? cleanupProbe.slice("print-".length) : undefined,
  });

  await runReservationSmoke({
    config: localSupabase,
    appRequest,
    accountA,
    accountB,
    activeJarA,
    activeJarB,
    requestSignal,
    cleanupRequestSignal,
  });

  await runAccountSettingsSmoke({
    config: localSupabase,
    appRequest,
    CookieJar,
    accountA,
    accountB,
    activeJarA,
    activeJarB,
    requestSignal,
    cleanupRequestSignal,
  });

  await runSettlementSmoke({
    config: localSupabase,
    appRequest,
    CookieJar,
    accountA,
    accountB,
    activeJarA,
    activeJarB,
    requestSignal,
    cleanupRequestSignal,
  });

  const sessionA = activeJarA.session();
  const sessionB = activeJarB.session();
  const expiryA = assertJwtExpiry(sessionA, "account A");
  const expiryB = assertJwtExpiry(sessionB, "account B");
  const replayJarB = activeJarB.clone();
  const accountBCookieNames = activeJarB.authCookieNames();
  ensure(accountBCookieNames.length > 0, "Account B did not have auth cookie chunks to preserve");

  await step("both fresh JWT expiry windows match local Auth configuration", async () => {
    ensure(expiryA > Math.floor(Date.now() / 1000), "Account A access token was not valid before signout");
    ensure(expiryB > Math.floor(Date.now() / 1000), "Account B access token was not valid before signout");
  });

  await step("account B signout revokes its session and deletes cookie chunks", async () => {
    const result = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarB });
    assertRedirect(result, { path: "/" });
    assertDeletedCookies(result, accountBCookieNames);
    assertNoAuthCookies(activeJarB, "Successful signout left account B auth cookies in its jar");
  });

  const expiryDeadline = Math.max(expiryA, expiryB) * 1000 + 2000;
  const refreshWaitStarted = Date.now();
  const requiredWaitMs = expiryDeadline - Date.now();
  ensure(
    requiredWaitMs <= REFRESH_WAIT_LIMIT_MS,
    "Fresh account tokens would exceed the 180-second refresh wait limit",
  );
  await step("wait until both access tokens expire without authenticated requests", async () => {
    while (Date.now() < expiryDeadline) {
      const remaining = expiryDeadline - Date.now();
      const wait = Math.min(1000, remaining, REFRESH_WAIT_LIMIT_MS - (Date.now() - refreshWaitStarted), remainingMs());
      ensure(wait > 0, "The 180-second refresh wait limit was exceeded");
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  });

  const oldAccessTokenA = sessionA.access_token;
  const oldRefreshTokenA = sessionA.refresh_token;

  await step("expired account A session refreshes and rotates cookie tokens", async () => {
    const result = await appRequest("/dashboard", { jar: activeJarA });
    assertHttpStatus(result, 200);
    assertBodyContains(result, accountA.email, "The dashboard did not show account A after token refresh");
    ensure(result.cookieWrites.length > 0, "Expired-session refresh did not write rotated cookies");
    const refreshed = activeJarA.session();
    ensure(refreshed.access_token !== oldAccessTokenA, "The access token did not change after refresh");
    ensure(refreshed.refresh_token !== oldRefreshTokenA, "The refresh token did not rotate");
    const refreshedExpiry = assertJwtExpiry(refreshed, "refreshed account A");
    ensure(refreshedExpiry > expiryA, "The refreshed access token did not have a future expiry");
    ensure(activeJarA.authCookieNames().length > 0, "The refreshed session lost its auth cookie chunks");
  });

  await step("refreshed account A session persists across a subsequent request", async () => {
    const result = await appRequest("/dashboard", { jar: activeJarA });
    assertHttpStatus(result, 200);
    assertBodyContains(result, accountA.email, "The refreshed dashboard identity did not persist");
  });

  await step("revoked account B refresh is rejected and auth chunks are deleted", async () => {
    const result = await appRequest("/dashboard", { jar: replayJarB });
    assertRedirect(result, { path: "/auth/signin" });
    assertDeletedCookies(result, accountBCookieNames);
    assertNoAuthCookies(replayJarB, "The revoked account B replay retained auth cookies");
  });

  const accountACookieNames = activeJarA.authCookieNames();
  await step("account A signout deletes its rotated session and denies later access", async () => {
    const signout = await appRequest("/api/auth/signout", { method: "POST", jar: activeJarA });
    assertRedirect(signout, { path: "/" });
    assertDeletedCookies(signout, accountACookieNames);
    assertNoAuthCookies(activeJarA, "Successful signout left account A auth cookies in its jar");

    const afterSignout = await appRequest("/dashboard", { jar: activeJarA });
    assertRedirect(afterSignout, { path: "/auth/signin" });
  });

  ensure(Date.now() - STARTED_AT < TOTAL_LIMIT_MS, "The 300-second total run limit was exceeded");
  console.log("\nAll auth smoke steps passed");
}

try {
  await runSmoke();
} catch (error) {
  console.error("Smoke failed: " + safeError(error));
  process.exitCode = 1;
}
