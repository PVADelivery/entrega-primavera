import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getElapsedSeconds } from "@/utils/time";

const NOTIFICATION_SOUND = "/ring.mp3";

export function useRealtimeDeliveries() {
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND);
    const channelId = `realtime-deliv-${Math.random().toString(36).substring(2, 9)}`;

    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        (payload) => {
          const d = payload.new as any;
          const isBroadcasted = d.status === "broadcasted";
          const isPending = d.status === "pending";
          const elapsedSeconds = getElapsedSeconds(d.created_at);

          // Se for "pending" e tiver menos de 2 minutos, está reservado no Admin! Não toca som de entrega em geral.
          if (isPending && !isBroadcasted && elapsedSeconds < 120 && !d.driver_id) {
            qc.invalidateQueries({ queryKey: ["deliveries"] });
            qc.invalidateQueries({ queryKey: ["delivery-stats"] });
            return;
          }

          audioRef.current?.play().catch(() => {});
          toast.info("🚀 Nova entrega disponível!", {
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
