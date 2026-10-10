import type { CookieOptions } from "@supabase/ssr";

export interface AuthCookieMutation {
  name: string;
  value: string;
  options: CookieOptions;
}

export type AuthCookieSetter = (name: string, value: string, options: CookieOptions) => void;

export interface AuthCookieStore {
  getAll(): { name: string; value: string }[];
  setAll(cookies: AuthCookieMutation[]): void;
  checkpoint(): number;
  restore(checkpoint: number): void;
  commit(setCookie: AuthCookieSetter): void;
}

function isDeletion(cookie: AuthCookieMutation): boolean {
  if (cookie.options.maxAge === 0) return true;
  const expires = cookie.options.expires;
  return expires instanceof Date && expires.getTime() <= Date.now();
}

export function createAuthCookieStore(requestCookies: { name: string; value: string }[]): AuthCookieStore {
  const initialCookies = requestCookies.map(({ name, value }) => ({ name, value }));
  const mutations: AuthCookieMutation[] = [];

  return {
    getAll() {
      const visibleCookies = new Map(initialCookies.map(({ name, value }) => [name, value]));
      for (const cookie of mutations) {
        if (isDeletion(cookie)) visibleCookies.delete(cookie.name);
        else visibleCookies.set(cookie.name, cookie.value);
      }
      return [...visibleCookies].map(([name, value]) => ({ name, value }));
    },
    setAll(cookies) {
      mutations.push(...cookies.map((cookie) => ({ ...cookie, options: { ...cookie.options } })));
    },
    checkpoint() {
      return mutations.length;
    },
    restore(checkpoint) {
      if (!Number.isInteger(checkpoint) || checkpoint < 0 || checkpoint > mutations.length) {
        throw new RangeError("Invalid auth cookie checkpoint");
      }
      mutations.length = checkpoint;
    },
    commit(setCookie) {
      for (const { name, value, options } of mutations) setCookie(name, value, options);
    },
  };
}
