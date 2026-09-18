// @ts-nocheck
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, ensureRealtimeConnected } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioAlert, stopGlobalAudioAlert } from "@/hooks/useAudioAlert";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { App } from "@capacitor/app";
import { toast } from "sonner";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";
import { isDeliveryEligibleForDriver, ADMIN_WINDOW_SECONDS } from "@/utils/delivery-eligibility";
import { getElapsedSeconds } from "@/utils/time";

const APP_NAME = "MT 24 Horas Express";
const NOTIFICATION_CHANNEL_ID = "mt24_delivery_alerts_v35";

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
    stopGlobalAudioAlert();
    if (typeof window === "undefined") return;
    const declined = getDeclinedDeliveries();
    declined.add(deliveryId);
    localStorage.setItem("declined_deliveries", JSON.stringify(Array.from(declined)));
    window.dispatchEvent(new CustomEvent("delivery-declined", { detail: { deliveryId } }));

    if (Capacitor.isNativePlatform()) {
      LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
      LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
      DeliveryOverlay.cancelDeliveryNotification({ deliveryId }).catch(() => {});
      DeliveryOverlay.hideDeliveryCard({ deliveryId }).catch(() => {});
      DeliveryOverlay.stopNativeAudio().catch(() => {});
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
    stopGlobalAudioAlert();
    if (typeof window === "undefined") return;
    const accepted = getAcceptedDeliveries();
    accepted.add(deliveryId);
    localStorage.setItem("accepted_deliveries", JSON.stringify(Array.from(accepted)));
    window.dispatchEvent(new CustomEvent("delivery-accepted", { detail: { id: deliveryId } }));

    if (Capacitor.isNativePlatform()) {
      LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
      LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
      DeliveryOverlay.cancelDeliveryNotification({ deliveryId }).catch(() => {});
      DeliveryOverlay.hideDeliveryCard({ deliveryId }).catch(() => {});
      DeliveryOverlay.stopNativeAudio().catch(() => {});
    }
  } catch (e) {
    console.error("[Notify] erro ao aceitar localmente:", e);
  }
};

export function useDriverNotifications() {
  const { user } = useAuth();
  const { playAlert, startLoop, stopLoop, stopAlert, unlockAudio } = useAudioAlert();
  const qc = useQueryClient();

  const invalidateDeliveries = () => {
    try {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["rides"] });
    } catch (e) {
      console.warn("[Notify] erro ao invalidar queries:", e);
    }
  };

  const permissionRef = useRef<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default"
  );
  const channelsRef = useRef<any[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const isOnlineRef = useRef<boolean>(false);
  const activeAlertsRef = useRef<Set<string>>(new Set());
  const driverVehicleInfoRef = useRef<{ vehicle_type?: string; vehicle?: string; service_types?: string[] } | null>(null);
  const scheduledDeliveriesRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const driverRowRef = useRef<any>(null);

  // ── Permissões e registro FCM
  useEffect(() => {
    // 0. Permissão para Web Browsers (Chrome, Edge, Firefox, Safari)
    if (!Capacitor.isNativePlatform() && typeof window !== "undefined" && "Notification" in window) {
      permissionRef.current = Notification.permission;
    }

    // 1. Notificações locais do dispositivo
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
      try {
        LocalNotifications.requestPermissions().then((res) => {
          permissionRef.current = res.display === "granted" ? "granted" : "denied";
        }).catch(() => {});

        LocalNotifications.createChannel({
          id: NOTIFICATION_CHANNEL_ID,
          name: "Novas Corridas MT 24 Horas",
          description: "Alerta de novas corridas disponíveis para entregadores MT 24 Horas",
          sound: "ring",
          importance: 5,
          visibility: 1,
          vibration: true,
        }).catch(() => {});
      } catch (err) {
        console.warn("[LocalNotifications] Não suportado:", err);
      }
    }

    // 2. Registro e sincronização do token FCM / Push Notifications
    let regListener: any = null;
    let errListener: any = null;
    let actListener: any = null;
    let notifListener: any = null;
    let refreshListener: any = null;

    if (Capacitor.isNativePlatform()) {
      try {
        const syncFcmToken = async (tokenVal: string) => {
          if (!tokenVal) return;
          console.log("[FCM] Sincronizando token:", tokenVal.slice(0, 15) + "...");
          localStorage.setItem("driver_fcm_token", tokenVal);

          if (user?.id) {
            await supabase.from("delivery_drivers").update({ fcm_token: tokenVal } as any).eq("user_id", user.id);
            await supabase.from("delivery_drivers").update({ fcm_token: tokenVal } as any).eq("id", user.id);

            try {
              await supabase
                .from("device_tokens")
                .upsert({
                  token: tokenVal,
                  user_id: user.id,
                  platform: Capacitor.getPlatform(),
                  updated_at: new Date().toISOString(),
                } as any, { onConflict: "token" });
            } catch (e) {
              console.warn("[FCM] device_tokens update error:", e);
            }
          }
        };

        if (Capacitor.isPluginAvailable("PushNotifications")) {
          PushNotifications.addListener("registration", (token) => {
            console.log("[FCM] Token recebido:", token.value);
            syncFcmToken(token.value);
          }).then((handle) => { regListener = handle; }).catch(() => {});

          PushNotifications.requestPermissions().then((result) => {
            if (result.receive === "granted") {
              PushNotifications.register().catch((e) => console.warn("[FCM] register erro:", e));
            }
          }).catch((e) => console.warn("[FCM] requestPermissions erro:", e));

          PushNotifications.addListener("registrationError", (error: any) => {
            console.warn("[FCM] Erro no register:", error);
          }).then((handle) => { errListener = handle; }).catch(() => {});

          PushNotifications.addListener("pushNotificationReceived", (notification) => {
            console.log("[FCM] Push recebido:", notification);
            const d = notification?.data;
            const rideId = d?.rideId || d?.ride_id;
            const deliveryId = d?.deliveryId || d?.delivery_id || d?.id;
            const targetId = deliveryId || rideId;

            // Se for comando de cancelamento ou encerramento de entrega aceita por outro:
            if (d?.type === "cancel_delivery" || d?.action === "cancel") {
              console.log("[FCM] Comando de cancelamento recebido para:", targetId);
              if (targetId) stopRingingFor(targetId);
              return;
            }

            const isLocalOnline = typeof window !== "undefined" && user?.id ? localStorage.getItem(`driver_is_online_${user.id}`) === "true" : false;
            if (!isOnlineRef.current || !isLocalOnline) {
              console.log("[FCM] Ignorando push pois o entregador está offline");
              if (targetId) stopRingingFor(targetId);
              return;
            }

            // Se o status da notificação NÃO for pending/broadcasted (ex: já foi aceita):
            const pushStatus = String(d?.status || "pending").toLowerCase().trim();
            if (pushStatus !== "pending" && pushStatus !== "broadcasted") {
              console.log("[FCM] Entrega já não está pendente:", pushStatus);
              if (targetId) stopRingingFor(targetId);
              return;
            }

            if (rideId || d?.type === "ride" || d?.type === "new_ride") {
              const targetRideId = rideId || deliveryId;
              seenIdsRef.current.delete(targetRideId);
              notifyNewRide({
                id: targetRideId,
                status: d?.status || "pending",
                customer_name: d?.customerName || d?.passenger || d?.storeName,
                customer_phone: d?.customerPhone || d?.phone,
                pickup_address: d?.pickup || d?.pickup_address,
                dropoff_address: d?.dropoff || d?.dropoff_address || d?.delivery_address,
                price: d?.fee || d?.price,
                vehicle_type: d?.vehicle_type || "taxi",
                driver_id: d?.driver_id,
              });
            } else if (deliveryId) {
              seenIdsRef.current.delete(deliveryId);
              notifyNewDelivery({
                id: deliveryId,
                status: d?.status || "pending",
                company_name: d?.storeName || d?.company_name,
                pickup_address: d?.pickup || d?.pickup_address,
                delivery_address: d?.dropoff || d?.delivery_address,
                delivery_fee: d?.fee,
                driver_id: d?.driver_id,
                created_at: d?.created_at,
              });
            }
          }).then((handle) => { notifListener = handle; }).catch(() => {});

          PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            console.log("[FCM] Push action performed:", action);
            const actionId = action.actionId;
            const data = action.notification?.data;
            const deliveryId = data?.deliveryId || data?.delivery_id;

            if (actionId === "reject" || actionId === "ACTION_DECLINE") {
              if (deliveryId) declineDeliveryLocally(deliveryId);
              return;
            }

            const targetRoute = deliveryId ? `/driver?deliveryId=${deliveryId}` : "/driver";
            if (targetRoute && typeof window !== "undefined") {
              window.location.href = targetRoute;
            }
          }).then((handle) => { actListener = handle; }).catch(() => {});
        }

        DeliveryOverlay.getPendingFcmToken().then(({ token }) => {
          if (token) syncFcmToken(token);
        }).catch(() => {});

        DeliveryOverlay.addListener("onFcmTokenRefresh", ({ token }: any) => {
          if (token) syncFcmToken(token);
        }).then((handle) => { refreshListener = handle; }).catch(() => {});

        const cachedToken = localStorage.getItem("driver_fcm_token");
        if (cachedToken && user?.id) {
          syncFcmToken(cachedToken);
        }
      } catch (err) {
        console.warn("[PushNotifications] Erro:", err);
      }
    }

    return () => {
      if (regListener) regListener.remove?.().catch(() => {});
      if (errListener) errListener.remove?.().catch(() => {});
      if (actListener) actListener.remove?.().catch(() => {});
      if (notifListener) notifListener.remove?.().catch(() => {});
      if (refreshListener) refreshListener.remove?.().catch(() => {});
    };
  }, [user?.id]);

  // ── Listener Principal de entregas e sincronização em tempo real
  useEffect(() => {
    if (!user?.id) return;
    let actionListener: PluginListenerHandle | undefined;
    let overlayListener: PluginListenerHandle | undefined;
    let nativeAcceptListener: PluginListenerHandle | undefined;
    let nativeDeclineListener: PluginListenerHandle | undefined;
    let appStateListener: PluginListenerHandle | undefined;
    let cancelled = false;

    const stopRingingFor = (deliveryId: string) => {
      if (!deliveryId) return;
      activeAlertsRef.current.delete(deliveryId);
      seenIdsRef.current.add(deliveryId);
      const timer = scheduledDeliveriesRef.current.get(deliveryId);
      if (timer) {
        clearTimeout(timer);
        scheduledDeliveriesRef.current.delete(deliveryId);
      }
      invalidateDeliveries();
      if (activeAlertsRef.current.size === 0) {
        stopAlert();
        stopLoop();
        stopGlobalAudioAlert();
        if (Capacitor.isNativePlatform()) {
          DeliveryOverlay.dismissIncomingCall().catch(() => {});
          DeliveryOverlay.stopNativeAudio().catch(() => {});
        }
      }
      if (Capacitor.isNativePlatform()) {
        const nid = hashId(deliveryId);
        LocalNotifications.cancel({ notifications: [{ id: nid }] }).catch(() => {});
        LocalNotifications.removeDeliveredNotifications({ notifications: [{ id: nid }] }).catch(() => {});
        DeliveryOverlay.cancelDeliveryNotification({ deliveryId }).catch(() => {});
        DeliveryOverlay.hideDeliveryCard({ deliveryId }).catch(() => {});
      }
    };

    const checkDriverOnline = () => {
      if (typeof window === "undefined") return false;
      const localOnline = user?.id ? localStorage.getItem(`driver_is_online_${user.id}`) === "true" : false;
      return Boolean(isOnlineRef.current || localOnline);
    };

    const handleStatusChangeEvent = (e: any) => {
      const isOnline = Boolean(e.detail?.isOnline);
      isOnlineRef.current = isOnline;
      if (!isOnline) {
        activeAlertsRef.current.clear();
        stopAlert();
        stopLoop();
        stopGlobalAudioAlert();
        scheduledDeliveriesRef.current.forEach((t) => clearTimeout(t));
        scheduledDeliveriesRef.current.clear();
        if (Capacitor.isNativePlatform()) {
          LocalNotifications.removeAllDeliveredNotifications().catch(() => {});
          DeliveryOverlay.cancelDeliveryNotification({ deliveryId: "" }).catch(() => {});
          DeliveryOverlay.dismissIncomingCall().catch(() => {});
          DeliveryOverlay.stopNativeAudio().catch(() => {});
        }
      }
    };
    window.addEventListener("driver-status-changed", handleStatusChangeEvent);

    const handleDeclineEvent = (e: any) => {
      const { deliveryId } = e.detail || {};
      if (deliveryId) stopRingingFor(deliveryId);
    };
    window.addEventListener("delivery-declined", handleDeclineEvent);

    const handleAcceptEvent = (e: any) => {
      const { id } = e.detail || {};
      if (id) stopRingingFor(id);
    };
    window.addEventListener("delivery-accepted", handleAcceptEvent);

    const notifyNewDelivery = async (rawDelivery: any) => {
      // 1. Apenas notifica se o entregador estiver estritamente ONLINE
      if (!checkDriverOnline()) return;

      // 2. CRUCIAL: Se a entrega NÃO estiver pendente nem transmitida (ex: já foi aceita por qualquer motoboy), NUNCA NOTIFICAR!
      const status = String(rawDelivery.status || "").toLowerCase().trim();
      if (status !== "pending" && status !== "broadcasted") {
        stopRingingFor(rawDelivery.id);
        return;
      }

      if (rawDelivery.completed_at || rawDelivery.delivered_at) {
        stopRingingFor(rawDelivery.id);
        return;
      }

      const declined = getDeclinedDeliveries();
      if (declined.has(rawDelivery.id)) return;
      if (seenIdsRef.current.has(rawDelivery.id)) return;

      // 3. Ignora entregas antigas (mais de 10 min) para não tocar som em entregas que já estavam lá
      const createdAt = rawDelivery.created_at || new Date().toISOString();
      const elapsed = getElapsedSeconds(createdAt);
      if (elapsed > 600) {
        seenIdsRef.current.add(rawDelivery.id);
        return;
      }

      const assignedId = rawDelivery.driver_id ? String(rawDelivery.driver_id).toLowerCase().trim() : "";
      const isAssigned = Boolean(assignedId && assignedId !== "none" && assignedId !== "00000000-0000-0000-0000-000000000000");
      const currentDriverId = driverRowRef.current?.id || user?.id;
      const currentUserId = user?.id;
      const myIds = [currentDriverId, currentUserId].filter(Boolean).map((id) => String(id).toLowerCase().trim());

      // Se atribuída a outro entregador (não a mim), encerra imediatamente qualquer alerta e não notifica!
      if (isAssigned && (!myIds.includes(assignedId) || myIds.length === 0)) {
        stopRingingFor(rawDelivery.id);
        return;
      }

      // REGRA: A notificação e áudio disparam IMEDIATAMENTE no momento da criação/push!
      // Se for entrega pendente geral dentro dos 2 minutos, agenda para aparecer no app para aceite ao completar 120s
      if (elapsed < ADMIN_WINDOW_SECONDS && !isAssigned && status !== "broadcasted") {
        if (!scheduledDeliveriesRef.current.has(rawDelivery.id)) {
          const remainingMs = Math.max(500, (ADMIN_WINDOW_SECONDS - elapsed) * 1000 + 500);
          console.log(`[Notify] Notificando som/alerta agora! A entrega ${rawDelivery.id} aparecerá para aceite no app em ${(remainingMs / 1000).toFixed(1)}s (2 min)`);
          const timer = setTimeout(() => {
            scheduledDeliveriesRef.current.delete(rawDelivery.id);
            invalidateDeliveries();
          }, remainingMs);
          scheduledDeliveriesRef.current.set(rawDelivery.id, timer);
        }
      }

      seenIdsRef.current.add(rawDelivery.id);
      activeAlertsRef.current.add(rawDelivery.id);
      invalidateDeliveries();

      // Dispara o alerta sonoro oficial MT 24 Horas Express (sem duplicidade)
      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.playNativeAudio().catch(() => {});
      } else {
        try {
          unlockAudio();
          startLoop();
        } catch (e) {
          console.warn("[Notify] som falhou:", e);
        }
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
      const grossValue = orderFee > 0 ? orderFee : Math.max(
        Number(delivery.delivery_fee) || 0,
        Number(delivery.value) || 0,
        Number(delivery.price) || 0
      );
      // Ganhos do Motoboy: 75% do valor da entrega (ou comissão/taxa do entregador explícita)
      const driverEarning = delivery.commission && Number(delivery.commission) > 0
        ? Number(delivery.commission)
        : (delivery.driver_fee && Number(delivery.driver_fee) > 0
            ? Number(delivery.driver_fee)
            : grossValue * 0.75);
      const feeText = driverEarning > 0 ? `R$ ${driverEarning.toFixed(2).replace(".", ",")}` : "";
      const description = `${storeName} • Retirada: ${pickup} → Entrega: ${dropoff}${feeText ? ` • Ganho: ${feeText}` : ""}`;
      const title = `🏬 ${storeName}${feeText ? ` — ${feeText}` : ""}`;

      if (Capacitor.isNativePlatform()) {
        (DeliveryOverlay as any).showIncomingCall?.({
          deliveryId: delivery.id,
          storeName: storeName,
          pickup: pickup,
          dropoff: dropoff,
          fee: feeText,
          customerName: delivery.customer_name || "Cliente",
          customerPhone: delivery.customer_phone || "",
        })?.catch?.(() => {});

        // Posta na central de notificações nativa do Android
        DeliveryOverlay.postNotification({
          deliveryId: delivery.id,
          storeName: storeName,
          pickup: pickup,
          dropoff: dropoff,
          fee: feeText,
          status: delivery.status || "pending",
          driverId: delivery.driver_id || "",
        }).catch((e) => {
          console.warn("[DeliveryOverlay] postNotification erro:", e);
        });

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
        }
      }
    };

    const isRideVehicleCompatible = (rideVehicle: string): boolean => {
      const rVeh = String(rideVehicle || "").toLowerCase().replace(/_/g, "");
      const info = driverVehicleInfoRef.current;
      const services = Array.isArray(info?.service_types) ? info.service_types : [];
      const dVeh = String(info?.vehicle_type || info?.vehicle || "").toLowerCase().replace(/_/g, "");

      if (services.length > 0) {
        const normServices = services.map((s: any) => String(s).toLowerCase().replace(/_/g, ""));
        const hasRideSpecificCategories = normServices.some((s: any) =>
          s.includes("taxi") || s.includes("mototaxi") || s.includes("passageiro") || s.includes("corrida")
        );
        if (hasRideSpecificCategories) {
          if (rVeh === "mototaxi" || rVeh === "moto") {
            return normServices.some((s: any) => s.includes("mototaxi") || s.includes("moto"));
          }
          if (rVeh === "taxi" || rVeh === "carro" || rVeh === "car") {
            return normServices.some((s: any) => s.includes("taxi") || s.includes("car"));
          }
        }
      }

      if (rVeh === "mototaxi" || rVeh === "moto") {
        return dVeh.includes("moto") || !dVeh.includes("car");
      }
      if (rVeh === "taxi" || rVeh === "carro" || rVeh === "car") {
        return dVeh.includes("car") || dVeh.includes("taxi") || !dVeh.includes("moto");
      }
      return true;
    };

    const notifyNewRide = async (rawRide: any) => {
      if (!checkDriverOnline()) return;

      const statusLower = String(rawRide.status || "").toLowerCase();
      if (
        ["completed", "cancelled", "concluida", "cancelada", "finished", "finalizada", "delivered"].includes(statusLower) ||
        rawRide.completed_at
      ) {
        return;
      }

      const declined = getDeclinedDeliveries();
      if (declined.has(rawRide.id)) return;
      if (seenIdsRef.current.has(rawRide.id)) return;

      const currentDriverId = driverRowRef.current?.id || user?.id;
      const currentUserId = user?.id;

      // Se já foi atribuída para outro motorista
      if (rawRide.driver_id && rawRide.driver_id !== currentDriverId && rawRide.driver_id !== currentUserId) {
        return;
      }

      if (statusLower !== "pending" && statusLower !== "broadcasted") {
        return;
      }

      // Checa compatibilidade de veículo
      if (!isRideVehicleCompatible(rawRide.vehicle_type)) {
        return;
      }

      seenIdsRef.current.add(rawRide.id);
      activeAlertsRef.current.add(rawRide.id);
      invalidateDeliveries();

      // Dispara o alerta sonoro oficial MT 24 Horas Express (sem duplicidade)
      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.playNativeAudio().catch(() => {});
      } else {
        try {
          unlockAudio();
          startLoop();
        } catch (e) {
          console.warn("[Notify] som falhou para corrida:", e);
        }
      }

      const isTaxi = String(rawRide.vehicle_type || "").toLowerCase().includes("taxi") && !String(rawRide.vehicle_type || "").toLowerCase().includes("moto");
      const rideTypeLabel = isTaxi ? "🚕 Nova Corrida de Táxi!" : "🏍️ Nova Corrida de Moto Táxi!";
      const passenger = rawRide.customer_name || "Passageiro";
      const pickup = rawRide.pickup_address || "Ponto de Embarque";
      const dropoff = rawRide.dropoff_address || "Destino";
      const ridePrice = Number(rawRide.price || (isTaxi ? 15.0 : 10.0));
      const feeText = `R$ ${ridePrice.toFixed(2).replace(".", ",")}`;

      const title = `${rideTypeLabel} ${feeText}`;
      const body = `Passageiro: ${passenger} • ${pickup} → ${dropoff}`;

      toast(title, {
        description: body,
        duration: 20000,
        action: {
          label: "Ver Corrida",
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.href = `/driver?mode=ride&rideId=${rawRide.id}`;
            }
          },
        },
      });

      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.showIncomingCall({
          deliveryId: rawRide.id,
          storeName: isTaxi ? "🚕 TÁXI EXPRESS" : "🏍️ MOTO TÁXI EXPRESS",
          pickup: pickup,
          dropoff: dropoff,
          fee: feeText,
          customerName: passenger,
          customerPhone: rawRide.customer_phone || "",
        }).catch(() => {
          DeliveryOverlay.postNotification({
            deliveryId: rawRide.id,
            storeName: isTaxi ? "🚕 TÁXI EXPRESS" : "🏍️ MOTO TÁXI EXPRESS",
            pickup: pickup,
            dropoff: dropoff,
            fee: feeText,
            status: rawRide.status || "pending",
            driverId: rawRide.driver_id || "",
          }).catch((e) => console.warn("[DeliveryOverlay] erro corrida:", e));
        });

        LocalNotifications.schedule({
          notifications: [
            {
              title: title,
              body: `🏁 Destino: ${dropoff}`,
              id: hashId(rawRide.id),
              actionTypeId: "DELIVERY_ACTION",
              channelId: NOTIFICATION_CHANNEL_ID,
              sound: "ring",
              extra: { type: "ride", rideId: rawRide.id },
            },
          ],
        }).catch((e) => console.warn("[LocalNotifications] erro corrida:", e));
      } else if (!Capacitor.isNativePlatform() && typeof window !== "undefined" && "Notification" in window) {
        const currentPerm = Notification.permission || permissionRef.current;
        if (currentPerm === "granted") {
          try {
            const notif = new Notification(title, {
              body,
              icon: "/favicon-v3.png",
              tag: `ride-${rawRide.id}`,
              requireInteraction: true,
            });
            notif.onclick = () => {
              window.focus();
              window.location.href = `/driver?mode=ride&rideId=${rawRide.id}`;
            };
          } catch (e) {}
        }
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
      driverRowRef.current = driverRow;
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
          const refreshToken = session?.refresh_token ?? "";
          DeliveryOverlay.saveDriverContext({ driverId, userId: user.id, userToken, refreshToken }).catch(() => {});
          DeliveryOverlay.setDriverOnlineStatus({ isOnline: isOnlineRef.current }).catch(() => {});
        } catch (e) {}

        // Verifica se houve aceite pendente feito nativamente na tela de chamada
        DeliveryOverlay.getPendingAcceptedDelivery().then(({ deliveryId }) => {
          if (deliveryId) {
            console.log("[NativeAccept] Corrida pendente de aceite nativo detectada:", deliveryId);
            acceptDeliveryLocally(deliveryId);
          }
        }).catch(() => {});

        nativeAcceptListener = await DeliveryOverlay.addListener("onDeliveryAccepted", ({ deliveryId }: any) => {
          if (deliveryId) {
            acceptDeliveryLocally(deliveryId);
          }
        });

        nativeDeclineListener = await DeliveryOverlay.addListener("onDeliveryDeclined", ({ deliveryId }: any) => {
          if (deliveryId) {
            declineDeliveryLocally(deliveryId);
          }
        });
      }

      if (cancelled) return;

      // Limpa canais anteriores deste driver para evitar conflitos de re-subscrição
      try {
        const existingChannels = supabase.getChannels();
        for (const ch of existingChannels) {
          if (ch.topic.includes(`mt24-driver-status-${driverId}`) || ch.topic.includes(`mt24-driver-broadcast-${driverId}`)) {
            supabase.removeChannel(ch);
          }
        }
      } catch {}

      const chUnique = `${driverId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Listener de status online/offline com nome de canal exclusivo e protegido contra unhandled rejection
      let driverChannel: any = null;
      try {
        driverChannel = supabase
          .channel(`mt24-driver-status-${chUnique}`)
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
                if (Capacitor.isNativePlatform()) {
                  DeliveryOverlay.setDriverOnlineStatus({ isOnline: updated.is_online }).catch(() => {});
                }
                if (!updated.is_online && wasOnline) {
                  activeAlertsRef.current.clear();
                  stopAlert();
                  if (Capacitor.isNativePlatform()) {
                    DeliveryOverlay.stopNativeAudio().catch(() => {});
                  }
                }
              }
            }
          )
          .subscribe();
      } catch (e) {
        console.warn("[Realtime] Falha ao assinar driverChannel:", e);
      }
      
      if (cancelled) {
        if (driverChannel) {
          try { supabase.removeChannel(driverChannel); } catch {}
        }
        return;
      }
      if (driverChannel) {
        channelsRef.current.push(driverChannel);
      }

      // Listener para resposta dos botões da Tela Cheia / Popup Nativo (IncomingCallActivity)
      if (Capacitor.isNativePlatform()) {
        overlayListener = await DeliveryOverlay.addListener(
          "onCallResponse",
          async (response: any) => {
            const deliveryId = response.deliveryId;
            if (response.status === "accepted") {
              stopAlert();
              activeAlertsRef.current.delete(deliveryId);

              // 1. Tenta atualizar deliveries primeiro
              const { data: delData, error: delErr } = await supabase
                .from("deliveries")
                .update({ status: "accepted", driver_id: driverId })
                .eq("id", deliveryId)
                .in("status", ["pending", "broadcasted"])
                .or(`driver_id.is.null,driver_id.eq.${driverId},driver_id.eq.${user.id}`)
                .select("id");

              if (!delErr && delData && delData.length > 0) {
                DeliveryOverlay.reportCallResult({ success: true, message: "✅ Entrega aceita!" }).catch(() => {});
                acceptDeliveryLocally(deliveryId);
                toast("✅ Entrega aceita!", { description: "Aceita com sucesso." });
                invalidateDeliveries();
                return;
              }

              // 2. Tenta atualizar ride_requests (Táxi / Moto Táxi)
              const { data: rideData, error: rideErr } = await supabase
                .from("ride_requests")
                .update({ status: "accepted", driver_id: driverId })
                .eq("id", deliveryId)
                .in("status", ["pending", "broadcasted"])
                .or(`driver_id.is.null,driver_id.eq.${driverId},driver_id.eq.${user.id}`)
                .select("id");

              if (!rideErr && rideData && rideData.length > 0) {
                DeliveryOverlay.reportCallResult({ success: true, message: "✅ Corrida aceita!" }).catch(() => {});
                acceptDeliveryLocally(deliveryId);
                toast("✅ Corrida aceita!", { description: "Vá até o ponto de embarque." });
                invalidateDeliveries();
                return;
              }

              // 3. Caso tenha falhado em ambas
              DeliveryOverlay.reportCallResult({ success: false, message: "Já foi aceita por outro motorista" }).catch(() => {});
              declineDeliveryLocally(deliveryId);
              toast("❌ Ops! Já foi aceita.", { description: "Outro motorista aceitou antes de você." });
            } else if (response.status === "rejected" || response.status === "declined") {
              declineDeliveryLocally(deliveryId);
            }
          }
        );
      }

      // Seed inicial: Apenas marcar entregas e corridas existentes no banco como JÁ VISTAS para NUNCA tocar som ao abrir o app
      try {
        const { data: initial } = await supabase
          .from("deliveries")
          .select("id, status, created_at, completed_at")
          .in("status", ["pending", "broadcasted"])
          .or(`driver_id.is.null,driver_id.eq.${driverId},driver_id.eq.${user.id}`);
        if (initial && !cancelled) {
          initial.forEach((d: any) => {
            seenIdsRef.current.add(d.id);
          });
        }

        // Seed inicial de Corridas (Táxi e Moto Táxi)
        const { data: initialRides } = await supabase
          .from("ride_requests")
          .select("id, status, created_at")
          .in("status", ["pending", "broadcasted"])
          .or(`driver_id.is.null,driver_id.eq.${driverId},driver_id.eq.${user.id}`)
          .limit(20);
        if (initialRides && !cancelled) {
          initialRides.forEach((r: any) => {
            seenIdsRef.current.add(r.id);
          });
        }
      } catch (e) {
        console.warn("[Notify] seed inicial falhou:", e);
      }

      // Polling contínuo para manter sincronizado com o banco
      const pollDeliveries = async () => {
        if (cancelled || !checkDriverOnline()) return;
        try {
          const { data } = await supabase
            .from("deliveries")
            .select("*, companies(name, address)")
            .in("status", ["pending", "broadcasted"])
            .or(`driver_id.is.null,driver_id.eq.${driverId},driver_id.eq.${user.id}`)
            .limit(20);

          const { data: ridesData } = await supabase
            .from("ride_requests")
            .select("*")
            .in("status", ["pending", "broadcasted"])
            .or(`driver_id.is.null,driver_id.eq.${driverId},driver_id.eq.${user.id}`)
            .limit(10);

          if (cancelled) return;

          const freshDeliveryIds = new Set((data || []).map((d: any) => d.id));
          const freshRideIds = new Set((ridesData || []).map((r: any) => r.id));
          const freshIds = new Set([...freshDeliveryIds, ...freshRideIds]);

          // Notifica APENAS se a entrega for recente (< 2 min) e ainda não foi vista
          data?.forEach((d: any) => {
            if (!seenIdsRef.current.has(d.id)) {
              const elapsed = getElapsedSeconds(d.created_at || "");
              if (elapsed <= 120) {
                notifyNewDelivery(d);
              } else {
                seenIdsRef.current.add(d.id);
              }
            }
          });

          ridesData?.forEach((r: any) => {
            if (!seenIdsRef.current.has(r.id)) {
              const elapsed = getElapsedSeconds(r.created_at || "");
              if (elapsed <= 120) {
                notifyNewRide(r);
              } else {
                seenIdsRef.current.add(r.id);
              }
            }
          });

          // Limpa timers agendados de corridas que não estão mais pendentes
          scheduledDeliveriesRef.current.forEach((timer, id) => {
            if (!freshIds.has(id)) {
              clearTimeout(timer);
              scheduledDeliveriesRef.current.delete(id);
            }
          });

          Array.from(activeAlertsRef.current).forEach((id) => {
            if (!freshIds.has(id)) stopRingingFor(id);
          });

          if (freshIds.size === 0) {
            scheduledDeliveriesRef.current.forEach((t) => clearTimeout(t));
            scheduledDeliveriesRef.current.clear();
            activeAlertsRef.current.clear();
            stopAlert();
            stopLoop();
            stopGlobalAudioAlert();
            if (Capacitor.isNativePlatform()) {
              LocalNotifications.removeAllDeliveredNotifications().catch(() => {});
              DeliveryOverlay.cancelDeliveryNotification({ deliveryId: "" }).catch(() => {});
              DeliveryOverlay.dismissIncomingCall().catch(() => {});
              DeliveryOverlay.stopNativeAudio().catch(() => {});
            }
          }
        } catch (e) {
          console.warn("[Notify] polling falhou:", e);
        }
      };

      const handleAppWakeup = () => {
        ensureRealtimeConnected();
        invalidateDeliveries();
        if (checkDriverOnline()) {
          pollDeliveries();
        } else {
          // Se estiver offline ao abrir o app, limpa qualquer notificação pendente da barra
          activeAlertsRef.current.clear();
          stopAlert();
          stopLoop();
          stopGlobalAudioAlert();
          if (Capacitor.isNativePlatform()) {
            LocalNotifications.removeAllDeliveredNotifications().catch(() => {});
            DeliveryOverlay.cancelDeliveryNotification({ deliveryId: "" }).catch(() => {});
            DeliveryOverlay.dismissIncomingCall().catch(() => {});
            DeliveryOverlay.stopNativeAudio().catch(() => {});
          }
        }
      };

      if (Capacitor.isNativePlatform()) {
        appStateListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            handleAppWakeup();
          }
        });
      }

      window.addEventListener("pageshow", handleAppWakeup);
      window.addEventListener("focus", handleAppWakeup);
      window.addEventListener("online", handleAppWakeup);

      if (cancelled) return;

      const broadcastUnique = `${driverId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // Realtime — novas entregas, corridas e mudanças de status (nome exclusivo para evitar conflito de subscribe())
      let broadcastChannel: any = null;
      try {
        broadcastChannel = supabase
          .channel(`mt24-driver-broadcast-${broadcastUnique}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "deliveries" },
            (payload) => {
              invalidateDeliveries();
              const d = payload.new as any;
              if (checkDriverOnline() && (d?.status === "pending" || d?.status === "broadcasted")) {
                notifyNewDelivery(d);
              }
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "deliveries" },
            (payload) => {
              invalidateDeliveries();
              const d = payload.new as any;
              const o = payload.old as any;

              // REGRA: Quando a entrega for aceita, concluída ou cancelada, encerra o alerta no mesmo instante!
              if (d?.status !== "pending" && d?.status !== "broadcasted") {
                stopRingingFor(d.id);
              }

              // Quando a entrega voltar a ficar pendente, dispara novamente o som/alerta se online
              if ((d?.status === "pending" || d?.status === "broadcasted") && checkDriverOnline()) {
                seenIdsRef.current.delete(d.id);
                notifyNewDelivery(d);
              }

              // Se atribuída a este motorista diretamente, confirma notificação de corrida aceita
              if ((d?.driver_id === driverId || d?.driver_id === user.id) && o?.status !== d?.status && d?.status === "accepted") {
                toast("✅ Corrida confirmada!", { description: "Vá até o ponto de retirada." });
                stopRingingFor(d.id);
              }
            }
          )
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "ride_requests" },
            (payload) => {
              invalidateDeliveries();
              const r = payload.new as any;
              if (checkDriverOnline() && (r?.status === "pending" || r?.status === "broadcasted")) {
                notifyNewRide(r);
              }
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "ride_requests" },
            (payload) => {
              invalidateDeliveries();
              const r = payload.new as any;
              const o = payload.old as any;

              // REGRA: Quando a corrida for aceita, concluída ou cancelada, encerra o alerta no mesmo instante!
              if (r?.status !== "pending" && r?.status !== "broadcasted") {
                stopRingingFor(r.id);
              }

              // Se atribuída a outro motorista, encerra no mesmo instante!
              if (r?.driver_id && r?.driver_id !== driverId && r?.driver_id !== user.id) {
                stopRingingFor(r.id);
              }

              if ((r?.status === "pending" || r?.status === "broadcasted") && (!r?.driver_id || r?.driver_id === driverId || r?.driver_id === user.id)) {
                if (checkDriverOnline()) {
                  seenIdsRef.current.delete(r.id);
                  notifyNewRide(r);
                }
              }

              if ((r?.driver_id === driverId || r?.driver_id === user.id) && r?.status === "accepted") {
                stopRingingFor(r.id);
                if (o?.status !== r?.status) {
                  toast("✅ Corrida confirmada!", { description: "Vá até o passageiro." });
                }
              }
            }
          )
          .subscribe();
      } catch (e) {
        console.warn("[Realtime] Falha ao assinar broadcastChannel:", e);
      }

      if (cancelled) {
        if (broadcastChannel) {
          try { supabase.removeChannel(broadcastChannel); } catch {}
        }
        return () => {};
      }
      if (broadcastChannel) {
        channelsRef.current.push(broadcastChannel);
      }

      return () => {
        window.removeEventListener("pageshow", handleAppWakeup);
        window.removeEventListener("focus", handleAppWakeup);
        window.removeEventListener("online", handleAppWakeup);
      };
    };

    let cleanupInner: (() => void) | undefined;
    setup().then((fn) => { cleanupInner = fn; });

    return () => {
      cancelled = true;
      window.removeEventListener("driver-status-changed", handleStatusChangeEvent);
      window.removeEventListener("delivery-declined", handleDeclineEvent);
      window.removeEventListener("delivery-accepted", handleAcceptEvent);
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
      if (actionListener) actionListener.remove?.().catch(() => {});
      if (overlayListener) overlayListener.remove?.().catch(() => {});
      if (nativeAcceptListener) nativeAcceptListener.remove?.().catch(() => {});
      scheduledDeliveriesRef.current.forEach((t) => clearTimeout(t));
      scheduledDeliveriesRef.current.clear();
      if (cleanupInner) cleanupInner();
    };
  }, [user?.id]);
}
