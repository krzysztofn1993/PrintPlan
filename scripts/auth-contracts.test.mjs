/* global Blob, FormData, Headers, Request, Response, URL */

import assert from "node:assert/strict";
import test from "node:test";
import { runWithControlledTime } from "./test-support/controlled-time.mjs";
import {
  AuthApiError,
  AuthInvalidCredentialsError,
  AuthInvalidJwtError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
import { createChunks, createServerClient, parseCookieHeader, stringToBase64URL } from "@supabase/ssr";
import { createAuthMiddleware } from "../src/lib/auth-middleware.ts";
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
  assert.equal(classifyAuthError(new AuthInvalidJwtError("Invalid JWT"), "session"), "invalid-session");
  for (const operation of ["session", "credentials", "signout"]) {
    assert.equal(
      classifyAuthError(new AuthApiError("Rate limited", 429, "over_request_rate_limit"), operation),
      "unavailable",
    );
  }
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
  const signoutBody = await signoutResponse.text();
  assert.match(signoutBody, /We couldn't sign you out/);
  assert.match(signoutBody, /Your session may still be active/);
  assert.match(signoutBody, /action="\/api\/auth\/signout"/);
  assert.match(signoutBody, /Retry sign out/);
  assert.match(signoutBody, /<style>/);

  const confirmationResponse = createAuthUnavailableResponse({ kind: "reload" });
  assert.equal(confirmationResponse.status, 503);
  assert.match(await confirmationResponse.text(), /window\.location\.reload\(\)/);

  const accumulated = new Headers({ Expires: "0", Pragma: "no-cache" });
  const refreshedResponse = applyAuthResponseHeaders(new Response("ok"), accumulated);
  assert.equal(refreshedResponse.headers.get("Expires"), "0");
  assert.equal(refreshedResponse.headers.get("Pragma"), "no-cache");
});

test("finalized auth responses retain the full SDK cookie cache-header contract", () => {
  const sdkHeaders = new Headers({
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  });
  const response = applyAuthResponseHeaders(
    new Response(null, { status: 302, headers: { Location: "/" } }),
    sdkHeaders,
  );

  assert.equal(response.headers.get("Cache-Control"), "private, no-cache, no-store, must-revalidate, max-age=0");
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
});

const syntheticUser = {
  id: "contract-user",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
  email: "contract@example.test",
};

function makeAuthFixture({
  signout = "success",
  refreshBeforeSignout = false,
  expired = false,
  lookup = "success",
  refresh = "success",
  incomingCookies,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const projectUrl = "https://project.supabase.co";
  const storageKey = "sb-project-auth-token";
  const initialSession = {
    access_token: `old-access-${"o".repeat(4000)}`,
    token_type: "bearer",
    expires_in: refreshBeforeSignout ? 20 : 3600,
    expires_at: now + (expired ? -3600 : refreshBeforeSignout ? 20 : 3600),
    refresh_token: "old-refresh-token",
    user: syntheticUser,
  };
  const initialCookieValue = `base64-${stringToBase64URL(JSON.stringify(initialSession))}`;
  const initialCookies = incomingCookies ?? createChunks(storageKey, initialCookieValue);
  const cookies = createAuthCookieStore(initialCookies);
  const responseHeaders = new Headers();
  const calls = [];

  const fetch = async (input) => {
    const url = new URL(input.toString());
    calls.push(`${url.pathname}${url.search}`);
    const mode = url.pathname.endsWith("/token") ? refresh : url.pathname.endsWith("/user") ? lookup : "success";
    if (mode === "network") throw new TypeError("fetch failed");
    if (mode !== "success") {
      const status = Number(mode);
      return Response.json(
        { message: "Private provider failure", code: status === 400 ? "refresh_token_not_found" : "server_error" },
        { status },
      );
    }
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

  const createClient = (store, headers) =>
    createServerClient(projectUrl, "test-anon-key", {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (mutations, sdkHeaders) => {
          store.setAll(mutations);
          Object.entries(sdkHeaders).forEach(([name, value]) => headers.set(name, value));
        },
      },
      global: { fetch },
    });

  const client = createClient(cookies, responseHeaders);
  return { client, createClient, cookies, responseHeaders, calls, initialCookies };
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

function middlewareRequest(fixture, { path = "/dashboard/settings", method = "GET" } = {}) {
  const emitted = [];
  const request = new Request(`https://app.test${path}`, {
    method,
    headers: { Cookie: fixture.initialCookies.map(({ name, value }) => `${name}=${value}`).join("; ") },
  });
  const context = {
    request,
    url: new URL(request.url),
    locals: {},
    cookies: { set: (name, value, options) => emitted.push({ name, value, options }) },
    redirect: (location) => new Response(null, { status: 302, headers: { Location: location } }),
  };
  let nextCalls = 0;
  const handler = createAuthMiddleware(fixture.createClient, (headers) =>
    parseCookieHeader(headers.get("Cookie") ?? ""),
  );
  return {
    context,
    emitted,
    nextCalls: () => nextCalls,
    run: () =>
      handler(context, async () => {
        nextCalls += 1;
        return new Response("route response", { status: 200 });
      }),
  };
}

for (const boundary of ["lookup", "refresh"]) {
  for (const failure of ["503", "network"]) {
    test(
      `middleware ${boundary} ${failure} preserves cookies and recovers on a fresh request`,
      { timeout: 45_000 },
      async (t) => {
        // The SDK logs fetch failures; assert responses without printing its diagnostics.
        t.mock.method(console, "error", () => undefined);
        t.mock.method(console, "warn", () => undefined);
        const fixture = makeAuthFixture({ [boundary]: failure, expired: boundary === "refresh" });
        const request = middlewareRequest(fixture);
        const response =
          boundary === "refresh"
            ? await runWithControlledTime(t, () => request.run(), { label: "Auth refresh" })
            : await request.run();
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("Location"), null);
        assert.equal(response.headers.get("Retry-After"), "30");
        assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
        assert.equal(response.headers.get("Expires"), "0");
        assert.equal(response.headers.get("Pragma"), "no-cache");
        const body = await response.text();
        assert.match(body, /href="\/dashboard\/settings"/);
        assert.doesNotMatch(body, /Private provider failure|fetch failed|old-refresh|old-access/);
        assert.equal(request.nextCalls(), 0);
        assert.equal(request.context.locals.authUnavailable, true);
        assert.equal(request.context.locals.user, null);
        assert.deepEqual(request.context.locals.authCookies.getAll(), fixture.initialCookies);
        assert.deepEqual(request.emitted, []);
        assert.ok(
          fixture.calls.some((path) =>
            path.startsWith(boundary === "refresh" ? "/auth/v1/token?grant_type=refresh_token" : "/auth/v1/user"),
          ),
        );
        if (boundary === "refresh") {
          assert.ok(
            fixture.calls.filter((path) => path.startsWith("/auth/v1/token?grant_type=refresh_token")).length > 1,
            "The installed SDK should retry the provider refresh before reporting the outage",
          );
        }

        const recovery = makeAuthFixture({ incomingCookies: request.context.locals.authCookies.getAll() });
        const nextRequest = middlewareRequest(recovery);
        const recovered = await nextRequest.run();
        assert.equal(recovered.status, 200);
        assert.equal(await recovered.text(), "route response");
        assert.equal(nextRequest.nextCalls(), 1);
        assert.equal(nextRequest.context.locals.user.id, syntheticUser.id);
        assert.equal(nextRequest.context.locals.authUnavailable, false);
        if (boundary === "refresh") {
          assert.ok(recovery.calls.includes("/auth/v1/token?grant_type=refresh_token"));
          assert.ok(nextRequest.emitted.some(({ value, options }) => value && options.maxAge > 0));
          assert.match(recovered.headers.get("Cache-Control"), /private.*no-store/);
          assert.equal(recovered.headers.get("Expires"), "0");
          assert.equal(recovered.headers.get("Pragma"), "no-cache");
          assert.notDeepEqual(nextRequest.context.locals.authCookies.getAll(), fixture.initialCookies);
        }
      },
    );
  }
}

test("middleware redirects missing and rejected sessions but treats lookup 429 as unavailable", async () => {
  for (const options of [{ incomingCookies: [] }, { lookup: "401" }, { expired: true, refresh: "400" }]) {
    const request = middlewareRequest(makeAuthFixture(options));
    const response = await request.run();
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "/auth/signin");
    assert.equal(request.context.locals.user, null);
    assert.equal(request.context.locals.authUnavailable, false);
    assert.equal(request.nextCalls(), 0);
    if (options.expired) {
      assert.deepEqual(request.context.locals.authCookies.getAll(), []);
      assert.ok(request.emitted.some(({ options }) => options.maxAge === 0));
      assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
      assert.equal(response.headers.get("Expires"), "0");
      assert.equal(response.headers.get("Pragma"), "no-cache");
    }
  }
  const request = middlewareRequest(makeAuthFixture({ lookup: "429" }));
  assert.equal((await request.run()).status, 503);
  assert.equal(request.context.locals.authUnavailable, true);
});

test("middleware finalizes successful refresh on a downstream redirect and isolates later requests", async () => {
  const fixture = makeAuthFixture({ expired: true });
  const request = middlewareRequest(fixture);
  // A downstream route can redirect after middleware has refreshed its session.
  const handler = createAuthMiddleware(fixture.createClient, (headers) =>
    parseCookieHeader(headers.get("Cookie") ?? ""),
  );
  const response = await handler(request.context, async () => request.context.redirect("/dashboard/spools"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/dashboard/spools");
  assert.equal(request.context.locals.user.id, syntheticUser.id);
  assert.ok(
    request.emitted.some(
      ({ name, value, options }) => name.startsWith("sb-project-auth-token.") && value && options.maxAge > 0,
    ),
  );
  assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");

  const anonymous = middlewareRequest(makeAuthFixture({ incomingCookies: [] }));
  assert.equal((await anonymous.run()).status, 302);
  assert.equal(anonymous.context.locals.user, null);
  assert.deepEqual(anonymous.emitted, []);
  assert.notEqual(anonymous.context.locals.authCookies, request.context.locals.authCookies);
});

test("middleware skips identity lookup for credential POSTs and carries outages to public and API routes", async () => {
  for (const path of ["/api/auth/signup", "/api/auth/signin"]) {
    const fixture = makeAuthFixture({ lookup: "503" });
    const request = middlewareRequest(fixture, { path, method: "POST" });
    assert.equal((await request.run()).status, 200);
    assert.equal(request.nextCalls(), 1);
    assert.deepEqual(fixture.calls, []);
    assert.equal(request.context.locals.authUnavailable, false);
  }
  for (const path of ["/", "/api/spools", "/api/prints", "/dashboard-other"]) {
    const request = middlewareRequest(makeAuthFixture({ lookup: "503" }), { path });
    assert.equal((await request.run()).status, 200);
    assert.equal(request.nextCalls(), 1);
    assert.equal(request.context.locals.authUnavailable, true);
    assert.equal(request.context.locals.user, null);
  }
  const request = middlewareRequest({ initialCookies: [], createClient: () => null });
  assert.equal((await request.run()).status, 503);
  assert.equal(request.nextCalls(), 0);
});

test("middleware retains unexpected returned and thrown session error causes", async () => {
  for (const thrown of [false, true]) {
    const cause = new Error("unexpected provider contract");
    const request = middlewareRequest({
      initialCookies: [],
      createClient: () => ({
        auth: {
          getUser: async () => {
            if (thrown) throw cause;
            return { data: { user: syntheticUser }, error: cause };
          },
        },
      }),
    });
    await assert.rejects(request.run(), (error) => {
      assert.equal(error.message, "Unexpected Supabase session lookup error");
      assert.equal(error.cause, cause);
      return true;
    });
    assert.equal(request.context.locals.user, null);
    assert.equal(request.nextCalls(), 0);
  }
});

test("middleware finalizes refreshed cookies even when the subsequent identity lookup fails", async (t) => {
  t.mock.method(console, "warn", () => undefined);
  const fixture = makeAuthFixture({ expired: true, lookup: "503" });
  const request = middlewareRequest(fixture);
  const response = await request.run();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Location"), null);
  assert.equal(request.nextCalls(), 0);
  assert.ok(fixture.calls.includes("/auth/v1/token?grant_type=refresh_token"));
  assert.ok(fixture.calls.includes("/auth/v1/user"));
  assert.ok(request.emitted.some(({ value, options }) => value && options.maxAge > 0));
  assert.notDeepEqual(request.context.locals.authCookies.getAll(), fixture.initialCookies);
  assert.equal(
    request.emitted.some(({ options }) => options.maxAge === 0),
    false,
  );
  assert.match(response.headers.get("Cache-Control"), /private.*no-store/);
  assert.equal(response.headers.get("Expires"), "0");
  assert.equal(response.headers.get("Pragma"), "no-cache");
});
