import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AdminBadges {
  openRides: number;
  unreadChats: number;
}

export function useAdminBadges(_userId?: string) {
  const [badges, setBadges] = useState<AdminBadges>({ openRides: 0, unreadChats: 0 });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Count deliveries that haven't been accepted yet (pending or broadcasted)
        const { count: openRides } = await supabase
          .from("deliveries")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "broadcasted"] as any);

        let unreadChatsCount = 0;

        // Count unread delivery chats
        try {
          let query = supabase
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("read", false);
          
          if (_userId) {
            query = query.neq("sender_id", _userId);
          }
          
          const { count: unreadChats } = await query;
          unreadChatsCount += unreadChats ?? 0;
        } catch (e) {
          console.warn("[AdminBadges] Failed to query chat_messages:", e);
        }

        // Count unread general support chats (chat_message_logs)
        try {
          let query = supabase
            .from("chat_message_logs")
            .select("id", { count: "exact", head: true })
            .eq("read", false);
          
          if (_userId) {
            query = query.neq("sender_id", _userId);
          }
          
          const { count: unreadLogs } = await query;
          unreadChatsCount += unreadLogs ?? 0;
        } catch (e) {
          console.warn("[AdminBadges] Failed to query chat_message_logs:", e);
        }

        if (!cancelled) {
          setBadges({
            openRides: openRides ?? 0,
            unreadChats: unreadChatsCount,
          });
        }
      } catch (err) {
        console.error("[AdminBadges] General error loading badges:", err);
      }
    }

    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { badges };
}
