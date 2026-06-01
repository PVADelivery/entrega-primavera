import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Occurrence, OccurrenceType } from "@/types/models";

export function useOccurrences(driverId?: string) {
  return useQuery({
    queryKey: ["occurrences", driverId],
    queryFn: async () => {
      let query = supabase
        .from("occurrences")
        .select("*, deliveries(customer_name)")
        .order("created_at", { ascending: false });

      if (driverId) query = query.eq("driver_id", driverId);

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown) as (Occurrence & { deliveries: { customer_name: string } | null })[];
    },
    enabled: !!driverId,
  });
}

export function useReportOccurrence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (occurrence: { driver_id: string; delivery_id: string | null; type: OccurrenceType; description: string }) => {
      const { error } = await supabase.from("occurrences").insert([
        {
          ...occurrence,
          type: occurrence.type as any,
        } as any,
      ]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["occurrences"] });
    },
  });
}
