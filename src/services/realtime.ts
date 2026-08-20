import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useAdminRealtime
 * Centralized hook for Admin Panel to monitor everything.
 * Ensures one single channel per table with proper cleanup.
 */
export function useAdminRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    // Unique ID for this session
    const sessionId = Math.random().toString(36).substring(2, 10);

    const deliverablesChannel = supabase
      .channel(`admin-deliveries-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries" },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["deliveries"] });
          qc.invalidateQueries({ queryKey: ["delivery-stats"] });
        }
      )
      .subscribe();

    const driversChannel = supabase
      .channel(`admin-drivers-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_drivers" },
        () => {
          qc.invalidateQueries({ queryKey: ["drivers"] });
        }
      )
      .subscribe();

    const notificationsChannel = supabase
      .channel(`admin-notifications-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_logs" },
        () => {
          qc.invalidateQueries({ queryKey: ["system-stats"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(deliverablesChannel);
      supabase.removeChannel(driversChannel);
      supabase.removeChannel(notificationsChannel);
    };
  }, []); // Run only once on mount
}

// Global audio player instance pre-unlocked on user interaction
let globalAudioSingleton: HTMLAudioElement | null = null;
let isAudioUnlocked = false;

if (typeof window !== "undefined") {
  globalAudioSingleton = new Audio("/ring.mp3");
  globalAudioSingleton.load();

  const unlockAudio = () => {
    if (globalAudioSingleton && !isAudioUnlocked) {
      globalAudioSingleton.volume = 0.001;
      globalAudioSingleton
        .play()
        .then(() => {
          globalAudioSingleton?.pause();
          if (globalAudioSingleton) globalAudioSingleton.volume = 1.0;
          isAudioUnlocked = true;
        })
        .catch(() => {});
    }
  };

  window.addEventListener("click", unlockAudio, { capture: true, passive: true });
  window.addEventListener("touchstart", unlockAudio, { capture: true, passive: true });
  window.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
}

/**
 * useDriverRealtime
 * Notification system for the Driver App.
 */
export function useDriverRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const notifyAvailableDelivery = (newDel: any) => {
      if ((newDel.status === "pending" || newDel.status === "broadcasted") && !newDel.driver_id) {
        // Play sound unconditionally on new or returned delivery offer using pre-unlocked singleton
        if (globalAudioSingleton) {
          try {
            globalAudioSingleton.currentTime = 0;
            globalAudioSingleton.volume = 1.0;
            globalAudioSingleton.play().catch(e => console.warn("Erro ao tocar áudio:", e));
          } catch (e) {
            console.warn("Erro ao reproduzir áudio:", e);
          }
        } else {
          const audio = new Audio("/ring.mp3");
          audio.volume = 1.0;
          audio.play().catch(e => console.warn("Erro ao tocar áudio:", e));
        }

        // Trigger System/Browser Push Notification for Lock Screen & Background
        if ("Notification" in window && Notification.permission === "granted") {
          const val = newDel.value ? `R$ ${Number(newDel.value).toFixed(2)}` : "";
          const storeName = newDel.company_name || newDel.companies?.name || "Loja Parceira";
          const notification = new Notification("🛵 Nova Entrega Disponível!", {
            body: `Loja: ${storeName}\nLocal de Retirada: ${newDel.pickup_address || "Loja"}\nValor do Pedido: ${val}`,
            icon: "/favicon-v3.png",
            tag: `delivery-${newDel.id}`,
            requireInteraction: true
          });
          notification.onclick = () => {
            window.focus();
          };
        }
      }
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    };

    const channel = supabase
      .channel(`driver-deliveries-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        (payload) => {
          notifyAvailableDelivery(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries" },
        (payload) => {
          notifyAvailableDelivery(payload.new);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}

// Deprecated individual hooks
export function useDeliveriesRealtime() {
  useAdminRealtime();
}
export function useDriversRealtime() {}
export function useOrdersRealtime() {}
export function useAllRealtime() { 
  useAdminRealtime();
}
