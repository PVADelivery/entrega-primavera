// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DeliveryStatus } from "@/types/models";

function toDbStatus(status: string) {
  // O enum do banco é: pending, broadcasted, accepted, collecting, in_transit, delivered, cancelled, returned
  if (status === "in_route") return "in_transit";
  if (status === "completed") return "delivered";
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
  regions?: {
    id: string;
    name: string;
    price: number | null;
  } | null;
  region_name?: string | null;
  company_name?: string | null;
  short_id?: string | null;
  customer_neighborhood?: string | null;
  delivery_fee?: number | null;
  order_value?: number | null;
  change_for?: number | null;
  [key: string]: any;
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
          delivery_drivers(id, user_id, vehicle, license_plate)
        `, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (status && status !== "all") {
        if (status === "pending") {
          query = query.in("status", ["pending", "broadcasted"]);
        } else {
          query = query.eq("status", toDbStatus(status) as any);
        }
      }
      
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
            vehicle_type: rawDriver.vehicle || null,
            vehicle_plate: rawDriver.license_plate || null,
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
    staleTime: 10000,
    gcTime: 300000,
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
    staleTime: 15000,
    gcTime: 300000,
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

export async function fetchAvailableDeliveries() {
  let { data, error } = await supabase
    .from("deliveries")
    .select("*, companies(name, phone), regions(id, name, price)")
    .in("status", ["pending", "broadcasted"])
    .is("driver_id", null)
    .order("created_at", { ascending: false });

  if (error) {
    const fb = await supabase
      .from("deliveries")
      .select("*")
      .in("status", ["pending", "broadcasted"])
      .is("driver_id", null)
      .order("created_at", { ascending: false });
    if (fb.error) throw fb.error;
    data = fb.data;
  }
  return (data ?? []).map((d: any) => ({ ...d, status: toAppStatus(d.status) }));
}

export async function fetchMyActiveDeliveries(driverId?: string | null, userId?: string | null) {
  const ids = Array.from(new Set([driverId, userId].filter(Boolean))) as string[];
  if (ids.length === 0) return [];

  // Tenta primeiro com JOIN seguro de orders e companies
  let data: any[] | null = null;
  let usedJoin = false;

  try {
    const res = await supabase
      .from("deliveries")
      .select(`
        *,
        companies(name, phone),
        orders(id, customer_name, customer_phone),
        regions(id, name, price)
      `)
      .in("driver_id", ids)
      .order("created_at", { ascending: false });

    if (!res.error && res.data) {
      data = res.data;
      usedJoin = true;
    } else {
      console.warn("[fetchMyActiveDeliveries] JOIN falhou, tentando SELECT * simples:", res.error?.message);
    }
  } catch (e) {
    console.warn("[fetchMyActiveDeliveries] Exceção no JOIN:", e);
  }

  // Fallback: SELECT * simples (sempre funciona)
  if (!data) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("deliveries")
      .select("*")
      .in("driver_id", ids)
      .order("created_at", { ascending: false });

    if (fallbackError) throw fallbackError;
    data = fallbackData ?? [];
  }

  return (data ?? [])
    .filter((d: any) => !["completed", "delivered", "cancelled", "returned"].includes(d.status))
    .map((d: any) => {
      const order = usedJoin ? d.orders : null;
      // Resolve nome do cliente se estiver mascarado
      const isMasked = !d.customer_name || d.customer_name === "Cliente" || d.customer_name === "XXXXXXXX" || /^X+$/.test(d.customer_name);
      const resolvedCustomerName = isMasked ? (order?.customer_name || d.customer_name || "Cliente") : d.customer_name;
      // Resolve endereço de entrega se estiver mascarado
      const isMaskedAddr = !d.address || d.address === "XXXXXX, XXX" || /^X+/.test(d.address);
      const resolvedAddress = isMaskedAddr
        ? (d.dropoff_address || order?.delivery_address || d.address)
        : d.address;
      return {
        ...d,
        status: toAppStatus(d.status),
        customer_name: resolvedCustomerName,
        customer_phone: d.customer_phone || order?.customer_phone || null,
        address: resolvedAddress,
        customer_neighborhood: d.customer_neighborhood || null,
      };
    });
}


export async function fetchMyHistory(driverId?: string | null, userId?: string | null) {
  const ids = Array.from(new Set([driverId, userId].filter(Boolean))) as string[];
  
  let query = supabase
    .from("deliveries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (ids.length > 0) {
    query = query.in("driver_id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  const historyDeliveries = (data ?? []).filter((d: any) =>
    ["completed", "delivered", "cancelled", "returned"].includes(d.status)
  );

  // Se não encontrou entregas com o ID do motorista, traz histórico recente geral
  if (historyDeliveries.length === 0 && ids.length > 0) {
    const { data: fallbackData } = await supabase
      .from("deliveries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    
    if (fallbackData && fallbackData.length > 0) {
      return fallbackData
        .filter((d: any) => ["completed", "delivered", "cancelled", "returned"].includes(d.status))
        .map((d: any) => ({ ...d, status: toAppStatus(d.status) }));
    }
  }

  return historyDeliveries.map((d: any) => ({ ...d, status: toAppStatus(d.status) }));
}

export async function acceptDelivery(deliveryId: string, driverId: string) {
  let targetId = driverId;
  const { data, error } = await supabase
    .from("deliveries")
    .update({ driver_id: targetId, status: "accepted", accepted_at: new Date().toISOString() } as any)
    .eq("id", deliveryId)
    .in("status", ["pending", "broadcasted"])
    .is("driver_id", null)
    .select()
    .maybeSingle();
  
  if (error) {
    console.error("[acceptDelivery] Supabase error:", error);
    throw error;
  }
}

const nextStatus: Record<string, string> = {
  pending: "accepted",
  accepted: "collecting",
  collecting: "in_transit",
  picked_up: "in_transit",
  in_transit: "delivered",
  in_route: "delivered",
};

function describeDbError(err: any) {
  if (!err) return "Erro desconhecido";
  const parts = [err.message, err.details, err.hint].filter(Boolean);
  const code = err.code ? `[${err.code}] ` : "";
  return `${code}${parts.join(" — ") || "Erro desconhecido"}`;
}

export async function advanceDelivery(delivery: any) {
  const next = nextStatus[delivery.status] || "collecting";
  const now = new Date().toISOString();
  const dbNextStatus = toDbStatus(next);

  // 1. Tenta RPC segura com assinatura p_delivery_id / p_status
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("update_delivery_status_safe", {
      p_delivery_id: delivery.id,
      p_status: next,
    });
    if (!rpcError && rpcData && (rpcData as any).success) {
      return;
    }
  } catch {}

  // 2. Tenta RPC segura com assinatura alternativa _delivery_id / _status
  try {
    const { data: rpcData2, error: rpcError2 } = await supabase.rpc("update_delivery_status_safe", {
      _delivery_id: delivery.id,
      _status: next,
    });
    if (!rpcError2 && rpcData2 && (rpcData2 as any).success) {
      return;
    }
  } catch {}

  // Atualização direta (colunas e enum válidos no banco)
  const updates: Record<string, any> = { status: dbNextStatus, updated_at: now };
  if (next === "accepted") updates.accepted_at = now;
  if (next === "collecting") updates.collected_at = now;
  if (next === "delivered") updates.completed_at = now;

  let res = await supabase.from("deliveries").update(updates).eq("id", delivery.id).select("id,status");

  // Se alguma coluna de timestamp não existir neste schema, tenta só o status
  if (res.error && res.error.code === "42703") {
    res = await supabase
      .from("deliveries")
      .update({ status: dbNextStatus, updated_at: now })
      .eq("id", delivery.id)
      .select("id,status");
  }

  if (res.error) {
    console.error("[advanceDelivery] Erro:", res.error);
    throw new Error(describeDbError(res.error));
  }

  if (res.data && res.data.length > 0) return;

  // Sem erro, mas nenhuma linha alterada: confere se o banco realmente mudou
  const { data: check } = await supabase
    .from("deliveries")
    .select("id,status,driver_id")
    .eq("id", delivery.id)
    .maybeSingle();

  if (check && check.status === dbNextStatus) return;

  throw new Error(
    "Esta entrega não está mais vinculada à sua conta ou seu perfil não tem permissão para alterá-la. Atualize a lista e tente novamente.",
  );
}

export async function releaseDeliveryToPool(deliveryId: string) {
  const { error } = await supabase
    .from("deliveries")
    .update({ 
      status: "pending" as any,
      driver_id: null,
      accepted_at: null
    })
    .eq("id", deliveryId);
  if (error) throw error;
}

export async function cancelDelivery(deliveryId: string) {
  const now = new Date().toISOString();
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("update_delivery_status_safe", {
      p_delivery_id: deliveryId,
      p_status: "cancelled",
    });
    if (!rpcError && rpcData && (rpcData as any).success) {
      return;
    }
  } catch {}

  try {
    const { data: rpcData2, error: rpcError2 } = await supabase.rpc("update_delivery_status_safe", {
      _delivery_id: deliveryId,
      _status: "cancelled",
    });
    if (!rpcError2 && rpcData2 && (rpcData2 as any).success) {
      return;
    }
  } catch {}

  const { error } = await supabase
    .from("deliveries")
    .update({ 
      status: "cancelled" as any,
      cancelled_at: now,
      updated_at: now
    })
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

export async function ensureDriverRow(userId: string, regionId?: string | null): Promise<string> {
  try {
    const { data } = await supabase
      .from("delivery_drivers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.id) {
      return data.id;
    }

    const { data: dataById } = await supabase
      .from("delivery_drivers")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (dataById?.id) {
      return dataById.id;
    }

    const payload: Record<string, any> = { user_id: userId };
    if (regionId) payload.region_id = regionId;

    const { data: created } = await supabase
      .from("delivery_drivers")
      .insert(payload as any)
      .select("id")
      .maybeSingle();

    if (created?.id) {
      return created.id;
    }
  } catch (err) {
    console.error("[ensureDriverRow] erro:", err);
  }

  return userId;
}

export async function fetchEarnings(driverId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const ids = Array.from(new Set([driverId, user?.id].filter(Boolean)));

  const { data: deliveries, error: deliveriesError } = await supabase
    .from("deliveries")
    .select("value, commission, completed_at, created_at")
    .in("driver_id", ids)
    .in("status", ["completed"]);

  if (deliveriesError) throw deliveriesError;

  // Tenta buscar também as corridas de passageiros
  const { data: rides, error: ridesError } = await supabase
    .from("ride_requests")
    .select("price, created_at, updated_at")
    .eq("driver_id", driverId)
    .eq("status", "completed");

  const now = new Date();
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startWeek = startDay - now.getDay() * 86400000;
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let day = 0, week = 0, month = 0, total = 0, count = 0;

  // Processa Entregas (deliveries)
  for (const r of deliveries ?? []) {
    const dateStr = r.completed_at || r.created_at;
    if (!dateStr) continue;
    const t = new Date(dateStr).getTime();
    
    // Calcula 75% do valor da entrega (o app retém 25%)
    const fee = Number(r.value || 0);
    const c = fee * 0.75;
    
    total += c;
    count += 1;
    if (t >= startMonth) month += c;
    if (t >= startWeek) week += c;
    if (t >= startDay) day += c;
  }

  // Processa Corridas de Táxi/Moto Táxi (se existirem)
  if (!ridesError) {
    for (const r of rides ?? []) {
      const dateStr = r.updated_at || r.created_at;
      if (!dateStr) continue;
      const t = new Date(dateStr).getTime();
      
      const fee = Number(r.price || 0);
      const c = fee * 0.75; // 75% do valor da corrida
      
      total += c;
      count += 1;
      if (t >= startMonth) month += c;
      if (t >= startWeek) week += c;
      if (t >= startDay) day += c;
    }
  }

  const result = { day, week, month, total, count };
  console.log("EARNINGS RESULTADO FINAL:", result);
  return result;
}
