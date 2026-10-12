import type { APIRoute } from "astro";

export const GET: APIRoute = ({ locals, redirect }) => redirect(locals.user ? "/dashboard" : "/auth/signin");
