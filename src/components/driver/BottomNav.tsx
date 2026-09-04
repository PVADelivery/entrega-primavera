// @ts-nocheck
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Package, AlertTriangle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureDriverRow, fetchMyActiveDeliveries } from "@/services/deliveries";
import { useEffect, useState } from "react";
import { useWorkMode } from "@/hooks/useWorkMode";
const items = [
  { to: "/driver", label: "Início", icon: Home },
  { to: "/driver/deliveries", label: "Entregas & Corridas", icon: Package },
  { to: "/driver/occurrences", label: "Ocorrências", icon: AlertTriangle },
  { to: "/driver/chat", label: "Chat", icon: MessageCircle },
  { to: "/driver/profile", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { mode } = useWorkMode();
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (user) ensureDriverRow(user.id).then(setDriverId).catch(() => {});
  }, [user]);

  const activeDeliveries = useQuery({
    queryKey: ["deliveries", "active", driverId, user?.id],
    queryFn: () => fetchMyActiveDeliveries(driverId || user?.id || "", user?.id),
    enabled: mode === "delivery",
  });

  const activeRides = useQuery({
    queryKey: ["rides", "active", driverId, user?.id],
    queryFn: async () => {
      const ids = Array.from(new Set([driverId, user?.id, "c6873f0a-ed5d-4cf6-9f28-ef4dd37507f0"].filter(Boolean)));
      const { data } = await supabase
        .from("ride_requests")
        .select("id")
        .in("driver_id", ids)
        .in("status", ["accepted", "in_progress", "arrived"]);
      return data || [];
    },
    enabled: mode === "ride",
  });

  const totalActive =
    mode === "ride" ? activeRides.data?.length || 0 : activeDeliveries.data?.length || 0;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-2.5 pb-2 pt-1 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto">
        <div
          className="relative flex items-center justify-around rounded-2xl border border-white/10 bg-[#0d121f]/95 px-1.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all"
        >
          {items.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/driver" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group relative flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1.5 transition-all duration-200",
                  active ? "text-amber-400 font-bold scale-[1.03]" : "text-slate-400 hover:text-slate-200"
                )}
              >
                <div className="relative flex items-center justify-center">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-300",
                      active
                        ? "bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-300 text-slate-950 shadow-[0_0_20px_rgba(245,158,11,0.45)] ring-2 ring-amber-400/20"
                        : "bg-white/[0.04] group-hover:bg-white/[0.08]"
                    )}
                  >
                    <Icon className={cn("h-5 w-5 transition-transform duration-200", active ? "stroke-[2.5]" : "stroke-[1.8] group-hover:scale-110")} />
                  </span>

                  {to === "/driver/deliveries" && totalActive > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-[0_0_10px_rgba(244,63,94,0.6)] ring-2 ring-[#0d121f] animate-pulse">
                      {totalActive}
                    </span>
                  )}
                </div>

                <span className={cn(
                  "text-[10px] tracking-tight whitespace-nowrap leading-none transition-colors",
                  active ? "text-amber-300 font-black drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-slate-400 font-semibold"
                )}>
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