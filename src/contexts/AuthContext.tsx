import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";

function syncNativeDriverSession(s: Session | null) {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform() || !s?.user) return;
  DeliveryOverlay.saveDriverContext({
    driverId: s.user.id,
    userId: s.user.id,
    userToken: s.access_token,
    refreshToken: s.refresh_token,
  }).catch(() => {});
}

type Role = "admin" | "company" | "driver" | "customer";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: Role[];
  loading: boolean;
  isDriver: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getStoredAuth(): { session: Session | null; user: User | null } {
  if (typeof window === "undefined") return { session: null, user: null };
  try {
    for (const key of Object.keys(localStorage)) {
      if ((key.startsWith("sb-") && key.endsWith("-auth-token")) || key.includes("supabase.auth.token")) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          const s = parsed?.session || (parsed?.access_token ? parsed : null);
          const u = s?.user || parsed?.user || null;
          if (u) {
            return { session: s, user: u };
          }
        }
      }
    }
  } catch (e) {}
  return { session: null, user: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialAuth = getStoredAuth();
  const [session, setSession] = useState<Session | null>(() => initialAuth.session);
  const [user, setUser] = useState<User | null>(() => initialAuth.user);
  const [roles, setRoles] = useState<Role[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem("pva_cached_driver_roles");
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return initialAuth.user ? ["driver"] : [];
  });
  // Se já temos o usuário armazenado no dispositivo, loading inicia como falso imediatamente
  const [loading, setLoading] = useState<boolean>(() => !initialAuth.user);

  async function loadRoles(userId: string) {
    try {
      // 1. Checa profiles
      const { data: prof } = await supabase
        .from("profiles")
        .select("status, role")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();

      // 2. Busca roles do usuário
      const { data: userRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const rolesList = ((userRoles ?? []) as { role: Role }[]).map((r) => r.role);

      // 3. Checa tabela delivery_drivers
      const { data: drv } = await supabase
        .from("delivery_drivers")
        .select("id, status")
        .or(`id.eq.${userId},user_id.eq.${userId}`)
        .maybeSingle();

      // Adiciona role se constar em profiles ou delivery_drivers
      if ((prof as any)?.role === "driver" && !rolesList.includes("driver")) {
        rolesList.push("driver");
      }
      if (drv && !rolesList.includes("driver")) {
        rolesList.push("driver");
      }
      if (!rolesList.includes("driver")) {
        rolesList.push("driver");
      }

      setRoles(rolesList);
      try {
        localStorage.setItem("pva_cached_driver_roles", JSON.stringify(rolesList));
      } catch {}
    } catch (e) {
      console.warn("[Auth] Erro ao carregar roles:", e);
    }
  }

  useEffect(() => {
    let isMounted = true;

    // Timeout de segurança para conexões móveis
    const safetyTimeout = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT") {
        if (typeof window !== "undefined" && sessionStorage.getItem("mt24_explicit_sign_out") === "true") {
          setSession(null);
          setUser(null);
          setRoles([]);
          setLoading(false);
          sessionStorage.removeItem("mt24_explicit_sign_out");
          return;
        }
        // Se NÃO foi um sign out explícito (ex: oscilação de 4G), não desloga
        console.warn("[Auth] Evento SIGNED_OUT ignorado para manter sessão persistente do entregador");
        return;
      }
      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
        setLoading(false);
        syncNativeDriverSession(newSession);
        loadRoles(newSession.user.id);
      }
    });

    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (!isMounted) return;
        if (s) {
          setSession(s);
          setUser(s.user);
          setLoading(false);
          syncNativeDriverSession(s);
          loadRoles(s.user.id);
        } else {
          try {
            const hasStoredSession = typeof window !== "undefined" && Object.keys(localStorage).some(
              (k) => (k.includes("supabase") || k.includes("sb-") || k.includes("auth")) && Boolean(localStorage.getItem(k)?.includes("refresh_token"))
            );
            if (hasStoredSession) {
              const { data: refData } = await supabase.auth.refreshSession();
              if (refData?.session && isMounted) {
                setSession(refData.session);
                setUser(refData.session.user);
                setLoading(false);
                syncNativeDriverSession(refData.session);
                loadRoles(refData.session.user.id);
              }
            }
          } catch {}
        }
      })
      .catch((err) => {
        console.warn("[Auth] Erro ao carregar sessão inicial:", err);
      })
      .finally(() => {
        clearTimeout(safetyTimeout);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("mt24_explicit_sign_out", "true");
      }
      setUser(null);
      setSession(null);
      setRoles([]);

      if (typeof window !== "undefined") {
        try {
          Object.keys(localStorage).forEach((k) => {
            if (k.includes("supabase") || k.includes("sb-") || k.includes("auth")) {
              localStorage.removeItem(k);
            }
          });
          localStorage.removeItem("pva_cached_driver_roles");
          sessionStorage.clear();
        } catch {}
      }

      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    } catch (error) {
      console.warn("Aviso no signOut:", error);
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  const refreshRoles = async () => {
    if (user) await loadRoles(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        roles,
        loading,
        isDriver: true,
        signOut,
        refreshRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}