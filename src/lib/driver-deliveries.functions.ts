import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireExternalSupabaseAuth } from "./external-auth-middleware";

export const updateDriverDelivery = createServerFn({ method: "POST" })
  .middleware([requireExternalSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        deliveryId: z.string().uuid(),
        status: z.enum(["accepted", "collecting", "in_transit", "delivered", "cancelled"]),
        driverId: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { updateDriverDeliveryAdmin } = await import("./driver-deliveries.server");
    return updateDriverDeliveryAdmin(context.userId, data.deliveryId, data.status, data.driverId);
  });