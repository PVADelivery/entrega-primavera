import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function escapeHtml(input: unknown, max = 1500): string {
  const s = String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    
    let authedUserEmail = "Anônimo";
    let authedUserId = "Não autenticado";

    // Optional user authentication check - never block error logging if user is anonymous!
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
        // Continue logging even if auth check fails
      }
    }

    const body = await req.json().catch(() => ({}));
    const {
      app_name = "App Desconhecido",
      error_message = "Sem mensagem de erro",
      stack_trace = "",
      url = "N/A",
      user_id,
      user_email,
      additional_info = {},
    } = body ?? {};

    const finalEmail = (user_email && user_email !== "Anônimo") ? user_email : authedUserEmail;
    const finalUserId = (user_id && user_id !== "Não autenticado") ? user_id : authedUserId;

    // Credentials from env with default bot token and chat ID fallback
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") || "8408781765:AAEoxY7J9VrNeagGNFu1yHpW3HQlq103gmM";
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID") || "-5333281601";
    if (!botToken || !chatId) {
      return new Response(JSON.stringify({ error: "Telegram not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Cuiaba" });

    let messageText = `🚨 <b>ERRO NO SISTEMA / TELA</b> 🚨\n\n`;
    messageText += `📱 <b>App:</b> ${escapeHtml(app_name, 80)}\n`;
    messageText += `🕒 <b>Hora:</b> ${escapeHtml(timestamp, 50)}\n`;
    messageText += `🔗 <b>URL:</b> <code>${escapeHtml(url, 250)}</code>\n`;
    messageText += `👤 <b>Usuário:</b> ${escapeHtml(finalEmail, 100)} (<code>${escapeHtml(finalUserId, 60)}</code>)\n\n`;
    messageText += `⚠️ <b>Mensagem:</b>\n<b>${escapeHtml(error_message, 800)}</b>\n\n`;

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
