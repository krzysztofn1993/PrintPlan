import type { APIRoute } from "astro";
import { classifyAuthError } from "@/lib/auth-errors";
import { readAuthFormData, validateSignInForm } from "@/lib/auth-validation";

function signinRedirect(context: Parameters<APIRoute>[0], error: string, fields: Partial<Record<string, string>> = {}) {
  const params = new URLSearchParams({ error });
  const encodedFields = Object.entries(fields)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([field, code]) => `${field}:${code}`);
  if (encodedFields.length > 0) params.set("fields", encodedFields.join(","));
  return context.redirect(`/auth/signin?${params.toString()}`);
}

export const POST: APIRoute = async (context) => {
  const form = await readAuthFormData(context.request);
  if (!form) return signinRedirect(context, "validation");

  const validation = validateSignInForm(form);
  if (!validation.data) {
    return signinRedirect(context, "validation", validation.errorCodes);
  }

  const supabase = context.locals.supabase;
  if (!supabase) return signinRedirect(context, "unavailable");

  let error: unknown;
  try {
    ({ error } = await supabase.auth.signInWithPassword({
      email: validation.data.email,
      password: validation.data.password,
    }));
  } catch (cause) {
    if (classifyAuthError(cause, "credentials") === "unavailable") {
      return signinRedirect(context, "unavailable");
    }
    throw cause;
  }

  if (error) {
    const kind = classifyAuthError(error, "credentials");
    if (kind === "unavailable") return signinRedirect(context, "unavailable");
    if (kind === "rejected-credentials") return signinRedirect(context, "signin-failed");
    throw new Error("Unexpected Supabase signin error", { cause: error });
  }

  return context.redirect("/");
};
