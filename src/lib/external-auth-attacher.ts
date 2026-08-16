import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const REFRESH_MARGIN_SECONDS = 60;

export const attachExternalSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    if (typeof window === "undefined") return next();

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("[auth] Não foi possível ler a sessão atual.");
      return next();
    }

    let session = data.session;
    const expiresAt = session?.expires_at ?? 0;
    const shouldRefresh = Boolean(
      session?.refresh_token && expiresAt <= Math.floor(Date.now() / 1000) + REFRESH_MARGIN_SECONDS,
    );

    if (shouldRefresh) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) {
        console.warn("[auth] A sessão expirou e não pôde ser renovada.");
        await supabase.auth.signOut({ scope: "local" });
        return next();
      }
      session = refreshed.data.session;
    }

    return next({
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    });
  },
);