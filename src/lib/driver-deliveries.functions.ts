import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { updateDriverDeliveryAdmin } from "./driver-deliveries.server";

export const updateDriverDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        deliveryId: z.string().uuid(),
        status: z.enum(["accepted", "collecting", "in_transit", "delivered", "cancelled"]),
      })
      .parse(data),
  )
  .handler(({ data, context }) =>
    updateDriverDeliveryAdmin(context.userId, data.deliveryId, data.status),
  );