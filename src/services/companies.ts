import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export async function fetchCompanies() {
  const response = await supabase.from("companies").select("*").order("name");
  console.log("FETCH COMPANIES RESPONSE:", response);
  if (response.error) throw response.error;
  return response.data ?? [];
}

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: fetchCompanies,
  });
}


export async function fetchCompanyByUserId(userId: string) {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId);
  
  if (error) throw error;
  
  if (!data || data.length === 0) {
    // Fallback para administradores
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (profile?.role === "admin") {
      const { data: fallbackCompanies } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);
      if (fallbackCompanies && fallbackCompanies.length > 0) {
        return fallbackCompanies[0];
      }
    }
    return null;
  }
  
  return data.find(c => !c.name.toLowerCase().includes("teste")) || data[0];
}

export function useCompany(userId?: string) {
  return useQuery({
    queryKey: ["company", userId],
    queryFn: () => (userId ? fetchCompanyByUserId(userId) : null),
    enabled: !!userId,
  });
}
