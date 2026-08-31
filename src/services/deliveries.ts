// @ts-nocheck
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getElapsedSeconds } from "@/utils/time";
import { getCompanyNames } from "@/lib/companies.functions";
import { updateDriverDelivery } from "@/lib/driver-deliveries.functions";
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

async function resolveDeliveryCompanies(rows: any[]) {
  if (rows.length === 0) return rows;

  const orderIds = Array.from(new Set(rows.map((row) => row.order_id).filter(Boolean))) as string[];
  const orderCompanies = new Map<string, { companyId: string | null; name: string | null; phone: string | null }>();

  if (orderIds.length > 0) {
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, company_id, companies(name, phone)")
      .in("id", orderIds);

    if (ordersError) {
      console.warn("[deliveries] Não foi possível resolver a loja pelo pedido:", ordersError.message);
    } else {
      (orders ?? []).forEach((order: any) => {
        orderCompanies.set(order.id, {
          companyId: order.company_id ?? null,
          name: order.companies?.name ?? null,
          phone: order.companies?.phone ?? null,
        });
      });
    }
  }

  const companyIds = Array.from(new Set(rows.flatMap((row) => {
    const orderCompanyId = row.order_id ? orderCompanies.get(row.order_id)?.companyId : null;
    return [row.company_id, orderCompanyId].filter(Boolean);
  }))) as string[];
  const companiesById = new Map<string, { name: string | null; phone: string | null }>();

  if (companyIds.length > 0) {
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name, phone")
      .in("id", companyIds);

    if (companiesError) {
      console.warn("[deliveries] leitura direta de lojas bloqueada:", companiesError.message);
    }

    (companies ?? []).forEach((company: any) => {
      companiesById.set(company.id, { name: company.name ?? null, phone: company.phone ?? null });
    });

    // Fallback: lojas bloqueadas por RLS são resolvidas no servidor
    const missing = companyIds.filter((id) => !companiesById.get(id)?.name);
    if (missing.length > 0) {
      try {
        const resolved = await getCompanyNames({ data: { ids: missing } });
        (resolved ?? []).forEach((company: any) => {
          companiesById.set(company.id, { name: company.name ?? null, phone: company.phone ?? null });
        });
      } catch (error: any) {
        console.warn("[deliveries] fallback de lojas falhou:", error?.message ?? error);
      }
    }
  }

  return rows.map((row) => {
    const orderCompany = row.order_id ? orderCompanies.get(row.order_id) : null;
    const resolvedCompanyId = row.company_id ?? orderCompany?.companyId ?? null;
    const directCompany = resolvedCompanyId ? companiesById.get(resolvedCompanyId) : null;
    const embeddedCompany = row.companies ?? null;
    const companyName = directCompany?.name ?? embeddedCompany?.name ?? orderCompany?.name ?? row.company_name ?? null;
    const companyPhone = directCompany?.phone ?? embeddedCompany?.phone ?? orderCompany?.phone ?? null;

    return {
      ...row,
      company_id: resolvedCompanyId,
      company_name: companyName,
      companies: companyName ? { name: companyName, phone: companyPhone } : null,
    };
  });
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
    return existingDelivery;
  }

  const fee = Number(order.delivery_fee ?? order.fee ?? 10);

  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .insert({
      company_id: order.company_id,
      order_id: orderId,
      customer_name: "Cliente",
      address: dropoff,
      value: fee,
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

export async function createBatchDeliveryRequests(deliveries: Array<{ orderId: string }>) {
  if (deliveries.length === 0) return [];
  const deliveriesData = deliveries.map(d => ({
    order_id: d.orderId,
    // Add other fields as needed (company_id, customer_name, address, value, etc.)
  }));
  const { data, error } = await supabase.from('deliveries').insert(deliveriesData).select();
  if (error) throw error;
  return data;
}

export function useCreateBatchDeliveryRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBatchDeliveryRequests,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deliveries'] });
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

export async function fetchAvailableDeliveries(driverInfo?: { vehicle_type?: string; vehicle?: string; service_types?: string[] } | null) {
  let { data, error } = await supabase
    .from("deliveries")
    .select("*, companies(name, phone), regions(id, name, price)")
    .order("created_at", { ascending: false });

  if (error || !data || data.length === 0) {
    const fb = await supabase
      .from("deliveries")
      .select("*")
      .order("created_at", { ascending: false });
    if (!fb.error && fb.data) {
      data = fb.data;
    }
  }

  // Filtragem flexível de status e entregador não atribuído (null, vazio ou 'none')
  const validStatuses = ["pending", "broadcasted", "pending_assignment", "created", "open", "em_aberto", "Pendente"];

  let list = (data ?? []).filter((d: any) => {
    const st = String(d.status || "").toLowerCase();
    const isValidStatus = validStatuses.includes(st) || validStatuses.includes(d.status);
    if (!isValidStatus) return false;

    const isUnassigned = !d.driver_id || String(d.driver_id).trim() === "" || d.driver_id === "none" || d.driver_id === "00000000-0000-0000-0000-000000000000";
    if (!isUnassigned) return false;

    // Qualquer entrega não atribuída a motorista deve aparecer imediatamente
    return true;
  });

  const canDoCar = true;

  list = list.filter((d: any) => {
    const dVehicle = String(d.vehicle_type || "moto").toLowerCase();
    const isCarDelivery = ["carro", "car", "carro_aberto", "frete"].includes(dVehicle);
    if (isCarDelivery) {
      return canDoCar;
    }
    return true;
  });

  const resolved = await resolveDeliveryCompanies(list);
  return resolved.map((d: any) => ({ ...d, status: toAppStatus(d.status) }));
}

export async function fetchMyActiveDeliveries(driverId?: string | null, userId?: string | null) {
  const ids = Array.from(new Set([driverId, userId].filter(Boolean))) as string[];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .in("driver_id", ids)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const resolvedData = await resolveDeliveryCompanies(data ?? []);

  return resolvedData
    .filter((d: any) => !["completed", "delivered", "cancelled", "returned"].includes(d.status))
    .map((d: any) => {
      // Resolve nome do cliente se estiver mascarado
      const isMasked = !d.customer_name || d.customer_name === "Cliente" || d.customer_name === "XXXXXXXX" || /^X+$/.test(d.customer_name);
      const resolvedCustomerName = isMasked ? (d.customer_name || "Cliente") : d.customer_name;
      // Resolve endereço de entrega se estiver mascarado
      const isMaskedAddr = !d.address || d.address === "XXXXXX, XXX" || /^X+/.test(d.address);
      const resolvedAddress = isMaskedAddr
        ? (d.dropoff_address || d.delivery_address || d.address)
        : d.address;
      return {
        ...d,
        status: toAppStatus(d.status),
        customer_name: resolvedCustomerName,
        customer_phone: d.customer_phone || null,
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
      const resolvedFallbackData = await resolveDeliveryCompanies(fallbackData);
      return resolvedFallbackData
        .filter((d: any) => ["completed", "delivered", "cancelled", "returned"].includes(d.status))
        .map((d: any) => ({ ...d, status: toAppStatus(d.status) }));
    }
  }

  const resolvedHistory = await resolveDeliveryCompanies(historyDeliveries);
  return resolvedHistory.map((d: any) => ({ ...d, status: toAppStatus(d.status) }));
}

// Deduplicação de chamadas concorrentes: o mesmo deliveryId em voo reaproveita
// a promessa existente, então cliques duplicados nunca geram dois POSTs.
const inFlightAccepts = new Map<string, Promise<void>>();

export async function acceptDelivery(deliveryId: string, _driverId?: string) {
  const existing = inFlightAccepts.get(deliveryId);
  if (existing) return existing;

  const run = (async () => {
    const { data, error } = await supabase.rpc("accept_delivery" as any, {
      p_delivery_id: deliveryId,
    });

    if (error) {
      console.error("[acceptDelivery] RPC error:", error);
      throw new Error(error.message || "Não foi possível aceitar a entrega.");
    }

    const result = data as any;
    if (!result?.success) {
      console.error("[acceptDelivery] RPC rejected:", result);
      const messages: Record<string, string> = {
        NOT_AUTHENTICATED: "Sessão expirada. Faça login novamente.",
        DRIVER_NOT_FOUND: "Entregador não encontrado.",
        DELIVERY_NOT_FOUND: "Entrega não encontrada.",
        DELIVERY_NOT_AVAILABLE: "Esta entrega já foi aceita por outro entregador.",
      };
      throw new Error(
        messages[result?.error] ||
          result?.message ||
          "Não foi possível aceitar a entrega."
      );
    }
  })();

  inFlightAccepts.set(deliveryId, run);
  try {
    await run;
  } finally {
    inFlightAccepts.delete(deliveryId);
  }
}

export async function acceptBatchDelivery(batchId: string, driverId?: string) {
  if (!batchId) return;

  const { data, error } = await supabase.rpc("accept_delivery_batch" as any, {
    p_batch_id: batchId,
    p_driver_id: driverId || null,
  });

  if (error) {
    console.warn("[acceptBatchDelivery] RPC fallback via update:", error.message);
    const { error: updateErr } = await supabase
      .from("deliveries")
      .update({
        status: "accepted",
        driver_id: driverId || null,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("batch_id", batchId)
      .in("status", ["pending", "broadcasted"]);

    if (updateErr) throw new Error(updateErr.message || "Erro ao aceitar lote de entregas.");
    return { success: true };
  }

  const result = data as any;
  if (result && result.success === false) {
    throw new Error(result.message || "Este lote não está mais disponível para aceite.");
  }
  return result;
}

const nextStatus: Record<string, string> = {
  pending: "accepted",
  broadcasted: "accepted",
  accepted: "collecting",
  collecting: "in_transit",
  picked_up: "in_transit",
  in_transit: "delivered",
  in_route: "delivered",
};

function describeDbError(err: any) {
  return err ? String(err.message || "Erro desconhecido") : "Erro desconhecido";
}

function statusCandidates(status: string): string[] {
  if (status === "in_transit" || status === "in_route") return ["in_transit", "in_route", "delivering"];
  if (status === "delivered" || status === "completed") return ["delivered", "completed"];
  return [status];
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

  // 2. Fallback autenticado no servidor; se falhar ou se o navegador (ex: Safari no iOS) der 'Load failed', continua para a atualização direta no banco
  try {
    const result = await updateDriverDelivery({
      data: { deliveryId: delivery.id, status: dbNextStatus as any },
    });
    if (result && (result as any).success) return;
  } catch (serverError: any) {
    console.warn("[advanceDelivery] Falha no endpoint do servidor, acionando atualização direta no banco:", serverError);
  }

  // Compatibilidade para ambientes antigos sem a função segura.
  let res: any = null;
  for (const candidate of statusCandidates(dbNextStatus)) {
    const updates: Record<string, any> = { status: candidate, updated_at: now };
    if (next === "accepted") updates.accepted_at = now;
    if (next === "collecting") updates.collected_at = now;
    if (next === "delivered") updates.completed_at = now;

    res = await supabase.from("deliveries").update(updates).eq("id", delivery.id).select("id,status");

    // Se alguma coluna de timestamp não existir neste schema, tenta só o status
    if (res.error && res.error.code === "42703") {
      res = await supabase
        .from("deliveries")
        .update({ status: candidate, updated_at: now })
        .eq("id", delivery.id)
        .select("id,status");
    }

    if (res.error?.code === "22P02") continue;
    break;
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

  if (check && statusCandidates(dbNextStatus).includes(String(check.status))) return;

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

  // 1. Tenta desvincular via RPC unassign_delivery_driver se existir no banco
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("unassign_delivery_driver", {
      p_delivery_id: deliveryId,
    });
    if (!rpcError && (rpcData as any)?.success) {
      return;
    }
  } catch {}

  // 2. Fallback REST: remove o entregador (driver_id = null) e reseta o status para 'pending'
  // assim a entrega volta imediatamente para a fila de entregas disponíveis para os outros entregadores.
  const { error } = await supabase
    .from("deliveries")
    .update({ 
      driver_id: null,
      status: "pending",
      accepted_at: null,
      updated_at: now
    })
    .eq("id", deliveryId);

  if (error) {
    console.error("[cancelDelivery] Erro ao devolver entrega para a fila:", error);
    throw new Error(error?.message || "Não foi possível recusar a entrega.");
  }
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

export const DELIVERY_DONE_STATUSES = ["delivered", "completed"];

export function deliveryGrossFee(row: any): number {
  if (!row) return 0;
  if (row.delivery_fee !== null && row.delivery_fee !== undefined && Number(row.delivery_fee) > 0) {
    return Number(row.delivery_fee);
  }
  if (row.value !== null && row.value !== undefined && Number(row.value) > 0) {
    return Number(row.value);
  }
  const candidates = [row?.delivery_fee, row?.value, row?.price, row?.commission];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Number(row?.delivery_fee || row?.value || row?.price || 0);
}

/** Data de conclusão da entrega, tolerante a bancos com colunas diferentes. */
export function deliveryDoneAt(row: any): number | null {
  const raw = row?.completed_at || row?.delivered_at || row?.updated_at || row?.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export async function fetchEarnings(driverId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const ids = Array.from(new Set([driverId, user?.id].filter(Boolean)));

  let deliveries: any[] = [];
  // Alguns bancos usam "delivered", outros ainda gravam "completed"
  const { data: rows, error: deliveriesError } = await supabase
    .from("deliveries")
    .select("*")
    .in("driver_id", ids);
  if (deliveriesError) throw deliveriesError;
  deliveries = (rows ?? []).filter((d: any) =>
    DELIVERY_DONE_STATUSES.includes(String(d.status))
  );

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
    const t = deliveryDoneAt(r);
    if (t == null) continue;

    // Taxa bruta da entrega: usa a primeira coluna preenchida
    const fee = deliveryGrossFee(r);
    // O entregador recebe 75% (25% fica com a plataforma)
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
  return result;
}
