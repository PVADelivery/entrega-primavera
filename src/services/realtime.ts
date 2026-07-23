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

/**
 * useDriverRealtime
 * Notification system for the Driver App.
 */
export function useDriverRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`driver-deliveries-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        (payload) => {
          const newDel = payload.new as any;
          if (newDel.status === "pending" || newDel.status === "broadcasted") {
            // Play sound if enabled
            if (sessionStorage.getItem("sound_enabled") === "true") {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
              audio.volume = 0.8;
              audio.play().catch(e => console.warn("Erro ao tocar áudio:", e));
            }
          }
          qc.invalidateQueries({ queryKey: ["deliveries"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries" },
        () => qc.invalidateQueries({ queryKey: ["deliveries"] })
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
