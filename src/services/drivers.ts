import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type DriverWithProfile = {
  id: string;
  user_id: string;
  full_name: string;
  phone?: string | null;
  document?: string | null;
  avatar_url?: string | null;
  vehicle_type?: string | null;
  vehicle_plate?: string | null;
  is_online?: boolean | null;
  online?: boolean | null;
  rating: number;
  latitude: number | null;
  longitude: number | null;
  status?: string | null;
  commission_rate?: number | null;
  created_at?: string;
};

export async function fetchDrivers(): Promise<DriverWithProfile[]> {
  // delivery_drivers already has: full_name, phone, document, avatar_url,
  // vehicle_type, vehicle_plate, status, is_online, rating, etc.
  
  const { data: drivers, error } = await supabase
    .from("delivery_drivers")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!drivers) return [];

  // Also fetch profiles as fallback for name/phone (in case delivery_drivers is empty)
  const userIds = drivers.map(d => d.user_id);
  const { data: profiles } = userIds.length > 0
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, phone, avatar_url, document")
        .in("user_id", userIds)
    : { data: [] };

  return drivers.map(driver => {
    const raw = driver as any;
    const profile = profiles?.find(p => p.user_id === driver.user_id);
    return {
      id: driver.id,
      user_id: driver.user_id,
      // Use delivery_drivers columns directly, fallback to profiles
      full_name: raw.full_name || profile?.full_name || "Entregador",
      phone: raw.phone || profile?.phone || null,
      document: raw.document || profile?.document || null,
      avatar_url: raw.avatar_url || profile?.avatar_url || null,
      vehicle_type: raw.vehicle_type || raw.vehicle || "motorcycle",
      vehicle_plate: raw.vehicle_plate || raw.license_plate || null,
      is_online: raw.is_online ?? raw.online ?? false,
      rating: Number(driver.rating) || 5.0,
      latitude: raw.latitude || raw.current_latitude || null,
      longitude: raw.longitude || raw.current_longitude || null,
      status: raw.status || "active",
      commission_rate: raw.commission_rate !== null && raw.commission_rate !== undefined ? Number(raw.commission_rate) : 0.40,
      created_at: driver.created_at,
    } as DriverWithProfile;
  });
}


export function useDrivers() {
  return useQuery({
    queryKey: ["drivers"],
    queryFn: fetchDrivers,
  });
}

export function useOnlineDrivers() {
  return useQuery({
    queryKey: ["drivers", "online"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_drivers")
        .select("*")
        .eq("is_online", true);

      if (error) throw error;
      if (!data) return [];

      const userIds = data.map(d => d.user_id);
      const { data: profiles } = userIds.length > 0
        ? await supabase
            .from("profiles")
            .select("user_id, full_name, phone, avatar_url, document")
            .in("user_id", userIds)
        : { data: [] };

      return data.map(driver => {
        const raw = driver as any;
        const profile = profiles?.find(p => p.user_id === driver.user_id);
        return {
          id: driver.id,
          user_id: driver.user_id,
          full_name: raw.full_name || profile?.full_name || "Entregador",
          phone: raw.phone || profile?.phone || null,
          document: raw.document || profile?.document || null,
          avatar_url: raw.avatar_url || profile?.avatar_url || null,
          vehicle_type: raw.vehicle_type || "motorcycle",
          vehicle_plate: raw.vehicle_plate || null,
          is_online: raw.is_online ?? raw.online ?? false,
          rating: Number(driver.rating) || 5.0,
          latitude: raw.latitude || raw.current_latitude || null,
          longitude: raw.longitude || raw.current_longitude || null,
          status: raw.status || "active",
          created_at: driver.created_at,
        } as DriverWithProfile;
      });
    },
  });
}

export function useToggleDriverOnline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ driverId, isOnline }: { driverId: string; isOnline: boolean }) => {
      const { error } = await supabase
        .from("delivery_drivers")
        .update({ is_online: isOnline } as any)
        .eq("id", driverId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}

export function useAvailableDeliveries() {
  return useQuery({
    queryKey: ["deliveries", "available"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select("*, companies(name)")
        .eq("status", "pending")
        .is("driver_id", null);

      if (error) throw error;
      return data;
    },
  });
}

export function useAcceptDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ deliveryId, driverId }: { deliveryId: string; driverId: string }) => {
      const { data, error } = await supabase
        .from("deliveries")
        .update({
          driver_id: driverId,
          status: "accepted" as any,
          accepted_at: new Date().toISOString()
        })
        .eq("id", deliveryId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    },
  });
}
