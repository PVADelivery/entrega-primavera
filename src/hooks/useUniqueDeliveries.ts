import { useMemo } from "react";
import type { DeliveryWithRelations } from "@/services/deliveries";

/**
 * useUniqueDeliveries
 * Hook para deduplicar entregas na interface.
 */
export function useUniqueDeliveries(deliveries: DeliveryWithRelations[] | undefined) {
  return useMemo(() => {
    if (!deliveries || deliveries.length === 0) return [];

    const seenIds = new Set<string>();
    
    return deliveries.filter((delivery) => {
      if (!delivery.id || seenIds.has(delivery.id)) {
        return false;
      }
      seenIds.add(delivery.id);
      return true;
    });
  }, [deliveries]);
}
