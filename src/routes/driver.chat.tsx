import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle, Phone, CheckCheck, Headphones, AlertCircle, Sparkles } from "lucide-react";
import { WhatsappIcon } from "@/components/icons/WhatsappIcon";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/driver/chat")({
  component: ChatPage,
  head: () => ({ meta: [{ title: "Chat da Central — MT 24horas express" }] }),
});

const CENTRAL_WHATSAPP = "556697196937";
const CENTRAL_DISPLAY_PHONE = "(66) 9719-6937";

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  is_local?: boolean;
}

const QUICK_ACTIONS = [
  "Estou no local e o cliente não atende",
  "Endereço incorreto ou não localizado",
  "Problema com taxa ou pagamento",
  "Dúvida urgente sobre a corrida/entrega",
];

function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [hasTable, setHasTable] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Carregar mensagens salvas localmente como fallback
  const localCacheKey = useMemo(() => `pva_driver_chat_${user?.id || "guest"}`, [user?.id]);

  useEffect(() => {
    if (!user) return;

    let isSubscribed = true;

    // 1. Carrega cache local imediato
    try {
      const cached = localStorage.getItem(localCacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {}

    // 2. Tenta carregar mensagens da tabela remota com proteção contra 404
    (async () => {
      try {
        const { data, error } = await supabase
          .from("chat_messages")
          .select("*")
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("created_at", { ascending: true })
          .limit(100);

        if (error) {
          // Se a tabela ainda não existir no Postgres (404), trata graciosamente
          if (error.code === "PGRST205" || error.message?.includes("does not exist") || (error as any).status === 404) {
            if (isSubscribed) setHasTable(false);
            return;
          }
          console.warn("[DriverChat] Aviso ao carregar histórico:", error.message);
          return;
        }

        if (isSubscribed && data) {
          setHasTable(true);
          setMessages(data as ChatMessage[]);
          try {
            localStorage.setItem(localCacheKey, JSON.stringify(data));
          } catch {}
        }
      } catch (err) {
        console.warn("[DriverChat] Erro resiliente ao consultar chat_messages:", err);
      }
    })();

    // 3. Inscrição Realtime caso a tabela esteja disponível
    let channel: any = null;
    try {
      const chUnique = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      channel = supabase
        .channel(`chat-driver-${chUnique}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          (payload) => {
            const m = payload.new as ChatMessage;
            if (m && (m.sender_id === user.id || m.receiver_id === user.id)) {
              setMessages((prev) => {
                if (prev.some((existing) => existing.id === m.id)) return prev;
                const next = [...prev, m];
                try {
                  localStorage.setItem(localCacheKey, JSON.stringify(next));
                } catch {}
                return next;
              });
            }
          }
        )
        .subscribe();
    } catch {}

    return () => {
      isSubscribed = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [user, localCacheKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(contentToSend: string) {
    const trimmed = contentToSend.trim();
    if (!user || !trimmed || sending) return;

    setSending(true);

    const tempMsg: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sender_id: user.id,
      receiver_id: user.id,
      content: trimmed,
      created_at: new Date().toISOString(),
      is_local: true,
    };

    // Adiciona imediatamente na tela para resposta instantânea
    setMessages((prev) => {
      const next = [...prev, tempMsg];
      try {
        localStorage.setItem(localCacheKey, JSON.stringify(next));
      } catch {}
      return next;
    });

    setText("");

    try {
      const { data, error } = await supabase.from("chat_messages").insert({
        sender_id: user.id,
        receiver_id: user.id,
        content: trimmed,
      }).select().maybeSingle();

      if (error) {
        console.warn("[DriverChat] Tabela remota pendente, mensagem salva localmente:", error.message);
      } else if (data) {
        // Substitui o id local pelo id real do banco
        setMessages((prev) =>
          prev.map((m) => (m.id === tempMsg.id ? (data as ChatMessage) : m))
        );
      }
    } catch (e) {
      console.warn("[DriverChat] Mensagem retida localmente:", e);
    } finally {
      setSending(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleSend(text);
  }

  const openWhatsAppCentral = () => {
    const defaultMsg = encodeURIComponent(
      `Olá Central MT 24horas express! Sou o entregador/motorista parceiro e preciso de suporte com um atendimento.`
    );
    window.open(`https://wa.me/${CENTRAL_WHATSAPP}?text=${defaultMsg}`, "_blank", "noopener,noreferrer");
  };

  return (
    <DriverShell noBottomPadding>
      <div 
        className="flex flex-col px-3 max-w-md mx-auto w-full"
        style={{
          height: "100dvh",
          paddingTop: "max(calc(env(safe-area-inset-top, 0px) + 0.75rem), 1.25rem)",
          paddingBottom: "max(calc(env(safe-area-inset-bottom, 0px) + 5.25rem), 5.25rem)",
        }}
      >
        {/* Cabeçalho Premium da Central com WhatsApp */}
        <div className="mb-2.5 rounded-2xl bg-gradient-to-r from-slate-900 via-[#0f172a] to-slate-900 border border-amber-500/30 p-3.5 shadow-xl shadow-black/25 flex items-center justify-between gap-2.5 relative overflow-hidden shrink-0">
          {/* Brilho sutil dourado de fundo */}
          <div 
            className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-amber-500/10 blur-2xl"
            aria-hidden
          />

          <div className="flex items-center gap-3 min-w-0 relative z-10">
            <div className="relative shrink-0">
              <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-amber-300 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-amber-500/25 ring-2 ring-amber-400/30">
                <Headphones className="h-5 w-5 stroke-[2.5]" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-900 flex items-center justify-center shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-black text-white tracking-tight truncate drop-shadow-sm">
                  Central MT 24horas
                </h1>
                <span className="shrink-0 text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold rounded-full flex items-center gap-1 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Online
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium truncate mt-0.5">
                Suporte e Atendimento aos Parceiros
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={openWhatsAppCentral}
            className="h-10 px-3.5 bg-gradient-to-r from-[#25D366] to-[#1ebd5b] hover:from-[#20bd5a] hover:to-[#1aa851] text-white font-bold rounded-xl shadow-lg shadow-emerald-950/40 border border-emerald-400/30 flex items-center gap-1.5 text-xs shrink-0 cursor-pointer transition-transform active:scale-95 relative z-10"
            title="Chamar suporte rápido no WhatsApp da Central"
          >
            <WhatsappIcon className="h-4 w-4" />
            WhatsApp
          </Button>
        </div>

        {/* Card do Chat */}
        <Card className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
          {/* Mensagens */}
          <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto p-3.5">
            {/* Mensagem de Boas-Vindas da Central */}
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-xs bg-slate-900 border border-white/10 p-3 text-xs text-slate-200 shadow-sm leading-relaxed">
                <p className="font-bold text-amber-400 mb-1 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" /> Central de Operações
                </p>
                <p>
                  Olá! Como podemos te ajudar hoje? Envie sua dúvida abaixo ou clique no botão verde no topo para falar diretamente no WhatsApp da Central:{" "}
                  <strong className="text-emerald-400">{CENTRAL_DISPLAY_PHONE}</strong>.
                </p>
              </div>
            </div>

            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              const timeStr = m.created_at
                ? new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                : "";

              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md ${
                      mine
                        ? "rounded-tr-xs bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-medium"
                        : "rounded-tl-xs bg-slate-900 border border-white/10 text-slate-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[9px] opacity-75 font-bold">
                      <span>{timeStr}</span>
                      {mine && <CheckCheck className="h-3 w-3" />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Atalhos Rápidos */}
          <div className="px-2.5 py-1.5 border-t border-white/5 bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => handleSend(action)}
                className="whitespace-nowrap px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-semibold text-slate-300 transition-colors shrink-0 cursor-pointer"
              >
                {action}
              </button>
            ))}
          </div>

          {/* Barra de Digitação */}
          <form onSubmit={handleFormSubmit} className="flex gap-2 border-t border-white/10 p-2.5 bg-slate-950/90 shrink-0">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem para a central..."
              className="h-10 text-xs bg-slate-900 border-white/10 rounded-xl focus-visible:ring-amber-500 text-white placeholder:text-slate-400"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim() || sending}
              className="h-10 w-10 shrink-0 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl shadow-md cursor-pointer transition-transform active:scale-95"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </DriverShell>
  );
}