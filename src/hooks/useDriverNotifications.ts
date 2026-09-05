// @ts-nocheck
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, ensureRealtimeConnected } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAudioAlert } from "@/hooks/useAudioAlert";
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
    if (typeof window === "undefined") return;
    const declined = getDeclinedDeliveries();
    declined.add(deliveryId);
    localStorage.setItem("declined_deliveries", JSON.stringify(Array.from(declined)));
    window.dispatchEvent(new CustomEvent("delivery-declined", { detail: { deliveryId } }));

    if (Capacitor.isNativePlatform()) {
      LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
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
    if (typeof window === "undefined") return;
    const accepted = getAcceptedDeliveries();
    accepted.add(deliveryId);
    localStorage.setItem("accepted_deliveries", JSON.stringify(Array.from(accepted)));
    window.dispatchEvent(new CustomEvent("delivery-accepted", { detail: { id: deliveryId } }));

    if (Capacitor.isNativePlatform()) {
      LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
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
  const { playAlert, stopAlert, unlockAudio } = useAudioAlert();
  const qc = useQueryClient();

  const invalidateDeliveries = () => {
    try {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.refetchQueries({ queryKey: ["deliveries"] });
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

    // 1. Notificações locais do dispositivo
    if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
      try {
        LocalNotifications.requestPermissions().then((res) => {
          permissionRef.current = res.display === "granted" ? "granted" : "denied";
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
      const timer = scheduledDeliveriesRef.current.get(deliveryId);
      if (timer) {
        clearTimeout(timer);
        scheduledDeliveriesRef.current.delete(deliveryId);
      }
      invalidateDeliveries();
      if (activeAlertsRef.current.size === 0) {
        stopAlert();
        if (Capacitor.isNativePlatform()) {
          DeliveryOverlay.dismissIncomingCall().catch(() => {});
          DeliveryOverlay.stopNativeAudio().catch(() => {});
        }
      }
      if (Capacitor.isNativePlatform()) {
        LocalNotifications.cancel({ notifications: [{ id: hashId(deliveryId) }] }).catch(() => {});
        DeliveryOverlay.cancelDeliveryNotification({ deliveryId }).catch(() => {});
        DeliveryOverlay.hideDeliveryCard({ deliveryId }).catch(() => {});
      }
    };

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
      const isOnlineNow = isOnlineRef.current || (typeof window !== "undefined" && user?.id && localStorage.getItem(`driver_is_online_${user.id}`) === "true");
      if (!isOnlineNow) return;

      const declined = getDeclinedDeliveries();
      if (declined.has(rawDelivery.id)) return;
      if (seenIdsRef.current.has(rawDelivery.id)) return;

      // ── REGRA RÍGIDA DOS 2 MINUTOS DO ADMIN ──
      // Se não for elegível (ex: está na janela de 2 min do Admin), NUNCA notifica nem toca som!
      const currentDriverId = user?.id;
      const isEligible = isDeliveryEligibleForDriver(rawDelivery, currentDriverId);

      if (!isEligible) {
        const validPendingStatuses = ["pending", "pending_assignment", "created", "open", "em_aberto", "pendente"];
        const isPendingLike = validPendingStatuses.includes(String(rawDelivery.status || "").toLowerCase());
        const isUnassigned = !rawDelivery.driver_id || String(rawDelivery.driver_id).trim() === "" || rawDelivery.driver_id === "none" || rawDelivery.driver_id === "00000000-0000-0000-0000-000000000000";

        if (isPendingLike && isUnassigned && rawDelivery.created_at) {
          const elapsed = getElapsedSeconds(rawDelivery.created_at);
          if (elapsed < ADMIN_WINDOW_SECONDS) {
            const delayMs = Math.max(500, (ADMIN_WINDOW_SECONDS - elapsed) * 1000 + 500);
            if (!scheduledDeliveriesRef.current.has(rawDelivery.id)) {
              const timer = setTimeout(async () => {
                scheduledDeliveriesRef.current.delete(rawDelivery.id);
                invalidateDeliveries();
                try {
                  const { data: latest } = await supabase
                    .from("deliveries")
                    .select("*, companies(name, address)")
                    .eq("id", rawDelivery.id)
                    .maybeSingle();
                  if (latest) {
                    notifyNewDelivery(latest);
                  }
                } catch (e) {}
              }, delayMs);
              scheduledDeliveriesRef.current.set(rawDelivery.id, timer);
            }
          }
        }
        return;
      }

      seenIdsRef.current.add(rawDelivery.id);
      activeAlertsRef.current.add(rawDelivery.id);
      invalidateDeliveries();

      // Dispara o alerta sonoro e vibração
      try {
        unlockAudio();
        playAlert(false);
      } catch (e) {
        console.warn("[Notify] som falhou:", e);
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

      // DENTRO DO APP: NUNCA abrir popup/card flutuante e NUNCA exibir toast branco. O entregador vê a corrida diretamente no feed.
      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.playNativeAudio().catch(() => {});
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
          DeliveryOverlay.setDriverOnlineStatus({ isOnline: isOnlineRef.current }).catch(() => {});
          DeliveryOverlay.requestBatteryOptimizationExemption({ prompt: true }).catch(() => {});
        } catch (e) {}

        if (isOnlineRef.current) {
          DeliveryOverlay.startOverlay().catch(() => {});
        } else {
          DeliveryOverlay.stopOverlay().catch(() => {});
        }

        if (typeof navigator !== "undefined" && "wakeLock" in navigator && isOnlineRef.current) {
          try {
            (navigator as any).wakeLock.request("screen").catch(() => {});
          } catch {}
        }

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
              if (Capacitor.isNativePlatform()) {
                DeliveryOverlay.setDriverOnlineStatus({ isOnline: updated.is_online }).catch(() => {});
              }
              if (!updated.is_online && wasOnline) {
                activeAlertsRef.current.clear();
                stopAlert();
                if (Capacitor.isNativePlatform()) {
                  DeliveryOverlay.stopOverlay().catch(() => {});
                  DeliveryOverlay.stopNativeAudio().catch(() => {});
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
                toast("✅ Corrida aceita!", { description: "Aceita com sucesso." });
              } else {
                DeliveryOverlay.reportCallResult({ success: false, message: "Corrida já foi aceita por outro entregador" }).catch(() => {});
                declineDeliveryLocally(deliveryId);
                toast("❌ Ops! Já foi aceita.", { description: "Outro entregador aceitou antes de você." });
              }
            } else if (response.status === "rejected" || response.status === "declined") {
              declineDeliveryLocally(deliveryId);
            }
          }
        );
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

      // Polling a cada 5s
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

            // Limpa timers agendados de corridas que não estão mais pendentes (ex: canceladas pelo lojista)
            scheduledDeliveriesRef.current.forEach((timer, id) => {
              if (!freshIds.has(id)) {
                clearTimeout(timer);
                scheduledDeliveriesRef.current.delete(id);
              }
            });

            Array.from(activeAlertsRef.current).forEach((id) => {
              if (!freshIds.has(id)) stopRingingFor(id);
            });

            if (data.length === 0) {
              scheduledDeliveriesRef.current.forEach((t) => clearTimeout(t));
              scheduledDeliveriesRef.current.clear();
              activeAlertsRef.current.clear();
              stopAlert();
            }
          } else if (!data || data.length === 0) {
            scheduledDeliveriesRef.current.forEach((t) => clearTimeout(t));
            scheduledDeliveriesRef.current.clear();
            activeAlertsRef.current.clear();
            stopAlert();
          }
        } catch (e) {
          console.warn("[Notify] polling falhou:", e);
        }
      };

      const intervalId = setInterval(pollDeliveries, 5000);

      const handleAppWakeup = () => {
        ensureRealtimeConnected();
        invalidateDeliveries();
        if (isOnlineRef.current) {
          pollDeliveries();
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

      // Realtime — novas entregas e mudanças de status
      const broadcastChannel = supabase
        .channel(`mt24-driver-broadcast-${driverId}-${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "deliveries" },
          (payload) => {
            invalidateDeliveries();
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
            invalidateDeliveries();
            const d = payload.new as any;
            const o = payload.old as any;

            if (d?.status !== "pending" && d?.status !== "broadcasted") {
              stopRingingFor(d.id);
            }

            if ((d?.status === "pending" || d?.status === "broadcasted") && !d?.driver_id) {
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
                DeliveryOverlay.stopNativeAudio().catch(() => {});
              }
            }
          }
        )
        .subscribe();
      channelsRef.current.push(broadcastChannel);

      return () => {
        clearInterval(intervalId);
        window.removeEventListener("pageshow", handleAppWakeup);
        window.removeEventListener("focus", handleAppWakeup);
        window.removeEventListener("online", handleAppWakeup);
      };
    };

    let cleanupInner: (() => void) | undefined;
    setup().then((fn) => { cleanupInner = fn; });

    return () => {
      cancelled = true;
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
