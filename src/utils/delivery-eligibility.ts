import { getElapsedSeconds } from "./time";

export const ADMIN_WINDOW_SECONDS = 120; // 2 minutos (120 segundos) da janela do Admin

/**
 * Regra de Elegibilidade de Entregas:
 * 1. Não elegível se já finalizada/cancelada.
 * 2. Se atribuída a outro entregador específico, ignora.
 * 3. Se atribuída ao entregador logado, ou transmitida (broadcasted):
 *    DISPONÍVEL E NOTIFICA IMEDIATAMENTE!
 * 4. Se for pendente geral (sem motorista atribuído):
 *    Respeita a regra dos 2 minutos (120s) do Admin. Só fica disponível e notifica
 *    após decorridos 120 segundos da criação (created_at).
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

  // 3. Se o administrador transmitiu para todos: DISPONÍVEL E NOTIFICA IMEDIATAMENTE!
  if (status === "broadcasted") {
    return true;
  }

  // 4. Se o status for pendente/aberto e não estiver atribuída:
  // REGRA DOS 2 MINUTOS DO ADMIN: Só fica elegível após completar 120 segundos!
  const validPendingStatuses = ["pending", "pending_assignment", "created", "open", "em_aberto", "pendente"];
  if (validPendingStatuses.includes(status)) {
    if (delivery.created_at) {
      const elapsed = getElapsedSeconds(delivery.created_at);
      if (elapsed < ADMIN_WINDOW_SECONDS) {
        return false; // Janela exclusiva do Admin (2 minutos)
      }
    }
    return true;
  }

  return false;
}
