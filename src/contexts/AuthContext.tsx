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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRoles(userId: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles(((data ?? []) as { role: Role }[]).map((r) => r.role));
  }

  useEffect(() => {
    let isMounted = true;

    // Timeout de segurança generoso para conexões móveis e inicialização nativa no Android
    const safetyTimeout = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 15000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT") {
        setSession(null);
        setUser(null);
        setRoles([]);
        setLoading(false);
        return;
      }
      if (newSession) {
        setSession(newSession);
        setUser(newSession.user);
        loadRoles(newSession.user.id);
        syncNativeDriverSession(newSession);
        setLoading(false);
      }
    });

    supabase.auth.getSession()
      .then(async ({ data: { session: s } }) => {
        if (!isMounted) return;
        if (s) {
          setSession(s);
          setUser(s.user);
          syncNativeDriverSession(s);
          await loadRoles(s.user.id);
        } else {
          // Se getSession inicial vier nulo, tenta refreshSession antes de considerar deslogado
          try {
            const { data: refData } = await supabase.auth.refreshSession();
            if (refData?.session && isMounted) {
              setSession(refData.session);
              setUser(refData.session.user);
              syncNativeDriverSession(refData.session);
              await loadRoles(refData.session.user.id);
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
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro no signOut:", error);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.clear();
        sessionStorage.clear();
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
        isDriver: roles.includes("driver") || roles.includes("admin"),
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