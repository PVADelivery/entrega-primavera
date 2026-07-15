import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadRoles(newSession.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRoles(s.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro no signOut:", error);
    } finally {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = "/login";
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