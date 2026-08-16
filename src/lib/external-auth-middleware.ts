import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const EXTERNAL_SUPABASE_URL = "https://owlbzwsdcognrgolvnzg.supabase.co";
const EXTERNAL_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJvd2xiendzZGNvZ25yZ29sdm56ZyIsInJlZiI6Im93bGJ6d3NkY29nbnJnb2x2bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQ1NTMsImV4cCI6MjA5NTU3MDU1M30.R6-FUqubIr3uABzv1CS7jiS5cwygrNiIqk4oNbq7O44";

export const requireExternalSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new Response("Unauthorized", { status: 401 });
    }

    const url = process.env["EXTERNAL_SUPABASE_URL"] || EXTERNAL_SUPABASE_URL;
    const publishableKey =
      process.env["EXTERNAL_SUPABASE_ANON_KEY"] || EXTERNAL_SUPABASE_PUBLISHABLE_KEY;
    const supabase = createClient(url, publishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw new Response("Unauthorized", { status: 401 });
    }

    return next({
      context: {
        supabase,
        userId: data.user.id,
        user: data.user,
      },
    });
  },
);