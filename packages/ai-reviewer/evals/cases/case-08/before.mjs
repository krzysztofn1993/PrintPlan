export function cookieOptions(_isHttps) {
  return { secure: false, sameSite: "lax" };
}
