import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { AuthCookieStore } from "@/lib/auth-cookies";

export function createClient(cookies: AuthCookieStore, responseHeaders: Headers) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookies.setAll(cookiesToSet);
        Object.entries(headers).forEach(([name, value]) => {
          responseHeaders.set(name, value);
        });
      },
    },
  });
}

export function getRequestCookies(requestHeaders: Headers) {
  return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
}
