import {
  AuthInvalidCredentialsError,
  AuthInvalidJwtError,
  isAuthApiError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from "@supabase/supabase-js";

export type AuthOperation = "session" | "credentials" | "signout";
export type AuthErrorKind =
  "missing-session" | "invalid-session" | "rejected-credentials" | "unavailable" | "unexpected";

function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

export function classifyAuthError(error: unknown, operation: AuthOperation): AuthErrorKind {
  if (isAuthRetryableFetchError(error)) return "unavailable";

  if (isAuthApiError(error) && isRetryableStatus(error.status)) return "unavailable";
  if (isAuthError(error) && isRetryableStatus(error.status)) return "unavailable";

  if (isAuthSessionMissingError(error)) return "missing-session";
  if (
    operation === "session" &&
    (error instanceof AuthInvalidJwtError || (isAuthApiError(error) && error.status >= 400 && error.status < 500))
  ) {
    return "invalid-session";
  }
  if (operation === "signout" && isAuthApiError(error) && [401, 403, 404].includes(error.status)) {
    return "invalid-session";
  }
  if (
    operation === "credentials" &&
    (error instanceof AuthInvalidCredentialsError ||
      (isAuthApiError(error) && error.status >= 400 && error.status < 500))
  ) {
    return "rejected-credentials";
  }

  return "unexpected";
}

export async function signOutPreservingCookies(
  client: { auth: { signOut(options: { scope: "global" }): Promise<{ error: unknown }> } },
  cookies: {
    checkpoint(): number;
    restore(checkpoint: number): void;
  },
): Promise<"signed-out" | "unavailable"> {
  const checkpoint = cookies.checkpoint();
  let error: unknown;
  try {
    ({ error } = await client.auth.signOut({ scope: "global" }));
  } catch (cause) {
    error = cause;
  }
  if (!error) return "signed-out";

  const kind = classifyAuthError(error, "signout");
  if (kind === "unavailable") {
    cookies.restore(checkpoint);
    return "unavailable";
  }
  if (kind === "missing-session" || kind === "invalid-session") return "signed-out";

  throw new Error("Unexpected Supabase sign-out error", { cause: error });
}
