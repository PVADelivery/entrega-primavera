import { Link, useLocation } from "@tanstack/react-router";
import { Home, Package, AlertTriangle, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/driver", label: "Início", icon: Home },
  { to: "/driver/deliveries", label: "Entregas", icon: Package },
  { to: "/driver/occurrences", label: "Ocorrências", icon: AlertTriangle },
  { to: "/driver/chat", label: "Chat", icon: MessageCircle },
  { to: "/driver/profile", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-md items-center justify-between px-2 py-2">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || (to !== "/driver" && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "group relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                  active ? "bg-primary/15" : "bg-transparent group-hover:bg-secondary",
                )}
              >
                <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
              </span>
              <span className={cn("font-semibold", active && "text-foreground")}>{label}</span>
              {active && (
                <span className="absolute -top-px h-0.5 w-8 rounded-full bg-primary" aria-hidden />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}