import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { PermissionModal } from "./PermissionModal";

export function DriverShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [mounted, loading, user, navigate]);

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4" suppressHydrationWarning>
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="mt-4 text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">
          Verificando acesso...
        </p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-16 text-foreground" suppressHydrationWarning>
      <div className="mx-auto max-w-md">{children}</div>
      <BottomNav />
      <PermissionModal />
    </div>
  );
}