import type { APIRoute } from "astro";
import { signOutPreservingCookies } from "@/lib/auth-errors";
import { createAuthUnavailableResponse } from "@/lib/auth-response";

export const POST: APIRoute = async (context) => {
  const supabase = context.locals.supabase;
  if (!supabase || context.locals.authUnavailable) {
    return createAuthUnavailableResponse({ kind: "signout" });
  }

  const result = await signOutPreservingCookies(supabase, context.locals.authCookies);
  if (result === "unavailable") return createAuthUnavailableResponse({ kind: "signout" });

  return context.redirect("/");
};
