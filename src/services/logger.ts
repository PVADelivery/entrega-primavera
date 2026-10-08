import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ErrorPayload {
  error_message: string;
  stack_trace?: string;
  url?: string;
  additional_info?: Record<string, any>;
  is_spam?: boolean;
  is_attack?: boolean;
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

export async function reportSpamToTelegram(
  reason: string,
  details: Record<string, any> = {},
  appName = "App Entregador"
) {
  return reportErrorToTelegram(
    {
      error_message: `[SPAM / ABUSO] ${reason}`,
      url: typeof window !== "undefined" ? window.location.href : "N/A",
      is_spam: true,
      additional_info: details,
    },
    appName
  );
}

export async function reportFailedLogin(
  email: string,
  details: Record<string, any> = {},
  appName = "App Entregador"
) {
  if (typeof window === "undefined") return;
  try {
    await supabase.functions.invoke("telegram-logger", {
      body: {
        event_type: "failed_login",
        app_name: appName,
        user_email: email,
        url: window.location.href,
        error_message: details.error_message || "Tentativa de login com senha incorreta",
        additional_info: {
          userAgent: navigator.userAgent,
          ...details
        }
      }
    });
  } catch (_) {}
}

export async function reportInvalidRoute(
  path: string,
  details: Record<string, any> = {},
  appName = "App Entregador"
) {
  if (typeof window === "undefined") return;
  try {
    await supabase.functions.invoke("telegram-logger", {
      body: {
        event_type: "invalid_route",
        app_name: appName,
        url: window.location.href,
        error_message: `Acesso a link inexistente / 404: ${path}`,
        additional_info: {
          path,
          referrer: document.referrer || "Direto",
          userAgent: navigator.userAgent,
          ...details
        }
      }
    });
  } catch (_) {}
}

export async function reportErrorToTelegram(payload: ErrorPayload, appName = "App Entregador") {
  if (typeof window === "undefined") return;

  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider") || ua.includes("headless") || ua.includes("googlebot")) {
    return;
  }

  const msg = (payload.error_message || "").toLowerCase();
  const isIgnored = 
    msg.includes("aceita por outro") ||
    msg.includes("delivery_not_available") ||
    msg.includes("row level security") ||
    msg.includes("blocked the action") ||
    msg.includes("not found") ||
    msg.includes("cancelada pelo usuário") ||
    msg.includes("insertbefore") ||
    msg.includes("removechild") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("importing a module script failed") ||
    msg.includes("categoria não habilitada") ||
    msg.includes("não habilitada pelo administrador") ||
    msg.includes("categoria nao habilitada") ||
    msg.includes("nao habilitada pelo administrador") ||
    msg.includes("invalid login credentials") ||
    msg.includes("invalid_grant") ||
    msg.includes("e-mail ou senha incorretos") ||
    msg.includes("email ou senha incorretos") ||
    msg.includes("credenciais inválidas") ||
    msg.includes("email not confirmed") ||
    msg.includes("minified react error #520") ||
    msg.includes("minified react error #418") ||
    msg.includes("minified react error #423") ||
    msg.includes("minified react error #425") ||
    msg.includes("react error #520") ||
    msg.includes("react error #418") ||
    msg.includes("refresh_token") ||
    msg.includes("grant_type=refresh_token") ||
    msg.includes("rate limit") && (msg.includes("token") || msg.includes("auth") || msg.includes("supabase")) ||
    msg.includes("429") && (msg.includes("token") || msg.includes("auth") || msg.includes("refresh")) ||
    msg.includes("hydration failed");

  if (isIgnored) return;

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
      is_spam: payload.is_spam || false,
      is_attack: payload.is_attack || false,
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
      const isSecurityAlert = Boolean(
        payload.is_spam ||
        payload.is_attack ||
        msg.includes("[spam]") ||
        msg.includes("[ataque detectado]") ||
        msg.includes("[abuso]")
      );

      let messageText = "";
      if (isSecurityAlert) {
        messageText += `🛡️ <b>ALERTA DE SEGURANÇA: SPAM / ABUSO DETECTADO (Direct)</b> 🛡️\n\n`;
        messageText += `📱 <b>Módulo / App:</b> ${escapeHtml(appName, 80)}\n`;
        messageText += `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n`;
        messageText += `🔗 <b>URL:</b> <code>${escapeHtml(requestBody.url, 250)}</code>\n`;
        messageText += `👤 <b>Usuário:</b> ${escapeHtml(requestBody.user_email, 100)} (<code>${escapeHtml(requestBody.user_id, 60)}</code>)\n\n`;
        messageText += `⚠️ <b>Tipo de Abuso / Alerta:</b>\n<b>${escapeHtml(requestBody.error_message, 800)}</b>\n\n`;
      } else {
        messageText += `🚨 <b>ERRO NO SISTEMA / TELA (Direct)</b> 🚨\n\n`;
        messageText += `📱 <b>App:</b> ${escapeHtml(appName, 80)}\n`;
        messageText += `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n`;
        messageText += `🔗 <b>URL:</b> <code>${escapeHtml(requestBody.url, 250)}</code>\n`;
        messageText += `👤 <b>Usuário:</b> ${escapeHtml(requestBody.user_email, 100)} (<code>${escapeHtml(requestBody.user_id, 60)}</code>)\n\n`;
        messageText += `⚠️ <b>Mensagem:</b>\n<b>${escapeHtml(requestBody.error_message, 800)}</b>\n\n`;
      }

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

  // Intercept Vite dynamic chunk import failures to auto-reload fresh code assets
  try {
    window.addEventListener("vite:preloadError", (event) => {
      console.warn("Vite chunk preload error detected, reloading page...", event);
      window.location.reload();
    });

    window.addEventListener("error", (e) => {
      const msgStr = e.message ? e.message.toLowerCase() : "";
      if (msgStr.includes("failed to fetch dynamically imported module") || msgStr.includes("importing a module script failed")) {
        console.warn("Dynamic import failed, reloading page...");
        window.location.reload();
      }
    });
  } catch {}

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
          const lower = (msgStr || "").toLowerCase();

          // Trata automaticamente sessão expirada (JWT Expired) sem poluir logs do Telegram
          if (lower.includes("jwt expired") || lower.includes("token expired") || lower.includes("session expired")) {
            supabase.auth.refreshSession().catch(() => {});
            return;
          }

          const isRaceCondition = 
            !msgStr ||
            msgStr.includes("cancelada pelo usuário") ||
            msgStr.includes("aceita por outro") ||
            msgStr.includes("DELIVERY_NOT_AVAILABLE") ||
            msgStr.includes("Row level security") ||
            msgStr.includes("blocked the action") ||
            msgStr.includes("not found") ||
            lower.includes("failed to fetch") ||
            lower.includes("networkerror") ||
            lower.includes("network request failed");

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

  // Intercept fetch calls for HTTP 429 (Rate Limit / Bloqueio de Spam do Servidor)
  try {
    const rawFetch = window.fetch;
    if (rawFetch && !(rawFetch as any).__telegram_fetch_patched) {
      window.fetch = async function (...args) {
        const response = await rawFetch.apply(this, args);
        if (response && response.status === 429) {
          const targetUrl = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "Desconhecido";
          const lowerUrl = targetUrl.toLowerCase();

          // NUNCA disparar alerta para renovação interna de token do Supabase, bots, ou chamadas de telemetria
          const isIgnoredUrl =
            lowerUrl.includes("auth/v1/token") ||
            lowerUrl.includes("refresh_token") ||
            lowerUrl.includes("telegram-logger") ||
            lowerUrl.includes("api.telegram.org") ||
            lowerUrl.includes("supabase.co/auth") ||
            lowerUrl.includes("tile.openstreetmap.org");

          if (!isIgnoredUrl) {
            reportSpamToTelegram("Servidor retornou HTTP 429 (Rate Limit / Bloqueio de Spam)", {
              url: targetUrl,
              status: 429,
            }, appName);
          }
        }
        return response;
      };
      (window.fetch as any).__telegram_fetch_patched = true;
    }
  } catch {}

  // 1. Unhandled exceptions
  window.onerror = (message, source, lineno, colno, error) => {
    const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
    if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider") || ua.includes("headless") || ua.includes("googlebot")) {
      return true;
    }

    const msgStr = String(message || "");
    const lower = msgStr.toLowerCase();

    // Ignore browser-translation DOM mutation errors
    if (lower.includes("insertbefore") || lower.includes("removechild")) {
      return true;
    }

    // Ignore generic cross-origin, browser extension, or Safari background termination noise without source/line
    if (
      lower === "script error." ||
      lower === "script error" ||
      (!error && !source && lineno === 0 && colno === 0)
    ) {
      console.warn("[Logger] Generic cross-origin / browser extension Script Error ignored.");
      return true;
    }

    // Ignore benign React concurrent/hydration recovery notices
    if (
      lower.includes("minified react error #520") ||
      lower.includes("minified react error #418") ||
      lower.includes("minified react error #423") ||
      lower.includes("minified react error #425") ||
      lower.includes("react error #520") ||
      lower.includes("react error #418") ||
      lower.includes("hydration failed") ||
      lower.includes("_nonreactive")
    ) {
      console.warn("[Logger] React concurrent/hydration recovery notice handled gracefully by client renderer.");
      return true;
    }

    reportErrorToTelegram({
      error_message: msgStr,
      stack_trace: error?.stack || `At ${source || 'unknown'}:${lineno}:${colno}`,
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
    const lower = (msg || "").toLowerCase();

    // Silencia erros de race condition do router
    if (lower.includes("_nonreactive")) {
      return;
    }

    // Silencia rejeições de JWT Expirado e tenta renovar a sessão silenciosamente sem forçar logout
    if (lower.includes("jwt expired") || lower.includes("token expired") || lower.includes("session expired")) {
      supabase.auth.refreshSession().catch(() => {});
      return;
    }

    // Silencia rejeições de renovação de token e 429 de autenticação
    if (
      lower.includes("refresh_token") ||
      lower.includes("grant_type=refresh_token") ||
      (lower.includes("429") && (lower.includes("token") || lower.includes("auth")))
    ) {
      return;
    }

    // Silencia rejeições de áudio/permissão de navegador não críticas (ex: autoplay policy do Safari / falta de clique)
    if (
      lower.includes("notallowederror") ||
      lower.includes("aborterror") ||
      lower.includes("user gesture") ||
      lower.includes("requestpermission") ||
      lower.includes("the operation was aborted") ||
      lower.includes("the play() request was interrupted") ||
      lower.includes("script error")
    ) {
      console.warn("[Logger] Non-critical browser rejection ignored:", msg);
      return;
    }

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
