import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export async function calculateDeliveryFee(lat: number, lng: number) {
  const { data, error: regionError } = await supabase.rpc("find_region_for_point", {
    _lat: lat,
    _lng: lng,
  });

  if (regionError) throw regionError;
  if (!data || data.length === 0) return { fee: 0, regionId: null, message: "Fora da área de cobertura" };

  const region = data[0];
  return { fee: region.region_price ?? 0, regionId: region.region_id };
}

export async function createOrder(orderData: {
  company_id: string;
  customer_id: string;
  delivery_fee?: number;
  items: { product_id: string; quantity: number; price: number }[];
  total: number;
}) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      company_id: orderData.company_id,
      customer_id: orderData.customer_id,
      delivery_fee: orderData.delivery_fee,
      total: orderData.total,
      status: "pending",
    })
    .select()
    .single();

  if (orderError) throw orderError;

  const orderItems = orderData.items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    quantity: item.quantity,
    price: item.price,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(orderItems);
  if (itemsError) throw itemsError;

  return order;
}

export async function getCompanyOrders(companyId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateOrderStatus(orderId: string, status: "pending" | "preparing" | "ready" | "delivered" | "cancelled") {
  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * HOOKS
 */
export function useCalculateDeliveryFee() {
  return useMutation({
    mutationFn: ({ lat, lng }: { lat: number; lng: number }) => calculateDeliveryFee(lat, lng),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

export function useOrders(customerId?: string) {
  return useQuery({
    queryKey: ["orders", customerId],
    queryFn: async () => {
      let query = supabase.from("orders").select("*, order_items(*), companies(name)");
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!customerId,
  });
}

export function useCompanyOrders(companyId?: string | null) {
  return useQuery({
    queryKey: ["orders", "company", companyId],
    queryFn: () => getCompanyOrders(companyId as string),
    enabled: !!companyId,
  });
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: any }) => updateOrderStatus(orderId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

import { useEffect } from "react";
export function useRealtimeOrders(companyId?: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`orders-company-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["orders", "company", companyId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, qc]);
}
