// @ts-nocheck
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DeliveryDetails {
  id: string;
  company_id: string | null;
  company_name: string | null;
  pickup_address: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_cpf: string | null;
  address: string | null;
  customer_address_number: string | null;
  customer_neighborhood: string | null;
  customer_address_complement: string | null;
  notes: string | null;
  payment_method: string | null;
  order_value: number;
  change_for: number;
  value: number;
  price: number | null;
  commission: number;
  delivery_fee: number;
  status: string;
  short_id: string | null;
  created_at: string;
  // Informações completas da loja
  company?: {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    logo_url: string | null;
  } | null;
}

export function useDeliveryDetails(deliveryId?: string | null, initialData?: any) {
  const [details, setDetails] = useState<DeliveryDetails | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deliveryId) return;

    let isMounted = true;
    async function loadFullDetails() {
      try {
        setLoading(true);
        // 1. Buscar a entrega no banco com todas as colunas
        const { data: del, error: delErr } = await supabase
          .from("deliveries")
          .select("*, companies(*), regions(*)")
          .eq("id", deliveryId)
          .maybeSingle();

        if (delErr) throw delErr;

        if (del) {
          let companyObj = del.companies ? {
            id: del.companies.id,
            name: del.companies.name,
            address: del.companies.address,
            phone: del.companies.phone,
            logo_url: del.companies.logo_url,
          } : null;

          // Se a empresa não veio na relação mas temos o ID ou precisamos buscar a primeira
          if (!companyObj && del.company_id) {
            const { data: comp } = await supabase
              .from("companies")
              .select("id, name, address, phone, logo_url")
              .eq("id", del.company_id)
              .maybeSingle();
            if (comp) companyObj = comp;
          }

          const parsed: DeliveryDetails = {
            ...del,
            company_name: del.company_name || companyObj?.name || "MT 24 HORAS",
            pickup_address: del.pickup_address || companyObj?.address || null,
            company: companyObj,
          };

          if (isMounted) {
            setDetails(parsed);
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || "Erro ao carregar detalhes da entrega");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadFullDetails();

    // Inscrição em tempo real para atualizações deste pedido
    const channel = supabase
      .channel(`delivery-details-${deliveryId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries", filter: `id=eq.${deliveryId}` },
        (payload) => {
          if (isMounted && payload.new) {
            setDetails((prev) => prev ? { ...prev, ...payload.new } : (payload.new as any));
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [deliveryId]);

  return { details, loading, error };
}
