// @ts-nocheck
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { toast } from "sonner";

const APP_NAME = "MT 24 Horas Express";
const NOTIFICATION_CHANNEL_ID = "delivery-incoming-v1";

const hashId = (str: string | number) => {
  const s = String(str);
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export const getDeclinedDeliveries = (): Set<string> => {
  try {
    const list = localStorage.getItem("declined_deliveries");
    return list ? new Set(JSON.parse(list)) : new Set();
  } catch {
    return new Set();
  }
};

export const declineDeliveryLocally = (deliveryId: string) => {
  try {
    const declined = getDeclinedDeliveries();
    declined.add(deliveryId);
    localStorage.setItem("declined_deliveries", JSON.stringify(Array.from(declined)));
    window.dispatchEvent(new CustomEvent("delivery-declined", { detail: { deliveryId } }));
  } catch (e) {
    console.error("[Notify] erro ao declinar localmente:", e);
  }
};

export const getAcceptedDeliveries = (): Set<string> => {
  try {
    const list = localStorage.getItem("accepted_deliveries");
    return list ? new Set(JSON.parse(list)) : new Set();
  } catch {
    return new Set();
  }
};

export const acceptDeliveryLocally = (deliveryId: string) => {
  try {
    const accepted = getAcceptedDeliveries();
    accepted.add(deliveryId);
    localStorage.setItem("accepted_deliveries", JSON.stringify(Array.from(accepted)));
    window.dispatchEvent(new CustomEvent("delivery-accepted", { detail: { id: deliveryId } }));
  } catch (e) {
    console.error("[Notify] erro ao aceitar localmente:", e);
  }
};

export function useDriverNotifications() {
  const { user } = useAuth();
  const { playAlert, stopAlert, unlockAudio } = useAudioAlert();

  const permissionRef = useRef<NotificationPermission>("default");
  const channelsRef = useRef<any[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isOnlineRef = useRef<boolean>(false);
  const activeAlertsRef = useRef<Set<string>>(new Set());

  // ── Permissões e registro FCM
  useEffect(() => {
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
      // Permissão de notificações locais
      LocalNotifications.requestPermissions().then((res) => {
        permissionRef.current = res.display === "granted" ? "granted" : "denied";
        if (permissionRef.current === "granted" && Capacitor.getPlatform() === "android") {
          LocalNotifications.registerActionTypes({
            types: [
              {
                id: "DELIVERY_ACTION",
                actions: [
                  { id: "accept", title: "✅ Aceitar" },
                  { id: "reject", title: "❌ Rejeitar", destructive: true },
                ],
              },
            ],
          }).catch(() => {});

          LocalNotifications.listChannels().then((channels) => {
            const hasChannel = channels.channels.some(c => c.id === NOTIFICATION_CHANNEL_ID);
            if (!hasChannel) {
              LocalNotifications.createChannel({
                id: NOTIFICATION_CHANNEL_ID,
                name: `Novas Corridas ${APP_NAME}`,
                description: "Alerta de alta prioridade para novas corridas",
                importance: 5,
                visibility: 1,
                sound: "ring.mp3",
                vibration: true,
              }).catch(() => {});
            }
          }).catch(() => {});
        }
      }).catch(() => {});

      // ── Registro e sincronização do token FCM
      let regListener: any = null;
      let errListener: any = null;
      let actListener: any = null;

      const isPushAvailable = Capacitor.isPluginAvailable("PushNotifications");

      if (isPushAvailable) {
        try {
          const syncFcmToken = async (tokenVal: string) => {
            if (!tokenVal) return;
            console.log("[FCM] Sincronizando token:", tokenVal.slice(0, 15) + "...");
            localStorage.setItem("driver_fcm_token", tokenVal);

            if (user?.id) {
              const { error } = await supabase
                .from("delivery_drivers")
                .update({ fcm_token: tokenVal } as any)
                .or(`user_id.eq.${user.id},id.eq.${user.id}`);
              if (error) console.error("[FCM] Erro ao salvar token:", error.message);
            }
          };

          PushNotifications.addListener("registration", (token) => {
            console.log("[FCM] Token recebido:", token.value);
            syncFcmToken(token.value);
          }).then((handle) => { regListener = handle; }).catch(() => {});

          const cachedToken = localStorage.getItem("driver_fcm_token");
          if (cachedToken && user?.id) {
            syncFcmToken(cachedToken);
          }

          PushNotifications.requestPermissions().then((result) => {
            if (result.receive === "granted") {
              PushNotifications.register().catch((e) => console.warn("[FCM] register erro:", e));
            }
          }).catch((e) => console.warn("[FCM] requestPermissions erro:", e));

          PushNotifications.addListener("registrationError", (error: any) => {
            console.warn("[FCM] Erro no register:", error);
          }).then((handle) => { errListener = handle; }).catch(() => {});

          PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            console.log("[FCM] Push action performed:", action);
            const data = action.notification?.data;
            const deliveryId = data?.deliveryId || data?.delivery_id;
            const targetRoute = deliveryId ? `/driver?deliveryId=${deliveryId}` : "/driver";
            if (targetRoute && typeof window !== "undefined") {
              window.location.href = targetRoute;
            }
          }).then((handle) => { actListener = handle; }).catch(() => {});

          PushNotifications.addListener("pushNotificationReceived", async (notification) => {
            console.log("[FCM] Push recebido em foreground:", notification);
            const deliveryId = notification.data?.deliveryId;
            if (!deliveryId) return;

            if (notification.data?.type === "cancel_delivery") {
              activeAlertsRef.current.delete(deliveryId);
              if (activeAlertsRef.current.size === 0) stopAlert();
              return;
            }

            const storeName = notification.data?.storeName || APP_NAME;
            const dropoff = notification.data?.dropoff || "Endereço do cliente";
            const fee = notification.data?.fee || "";
            const details = notification.data?.details || `${storeName}\n🏁 Entrega: ${dropoff}`;

            toast(`🏬 ${storeName}`, {
              description: `🏁 ${dropoff}${fee ? ` • 💰 ${fee}` : ""}`,
            });

            if (!Capacitor.isNativePlatform() && permissionRef.current === "granted") {
              try {
                new Notification(`🏬 ${storeName}`, { body: details, icon: "/favicon-v3.png" });
              } catch {}
            }
          }).catch(() => {});
        } catch (e) {
          console.warn("[FCM] Indisponível no dispositivo:", e);
        }
      }

      return () => {
        if (regListener?.remove) regListener.remove();
        if (errListener?.remove) errListener.remove();
        if (actListener?.remove) actListener.remove();
      };
    } else {
      // Browser web
      if (!("Notification" in window)) return;
      if (Notification.permission === "granted") {
        permissionRef.current = "granted";
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((p) => {
          permissionRef.current = p;
        });
      }
    }
  }, [user?.id]);

  // ── Listener de corridas em tempo real + polling
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let actionListener: PluginListenerHandle | null = null;
    let appStateListener: PluginListenerHandle | null = null;

    const handleDeclineEvent = (e: any) => {
      const { deliveryId } = e.detail || {};
      if (deliveryId) {
        activeAlertsRef.current.delete(deliveryId);
        if (activeAlertsRef.current.size === 0) stopAlert();
        if (Capacitor.isNativePlatform()) {
          LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
        }
      }
    };
    window.addEventListener("delivery-declined", handleDeclineEvent);

    const notifyNewDelivery = async (rawDelivery: any) => {
      if (!rawDelivery?.id) return;
      if (!isOnlineRef.current) return;

      const declined = getDeclinedDeliveries();
      if (declined.has(rawDelivery.id)) return;
      if (seenIdsRef.current.has(rawDelivery.id)) return;

      seenIdsRef.current.add(rawDelivery.id);
      activeAlertsRef.current.add(rawDelivery.id);

      // Som (só no web, no nativo o Java toca o ring.mp3)
      if (!Capacitor.isNativePlatform()) {
        try {
          unlockAudio();
          playAlert(true);
        } catch (e) {
          console.warn("[Notify] som falhou:", e);
        }
      }

      // Busca detalhes completos
      let delivery: any = rawDelivery;
      try {
        const { data: fullDelivery } = await supabase
          .from("deliveries")
          .select("*, companies(name, address, trade_name)")
          .eq("id", rawDelivery.id)
          .single();
        if (fullDelivery) delivery = fullDelivery;
      } catch (e) {
        console.warn("[Notify] detalhe da corrida falhou:", e);
      }

      const storeName = delivery.companies?.trade_name || delivery.companies?.name ||
        delivery.company_name || delivery.store_name || APP_NAME;
      const pickup = delivery.pickup_address || delivery.origin_address ||
        delivery.store_address || delivery.companies?.address || "Retirada na Loja";
      const dropoff = delivery.delivery_address || delivery.dropoff_address ||
        delivery.address || "Endereço do cliente";
      const orderFee = delivery.orders?.delivery_fee ? Number(delivery.orders.delivery_fee) : 0;
      const value = orderFee > 0 ? orderFee : Math.max(
        Number(delivery.delivery_fee) || 0,
        Number(delivery.value) || 0,
        Number(delivery.price) || 0,
        Number(delivery.total_value) || 0
      );
      const feeText = value > 0 ? `R$ ${value.toFixed(2).replace(".", ",")}` : "";

      const title = `🏬 ${storeName}`;
      const description = `${storeName}\nColeta: ${pickup}\nEntrega: ${dropoff}${feeText ? `\nGanhos: ${feeText}` : ""}`;

      // Toast
      try {
        toast(title, { description: `🏁 ${dropoff}${feeText ? ` • 💰 ${feeText}` : ""}` });
      } catch {}

      // Notificação local no sistema operacional
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
        LocalNotifications.schedule({
          notifications: [
            {
              title,
              body: `🏁 Entrega: ${dropoff}`,
              id: hashId(delivery.id),
              actionTypeId: "DELIVERY_ACTION",
              channelId: NOTIFICATION_CHANNEL_ID,
              sound: "ring.mp3",
              extra: { type: "delivery", deliveryId: delivery.id },
            },
          ],
        }).catch((e) => console.warn("[LocalNotifications] erro:", e));
      } else if (permissionRef.current === "granted") {
        try {
          new Notification(title, { body: description, icon: "/favicon-v3.png", tag: `delivery-${delivery.id}` });
        } catch {}
      }
    };

    const stopRingingFor = (deliveryId: string) => {
      activeAlertsRef.current.delete(deliveryId);
      if (activeAlertsRef.current.size === 0) stopAlert();
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
        LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
      }
    };

    const setup = async () => {
      const localOnline = typeof window !== "undefined" ? localStorage.getItem(`driver_is_online_${user.id}`) === "true" : false;

      const { data: driverRow } = await supabase
        .from("delivery_drivers")
        .select("id, is_online")
        .or(`user_id.eq.${user.id},id.eq.${user.id}`)
        .maybeSingle();

      if (cancelled) return;
      const driverId = driverRow?.id || user.id;
      isOnlineRef.current = typeof driverRow?.is_online === "boolean" ? driverRow.is_online : localOnline;

      // Listener de status online/offline
      const driverChannel = supabase
        .channel(`mt24-driver-profile-${user.id}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "delivery_drivers", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const updated = payload.new as any;
            const wasOnline = isOnlineRef.current;
            isOnlineRef.current = updated.is_online ?? false;
            if (!isOnlineRef.current && wasOnline) {
              activeAlertsRef.current.clear();
              stopAlert();
            }
          }
        )
        .subscribe();
      channelsRef.current.push(driverChannel);

      // Listener de ações de notificação local (aceitar/rejeitar)
      if (Capacitor.isNativePlatform()) {
        actionListener = await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          async (action) => {
            if (action.notification.extra?.type === "delivery") {
              const deliveryId = action.notification.extra.deliveryId;
              if (action.actionId === "accept") {
                stopAlert();
                activeAlertsRef.current.delete(deliveryId);
                const { data, error } = await supabase
                  .from("deliveries")
                  .update({ status: "accepted", driver_id: driverId })
                  .eq("id", deliveryId)
                  .in("status", ["pending", "broadcasted"])
                  .is("driver_id", null)
                  .select("id");
                if (!error && data && data.length > 0) {
                  acceptDeliveryLocally(deliveryId);
                  toast("✅ Corrida aceita!", { description: "Aceita via notificação." });
                } else {
                  toast("❌ Ops! Já foi aceita.", { description: "Outro entregador aceitou antes de você." });
                  declineDeliveryLocally(deliveryId);
                }
              } else if (action.actionId === "reject") {
                declineDeliveryLocally(deliveryId);
              }
            }
          }
        );
      }

      // Seed inicial
      if (isOnlineRef.current) {
        try {
          const { data: initial } = await supabase
            .from("deliveries")
            .select("*, companies(name, address, trade_name)")
            .in("status", ["pending", "broadcasted"])
            .is("driver_id", null);
          if (initial && !cancelled) {
            initial.forEach((d: any) => notifyNewDelivery(d));
          }
        } catch (e) {
          console.warn("[Notify] seed inicial falhou:", e);
        }
      }

      // Polling a cada 10s
      const pollDeliveries = async () => {
        if (cancelled || !isOnlineRef.current) return;
        try {
          const { data } = await supabase
            .from("deliveries")
            .select("*, companies(name, address, trade_name)")
            .in("status", ["pending", "broadcasted"])
            .is("driver_id", null);
          if (data && !cancelled) {
            const freshIds = new Set(data.map((d: any) => d.id));
            data.forEach((d: any) => notifyNewDelivery(d));
            Array.from(activeAlertsRef.current).forEach((id) => {
              if (!freshIds.has(id)) stopRingingFor(id);
            });
          }
        } catch (e) {
          console.warn("[Notify] polling falhou:", e);
        }
      };

      const intervalId = setInterval(pollDeliveries, 10000);

      // Quando app volta ao foreground, faz fetch imediato
      if (Capacitor.isNativePlatform()) {
        appStateListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive && isOnlineRef.current) pollDeliveries();
        });
      }

      // Realtime — novas entregas e mudanças de status
      const broadcastChannel = supabase
        .channel(`mt24-driver-broadcast-${driverId}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "deliveries" },
          (payload) => {
            const d = payload.new as any;
            if (isOnlineRef.current && (d?.status === "pending" || d?.status === "broadcasted") && !d?.driver_id) {
              notifyNewDelivery(d);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "deliveries" },
          (payload) => {
            const d = payload.new as any;
            const o = payload.old as any;

            // Corrida saiu do pool
            if (
              (o?.status === "pending" || o?.status === "broadcasted") &&
              d?.status !== "pending" && d?.status !== "broadcasted"
            ) {
              stopRingingFor(d.id);
            }

            // Corrida entrou no pool
            if (
              o?.status && o.status !== "pending" && o.status !== "broadcasted" &&
              (d?.status === "pending" || d?.status === "broadcasted") && !d?.driver_id
            ) {
              if (isOnlineRef.current) {
                seenIdsRef.current.delete(d.id);
                notifyNewDelivery(d);
              }
            }

            // Confirmação da própria corrida
            if (d?.driver_id === driverId && o?.status !== d?.status && d?.status === "accepted") {
              toast("✅ Corrida confirmada!", { description: "Vá até o ponto de retirada." });
              activeAlertsRef.current.delete(d.id);
              if (activeAlertsRef.current.size === 0) stopAlert();
            }
          }
        )
        .subscribe();
      channelsRef.current.push(broadcastChannel);

      return () => {
        clearInterval(intervalId);
      };
    };

    let cleanupInner: (() => void) | undefined;
    setup().then((fn) => { cleanupInner = fn; });

    return () => {
      cancelled = true;
      window.removeEventListener("delivery-declined", handleDeclineEvent);
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
      if (actionListener) actionListener.remove().catch(() => {});
      if (appStateListener) appStateListener.remove().catch(() => {});
      if (cleanupInner) cleanupInner();
    };
  }, [user?.id]);
}
