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
      channel = supabase
        .channel(`chat-driver-${user.id}`)
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
    <DriverShell>
      <div className="flex h-[calc(100vh-6rem)] flex-col px-3 pt-3 max-w-md mx-auto">
        {/* Cabeçalho da Central com WhatsApp */}
        <div className="mb-2.5 rounded-2xl bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 border border-amber-500/30 p-3 shadow-md flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="h-10 w-10 rounded-2xl bg-amber-500 flex items-center justify-center text-slate-950 font-black shadow-lg">
                <Headphones className="h-5 w-5" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black text-foreground truncate flex items-center gap-1.5">
                Central MT 24horas
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 font-bold rounded-full">Online</span>
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                Suporte e Atendimento aos Parceiros
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={openWhatsAppCentral}
            className="h-9 px-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl shadow-md flex items-center gap-1.5 text-xs shrink-0 cursor-pointer"
            title="Chamar suporte rápido no WhatsApp da Central"
          >
            <WhatsappIcon className="h-4 w-4" />
            WhatsApp
          </Button>
        </div>

        {/* Card do Chat */}
        <Card className="flex flex-1 flex-col overflow-hidden rounded-2xl border-white/10 bg-slate-950/80 backdrop-blur-xl shadow-2xl">
          {/* Mensagens */}
          <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
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
          <div className="px-2.5 py-1.5 border-t border-white/5 bg-slate-900/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
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
          <form onSubmit={handleFormSubmit} className="flex gap-2 border-t border-white/10 p-2.5 bg-slate-950/90">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem para a central..."
              className="h-10 text-xs bg-slate-900 border-white/10 rounded-xl focus-visible:ring-amber-500 text-foreground"
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