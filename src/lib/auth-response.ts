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

export type AuthRetryTarget = { kind: "link"; href: string } | { kind: "signout" } | { kind: "reload" };

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
  const isSignout = target.kind === "signout";
  const title = isSignout ? "We couldn't sign you out" : "Authentication is temporarily unavailable";
  const description = isSignout
    ? "We couldn't confirm that you were signed out. Your session may still be active. Please try again."
    : "Please wait a moment and try again.";
  const retryMarkup =
    target.kind === "signout"
      ? '<form method="post" action="/api/auth/signout"><button type="submit">Retry sign out</button></form>'
      : target.kind === "reload"
        ? '<button type="button" onclick="window.location.reload()">Try again</button>'
        : `<a href="${safeInternalHref(target.href)}">Try again</a>`;
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>${title}</title>
    <style>
      :root { color-scheme: dark; font-family: "Arial Narrow", "Segoe UI", Arial, sans-serif; background: #090C0D; color: #F0F3F1; }
      * { box-sizing: border-box; }
      body { display: grid; min-height: 100vh; margin: 0; padding: 24px; place-items: center; background-color: #090C0D; background-image: linear-gradient(90deg, #182022 0 1px, transparent 1px 100%); background-size: 42px 42px; }
      main { width: min(100%, 34rem); padding: clamp(24px, 5vw, 40px); border: 1px solid #293337; border-top: 2px solid #FF7058; border-radius: 0.15rem; background: #14191B; }
      h1 { display: flex; align-items: center; gap: 12px; margin: 0; font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.2; }
      h1::before { flex: 0 0 7px; width: 7px; height: 7px; border-radius: 50%; background: #FF7058; box-shadow: 0 0 12px rgb(255 112 88 / 35%); content: ""; }
      p { margin: 16px 0 24px; color: #D6DFDF; line-height: 1.6; }
      a, button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 10px 16px; border: 1px solid #FF7058; border-radius: 0.14rem; background: #FF7058; color: #170C0B; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
      a:hover, button:hover { filter: brightness(1.08); }
      a:focus-visible, button:focus-visible { outline: 3px solid #FFAE9A; outline-offset: 3px; }
    </style>
  </head>
  <body>
    <main role="alert">
      <h1>${title}</h1>
      <p>${description}</p>
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
