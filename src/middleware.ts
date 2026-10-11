import { defineMiddleware } from "astro:middleware";
import { createAuthCookieStore } from "@/lib/auth-cookies";
import { classifyAuthError } from "@/lib/auth-errors";
import { applyAuthResponseHeaders, createAuthUnavailableResponse, isProtectedDashboardPath } from "@/lib/auth-response";
import { createClient, getRequestCookies } from "@/lib/supabase";

export const onRequest = defineMiddleware(async (context, next) => {
  const cookies = createAuthCookieStore(getRequestCookies(context.request.headers));
  const responseHeaders = new Headers();
  const supabase = createClient(cookies, responseHeaders, context.url.protocol === "https:");
  const isCredentialPost =
    context.request.method === "POST" && ["/api/auth/signup", "/api/auth/signin"].includes(context.url.pathname);

  context.locals.supabase = supabase;
  context.locals.authCookies = cookies;
  context.locals.authResponseHeaders = responseHeaders;
  context.locals.authUnavailable = !supabase;
  context.locals.user = null;

  const finalize = (response: Response) => {
    cookies.commit((name, value, options) => {
      context.cookies.set(name, value, options);
    });
    return applyAuthResponseHeaders(response, responseHeaders);
  };

  if (supabase && !isCredentialPost) {
    let error: unknown;
    try {
      const result = await supabase.auth.getUser();
      context.locals.user = result.data.user ?? null;
      error = result.error;
    } catch (cause) {
      error = cause;
    }

    if (error) {
      context.locals.user = null;
      const kind = classifyAuthError(error, "session");
      if (kind === "unavailable") {
        context.locals.authUnavailable = true;
      } else if (kind === "missing-session" || kind === "invalid-session") {
        context.locals.user = null;
      } else {
        throw new Error("Unexpected Supabase session lookup error", { cause: error });
      }
    }
  }

  if (isProtectedDashboardPath(context.url.pathname)) {
    if (context.locals.authUnavailable) {
      return finalize(createAuthUnavailableResponse({ kind: "link", href: context.url.pathname }));
    }
    if (!context.locals.user) return finalize(context.redirect("/auth/signin"));
  }

  return finalize(await next());
});
