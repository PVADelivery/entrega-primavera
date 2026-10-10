import { toast } from "sonner";

/**
 * Detecta falhas de conexão (rede offline, DNS, timeout, CORS, servidor fora do ar)
 * em erros vindos do Supabase/fetch.
 */
export function isConnectionError(err: any): boolean {
  if (!err) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = String(err.message || err.error_description || err || "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("fetch failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("dns") ||
    msg.includes("offline") ||
    msg.includes("sem conex") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("504")
  );
}

/** Mensagem amigável para exibir ao entregador. */
export function connectionErrorMessage(what: string): string {
  return `Sem conexão com o servidor. Não foi possível carregar ${what}. Verifique sua internet e tente novamente.`;
}

// Evita bombardear o usuário com toasts repetidos quando as queries fazem polling.
const lastToastAt: Record<string, number> = {};
const TOAST_THROTTLE_MS = 30000;

/**
 * Mostra um toast claro quando a falha é de conexão.
 * Retorna true se o erro era de conexão (e o toast foi considerado), false caso contrário.
 */
export function notifyConnectionError(err: any, what: string, key = what): boolean {
  if (!isConnectionError(err)) return false;
  const now = Date.now();
  if (!lastToastAt[key] || now - lastToastAt[key] > TOAST_THROTTLE_MS) {
    lastToastAt[key] = now;
    toast.error(connectionErrorMessage(what), { duration: 6000 });
  }
  return true;
}
