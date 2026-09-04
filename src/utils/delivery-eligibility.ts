import { getElapsedSeconds } from "./time";

export const ADMIN_WINDOW_SECONDS = 120; // 2 minutos estipulados pelo Admin

/**
 * Regra Obrigatória e Rígida:
 * NÃO É PARA NOTIFICAR NEM SOM, NEM POP NEM NADA ATÉ DAR OS 2 MINUTOS (120s)
 * 
 * Uma entrega só pode notificar, abrir popup ou tocar áudio para o entregador se:
 * 1. Foi explicitamente atribuída ao entregador logado (driver_id === currentDriverId); OU
 * 2. Foi transmitida manualmente para todos pelo Admin (status === "broadcasted"); OU
 * 3. Se for 'pending', JÁ SE PASSARAM PELO MENOS 120 SEGUNDOS (2 minutos) desde created_at.
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

  // 4. Se o status não for 'pending', não oferece para entregadores gerais
  if (status !== "pending") {
    return false;
  }

  // 5. Para status 'pending' sem entregador atribuído:
  // REGRA DOS 2 MINUTOS: OBRIGATÓRIO ter timestamp e ter se passado no mínimo 120 segundos
  if (!delivery.created_at) {
    return false; // Sem data de criação confiável, BLOQUEADO por segurança
  }

  const elapsedSeconds = getElapsedSeconds(delivery.created_at);
  return elapsedSeconds >= ADMIN_WINDOW_SECONDS;
}
