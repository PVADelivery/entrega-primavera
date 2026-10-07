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

  // 1. Se já está atribuída a algum entregador, NUNCA oferecer para aceite no app (ela já pertence exclusivamente àquele entregador)
  if (isAssigned) {
    return false;
  }

  // 2. Se o administrador transmitiu para todos (sem motorista atribuído): DISPONÍVEL E NOTIFICA IMEDIATAMENTE!
  if (status === "broadcasted") {
    return true;
  }

  // 4. Se a entrega foi devolvida / reaberta recentemente por um entregador que cancelou / recusou:
  // DISPONÍVEL IMEDIATAMENTE PARA TODOS OS DEMAIS!
  const isReopened = Boolean(
    delivery.updated_at &&
    delivery.created_at &&
    delivery.updated_at !== delivery.created_at &&
    getElapsedSeconds(delivery.updated_at) <= 300
  );
  if (isReopened) {
    return true;
  }

  // 5. Se o status for pendente/aberto e não estiver atribuída:
  // REGRA DOS 2 MINUTOS DO ADMIN: Só fica elegível após completar 120 segundos da criação original!
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
