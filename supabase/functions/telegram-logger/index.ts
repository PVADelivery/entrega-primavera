import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- In-Memory Anti-Spam / Rate Limiter ---
const ipRequestHistory = new Map<string, number[]>();
const ipBlockedUntil = new Map<string, number>();
const recentSentMessages = new Map<string, number>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 20; // máx 20 chamadas/minuto por IP
const BLOCK_DURATION_MS = 2 * 60 * 1000; // 2 minutos de bloqueio temporário
const DEDUPE_WINDOW_MS = 10 * 1000; // 10 segundos para mensagens idênticas
const MAX_BODY_BYTES = 32 * 1024; // 32KB máx

function escapeHtml(input: unknown, max = 1500): string {
  const s = String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "IP Desconhecido"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const clientIp = getClientIp(req);
  const now = Date.now();

  // 1. Verificação de Bloqueio por Spam / Flood
  const blockedUntil = ipBlockedUntil.get(clientIp) || 0;
  if (now < blockedUntil) {
    const remainingSeconds = Math.ceil((blockedUntil - now) / 1000);
    return new Response(
      JSON.stringify({
        error: "Too many requests. Rate limit active.",
        retry_after_seconds: remainingSeconds,
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(remainingSeconds) },
      }
    );
  }

  // 2. Rate Limiting por IP (Sliding Window)
  const timestamps = (ipRequestHistory.get(clientIp) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  ipRequestHistory.set(clientIp, timestamps);

  // Limpeza periódica de memória
  if (ipRequestHistory.size > 500) {
    for (const [ip, list] of ipRequestHistory.entries()) {
      if (list.length === 0 || now - list[list.length - 1] > RATE_LIMIT_WINDOW_MS) {
        ipRequestHistory.delete(ip);
      }
    }
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "8408781765:AAEoxY7J9VrNeagGNFu1yHpW3HQlq103gmM";
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "-5333281601";

  // Se exceder o limite de requisições, bloqueia o IP e notifica o Telegram
  if (timestamps.length > MAX_REQUESTS_PER_WINDOW) {
    ipBlockedUntil.set(clientIp, now + BLOCK_DURATION_MS);
    
    // Dispara alerta no Telegram informando o bloqueio de spam
    if (botToken && chatId) {
      try {
        const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🛡️ <b>ALERTA DE SEGURANÇA: FLOOD / SPAM BLOQUEADO NO SERVIDOR</b> 🛡️\n\n` +
              `📱 <b>Servidor:</b> Edge Function (telegram-logger)\n` +
              `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n` +
              `🌐 <b>IP Bloqueado:</b> <code>${escapeHtml(clientIp, 60)}</code>\n` +
              `⚠️ <b>Motivo:</b> Tráfego anormal / excesso de chamadas (${timestamps.length} req/min)\n` +
              `🔒 <b>Ação:</b> IP temporariamente bloqueado por 2 minutos (HTTP 429).`,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
      } catch (_) {}
    }

    return new Response(
      JSON.stringify({
        error: "Too many requests. Rate limit triggered.",
        retry_after_seconds: 120,
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "120" },
      }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    
    let authedUserEmail = "Anônimo";
    let authedUserId = "Não autenticado";

    // Opcional: validação de usuário autenticado
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ") && supabaseUrl && supabaseAnonKey) {
      try {
        const authedClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData } = await authedClient.auth.getUser();
        if (userData?.user) {
          authedUserEmail = userData.user.email ?? authedUserEmail;
          authedUserId = userData.user.id ?? authedUserId;
        }
      } catch {
        // Continua mesmo se a checagem falhar
      }
    }

    const rawBody = await req.text().catch(() => "{}");
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Payload too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: Record<string, any> = {};
    try {
      body = JSON.parse(rawBody || "{}");
    } catch {
      body = {};
    }

    const {
      app_name = "App Entregador",
      error_message = "",
      stack_trace = "",
      url = "N/A",
      user_id,
      user_email,
      is_spam = false,
      is_attack = false,
      additional_info = {},
    } = body ?? {};

    // Ignora chamadas sem mensagem real de erro ou pings vazios
    if (!error_message || error_message === "Sem mensagem de erro" || error_message.trim() === "") {
      return new Response(JSON.stringify({ success: true, ignored: true, reason: "Empty error payload ignored" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalEmail = (user_email && user_email !== "Anônimo") ? user_email : authedUserEmail;
    const finalUserId = (user_id && user_id !== "Não autenticado") ? user_id : authedUserId;

    // Deduplicação de mensagens idênticas para não inundar o Telegram
    const dedupeKey = `${app_name}:${error_message}:${url}`;
    const lastSent = recentSentMessages.get(dedupeKey);
    if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
      return new Response(JSON.stringify({ success: true, deduplicated: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    recentSentMessages.set(dedupeKey, now);

    if (!botToken || !chatId) {
      return new Response(JSON.stringify({ error: "Telegram not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });
    const isSecurityAlert = Boolean(
      is_spam ||
      is_attack ||
      error_message.toLowerCase().includes("[spam]") ||
      error_message.toLowerCase().includes("[ataque detectado]") ||
      error_message.toLowerCase().includes("[abuso]")
    );

    let messageText = "";
    if (isSecurityAlert) {
      messageText += `🛡️ <b>ALERTA DE SEGURANÇA: SPAM / ABUSO DETECTADO</b> 🛡️\n\n`;
      messageText += `📱 <b>Módulo / App:</b> ${escapeHtml(app_name, 80)}\n`;
      messageText += `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n`;
      messageText += `🌐 <b>IP de Origem:</b> <code>${escapeHtml(clientIp, 80)}</code>\n`;
      messageText += `🔗 <b>URL / Rota:</b> <code>${escapeHtml(url, 250)}</code>\n`;
      messageText += `👤 <b>Usuário:</b> ${escapeHtml(finalEmail, 100)} (<code>${escapeHtml(finalUserId, 60)}</code>)\n\n`;
      messageText += `⚠️ <b>Tipo de Abuso / Alerta:</b>\n<b>${escapeHtml(error_message, 800)}</b>\n\n`;
    } else {
      messageText += `🚨 <b>ERRO NO SISTEMA / TELA</b> 🚨\n\n`;
      messageText += `📱 <b>App:</b> ${escapeHtml(app_name, 80)}\n`;
      messageText += `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n`;
      messageText += `🔗 <b>URL:</b> <code>${escapeHtml(url, 250)}</code>\n`;
      messageText += `👤 <b>Usuário:</b> ${escapeHtml(finalEmail, 100)} (<code>${escapeHtml(finalUserId, 60)}</code>)\n\n`;
      messageText += `⚠️ <b>Mensagem:</b>\n<b>${escapeHtml(error_message, 800)}</b>\n\n`;
    }

    if (stack_trace) {
      messageText += `📜 <b>Stack Trace:</b>\n<pre>${escapeHtml(stack_trace, 1200)}</pre>\n\n`;
    }

    if (additional_info && typeof additional_info === "object" && Object.keys(additional_info).length > 0) {
      messageText += `🔍 <b>Detalhes adicionais:</b>\n<pre>${escapeHtml(JSON.stringify(additional_info, null, 2), 800)}</pre>\n`;
    }

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const resData = await response.json();
    return new Response(JSON.stringify({ success: true, telegram: resData }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in telegram-logger:", err?.message);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
