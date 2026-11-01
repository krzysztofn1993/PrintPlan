export function cookieOptions(_isHttps) {
  return { secure: _isHttps, sameSite: "lax" };
}
