// @ts-nocheck
import { Bike, Package2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkMode, type WorkMode } from "@/hooks/useWorkMode";
import { toast } from "sonner";

export function WorkModeSwitch({ className }: { className?: string }) {
  const { mode, setMode, canDelivery, canRide } = useWorkMode();

  const options: { value: WorkMode; label: string; icon: any; allowed: boolean }[] = [
    { value: "delivery", label: "Entregas", icon: Package2, allowed: canDelivery },
    { value: "ride", label: "Corridas", icon: Bike, allowed: canRide },
  ];

  return (
    <div className={cn("px-4", className)}>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
        Modo de trabalho
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/50 bg-secondary/40 p-1.5">
        {options.map(({ value, label, icon: Icon, allowed }) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (!allowed) {
                  toast.error("Categoria não habilitada pelo administrador.");
                  return;
                }
                setMode(value);
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-xs font-black uppercase tracking-wider transition-all",
                active
                  ? "text-primary-foreground shadow-[var(--shadow-elegant)]"
                  : allowed
                    ? "text-muted-foreground hover:text-foreground"
                    : "cursor-not-allowed text-muted-foreground/40",
              )}
              style={active ? { background: "var(--gradient-gold)" } : undefined}
            >
              {allowed ? <Icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] font-medium text-muted-foreground">
        {mode === "delivery"
          ? "Você está recebendo apenas entregas de lojas."
          : "Você está recebendo apenas corridas de passageiros."}
      </p>
    </div>
  );
}