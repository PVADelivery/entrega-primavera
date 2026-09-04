import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { declineDeliveryLocally, acceptDeliveryLocally, getDeclinedDeliveries } from "@/hooks/useDriverNotifications";
import { acceptDelivery, extractDeliveryFee, type DeliveryWithRelations as Delivery } from "@/services/deliveries";
import { MT24NewDeliveryPopup } from "./MT24NewDeliveryPopup";
import { isDeliveryEligibleForDriver, ADMIN_WINDOW_SECONDS } from "@/utils/delivery-eligibility";
import { getElapsedSeconds } from "@/utils/time";
import { toast } from "sonner";

export function NewDeliveryPopupModal() {
  const { user } = useAuth();
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const [pending, setPending] = useState(false);
  const acceptingRef = useRef(false);
  const scheduledTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const checkAndOfferDelivery = useCallback(async (del: any) => {
    if (!del || !del.id) return;
    if (acceptingRef.current) return;

    const currentDriverId = user?.id;
    const declined = getDeclinedDeliveries();
    if (declined.has(del.id)) return;

    // Regra Rígida de Ouro: NÃO É PARA NOTIFICAR NEM SOM, NEM POP ATÉ DAR OS 2 MINUTOS
    const isEligible = isDeliveryEligibleForDriver(del, currentDriverId);

    if (!isEligible) {
      // Se a entrega está na janela do Admin (< 120s) e é pendente sem motorista,
      // agendamos a verificação para o exato momento em que completar os 120 segundos!
      if (del.status === "pending" && !del.driver_id && del.created_at) {
        const elapsed = getElapsedSeconds(del.created_at);
        if (elapsed < ADMIN_WINDOW_SECONDS) {
          const delayMs = Math.max(500, (ADMIN_WINDOW_SECONDS - elapsed) * 1000 + 500);

          // Evita timers duplicados para a mesma entrega
          if (!scheduledTimersRef.current.has(del.id)) {
            const timer = setTimeout(async () => {
              scheduledTimersRef.current.delete(del.id);
              // Quando der os 2 minutos exatos, busca o estado atualizado no banco
              try {
                const { data: latest } = await supabase
                  .from("deliveries")
                  .select("*, companies(name, address)")
                  .eq("id", del.id)
                  .maybeSingle();

                if (latest) {
                  checkAndOfferDelivery(latest);
                }
              } catch (e) {
                console.warn("[MT24Popup] Erro ao reavaliar entrega após 2 min:", e);
              }
            }, delayMs);

            scheduledTimersRef.current.set(del.id, timer);
          }
        }
      }
      return;
    }

    // Se já tiver uma entrega aberta e não for essa
    if (activeDelivery && activeDelivery.id !== del.id) return;

    // Buscar detalhes da empresa se necessário
    let companyName = del.company_name || del.companies?.name;
    let pickupAddress = del.pickup_address || del.companies?.address;

    if ((!companyName || !pickupAddress) && del.company_id) {
      try {
        const { data: comp } = await supabase
          .from("companies")
          .select("name, address")
          .eq("id", del.company_id)
          .maybeSingle();
        if (comp?.name && !companyName) companyName = comp.name;
        if (comp?.address && !pickupAddress) pickupAddress = comp.address;
      } catch {}
    }

    setActiveDelivery({
      ...del,
      company_name: companyName || del.company_name || "Loja Parceira",
      pickup_address: pickupAddress || del.pickup_address || "Retirada na Loja",
    });
  }, [user?.id, activeDelivery]);

  useEffect(() => {
    if (!user?.id) return;

    // Escuta eventos realtime de deliveries (INSERT e UPDATE)
    const channelId = `mt24-popup-guard-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        (payload) => {
          checkAndOfferDelivery(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries" },
        (payload) => {
          const updated = payload.new as any;
          if (!updated) return;

          // Se a entrega ativa foi aceita por outro ou cancelada, fecha o popup imediatamente
          if (activeDelivery && activeDelivery.id === updated.id) {
            if (updated.status !== "pending" && updated.status !== "broadcasted") {
              setActiveDelivery(null);
              return;
            }
            if (updated.driver_id && String(updated.driver_id) !== String(user.id)) {
              setActiveDelivery(null);
              return;
            }
          }

          checkAndOfferDelivery(updated);
        }
      )
      .subscribe();

    return () => {
      // Limpa canal e todos os timers agendados
      supabase.removeChannel(channel);
      scheduledTimersRef.current.forEach((t) => clearTimeout(t));
      scheduledTimersRef.current.clear();
    };
  }, [user?.id, checkAndOfferDelivery, activeDelivery?.id]);

  const handleAccept = async (deliveryId: string) => {
    if (!activeDelivery || acceptingRef.current) return;
    acceptingRef.current = true;
    setPending(true);

    try {
      const { data: driver } = await supabase
        .from("delivery_drivers")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();

      const effectiveDriverId = driver?.id || user?.id || "";
      await acceptDelivery(deliveryId, effectiveDriverId);
      acceptDeliveryLocally(deliveryId);
      toast.success("✅ Corrida aceita com sucesso!");
      setActiveDelivery(null);
    } catch (e: any) {
      toast.info("Esta entrega já foi aceita por outro entregador.");
      setActiveDelivery(null);
    } finally {
      acceptingRef.current = false;
      setPending(false);
    }
  };

  const handleDecline = (deliveryId: string) => {
    declineDeliveryLocally(deliveryId);
    setActiveDelivery(null);
  };

  if (!activeDelivery) return null;

  return (
    <MT24NewDeliveryPopup
      delivery={activeDelivery}
      open={Boolean(activeDelivery)}
      onAccept={handleAccept}
      onDecline={handleDecline}
      pending={pending}
    />
  );
}
