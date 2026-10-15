import { defineMiddleware } from "astro:middleware";
import { createAuthMiddleware } from "@/lib/auth-middleware";
import { createClient, getRequestCookies } from "@/lib/supabase";

export const onRequest = defineMiddleware(createAuthMiddleware(createClient, getRequestCookies));
