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
  requestedDriverId?: string,
) {
  const admin = externalAdminClient();
  const { data: driverRows, error: driverError } = await admin
    .from("delivery_drivers")
    .select("id")
    .eq("user_id", userId);

  if (driverError) throw new Error("Não foi possível validar o entregador.");

  const permittedDriverIds = new Set([userId, ...(driverRows ?? []).map((row) => row.id)]);
  const targetDriverId = requestedDriverId ?? driverRows?.[0]?.id ?? userId;
  if (!permittedDriverIds.has(targetDriverId)) {
    throw new Error("O cadastro do entregador não pertence à sua conta.");
  }
  const { data: delivery, error: deliveryError } = await admin
    .from("deliveries")
    .select("id, driver_id, status")
    .eq("id", deliveryId)
    .maybeSingle();

  if (deliveryError || !delivery) throw new Error("Entrega não encontrada.");
  const isAvailableClaim =
    nextStatus === "accepted" &&
    !delivery.driver_id &&
    ["pending", "broadcasted"].includes(String(delivery.status));

  if (!isAvailableClaim && (!delivery.driver_id || !permittedDriverIds.has(delivery.driver_id))) {
    throw new Error("Esta entrega não pertence à sua conta.");
  }

  const allowed = allowedTransitions[String(delivery.status)] ?? [];
  if (!allowed.includes(nextStatus)) {
    if (delivery.status === nextStatus) return { success: true, status: nextStatus };
    throw new Error("Esta alteração de status não é permitida.");
  }

  const now = new Date().toISOString();
  const updates: Record<string, string> = { status: nextStatus, updated_at: now };
  if (isAvailableClaim) updates.driver_id = targetDriverId;
  if (nextStatus === "accepted") updates.accepted_at = now;
  if (nextStatus === "collecting") updates.collected_at = now;
  if (nextStatus === "delivered") updates.completed_at = now;
  if (nextStatus === "cancelled") updates.cancelled_at = now;

  let updateQuery = admin
    .from("deliveries")
    .update(updates)
    .eq("id", deliveryId);

  updateQuery = isAvailableClaim
    ? updateQuery.is("driver_id", null).in("status", ["pending", "broadcasted"])
    : updateQuery.eq("driver_id", delivery.driver_id);

  const { data: updated, error: updateError } = await updateQuery.select("id").maybeSingle();

  if (updateError) throw new Error("Não foi possível atualizar a entrega.");
  if (!updated) throw new Error("Esta entrega já foi aceita por outro entregador.");
  return { success: true, status: nextStatus };
}