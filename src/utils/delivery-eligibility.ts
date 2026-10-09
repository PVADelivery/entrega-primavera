import { getElapsedSeconds } from "./time";

export const ADMIN_WINDOW_SECONDS = 0; // Disponibilização e notificação IMEDIATA para entregadores (padrão speed-squad)

/**
 * Regra de Elegibilidade de Entregas:
 * 1. Não elegível se já finalizada/cancelada.
 * 2. Se atribuída a outro entregador específico, ignora.
 * 3. Se atribuída ao entregador logado, ou transmitida (broadcasted), ou pendente geral:
 *    DISPONÍVEL E NOTIFICA IMEDIATAMENTE (sem janela de espera artificial).
 */
export function isDeliveryEligibleForDriver(
  delivery: any,
  currentDriverId?: string | null,
  currentUserId?: string | null
): boolean {
  if (!delivery) return false;

  const status = String(delivery.status || "").toLowerCase();

  // Se já finalizada ou cancelada, nunca elegível
  if (["completed", "delivered", "cancelled", "returned", "concluida", "cancelada"].includes(status)) {
    return false;
  }

  const assignedId = delivery.driver_id ? String(delivery.driver_id).toLowerCase().trim() : "";
  const isAssigned = Boolean(assignedId && assignedId !== "none" && assignedId !== "00000000-0000-0000-0000-000000000000");

  const myIds = [currentDriverId, currentUserId]
    .filter(Boolean)
    .map((id) => String(id).toLowerCase().trim());

  // 1. Se atribuída para outro entregador específico, não oferece
  if (isAssigned && myIds.length > 0 && !myIds.includes(assignedId)) {
    return false;
  }

  // 2. Se atribuída diretamente para o motorista logado pelo Admin: DISPONÍVEL E NOTIFICA IMEDIATAMENTE!
  if (isAssigned && myIds.includes(assignedId)) {
    return true;
  }

  // 3. Se transmitida para todos (broadcasted): DISPONÍVEL IMEDIATAMENTE!
  if (status === "broadcasted") {
    return true;
  }

  // 4. Se a entrega foi devolvida / reaberta recentemente: DISPONÍVEL IMEDIATAMENTE!
  const isReopened = Boolean(
    delivery.updated_at &&
    delivery.created_at &&
    delivery.updated_at !== delivery.created_at &&
    getElapsedSeconds(delivery.updated_at) <= 300
  );
  if (isReopened) {
    return true;
  }

  // 5. Se o status for pendente/aberto e não estiver atribuída: DISPONÍVEL IMEDIATAMENTE!
  const validPendingStatuses = ["pending", "pending_assignment", "created", "open", "em_aberto", "pendente"];
  if (validPendingStatuses.includes(status)) {
    return true;
  }

  return false;
}
