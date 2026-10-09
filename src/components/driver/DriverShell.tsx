import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { PermissionModal } from "./PermissionModal";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";

export function DriverShell({ 
  children, 
  noBottomPadding = false 
}: { 
  children: ReactNode; 
  noBottomPadding?: boolean;
}) {
  const { user, loading, isDriver, signOut } = useAuth();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  useDriverNotifications();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading && !user) {
      // Verifica se há tokens de autenticação no localStorage antes de redirecionar para login
      const hasStoredAuth = typeof window !== "undefined" && Object.keys(localStorage).some(
        (k) => (k.startsWith("sb-") && k.endsWith("-auth-token")) || (k.includes("auth") && localStorage.getItem(k)?.includes("refresh_token"))
      );
      if (!hasStoredAuth) {
        navigate({ to: "/login", replace: true });
      }
    }
  }, [mounted, loading, user, navigate]);

  if (!mounted || (loading && !user)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4" suppressHydrationWarning>
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
          Verificando acesso...
        </p>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-background text-foreground"
      style={{
        paddingBottom: noBottomPadding ? "0px" : "calc(env(safe-area-inset-bottom, 0px) + 8.5rem)",
        WebkitOverflowScrolling: "touch",
      }}
      suppressHydrationWarning
    >
      <div className="mx-auto max-w-md">{children}</div>
      <BottomNav />
      <PermissionModal />
    </div>
  );
}