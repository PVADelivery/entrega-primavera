import { createClient } from "@supabase/supabase-js";

type DriverDeliveryStatus =
  | "accepted"
  | "collecting"
  | "in_transit"
  | "delivered"
  | "cancelled";

const allowedTransitions: Record<string, DriverDeliveryStatus[]> = {
  pending: ["accepted", "cancelled"],
  broadcasted: ["accepted", "cancelled"],
  accepted: ["collecting", "cancelled"],
  collecting: ["in_transit", "cancelled"],
  picked_up: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  in_route: ["delivered", "cancelled"],
};

function externalAdminClient() {
  const url =
    process.env["EXTERNAL_SUPABASE_URL"] ||
    process.env["VITE_SUPABASE_URL"] ||
    "https://owlbzwsdcognrgolvnzg.supabase.co";
  const key = process.env["EXTERNAL_SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !key) {
    throw new Error("Serviço de entregas indisponível.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function updateDriverDeliveryAdmin(
  userId: string,
  deliveryId: string,
  nextStatus: DriverDeliveryStatus,
) {
  const admin = externalAdminClient();
  const { data: driverRows, error: driverError } = await admin
    .from("delivery_drivers")
    .select("id")
    .eq("user_id", userId);

  if (driverError) throw new Error("Não foi possível validar o entregador.");

  const permittedDriverIds = new Set([userId, ...(driverRows ?? []).map((row) => row.id)]);
  const { data: delivery, error: deliveryError } = await admin
    .from("deliveries")
    .select("id, driver_id, status")
    .eq("id", deliveryId)
    .maybeSingle();

  if (deliveryError || !delivery) throw new Error("Entrega não encontrada.");
  if (!delivery.driver_id || !permittedDriverIds.has(delivery.driver_id)) {
    throw new Error("Esta entrega não pertence à sua conta.");
  }

  const allowed = allowedTransitions[String(delivery.status)] ?? [];
  if (!allowed.includes(nextStatus)) {
    if (delivery.status === nextStatus) return { success: true, status: nextStatus };
    throw new Error("Esta alteração de status não é permitida.");
  }

  const now = new Date().toISOString();
  const updates: Record<string, string> = { status: nextStatus, updated_at: now };
  if (nextStatus === "accepted") updates.accepted_at = now;
  if (nextStatus === "collecting") updates.collected_at = now;
  if (nextStatus === "delivered") updates.completed_at = now;
  if (nextStatus === "cancelled") updates.cancelled_at = now;

  const { error: updateError } = await admin
    .from("deliveries")
    .update(updates)
    .eq("id", deliveryId)
    .eq("driver_id", delivery.driver_id);

  if (updateError) throw new Error("Não foi possível atualizar a entrega.");
  return { success: true, status: nextStatus };
}