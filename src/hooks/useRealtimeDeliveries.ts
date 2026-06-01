import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

export function useRealtimeDeliveries() {
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);

    const channel = supabase
      .channel("realtime-deliveries-global")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        (payload) => {
          const d = payload.new as any;
          audioRef.current?.play().catch(() => {});
          toast.info("🚀 Nova entrega criada!", {
            description: `${d.customer_name || "Cliente"} — R$ ${Number(d.value ?? 0).toFixed(2)}`,
            duration: 6000,
          });
          qc.invalidateQueries({ queryKey: ["deliveries"] });
          qc.invalidateQueries({ queryKey: ["delivery-stats"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries" },
        (payload) => {
          const d = payload.new as any;
          const old = payload.old as any;
          if (d.status !== old.status) {
            const labels: Record<string, string> = {
              accepted: "✅ Entrega aceita",
              collecting: "📦 Coletando pedido",
              in_transit: "🏍️ Em trânsito",
              delivered: "🎉 Entrega finalizada",
              cancelled: "❌ Entrega cancelada",
            };
            const label = labels[d.status];
            if (label) {
              toast(label, {
                description: d.customer_name || "Cliente",
                duration: 4000,
              });
            }
          }
          qc.invalidateQueries({ queryKey: ["deliveries"] });
          qc.invalidateQueries({ queryKey: ["delivery-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
