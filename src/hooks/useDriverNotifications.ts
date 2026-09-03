// @ts-nocheck
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { getElapsedSeconds } from "@/utils/time";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";

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
    if (typeof window === "undefined") return new Set();
    const list = localStorage.getItem("declined_deliveries");
    return list ? new Set(JSON.parse(list)) : new Set();
  } catch {
    return new Set();
  }
};

export const declineDeliveryLocally = (deliveryId: string) => {
  try {
    if (typeof window === "undefined") return;
    const declined = getDeclinedDeliveries();
    declined.add(deliveryId);
    localStorage.setItem("declined_deliveries", JSON.stringify(Array.from(declined)));
    window.dispatchEvent(new CustomEvent("delivery-declined", { detail: { deliveryId } }));
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
      LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }, { id: 7777 }] }).catch(() => {});
    }
  } catch (e) {
    console.error("[Notify] erro ao declinar localmente:", e);
  }
};

export const getAcceptedDeliveries = (): Set<string> => {
  try {
    if (typeof window === "undefined") return new Set();
    const list = localStorage.getItem("accepted_deliveries");
    return list ? new Set(JSON.parse(list)) : new Set();
  } catch {
    return new Set();
  }
};

export const acceptDeliveryLocally = (deliveryId: string) => {
  try {
    if (typeof window === "undefined") return;
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

  const permissionRef = useRef<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const channelsRef = useRef<any[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isOnlineRef = useRef<boolean>(false);
  const activeAlertsRef = useRef<Set<string>>(new Set());
  const driverVehicleInfoRef = useRef<{ vehicle_type?: string; vehicle?: string; service_types?: string[] } | null>(null);

  // ── Permissões e registro FCM
  useEffect(() => {
    // 0. Permissão para Web Browsers (Chrome, Edge, Firefox, Safari)
    if (!Capacitor.isNativePlatform() && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then((perm) => {
          permissionRef.current = perm;
        }).catch(() => {});
      } else {
        permissionRef.current = Notification.permission;
      }
    }

    // 1. Notificações locais do dispositivo (se suportado nativamente)
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
      try {
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
                  sound: "ring",
                  vibration: true,
                }).catch(() => {});
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      } catch (err) {
        console.warn("[LocalNotifications] Não suportado:", err);
      }
    }

    // 2. Registro e sincronização do token FCM / Push Notifications
    let regListener: any = null;
    let errListener: any = null;
    let actListener: any = null;

    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("PushNotifications")) {
      try {
        const syncFcmToken = async (tokenVal: string) => {
          if (!tokenVal) return;
          console.log("[FCM] Sincronizando token:", tokenVal.slice(0, 15) + "...");
          localStorage.setItem("driver_fcm_token", tokenVal);

          if (user?.id) {
            await supabase.from("delivery_drivers").update({ fcm_token: tokenVal } as any).eq("user_id", user.id);
            await supabase.from("delivery_drivers").update({ fcm_token: tokenVal } as any).eq("id", user.id);
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
          const actionId = action.actionId;
          const data = action.notification?.data;
          const deliveryId = data?.deliveryId || data?.delivery_id;

          if (actionId === "reject" || actionId === "tap_reject") {
            if (deliveryId) declineDeliveryLocally(deliveryId);
            return;
          }

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
            if (activeAlertsRef.current.size === 0) {
              stopAlert();
              DeliveryOverlay.dismissIncomingCall().catch(() => {});
            }
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
        }).then((handle) => { channelListener = handle; }).catch(() => {});
      } catch (err) {
        console.warn("[PushNotifications] Erro:", err);
      }
    }

    return () => {
      if (regListener) regListener.remove().catch(() => {});
      if (errListener) errListener.remove().catch(() => {});
      if (actListener) actListener.remove().catch(() => {});
    };
  }, [user?.id]);

  // ── Listener Principal de entregas e sincronização em tempo real
  useEffect(() => {
    if (!user?.id) return;
    let actionListener: PluginListenerHandle | undefined;
    let overlayListener: PluginListenerHandle | undefined;
    let appStateListener: PluginListenerHandle | undefined;
    let cancelled = false;

    const handleDeclineEvent = (e: any) => {
      const { deliveryId } = e.detail || {};
      if (deliveryId) {
        activeAlertsRef.current.delete(deliveryId);
        if (activeAlertsRef.current.size === 0) {
          stopAlert();
          DeliveryOverlay.dismissIncomingCall().catch(() => {});
        }
        if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
          LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
        }
      }
    };
    window.addEventListener("delivery-declined", handleDeclineEvent);

    const handleAcceptEvent = (e: any) => {
      const { id } = e.detail || {};
      if (id) {
        activeAlertsRef.current.delete(id);
        if (activeAlertsRef.current.size === 0) {
          stopAlert();
          DeliveryOverlay.dismissIncomingCall().catch(() => {});
        }
        if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
          LocalNotifications.cancel({ notifications: [{ id: hashId(id) }] }).catch(() => {});
        }
      }
    };
    window.addEventListener("delivery-accepted", handleAcceptEvent);

    const notifyNewDelivery = async (rawDelivery: any) => {
      const isOnlineNow = isOnlineRef.current || (typeof window !== "undefined" && user?.id && localStorage.getItem(`driver_is_online_${user.id}`) === "true");
      if (!isOnlineNow) return;

      const declined = getDeclinedDeliveries();
      if (declined.has(rawDelivery.id)) return;
      if (seenIdsRef.current.has(rawDelivery.id)) return;

      // ── Direcionamento de corrida e alerta imediato ──
      const currentDriverId = user?.id;
      if (rawDelivery.driver_id) {
        if (rawDelivery.driver_id !== currentDriverId) return; // Atribuído para outro entregador
      }

      seenIdsRef.current.add(rawDelivery.id);
      activeAlertsRef.current.add(rawDelivery.id);

      // Dispara o ronco do motor de moto e som continuo
      try {
        unlockAudio();
        playAlert(true);
      } catch (e) {
        console.warn("[Notify] som do motor falhou:", e);
      }

      // Busca detalhes completos apenas se não vierem no payload da entrega
      let delivery: any = rawDelivery;
      if (!delivery.companies && delivery.company_id) {
        try {
          const { data: fullDelivery } = await supabase
            .from("deliveries")
            .select("*, companies(name, address)")
            .eq("id", rawDelivery.id)
            .maybeSingle();
          if (fullDelivery) delivery = fullDelivery;
        } catch (e) {
          console.warn("[Notify] detalhe da corrida falhou:", e);
        }
      }

      const storeName = delivery.companies?.name ||
        delivery.company_name || delivery.store_name || APP_NAME;
      const pickup = delivery.pickup_address || delivery.origin_address ||
        delivery.store_address || delivery.companies?.address || "Retirada na Loja";
      const dropoff = delivery.delivery_address || delivery.dropoff_address ||
        delivery.address || "Endereço do cliente";
      const orderFee = delivery.orders?.delivery_fee ? Number(delivery.orders.delivery_fee) : 0;
      const value = orderFee > 0 ? orderFee : Math.max(
        Number(delivery.delivery_fee) || 0,
        Number(delivery.value) || 0,
        Number(delivery.price) || 0
      );
      const feeText = value > 0 ? `R$ ${value.toFixed(2).replace(".", ",")}` : "";
      const description = `${storeName} • Retirada: ${pickup} → Entrega: ${dropoff}${feeText ? ` • Ganho: ${feeText}` : ""}`;
      const title = `🏬 ${storeName}${feeText ? ` — ${feeText}` : ""}`;

      toast(`🏬 ${storeName}`, {
        description: `🏁 ${dropoff}${feeText ? ` • 💰 ${feeText}` : ""}`,
      });

      // Dispara a chamada nativa de tela cheia (IncomingCallActivity e Overlay)
      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.testIncomingCall({
          details: `${storeName}\n📍 Coleta: ${pickup}\n🏁 Entrega: ${dropoff}`,
          deliveryId: delivery.id,
          storeName,
          pickup,
          dropoff,
          fee: feeText,
        }).catch(console.warn);

        LocalNotifications.schedule({
          notifications: [
            {
              title: title,
              body: `🏁 Entrega: ${dropoff}`,
              id: hashId(delivery.id),
              actionTypeId: "DELIVERY_ACTION",
              channelId: NOTIFICATION_CHANNEL_ID,
              sound: "ring",
              extra: { type: "delivery", deliveryId: delivery.id },
            },
          ],
        }).catch((e) => console.warn("[LocalNotifications] erro:", e));
      } else if (!Capacitor.isNativePlatform() && typeof window !== "undefined" && "Notification" in window) {
        const currentPerm = Notification.permission || permissionRef.current;
        if (currentPerm === "granted") {
          try {
            const notif = new Notification(title, {
              body: description,
              icon: "/favicon-v3.png",
              tag: `delivery-${delivery.id}`,
              requireInteraction: true,
            });
            notif.onclick = () => {
              window.focus();
              window.location.href = `/driver?deliveryId=${delivery.id}`;
            };
          } catch (e) {
            console.warn("[WebNotification] Erro ao criar notificação:", e);
          }
        } else if (currentPerm === "default") {
          Notification.requestPermission().then((perm) => {
            permissionRef.current = perm;
            if (perm === "granted") {
              try {
                const notif = new Notification(title, {
                  body: description,
                  icon: "/favicon-v3.png",
                  tag: `delivery-${delivery.id}`,
                  requireInteraction: true,
                });
                notif.onclick = () => {
                  window.focus();
                  window.location.href = `/driver?deliveryId=${delivery.id}`;
                };
              } catch (e) {}
            }
          }).catch(() => {});
        }
      }
    };

    const notifyNewRide = (ride: any) => {
      if (!ride || !ride.id) return;
      if (seenIdsRef.current.has(ride.id)) return;

      // Filtro de compatibilidade de veículo
      const dInfo = driverVehicleInfoRef.current;
      const dServices = dInfo?.service_types || [];
      const dVeh = dInfo?.vehicle_type || dInfo?.vehicle || "moto";
      const rVeh = String(ride.vehicle_type || "").toLowerCase();

      if (Array.isArray(dServices) && dServices.length > 0) {
        const norm = dServices.map(s => String(s).toLowerCase().replace(/_/g, ""));
        if (rVeh === "taxi" && !norm.some(s => s.includes("taxi") || s.includes("car"))) return;
        if (rVeh === "mototaxi" && !norm.some(s => s.includes("moto"))) return;
      } else {
        if (rVeh === "taxi" && !["car", "carro", "taxi"].includes(dVeh.toLowerCase())) return;
        if (rVeh === "mototaxi" && !["moto", "mototaxi", "motorcycle"].includes(dVeh.toLowerCase())) return;
      }

      seenIdsRef.current.add(ride.id);
      activeAlertsRef.current.add(ride.id);
      startAlert();

      const isTaxi = rVeh === "taxi" || rVeh === "carro" || rVeh === "car";
      const rideLabel = isTaxi ? "Táxi (Passageiro)" : "Moto Táxi (Passageiro)";
      const customer = ride.customer_name || "Passageiro";
      const pickup = ride.pickup_address || "Ponto de Embarque";
      const dropoff = ride.dropoff_address || "Destino";
      const fee = Number(ride.price) || 0;
      const feeText = fee > 0 ? `R$ ${fee.toFixed(2).replace(".", ",")}` : "";
      const title = `🚕 ${rideLabel}${feeText ? ` — ${feeText}` : ""}`;

      toast(`🚕 ${rideLabel}`, {
        description: `📍 ${pickup} → 🏁 ${dropoff}${feeText ? ` • 💰 ${feeText}` : ""}`,
      });

      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.testIncomingCall({
          details: `${rideLabel}\n👤 ${customer}\n📍 Embarque: ${pickup}\n🏁 Destino: ${dropoff}`,
          deliveryId: ride.id,
          storeName: rideLabel,
          pickup,
          dropoff,
          fee: feeText,
        }).catch(console.warn);

        LocalNotifications.schedule({
          notifications: [
            {
              title,
              body: `📍 ${pickup} → 🏁 ${dropoff}`,
              id: hashId(ride.id),
              actionTypeId: "DELIVERY_ACTION",
              channelId: NOTIFICATION_CHANNEL_ID,
              sound: "ring",
              extra: { type: "ride", rideId: ride.id },
            },
          ],
        }).catch((e) => console.warn("[LocalNotifications] erro:", e));
      } else if (!Capacitor.isNativePlatform() && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification(title, {
              body: `📍 ${pickup} → 🏁 ${dropoff}`,
              icon: "/favicon-v3.png",
              tag: `ride-${ride.id}`,
              requireInteraction: true,
            });
          } catch (e) {}
        }
      }
    };

    const stopRingingFor = (deliveryId: string) => {
      activeAlertsRef.current.delete(deliveryId);
      if (activeAlertsRef.current.size === 0) {
        stopAlert();
        DeliveryOverlay.dismissIncomingCall().catch(() => {});
      }
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
        LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
      }
    };

    const setup = async () => {
      const localOnline = typeof window !== "undefined" ? localStorage.getItem(`driver_is_online_${user.id}`) === "true" : false;

      let driverRow: any = null;
      const { data: d1 } = await supabase.from("delivery_drivers").select("*").eq("user_id", user.id).maybeSingle();
      if (d1) driverRow = d1;
      else {
        const { data: d2 } = await supabase.from("delivery_drivers").select("*").eq("id", user.id).maybeSingle();
        driverRow = d2;
      }

      if (cancelled) return;
      const driverId = driverRow?.id || user.id;
      isOnlineRef.current = typeof driverRow?.is_online === "boolean" ? driverRow.is_online : localOnline;
      if (driverRow) {
        driverVehicleInfoRef.current = {
          vehicle_type: (driverRow as any).vehicle_type,
          vehicle: (driverRow as any).vehicle,
          service_types: (driverRow as any).service_types,
        };
      }

      // Salva contexto do driver no Android Native SharedPreferences
      if (Capacitor.isNativePlatform()) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const userToken = session?.access_token ?? "";
          DeliveryOverlay.saveDriverContext({ driverId, userToken }).catch(() => {});
        } catch (e) {}

        if (isOnlineRef.current) {
          DeliveryOverlay.startOverlay().catch(() => {});
        } else {
          DeliveryOverlay.stopOverlay().catch(() => {});
        }
      }

      // Listener de status online/offline
      const driverChannel = supabase
        .channel(`mt24-driver-status-${driverId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "delivery_drivers", filter: `id=eq.${driverId}` },
          (payload) => {
            const updated = payload.new as any;
            const wasOnline = isOnlineRef.current;
            if (typeof updated?.is_online === "boolean") {
              isOnlineRef.current = updated.is_online;
              if (typeof window !== "undefined") {
                localStorage.setItem(`driver_is_online_${user.id}`, String(updated.is_online));
              }
              if (!updated.is_online && wasOnline) {
                activeAlertsRef.current.clear();
                stopAlert();
                if (Capacitor.isNativePlatform()) {
                  DeliveryOverlay.stopOverlay().catch(() => {});
                }
              } else if (updated.is_online && !wasOnline) {
                if (Capacitor.isNativePlatform()) {
                  DeliveryOverlay.startOverlay().catch(() => {});
                }
              }
            }
          }
        )
        .subscribe();
      channelsRef.current.push(driverChannel);

      // Listener para resposta dos botões da Tela Cheia / Popup Nativo (IncomingCallActivity)
      if (Capacitor.isNativePlatform()) {
        overlayListener = await DeliveryOverlay.addListener(
          "onCallResponse",
          async (response: any) => {
            const deliveryId = response.deliveryId;
            if (response.status === "accepted") {
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
                DeliveryOverlay.reportCallResult({ success: true, message: "✅ Corrida aceita!" }).catch(() => {});
                acceptDeliveryLocally(deliveryId);
                toast("✅ Corrida aceita!", { description: "Aceita via tela nativa." });
              } else {
                DeliveryOverlay.reportCallResult({ success: false, message: "Corrida já foi aceita por outro entregador" }).catch(() => {});
                declineDeliveryLocally(deliveryId);
                toast("❌ Ops! Já foi aceita.", { description: "Outro entregador aceitou antes de você." });
              }
            } else if (response.status === "rejected") {
              declineDeliveryLocally(deliveryId);
            }
          }
        );
      }

      // Listener de ações de notificação local (aceitar/rejeitar)
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
        try {
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
        } catch (err) {
          console.warn("[LocalNotifications] addListener falhou ou não suportado:", err);
        }
      }

      // Seed inicial
      const isOnlineNow = isOnlineRef.current || (typeof window !== "undefined" && user?.id && localStorage.getItem(`driver_is_online_${user.id}`) === "true");
      if (isOnlineNow) {
        try {
          const { data: initial } = await supabase
            .from("deliveries")
            .select("*, companies(name, address)")
            .in("status", ["pending", "broadcasted"])
            .is("driver_id", null);
          if (initial && !cancelled) {
            initial.forEach((d: any) => notifyNewDelivery(d));
          }
        } catch (e) {
          console.warn("[Notify] seed inicial falhou:", e);
        }
      }

      // Polling a cada 3s
      const pollDeliveries = async () => {
        const isNowOnline = isOnlineRef.current || (typeof window !== "undefined" && user?.id && localStorage.getItem(`driver_is_online_${user.id}`) === "true");
        if (cancelled || !isNowOnline) return;
        try {
          const { data } = await supabase
            .from("deliveries")
            .select("*, companies(name, address)")
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

            if (d?.status !== "pending" && d?.status !== "broadcasted") {
              stopRingingFor(d.id);
            }

            if (
              (d?.status === "pending" || d?.status === "broadcasted") && !d?.driver_id
            ) {
              if (isOnlineRef.current) {
                seenIdsRef.current.delete(d.id);
                notifyNewDelivery(d);
              }
            }

            if (d?.driver_id === driverId && o?.status !== d?.status && d?.status === "accepted") {
              toast("✅ Corrida confirmada!", { description: "Vá até o ponto de retirada." });
              activeAlertsRef.current.delete(d.id);
              if (activeAlertsRef.current.size === 0) {
                stopAlert();
                DeliveryOverlay.dismissIncomingCall().catch(() => {});
              }
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
      if (overlayListener) overlayListener.remove().catch(() => {});
      if (appStateListener) appStateListener.remove().catch(() => {});
      if (cleanupInner) cleanupInner();
    };
  }, [user?.id]);
}
