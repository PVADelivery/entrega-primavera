import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type RegionRow = Tables<"regions">;
export type CreateRegionInput = TablesInsert<"regions"> & { city?: string };
export type UpdateRegionInput = TablesUpdate<"regions"> & { city?: string };

export async function fetchRegions(city?: string) {
  let query = supabase.from("regions").select("*").order("name");
  if (city) query = query.eq("city", city);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchCitiesWithRegions() {
  const { data, error } = await supabase
    .from("regions")
    .select("city")
    .not("city", "is", null);
  
  if (error) throw error;
  
  // Return unique sorted list of cities
  const cities = Array.from(new Set(data.map(r => r.city as string))).sort();
  return cities;
}

export async function createRegion(region: CreateRegionInput) {
  const { data, error } = await supabase
    .from("regions")
    .insert(region as any)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRegion(id: string, updates: UpdateRegionInput) {
  const { data, error } = await supabase
    .from("regions")
    .update(updates as any)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRegion(id: string) {
  const { error } = await supabase
    .from("regions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export function useRegions(city?: string) {
  return useQuery({
    queryKey: ["regions", city],
    queryFn: () => fetchRegions(city),
  });
}

export function useCitiesWithRegions() {
  return useQuery({
    queryKey: ["cities-with-regions"],
    queryFn: fetchCitiesWithRegions,
  });
}

export function useCreateRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createRegion,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regions"] });
      qc.invalidateQueries({ queryKey: ["cities-with-regions"] });
    },
  });
}

export function useUpdateRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateRegionInput }) =>
      updateRegion(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regions"] });
      qc.invalidateQueries({ queryKey: ["cities-with-regions"] });
    },
  });
}

export function useDeleteRegion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteRegion,
    onMutate: async (id) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await qc.cancelQueries({ queryKey: ["regions"] });

      // Snapshot the previous value
      const previousRegions = qc.getQueryData(["regions"]);

      // Optimistically update to the new value by removing the deleted id
      qc.setQueriesData({ queryKey: ["regions"] }, (old: any) => {
        if (!old) return old;
        return Array.isArray(old) ? old.filter((r: any) => r.id !== id) : old;
      });

      // Return a context object with the snapshotted value
      return { previousRegions };
    },
    onError: (err, id, context: any) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousRegions) {
        qc.setQueriesData({ queryKey: ["regions"] }, context.previousRegions);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to keep server sync
      qc.invalidateQueries({ queryKey: ["regions"] });
      qc.invalidateQueries({ queryKey: ["cities-with-regions"] });
    },
  });
}
