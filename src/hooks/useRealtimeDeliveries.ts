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

          // Se for "pending" e tiver menos de 2 minutos, agenda para aparecer na lista de aceite ao completar 120s
          if (isPending && !isBroadcasted && elapsedSeconds < 120 && !d.driver_id) {
            setTimeout(() => {
              qc.invalidateQueries({ queryKey: ["deliveries"] });
              qc.invalidateQueries({ queryKey: ["delivery-stats"] });
            }, Math.max(500, (120 - elapsedSeconds) * 1000));
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
