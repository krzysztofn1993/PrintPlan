/* global Blob, FormData, Headers, Request, Response, URL */

import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthApiError,
  AuthInvalidCredentialsError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { createChunks, createServerClient, stringToBase64URL } from "@supabase/ssr";
import { createAuthCookieStore } from "../src/lib/auth-cookies.ts";
import { classifyAuthError, signOutPreservingCookies } from "../src/lib/auth-errors.ts";
import {
  readAuthFormData,
  validateSignInForm,
  validateSignInInput,
  validateSignUpForm,
  validateSignUpInput,
} from "../src/lib/auth-validation.ts";
import {
  applyAuthResponseHeaders,
  createAuthUnavailableResponse,
  isProtectedDashboardPath,
} from "../src/lib/auth-response.ts";

function formWith(entries) {
  const form = new FormData();
  for (const [name, value] of entries) form.append(name, value);
  return form;
}

test("signup rejects missing, repeated and non-string fields", () => {
  const missing = validateSignUpForm(new FormData());
  assert.deepEqual(Object.keys(missing.errors).sort(), ["confirmPassword", "email", "password"]);

  const missingConfirmation = validateSignUpForm(
    formWith([
      ["email", "person@example.com"],
      ["password", "long-enough"],
    ]),
  );
  assert.equal(missingConfirmation.errors.confirmPassword, "Please confirm your password");

  const repeatedEmail = formWith([
    ["email", "first@example.com"],
    ["email", "second@example.com"],
    ["password", "long-enough"],
    ["confirmPassword", "long-enough"],
  ]);
  assert.equal(validateSignUpForm(repeatedEmail).errors.email, "Email is required");

  const repeatedConfirmation = formWith([
    ["email", "person@example.com"],
    ["password", "long-enough"],
    ["confirmPassword", "long-enough"],
    ["confirmPassword", "longer-enough"],
  ]);
  assert.equal(validateSignUpForm(repeatedConfirmation).errors.confirmPassword, "Please confirm your password");

  const filePassword = formWith([
    ["email", "person@example.com"],
    ["password", new Blob(["secret"])],
    ["confirmPassword", "secret"],
  ]);
  assert.equal(validateSignUpForm(filePassword).errors.password, "Password is required");

  const fileEmail = formWith([
    ["email", new Blob(["person@example.com"])],
    ["password", "long-enough"],
    ["confirmPassword", "long-enough"],
  ]);
  assert.equal(validateSignUpForm(fileEmail).errors.email, "Email is required");

  const fileConfirmation = formWith([
    ["email", "person@example.com"],
    ["password", "long-enough"],
    ["confirmPassword", new Blob(["long-enough"])],
  ]);
  assert.equal(validateSignUpForm(fileConfirmation).errors.confirmPassword, "Please confirm your password");

  const repeatedPassword = formWith([
    ["email", "person@example.com"],
    ["password", "long-enough"],
    ["password", "another-password"],
    ["confirmPassword", "long-enough"],
  ]);
  assert.equal(validateSignUpForm(repeatedPassword).errors.password, "Password is required");
});

test("signup validates confirmation and the six-character boundary", () => {
  const mismatched = validateSignUpInput({
    email: "person@example.com",
    password: "secret",
    confirmPassword: "secrets",
  });
  assert.equal(mismatched.errors.confirmPassword, "Passwords do not match");

  const five = validateSignUpInput({
    email: "person@example.com",
    password: "12345",
    confirmPassword: "12345",
  });
  assert.equal(five.errors.password, "Password must be at least 6 characters");

  const six = validateSignUpInput({
    email: "person@example.com",
    password: "123456",
    confirmPassword: "123456",
  });
  assert.equal(six.errors.password, undefined);
  assert.equal(six.data.password, "123456");
});

test("password whitespace is preserved and signin accepts short nonempty passwords", () => {
  const signup = validateSignUpInput({
    email: "person@example.com",
    password: " pass ",
    confirmPassword: " pass ",
  });
  assert.equal(signup.data.password, " pass ");

  const signin = validateSignInInput({ email: "person@example.com", password: "x" });
  assert.equal(signin.data.password, "x");
  assert.equal(signin.errors.password, undefined);

  const invalidEmail = validateSignInForm(
    formWith([
      ["email", "not-an-email"],
      ["password", "x"],
    ]),
  );
  assert.equal(invalidEmail.errors.email, "Enter a valid email address");
});

test("unreadable auth form bodies are returned as form errors", async () => {
  const request = new Request("https://app.test/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "person@example.com" }),
  });
  assert.equal(await readAuthFormData(request), null);
});

test("auth failures distinguish invalid sessions from retryable outages", () => {
  assert.equal(classifyAuthError(new AuthSessionMissingError(), "session"), "missing-session");
  assert.equal(
    classifyAuthError(new AuthApiError("Invalid token", 401, "invalid_token"), "session"),
    "invalid-session",
  );
  assert.equal(classifyAuthError(new AuthInvalidCredentialsError("Rejected"), "credentials"), "rejected-credentials");
  assert.equal(classifyAuthError(new AuthRetryableFetchError("Network issue", 0), "session"), "unavailable");
  assert.equal(classifyAuthError(new AuthApiError("Provider issue", 503, "server_error"), "session"), "unavailable");
  assert.equal(classifyAuthError(new Error("network unavailable"), "session"), "unexpected");
});

test("protected path matching respects dashboard path segments", () => {
  assert.equal(isProtectedDashboardPath("/dashboard"), true);
  assert.equal(isProtectedDashboardPath("/dashboard/settings"), true);
  assert.equal(isProtectedDashboardPath("/dashboard-other"), false);
});

test("auth cookie overlay and checkpoint restore retain only accepted writes", () => {
  const cookies = createAuthCookieStore([
    { name: "session", value: "old" },
    { name: "keep", value: "yes" },
  ]);
  cookies.setAll([
    { name: "session", value: "fresh", options: { path: "/" } },
    { name: "keep", value: "", options: { path: "/", maxAge: 0 } },
  ]);
  const checkpoint = cookies.checkpoint();
  cookies.setAll([{ name: "session", value: "", options: { path: "/", maxAge: 0 } }]);
  assert.deepEqual(cookies.getAll(), []);
  cookies.restore(checkpoint);
  assert.deepEqual(cookies.getAll(), [{ name: "session", value: "fresh" }]);

  const committed = [];
  cookies.commit((name, value, options) => committed.push({ name, value, options }));
  assert.equal(
    committed.some((cookie) => cookie.options.maxAge === 0),
    true,
  );
  assert.equal(committed.at(-1).value, "");
});

test("auth outage responses are private 503s with a usable retry", async () => {
  const pageResponse = createAuthUnavailableResponse({ kind: "link", href: "/dashboard/settings" });
  assert.equal(pageResponse.status, 503);
  assert.match(pageResponse.headers.get("Cache-Control"), /private/);
  assert.match(pageResponse.headers.get("Cache-Control"), /no-store/);
  assert.match(await pageResponse.text(), /href="\/dashboard\/settings"/);

  const signoutResponse = createAuthUnavailableResponse({ kind: "signout" });
  assert.equal(signoutResponse.status, 503);
  assert.match(await signoutResponse.text(), /action="\/api\/auth\/signout"/);

  const confirmationResponse = createAuthUnavailableResponse({ kind: "reload" });
  assert.equal(confirmationResponse.status, 503);
  assert.match(await confirmationResponse.text(), /window\.location\.reload\(\)/);

  const accumulated = new Headers({ Expires: "0", Pragma: "no-cache" });
  const refreshedResponse = applyAuthResponseHeaders(new Response("ok"), accumulated);
  assert.equal(refreshedResponse.headers.get("Expires"), "0");
  assert.equal(refreshedResponse.headers.get("Pragma"), "no-cache");
});

const syntheticUser = {
  id: "contract-user",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
  email: "contract@example.test",
};

function makeAuthFixture({ signout = "success", refreshBeforeSignout = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const projectUrl = "https://project.supabase.co";
  const storageKey = "sb-project-auth-token";
  const initialSession = {
    access_token: `old-access-${"o".repeat(4000)}`,
    token_type: "bearer",
    expires_in: refreshBeforeSignout ? 20 : 3600,
    expires_at: now + (refreshBeforeSignout ? 20 : 3600),
    refresh_token: "old-refresh-token",
    user: syntheticUser,
  };
  const initialCookieValue = `base64-${stringToBase64URL(JSON.stringify(initialSession))}`;
  const initialCookies = createChunks(storageKey, initialCookieValue);
  const cookies = createAuthCookieStore(initialCookies);
  const responseHeaders = new Headers();
  const calls = [];

  const fetch = async (input) => {
    const url = new URL(input.toString());
    calls.push(`${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/token")) {
      const refreshedSession = {
        access_token: `fresh-access-${"n".repeat(4000)}`,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: `fresh-refresh-${"r".repeat(80)}`,
        user: syntheticUser,
      };
      return Response.json(refreshedSession);
    }
    if (url.pathname.endsWith("/user")) return Response.json(syntheticUser);
    if (url.pathname.endsWith("/logout")) {
      if (signout === "network") throw new TypeError("fetch failed");
      if (signout === "503") {
        return Response.json({ message: "temporary provider failure", code: "server_error" }, { status: 503 });
      }
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: "unexpected request" }, { status: 404 });
  };

  const client = createServerClient(projectUrl, "test-anon-key", {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (mutations, headers) => {
        cookies.setAll(mutations);
        Object.entries(headers).forEach(([name, value]) => responseHeaders.set(name, value));
      },
    },
    global: { fetch },
  });

  return { client, cookies, responseHeaders, calls, initialCookies };
}

for (const failureMode of ["503", "network"]) {
  test(`SDK signout ${failureMode} returns retryable 503 without cookie deletions`, async () => {
    const fixture = makeAuthFixture({ signout: failureMode });
    const { data, error } = await fixture.client.auth.getUser();
    assert.equal(error, null);
    assert.equal(data.user.email, syntheticUser.email);

    const result = await signOutPreservingCookies(fixture.client, fixture.cookies);
    assert.equal(result, "unavailable");
    assert.equal(
      fixture.calls.some((path) => path.startsWith("/auth/v1/logout?scope=global")),
      true,
    );

    const response = applyAuthResponseHeaders(
      createAuthUnavailableResponse({ kind: "signout" }),
      fixture.responseHeaders,
    );
    const emitted = [];
    fixture.cookies.commit((name, value, options) => emitted.push({ name, value, options }));
    assert.equal(response.status, 503);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    assert.match(await response.text(), /Retry sign out/);
    assert.equal(
      emitted.some((cookie) => cookie.options.maxAge === 0),
      false,
    );
  });
}

test("failed signout preserves middleware refresh chunks and privacy headers", async () => {
  const fixture = makeAuthFixture({ signout: "503", refreshBeforeSignout: true });
  const { data, error } = await fixture.client.auth.getUser();
  assert.equal(error, null);
  assert.equal(data.user.email, syntheticUser.email);
  assert.equal(
    fixture.calls.some((path) => path.startsWith("/auth/v1/token?grant_type=refresh_token")),
    true,
  );

  const refreshedCookies = fixture.cookies.getAll();
  assert.ok(refreshedCookies.some(({ name }) => name.startsWith("sb-project-auth-token.")));
  const checkpoint = fixture.cookies.checkpoint();
  assert.ok(checkpoint > 0);

  assert.equal(await signOutPreservingCookies(fixture.client, fixture.cookies), "unavailable");
  const response = applyAuthResponseHeaders(
    createAuthUnavailableResponse({ kind: "signout" }),
    fixture.responseHeaders,
  );
  const emitted = [];
  fixture.cookies.commit((name, value, options) => emitted.push({ name, value, options }));

  assert.equal(response.status, 503);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
  assert.ok(emitted.some(({ name }) => name.startsWith("sb-project-auth-token.")));
  assert.equal(
    emitted.some((cookie) => cookie.options.maxAge === 0),
    false,
  );
  assert.ok(
    emitted.every(
      (cookie) =>
        !fixture.initialCookies.some((initial) => initial.name === cookie.name && initial.value === cookie.value),
    ),
  );
});

test("successful global signout still emits cookie deletions", async () => {
  const fixture = makeAuthFixture();
  const { error } = await fixture.client.auth.getUser();
  assert.equal(error, null);

  assert.equal(await signOutPreservingCookies(fixture.client, fixture.cookies), "signed-out");
  const emitted = [];
  fixture.cookies.commit((name, value, options) => emitted.push({ name, value, options }));
  assert.equal(
    fixture.calls.some((path) => path.startsWith("/auth/v1/logout?scope=global")),
    true,
  );
  assert.ok(emitted.some((cookie) => cookie.options.maxAge === 0));
});
