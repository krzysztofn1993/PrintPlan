declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    supabase: ReturnType<typeof import("./lib/supabase").createClient>;
    authCookies: import("./lib/auth-cookies").AuthCookieStore;
    authResponseHeaders: Headers;
    authUnavailable: boolean;
  }
}
