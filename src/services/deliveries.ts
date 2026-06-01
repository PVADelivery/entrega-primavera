import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DeliveryStatus } from "@/types/models";

// DB enum delivery_status: pending, broadcasted, accepted, collecting, in_transit, delivered, cancelled, returned, completed
function toDbStatus(status: string) {
  return status;
}

function toAppStatus(status: string) {
  return status as DeliveryStatus;
}

export interface DeliveryWithRelations {
  id: string;
  company_id: string | null;
  driver_id: string | null;
  order_id: string | null;
  region_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  pickup_address: string;
  dropoff_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  value: number;
  price: number | null;
  commission: number;
  distance_km: number | null;
  estimated_time_minutes: number | null;
  status: DeliveryStatus;
  notes: string | null;
  proof_photo_url: string | null;
  signature_url: string | null;
  accepted_at: string | null;
  collected_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  picked_up_at: string | null;
  cancellation_reason: string | null;
  payment_method?: string | null;
  created_at: string;
  updated_at: string | null;
  delivery_drivers?: {
    id: string;
    user_id: string;
    full_name: string;
    phone: string | null;
    vehicle_type: string | null;
    vehicle_plate: string | null;
  } | null;
  companies?: {
    name: string | null;
    phone: string | null;
  } | null;
  region_name?: string | null;
}

interface UseDeliveriesParams {
  status?: string;
  search?: string;
  companyId?: string;
  driverId?: string;
  dateFrom?: string;
  dateTo?: string;
  pageSize?: number;
  page?: number;
  enabled?: boolean;
}

export function useDeliveries(params?: UseDeliveriesParams) {
  const { status, search, companyId, driverId, dateFrom, dateTo, pageSize = 50, page = 0, enabled = true } = params || {};

  return useQuery({
    queryKey: ["deliveries", status, search, companyId, driverId, dateFrom, dateTo, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("deliveries")
        .select(`
          *,
          companies(name, phone),
          delivery_drivers(id, user_id, full_name, phone, vehicle_type, vehicle_plate)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (status && status !== "all") query = query.eq("status", toDbStatus(status) as any);
      
      if (search) {
        query = query.or(`customer_name.ilike.%${search}%,address.ilike.%${search}%,dropoff_address.ilike.%${search}%`);
      }
      if (companyId) query = query.eq("company_id", companyId);
      if (driverId) query = query.eq("driver_id", driverId);
      if (dateFrom) query = query.gte("created_at", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const orderIds = Array.from(
        new Set((data ?? []).map((delivery: any) => delivery.order_id).filter(Boolean))
      ) as string[];

      const paymentMethodsByOrderId = new Map<string, string | null>();
      if (orderIds.length > 0) {
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select("id, payment_method")
          .in("id", orderIds);

        if (ordersError) {
          console.error("Erro ao buscar formas de pagamento das entregas:", ordersError);
        } else {
          (ordersData ?? []).forEach((order: any) => {
            paymentMethodsByOrderId.set(order.id, order.payment_method ?? null);
          });
        }
      }

      const normalizedData = (data ?? []).map((delivery: any) => {
        const rawDriver = delivery.delivery_drivers;
        let normalizedDriver = null;
        if (rawDriver) {
          normalizedDriver = {
            id: rawDriver.id,
            user_id: rawDriver.user_id,
            full_name: rawDriver.full_name || "Entregador Atribuído",
            phone: rawDriver.phone || null,
            vehicle_type: rawDriver.vehicle_type || null,
            vehicle_plate: rawDriver.vehicle_plate || null,
          };
        }

        return {
          ...delivery,
          status: toAppStatus(delivery.status),
          delivered_at: delivery.delivered_at ?? delivery.completed_at ?? null,
          payment_method: delivery.order_id ? paymentMethodsByOrderId.get(delivery.order_id) ?? null : null,
          delivery_drivers: normalizedDriver,
        };
      });

      return { data: normalizedData as unknown as DeliveryWithRelations[], count: count || 0 };
    },
    enabled,
  });
}

export function useDeliveryStats() {
  return useQuery({
    queryKey: ["delivery-stats"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayRes, totalRes] = await Promise.all([
        supabase.from("deliveries").select("status, price").gte("created_at", today.toISOString()),
        supabase.from("deliveries").select("id", { count: "exact", head: true }),
      ]);

      if (todayRes.error) throw todayRes.error;
      const data = todayRes.data;

      const normalizedData = data.map((d) => ({
        ...d,
        status: toAppStatus(d.status),
      }));

      return {
        today: normalizedData.length,
        total: totalRes.count ?? 0,
        pending: normalizedData.filter((d) => d.status === "pending").length,
        inTransit: normalizedData.filter((d) => d.status === "in_transit" || d.status === "collecting").length,
        delivered: normalizedData.filter((d) => d.status === "delivered").length,
        cancelled: normalizedData.filter((d) => d.status === "cancelled").length,
        todayRevenue: normalizedData.filter((d) => d.status === "delivered").reduce((sum, d) => sum + Number(d.price ?? 0), 0),
      };
    },
    refetchInterval: 30000,
  });
}

export function useUpdateDeliveryStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DeliveryStatus }) => {
      const now = new Date().toISOString();
      const dbStatus = toDbStatus(status);

      // 1. Try the safe, bulletproof, RLS-bypassing RPC function first
      try {
        const { data, error } = await supabase.rpc("update_delivery_status_safe", {
          p_delivery_id: id,
          p_status: status,
        });

        if (!error && data && (data as any).success) {
          return;
        }
      } catch (err) {
        // Silently ignore to proceed to REST fallbacks
      }

      // Fallback: Original REST-based combination updates (backward compatible)
      // Combination 1: dbStatus + completed_at (Ideal normalized database state)
      const updates1: Record<string, unknown> = { status: dbStatus, updated_at: now };
      if (status === "accepted") updates1.accepted_at = now;
      if (status === "collecting") updates1.collected_at = now;
      if (status === "delivered") updates1.completed_at = now;
      if (status === "cancelled") updates1.cancelled_at = now;

      const res1 = await supabase.from("deliveries").update(updates1 as any).eq("id", id).select();

      if (res1.error || !res1.data || res1.data.length === 0) {
        // Combination 2: dbStatus + delivered_at
        const updates2: Record<string, unknown> = { status: dbStatus, updated_at: now };
        if (status === "accepted") updates2.accepted_at = now;
        if (status === "collecting") updates2.collected_at = now;
        if (status === "delivered") updates2.delivered_at = now;
        if (status === "cancelled") updates2.cancelled_at = now;

        const res2 = await supabase.from("deliveries").update(updates2 as any).eq("id", id).select();

        if (res2.error || !res2.data || res2.data.length === 0) {
          // Combination 3: appStatus (status) + completed_at
          const updates3: Record<string, unknown> = { status: status, updated_at: now };
          if (status === "accepted") updates3.accepted_at = now;
          if (status === "collecting") updates3.collected_at = now;
          if (status === "delivered") updates3.completed_at = now;
          if (status === "cancelled") updates3.cancelled_at = now;

          const res3 = await supabase.from("deliveries").update(updates3 as any).eq("id", id).select();

          if (res3.error || !res3.data || res3.data.length === 0) {
            // Combination 4: appStatus (status) + delivered_at (Legacy and default database states)
            const updates4: Record<string, unknown> = { status: status, updated_at: now };
            if (status === "accepted") updates4.accepted_at = now;
            if (status === "collecting") updates4.collected_at = now;
            if (status === "delivered") updates4.delivered_at = now;
            if (status === "cancelled") updates4.cancelled_at = now;

            const res4 = await supabase.from("deliveries").update(updates4 as any).eq("id", id).select();

            if (res4.error) {
              throw res4.error;
            }
            if (!res4.data || res4.data.length === 0) {
              throw new Error("Update failed: Row level security (RLS) blocked the action or delivery not found.");
            }
          }
        }
      }

      // Update linked order status to keep customer/merchant informed
      let orderStatus = "";
      if (status === "accepted") orderStatus = "confirmed";
      if (status === "collecting") orderStatus = "preparing";
      if (status === "in_transit") orderStatus = "delivering";
      if (status === "delivered") orderStatus = "delivered";
      if (status === "cancelled") orderStatus = "cancelled";

      if (orderStatus) {
        const { error: orderError } = await supabase
          .from("orders")
          .update({ status: orderStatus as any })
          .eq("delivery_id", id);
        if (orderError) console.error("Error updating order status:", orderError);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-stats"] });
    },
  });
}

export function useReassignDelivery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, driverId }: { id: string; driverId: string | null }) => {
      const { error } = await supabase.from("deliveries").update({ driver_id: driverId, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deliveries"] }),
  });
}

/**
 * INTEGRAÇÕES COM PAINEL LOJISTA
 */
export async function createDeliveryRequest(orderId: string) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderError) throw orderError;
  if (!order) throw new Error("Pedido não encontrado");

  const { data: address } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", order.user_id)
    .limit(1)
    .maybeSingle();

  const dropoff = address ? `${address.street}, ${address.number} - ${address.neighborhood}` : "Endereço não cadastrado";

  // VERIFICAÇÃO DE DUPLICIDADE
  const { data: existingDelivery } = await supabase
    .from("deliveries")
    .select("*")
    .eq("order_id", orderId)
    .not("status", "eq", "cancelled")
    .maybeSingle();

  if (existingDelivery) {
    console.log(`[Deliveries] Entrega já existe para o pedido ${orderId}. Retornando existente.`);
    return existingDelivery;
  }

  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .insert({
      company_id: order.company_id,
      order_id: orderId,
      customer_name: "Cliente",
      address: dropoff,
      value: order.total || 0,
      status: "pending",
    })
    .select()
    .single();

  if (deliveryError) throw deliveryError;

  return delivery;
}

export function useCreateDeliveryRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDeliveryRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

import { useEffect } from "react";
export function useDeliveryTracking(orderId?: string | null) {
  const qc = useQueryClient();

  const { data: order } = useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await supabase.from("orders").select("*, deliveries(*)").eq("id", orderId).single();
      return data;
    },
    enabled: !!orderId,
  });

  const deliveryId = (order as any)?.delivery_id;

  useEffect(() => {
    if (!deliveryId) return;
    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2, 11);

    const channel = supabase
      .channel(`delivery-tracker-${deliveryId}-${uuid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deliveries", filter: `id=eq.${deliveryId}` },
        () => qc.invalidateQueries({ queryKey: ["order", orderId] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [deliveryId, orderId, qc]);

  return { order, delivery: (order as any)?.deliveries };
}
