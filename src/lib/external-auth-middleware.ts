import { createClient } from "@supabase/supabase-js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const EXTERNAL_SUPABASE_URL = "https://owlbzwsdcognrgolvnzg.supabase.co";
const EXTERNAL_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGJ6d3NkY29nbnJnb2x2bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQ1NTMsImV4cCI6MjA5NTU3MDU1M30.R6-FUqubIr3uABzv1CS7jiS5cwygrNiIqk4oNbq7O44";

function decodeClaims(token: string): { iss?: string; sub?: string; exp?: number } {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const claims = JSON.parse(json) as { iss?: string; sub?: string; exp?: number };
    return { iss: claims.iss, sub: claims.sub, exp: claims.exp };
  } catch {
    return {};
  }
}

export const requireExternalSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");

    if (!authHeader) {
      console.warn("[external-auth] Cabeçalho de autorização ausente.");
      throw new Response("Sessão expirada. Entre novamente.", { status: 401 });
    }
    if (!authHeader.startsWith("Bearer ")) {
      console.warn("[external-auth] Formato de autorização inválido.");
      throw new Response("Sessão inválida. Entre novamente.", { status: 401 });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      console.warn("[external-auth] Bearer token vazio.");
      throw new Response("Sessão expirada. Entre novamente.", { status: 401 });
    }

    const url = process.env["EXTERNAL_SUPABASE_URL"] || EXTERNAL_SUPABASE_URL;
    // Só aceita chaves que pertençam ao projeto externo correto; chaves de
    // outros projetos causam "Invalid API key" ao validar o JWT.
    const projectRef = url.replace("https://", "").split(".")[0];
    const keyMatchesProject = (key?: string | null) => {
      if (!key) return false;
      try {
        const payload = JSON.parse(
          Buffer.from(key.split(".")[1] ?? "", "base64").toString("utf8"),
        );
        return payload?.ref === projectRef;
      } catch {
        return false;
      }
    };
    const publishableKey =
      [
        process.env["EXTERNAL_SUPABASE_ANON_KEY"],
        process.env["VITE_SUPABASE_ANON_KEY"],
        process.env["VITE_SUPABASE_PUBLISHABLE_KEY"],
      ].find(keyMatchesProject) || EXTERNAL_SUPABASE_PUBLISHABLE_KEY;
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
      const claims = decodeClaims(token);
      console.warn(
        `[AUTH DEBUG] getUser falhou | at=${new Date().toISOString()} | code=${error?.code ?? "no_user"} | status=${(error as any)?.status ?? "?"} | message=${error?.message ?? "usuário ausente"} | iss=${claims.iss ?? "?"} | sub=${claims.sub ?? "?"} | exp=${claims.exp ?? "?"} | now=${Math.floor(Date.now() / 1000)} | expired=${claims.exp ? claims.exp < Math.floor(Date.now() / 1000) : "?"}`,
      );
      throw new Response("Sessão expirada. Entre novamente.", { status: 401 });
    }

    const okClaims = decodeClaims(token);
    console.info(
      `[AUTH DEBUG] getUser ok | at=${new Date().toISOString()} | authUserId=${data.user.id} | sub=${okClaims.sub ?? "?"} | iss=${okClaims.iss ?? "?"} | exp=${okClaims.exp ?? "?"} | now=${Math.floor(Date.now() / 1000)}`,
    );

    return next({
      context: {
        supabase,
        userId: data.user.id,
        user: data.user,
      },
    });
  },
);