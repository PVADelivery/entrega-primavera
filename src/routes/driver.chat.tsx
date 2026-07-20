import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/chat")({
  component: ChatPage,
  head: () => ({ meta: [{ title: "Chat — MT Express" }] }),
});

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

function ChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((data ?? []) as ChatMessage[]);
    })();

    const channel = supabase
      .channel("chat-driver")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.sender_id === user.id || m.receiver_id === user.id) {
            setMessages((prev) => [...prev, m]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !text.trim()) return;
    // Sem destinatário específico ainda — manda como broadcast (sender = receiver)
    // Em produção: escolher empresa/admin destinatária.
    const { error } = await supabase.from("chat_messages").insert({
      sender_id: user.id,
      receiver_id: user.id,
      content: text.trim(),
    });
    if (error) {
      toast.error("Falha ao enviar");
      return;
    }
    setText("");
  }

  return (
    <DriverShell>
      <div className="flex h-[calc(100vh-6rem)] flex-col px-4 pt-6">
        <h1 className="text-2xl font-bold text-foreground">Chat</h1>
        <p className="mb-3 text-sm text-muted-foreground">Mensagens da central</p>

        <Card className="flex flex-1 flex-col overflow-hidden rounded-2xl">
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                <MessageCircle className="h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">Sem mensagens ainda</p>
              </div>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite sua mensagem..."
            />
            <Button type="submit" size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </DriverShell>
  );
}