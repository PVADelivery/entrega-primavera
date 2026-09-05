import { getElapsedSeconds } from "./time";

export const ADMIN_WINDOW_SECONDS = 0; // Notificação imediata sem espera

/**
 * Notifica a corrida instantaneamente para o entregador assim que for criada
 */
export function isDeliveryEligibleForDriver(
  delivery: any,
  currentDriverId?: string | null
): boolean {
  if (!delivery) return false;

  const status = String(delivery.status || "").toLowerCase();

  // Se já finalizada ou cancelada, nunca elegível
  if (["completed", "delivered", "cancelled", "returned", "concluida", "cancelada"].includes(status)) {
    return false;
  }

  // 1. Se atribuída para outro entregador, nunca oferece
  if (delivery.driver_id && currentDriverId && String(delivery.driver_id).toLowerCase() !== String(currentDriverId).toLowerCase()) {
    return false;
  }

  // 2. Se atribuída diretamente para o motorista logado: NOTIFICA IMEDIATAMENTE!
  if (delivery.driver_id && currentDriverId && String(delivery.driver_id).toLowerCase() === String(currentDriverId).toLowerCase()) {
    return true;
  }

  // 3. Se o administrador transmitiu para todos: NOTIFICA IMEDIATAMENTE!
  if (status === "broadcasted") {
    return true;
  }

  // 4. Se for corrida pendente/aberta: NOTIFICA IMEDIATAMENTE!
  const validPendingStatuses = ["pending", "pending_assignment", "created", "open", "em_aberto", "pendente"];
  if (validPendingStatuses.includes(status)) {
    return true;
  }

  return false;
}
