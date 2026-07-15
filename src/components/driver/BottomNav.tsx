// @ts-nocheck
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Package, AlertTriangle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureDriverRow, fetchMyActiveDeliveries } from "@/services/deliveries";
import { useEffect, useState } from "react";
const items = [
  { to: "/driver", label: "Início", icon: Home },
  { to: "/driver/deliveries", label: "Entregas", icon: Package },
  { to: "/driver/occurrences", label: "Ocorrências", icon: AlertTriangle },
  { to: "/driver/chat", label: "Chat", icon: MessageCircle },
  { to: "/driver/profile", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (user) ensureDriverRow(user.id).then(setDriverId).catch(() => {});
  }, [user]);

  const activeDeliveries = useQuery({
    queryKey: ["deliveries", "active", driverId],
    queryFn: () => (driverId ? fetchMyActiveDeliveries(driverId) : Promise.resolve([])),
    enabled: !!driverId,
  });

  const activeRides = useQuery({
    queryKey: ["rides", "active", driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data } = await supabase
        .from("ride_requests")
        .select("id")
        .eq("driver_id", driverId)
        .in("status", ["accepted", "in_progress", "arrived"]);
      return data || [];
    },
    enabled: !!driverId,
  });

  const totalActive = (activeDeliveries.data?.length || 0) + (activeRides.data?.length || 0);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pt-2">
      <div className="mx-auto max-w-md">
        <div
          className="relative flex items-center justify-between rounded-2xl border border-border/60 bg-card/85 px-2 py-1.5 shadow-[var(--shadow-card)] backdrop-blur-xl"
        >
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/driver" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                    active
                      ? "text-primary-foreground shadow-[var(--shadow-elegant)]"
                      : "bg-transparent group-hover:bg-secondary/70",
                  )}
                  style={active ? { background: "var(--gradient-gold)" } : undefined}
                >
                  <Icon className={cn("h-[18px] w-[18px]", active && "stroke-[2.4]")} />
                  {to === "/driver/deliveries" && totalActive > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm">
                      {totalActive}
                    </span>
                  )}
                </span>
                <span className={cn("font-semibold tracking-tight", active && "text-foreground")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}