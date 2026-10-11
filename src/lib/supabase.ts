import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { AuthCookieStore } from "@/lib/auth-cookies";
import type { Database } from "@/types/database";

export function createClient(cookies: AuthCookieStore, responseHeaders: Headers, secureCookies: boolean) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookieOptions: {
      secure: secureCookies,
    },
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
