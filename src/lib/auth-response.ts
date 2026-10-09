export type AuthForm = "signin" | "signup";

export function isProtectedDashboardPath(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function getAuthFormErrorMessage(form: AuthForm, code: string | null): string | undefined {
  if (code === "validation") return "Please review the highlighted fields and try again.";
  if (code === "unavailable") return "Authentication is temporarily unavailable. Please try again.";
  if (form === "signin" && code === "signin-failed") return "Email or password is incorrect.";
  if (form === "signup" && code === "signup-failed") return "We couldn't create your account. Please try again.";
  return undefined;
}

export type AuthRetryTarget = { kind: "link"; href: string } | { kind: "signout" };

export function applyAuthResponseHeaders(response: Response, accumulatedHeaders: Headers): Response {
  accumulatedHeaders.forEach((value, name) => {
    response.headers.set(name, value);
  });
  return response;
}

function safeInternalHref(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//") || /[\r\n"<>]/.test(href)) return "/";
  return href;
}

export function createAuthUnavailableResponse(target: AuthRetryTarget): Response {
  const retryMarkup =
    target.kind === "signout"
      ? '<form method="post" action="/api/auth/signout"><button type="submit">Retry sign out</button></form>'
      : `<a href="${safeInternalHref(target.href)}">Try again</a>`;
  const body = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Authentication unavailable</title></head>
  <body>
    <main>
      <h1>Authentication is temporarily unavailable</h1>
      <p>Please wait a moment and try again.</p>
      ${retryMarkup}
    </main>
  </body>
</html>`;

  return new Response(body, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      Expires: "0",
      Pragma: "no-cache",
      "Retry-After": "30",
    },
  });
}
