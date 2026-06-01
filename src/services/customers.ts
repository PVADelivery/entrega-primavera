import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export async function getCustomersByCompany(companyId: string) {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*")
    .eq("company_id", companyId);

  if (error) throw error;

  const customerMap = new Map();
  orders.forEach((order) => {
    const custId = order.customer_id;
    if (!custId) return;

    if (!customerMap.has(custId)) {
      customerMap.set(custId, {
        id: custId,
        total_orders: 0,
        total_spent: 0,
        last_order_date: order.created_at,
      });
    }
    
    const stats = customerMap.get(custId);
    stats.total_orders += 1;
    stats.total_spent += order.total || 0;
    if (new Date(order.created_at!) > new Date(stats.last_order_date)) {
      stats.last_order_date = order.created_at;
    }
  });

  return Array.from(customerMap.values());
}

export async function getCustomerAddresses(userId: string) {
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  
  if (error) throw error;
  return data;
}

export function useCustomers(companyId?: string | null) {
  return useQuery({
    queryKey: ["customers", "company", companyId],
    queryFn: () => getCustomersByCompany(companyId as string),
    enabled: !!companyId,
  });
}

export function useCustomerAddresses(userId?: string | null) {
  return useQuery({
    queryKey: ["addresses", "user", userId],
    queryFn: () => getCustomerAddresses(userId as string),
    enabled: !!userId,
  });
}

/**
 * Busca clientes pelo nome ou telefone vinculados a uma empresa.
 */
export async function searchCustomers(companyId: string, query: string) {
  if (!query) return [];

  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, customers(*)")
    .eq("company_id", companyId)
    .ilike("customers.name", `%${query}%`);

  if (error) throw error;

  const customerMap = new Map();
  orders.forEach((order) => {
    const cust = order.customers as any;
    if (!cust) return;
    if (!customerMap.has(cust.id)) {
      customerMap.set(cust.id, { ...cust });
    }
  });

  return Array.from(customerMap.values());
}
