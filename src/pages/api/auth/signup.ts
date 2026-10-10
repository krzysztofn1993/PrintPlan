import type { APIRoute } from "astro";
import { classifyAuthError } from "@/lib/auth-errors";
import { readAuthFormData, validateSignUpForm } from "@/lib/auth-validation";

function signupRedirect(context: Parameters<APIRoute>[0], error: string, fields: Partial<Record<string, string>> = {}) {
  const params = new URLSearchParams({ error });
  const encodedFields = Object.entries(fields)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([field, code]) => `${field}:${code}`);
  if (encodedFields.length > 0) params.set("fields", encodedFields.join(","));
  return context.redirect(`/auth/signup?${params.toString()}`);
}

export const POST: APIRoute = async (context) => {
  const form = await readAuthFormData(context.request);
  if (!form) return signupRedirect(context, "validation");

  const validation = validateSignUpForm(form);
  if (!validation.data) {
    return signupRedirect(context, "validation", validation.errorCodes);
  }

  const supabase = context.locals.supabase;
  if (!supabase) return signupRedirect(context, "unavailable");

  let signupResult: Awaited<ReturnType<typeof supabase.auth.signUp>>;
  try {
    signupResult = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
    });
  } catch (cause) {
    if (classifyAuthError(cause, "credentials") === "unavailable") {
      return signupRedirect(context, "unavailable");
    }
    throw cause;
  }

  const { data, error } = signupResult;
  if (error) {
    const kind = classifyAuthError(error, "credentials");
    if (kind === "unavailable") return signupRedirect(context, "unavailable");
    if (kind === "rejected-credentials") return signupRedirect(context, "signup-failed");
    throw new Error("Unexpected Supabase signup error", { cause: error });
  }

  return context.redirect(data.session ? "/auth/confirm-email?status=ready" : "/auth/confirm-email?status=pending");
};
