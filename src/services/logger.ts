import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ErrorPayload {
  error_message: string;
  stack_trace?: string;
  url?: string;
  additional_info?: Record<string, any>;
}

const TELEGRAM_BOT_TOKEN = "8408781765:AAEoxY7J9VrNeagGNFu1yHpW3HQlq103gmM";
const TELEGRAM_CHAT_ID = "-5333281601";

// In-memory deduplication cache: messageHash -> timestamp
const recentErrors = new Map<string, number>();
const DEDUPE_WINDOW_MS = 15000; // 15 seconds

let isReporting = false;

function escapeHtml(input: unknown, max = 1500): string {
  const s = String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export async function reportErrorToTelegram(payload: ErrorPayload, appName = "App Entregador") {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const errorKey = `${appName}:${payload.error_message}:${payload.url || ""}`;
  const lastSent = recentErrors.get(errorKey);
  if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
    return; // Ignore duplicate within cooldown
  }
  recentErrors.set(errorKey, now);

  // Clean old deduplication entries
  if (recentErrors.size > 100) {
    for (const [k, v] of recentErrors.entries()) {
      if (now - v > DEDUPE_WINDOW_MS) recentErrors.delete(k);
    }
  }

  if (isReporting) return;
  isReporting = true;

  try {
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    
    const requestBody = {
      app_name: appName,
      error_message: payload.error_message,
      stack_trace: payload.stack_trace || new Error().stack || "",
      user_id: user?.id || "Não autenticado",
      user_email: user?.email || "Anônimo",
      url: payload.url || window.location.href,
      additional_info: {
        userAgent: navigator.userAgent,
        screenResolution: `${window.innerWidth}x${window.innerHeight}`,
        time: new Date().toISOString(),
        ...payload.additional_info
      }
    };

    // 1. Try Supabase Edge Function
    let edgeSuccess = false;
    try {
      const { data, error } = await supabase.functions.invoke("telegram-logger", {
        body: requestBody
      });
      if (!error && (data as any)?.success) {
        edgeSuccess = true;
      }
    } catch {
      edgeSuccess = false;
    }

    // 2. Direct Fallback if Edge function failed or is unconfigured
    if (!edgeSuccess) {
      const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });
      let messageText = `🚨 <b>ERRO NO SISTEMA / TELA (Direct)</b> 🚨\n\n`;
      messageText += `📱 <b>App:</b> ${escapeHtml(appName, 80)}\n`;
      messageText += `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n`;
      messageText += `🔗 <b>URL:</b> <code>${escapeHtml(requestBody.url, 250)}</code>\n`;
      messageText += `👤 <b>Usuário:</b> ${escapeHtml(requestBody.user_email, 100)} (<code>${escapeHtml(requestBody.user_id, 60)}</code>)\n\n`;
      messageText += `⚠️ <b>Mensagem:</b>\n<b>${escapeHtml(requestBody.error_message, 800)}</b>\n\n`;

      if (requestBody.stack_trace) {
        messageText += `📜 <b>Stack Trace:</b>\n<pre>${escapeHtml(requestBody.stack_trace, 1200)}</pre>\n\n`;
      }

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messageText,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error("Failed to report error to Telegram:", err);
  } finally {
    isReporting = false;
  }
}

// Global error handlers + Toast error interceptor
export function initializeGlobalErrorHandlers(appName: string) {
  if (typeof window === "undefined") return;

  // 0. Monkeypatch Node.prototype.insertBefore & removeChild for Google Translate / Browser Extension compatibility
  try {
    if (typeof Node !== "undefined" && !(Node.prototype as any).__patched_for_translate) {
      const originalInsertBefore = Node.prototype.insertBefore;
      Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
        if (referenceNode && referenceNode.parentNode !== this) {
          if (referenceNode.parentNode && referenceNode.parentNode.parentNode === this) {
            return originalInsertBefore.call(this, newNode, referenceNode.parentNode) as T;
          }
          return originalInsertBefore.call(this, newNode, null) as T;
        }
        return originalInsertBefore.call(this, newNode, referenceNode) as T;
      };

      const originalRemoveChild = Node.prototype.removeChild;
      Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (child && child.parentNode !== this) {
          if (child.parentNode) {
            return child.parentNode.removeChild(child) as T;
          }
          return child;
        }
        return originalRemoveChild.call(this, child) as T;
      };

      (Node.prototype as any).__patched_for_translate = true;
    }
  } catch (e) {
    console.warn("Could not patch Node prototypes for translation compatibility:", e);
  }

  // Intercept Sonner toast.error calls to immediately log on-screen errors
  try {
    const rawToast = toast as any;
    if (rawToast && typeof rawToast.error === "function" && !rawToast.__telegram_patched) {
      const originalToastError = rawToast.error;
      rawToast.error = function (message: any, options?: any) {
        try {
          const msgStr = typeof message === "string" ? message : (message?.message || message?.toString?.() || JSON.stringify(message));
          const isRaceCondition = 
            !msgStr ||
            msgStr.includes("cancelada pelo usuário") ||
            msgStr.includes("aceita por outro") ||
            msgStr.includes("DELIVERY_NOT_AVAILABLE") ||
            msgStr.includes("Row level security") ||
            msgStr.includes("blocked the action") ||
            msgStr.includes("not found");

          if (typeof msgStr === "string" && !isRaceCondition) {
            reportErrorToTelegram({
              error_message: `[Erro na Tela] ${msgStr}`,
              url: window.location.href,
              additional_info: { type: "toast_error", options }
            }, appName);
          }
        } catch {}
        return originalToastError.apply(rawToast, [message, options]);
      };
      rawToast.__telegram_patched = true;
    }
  } catch {}

  // 1. Unhandled exceptions
  window.onerror = (message, source, lineno, colno, error) => {
    const msgStr = String(message);
    if (msgStr.includes("insertBefore") || msgStr.includes("removeChild")) {
      return true; // Ignore browser-translation DOM mutation errors
    }
    reportErrorToTelegram({
      error_message: String(message),
      stack_trace: error?.stack || `At ${source}:${lineno}:${colno}`,
      url: window.location.href,
      additional_info: {
        source,
        lineno,
        colno
      }
    }, appName);
    return false;
  };

  // 2. Unhandled promise rejections
  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const msg = reason?.message || (typeof reason === "object" ? JSON.stringify(reason) : String(reason));
    reportErrorToTelegram({
      error_message: `Unhandled Rejection: ${msg}`,
      stack_trace: reason?.stack || "No stack trace available",
      url: window.location.href,
      additional_info: {
        reason: typeof reason === "object" ? JSON.stringify(reason) : String(reason)
      }
    }, appName);
  };
}
