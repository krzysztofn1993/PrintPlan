import type { APIRoute } from "astro";
import { classifyAuthError } from "@/lib/auth-errors";
import { createAuthUnavailableResponse } from "@/lib/auth-response";

const invalidLink = "/auth/confirm-email?status=invalid";

function confirmationFailure(context: Parameters<APIRoute>[0], error: unknown) {
  const kind = classifyAuthError(error, "credentials");
  if (kind === "unavailable") return createAuthUnavailableResponse({ kind: "reload" });
  if (kind === "rejected-credentials") return context.redirect(invalidLink);
  throw new Error("Unexpected Supabase email confirmation error", { cause: error });
}

export const GET: APIRoute = async (context) => {
  const tokenHashes = context.url.searchParams.getAll("token_hash");
  const types = context.url.searchParams.getAll("type");
  const tokenHash = tokenHashes[0];

  if (tokenHashes.length !== 1 || !tokenHash.trim() || types.length !== 1 || types[0] !== "email") {
    return context.redirect(invalidLink);
  }

  const supabase = context.locals.supabase;
  if (!supabase) return createAuthUnavailableResponse({ kind: "reload" });

  let result: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>;
  try {
    result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  } catch (cause) {
    return confirmationFailure(context, cause);
  }

  if (result.error) return confirmationFailure(context, result.error);
  if (!result.data.session) return context.redirect(invalidLink);

  return context.redirect("/");
};
