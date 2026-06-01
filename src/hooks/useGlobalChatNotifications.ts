import { useContext, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from "@/contexts/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function useGlobalChatNotifications() {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const sessionId = Math.random().toString(36).substring(2, 10);
    const channel = supabase
      .channel(`global-notifications-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const newMessage = payload.new as any;
          if (newMessage.sender_id === user.id) return;

          const isChatPage = window.location.pathname.includes("/chat");
          
          try {
             const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
             audio.volume = 0.5;
             audio.play().catch(e => console.warn("[Audio] Bloqueio de auto-play pelo navegador:", e)); 
          } catch (err) {
             console.error("[Audio] Erro ao reproduzir som:", err);
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", newMessage.sender_id)
            .single();

          let senderName = profile?.full_name;
          
          if (!senderName) {
            const { data: company } = await supabase
              .from("companies")
              .select("name")
              .eq("user_id", newMessage.sender_id)
              .single();
            senderName = company?.name;
          }

          if (!senderName) {
            const { data: driver } = await supabase
              .from("delivery_drivers")
              .select("full_name")
              .eq("user_id", newMessage.sender_id)
              .single();
            senderName = driver?.full_name;
          }

          toast.info(senderName || "Nova mensagem recebida!", {
            description: newMessage.content,
            duration: 8000,
            action: isChatPage ? undefined : {
              label: "Abrir Chat",
              onClick: () => navigate("/chat")
            }
          });

          qc.invalidateQueries({ queryKey: ["conversations"] });
          qc.invalidateQueries({ queryKey: ["admin-conversations"] });
          qc.invalidateQueries({ queryKey: ["messages", newMessage.conversation_id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, qc]);
}

export function GlobalChatListener() {
  useGlobalChatNotifications();
  return null;
}
