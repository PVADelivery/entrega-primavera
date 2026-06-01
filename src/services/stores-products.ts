import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * CLIENTE (APP CONSUMIDOR)
 */
export function useStores(regionId?: string) {
  return useQuery({
    queryKey: ["stores", regionId],
    queryFn: async () => {
      let query = supabase.from("companies").select("*").eq("is_active", true);
      if (regionId) query = query.eq("city_id", regionId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useStoreDetails(storeId: string) {
  return useQuery({
    queryKey: ["stores", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", storeId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!storeId,
  });
}

export function useProducts(companyId: string) {
  return useQuery({
    queryKey: ["products", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("company_id", companyId).eq("is_active", true);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });
}

/**
 * LOJISTA (PAINEL DE GESTÃO)
 */
export function useProductsManager(companyId?: string) {
  const qc = useQueryClient();
  
  const query = useQuery({
    queryKey: ["products-manager", companyId],
    queryFn: async () => {
       const { data, error } = await supabase.from("products").select("*").eq("company_id", companyId);
       if (error) throw error;
       return data;
    },
    enabled: !!companyId,
  });

  const createProduct = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase.from("products").insert({ ...data, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products-manager"] }),
  });

  return { ...query, createProduct };
}
