export function cookieOptions(_isHttps) {
  return { secure: true, sameSite: "lax" };
}
