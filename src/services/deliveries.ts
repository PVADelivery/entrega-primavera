import { supabase } from "@/integrations/supabase/client";

export interface Delivery {
  id: string;
  company_id: string | null;
  driver_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  status: "pending" | "broadcasted" | "accepted" | "collecting" | "in_transit" | "delivered" | "cancelled" | "returned";
  value: number;
  commission: number;
  notes: string | null;
  region_id: string | null;
  accepted_at: string | null;
  collected_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchAvailableDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("status", "pending")
    .is("driver_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

export async function fetchMyActiveDeliveries(driverId: string): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("driver_id", driverId)
    .in("status", ["accepted", "collecting", "in_transit"])
    .order("accepted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

export async function fetchMyHistory(driverId: string): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .eq("driver_id", driverId)
    .in("status", ["delivered", "cancelled", "returned"])
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Delivery[];
}

export async function acceptDelivery(deliveryId: string, driverId: string) {
  const { error } = await supabase
    .from("deliveries")
    .update({ driver_id: driverId, status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .is("driver_id", null);
  if (error) throw error;
}

const nextStatus: Record<string, Delivery["status"]> = {
  accepted: "collecting",
  collecting: "in_transit",
  in_transit: "delivered",
};

export async function advanceDelivery(delivery: Delivery) {
  const next = nextStatus[delivery.status];
  if (!next) return;
  const { error } = await supabase.from("deliveries").update({ status: next }).eq("id", delivery.id);
  if (error) throw error;
}

export async function cancelDelivery(deliveryId: string) {
  const { error } = await supabase
    .from("deliveries")
    .update({ status: "cancelled" })
    .eq("id", deliveryId);
  if (error) throw error;
}

export async function getDriverIdFromUser(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("delivery_drivers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function ensureDriverRow(userId: string, regionId?: string | null) {
  const { data } = await supabase
    .from("delivery_drivers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await supabase
    .from("delivery_drivers")
    .insert({ user_id: userId, region_id: regionId ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function fetchEarnings(driverId: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("commission, completed_at")
    .eq("driver_id", driverId)
    .eq("status", "delivered")
    .not("completed_at", "is", null);
  if (error) throw error;
  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startWeek = startDay - now.getDay() * 86400000;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let day = 0, week = 0, month = 0, total = 0;
  for (const r of data ?? []) {
    const t = new Date(r.completed_at as string).getTime();
    const c = Number(r.commission ?? 0);
    total += c;
    if (t >= startMonth) month += c;
    if (t >= startWeek) week += c;
    if (t >= startDay) day += c;
  }
  return { day, week, month, total, count: data?.length ?? 0 };
}