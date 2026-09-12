import { useEffect, useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ThemeToggle } from "./ThemeToggle";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";

export function DriverHeader() {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);
  const [name, setName] = useState("Entregador");
  const locationWatchRef = useRef<number | null>(null);
  const lastLocationUpdateRef = useRef<{ lat: number; lng: number; time: number }>({ lat: 0, lng: 0, time: 0 });

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;

    // Carrega status salvo do localStorage como prioridade
    const localStatus = localStorage.getItem(`driver_is_online_${user.id}`);
    if (localStatus === "true") {
      setOnline(true);
    }

      const loadDriverInfo = async () => {
        let drvData: any = null;
        let profData: any = null;

        const { data: drv1 } = await supabase.from("delivery_drivers").select("is_online, full_name").eq("user_id", user.id).maybeSingle();
        if (drv1) drvData = drv1;
        else {
          const { data: drv2 } = await supabase.from("delivery_drivers").select("is_online, full_name").eq("id", user.id).maybeSingle();
          drvData = drv2;
        }

        const { data: p1 } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        profData = p1;

        const drv = drvData;
        const prof = profData;

        if (drv && typeof drv.is_online === "boolean") {
          setOnline(drv.is_online);
          localStorage.setItem(`driver_is_online_${user.id}`, String(drv.is_online));
        } else if (localStatus === "true") {
          await supabase
            .from("delivery_drivers")
            .update({ is_online: true } as any)
            .eq("user_id", user.id);
        }

        const finalName = prof?.full_name || drv?.full_name;
        if (finalName) setName(finalName);
      };

      loadDriverInfo();

      // Debounce e filtro para refletir alterações do Admin sem re-consultar a cada tick de GPS
      let debounceTimer: any = null;
      const debouncedLoadDriverInfo = (payload?: any) => {
        if (payload?.table === "delivery_drivers" && payload?.eventType === "UPDATE") {
          const oldD = payload.old;
          const newD = payload.new;
          if (oldD && newD && oldD.full_name === newD.full_name && oldD.is_online === newD.is_online) {
            return; // Apenas GPS mudou, não recarrega perfil
          }
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadDriverInfo();
        }, 2000);
      };

      // Realtime listener para refletir alterações do Admin instantaneamente
      const ch = supabase
        .channel(`driver-profile-sync-${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, (p) => debouncedLoadDriverInfo(p))
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, (p) => debouncedLoadDriverInfo(p))
        .on("postgres_changes", { event: "*", schema: "public", table: "delivery_drivers", filter: `user_id=eq.${user.id}` }, (p) => debouncedLoadDriverInfo(p))
        .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(ch);
    };
  }, [user]);

  useEffect(() => {
    return () => {
      if (locationWatchRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
    };
  }, []);

  function stopLocationTracking() {
    if (locationWatchRef.current === null || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(locationWatchRef.current);
    locationWatchRef.current = null;
  }

  function startLocationTracking() {
    if (!user || typeof navigator === "undefined" || !navigator.geolocation || locationWatchRef.current !== null) return;

    locationWatchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = Number(pos.coords?.latitude);
        const lng = Number(pos.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const now = Date.now();
        const last = lastLocationUpdateRef.current;
        const timeDiff = now - last.time;

        // Limite de taxa: no máximo 1 update a cada 20 segundos, ou 10s se deslocamento > 35m
        const approxDist = Math.hypot(lat - last.lat, lng - last.lng);
        if (timeDiff < 20000 && (timeDiff < 10000 || approxDist < 0.00035)) {
          return;
        }

        lastLocationUpdateRef.current = { lat, lng, time: now };

        try {
          await supabase
            .from("delivery_drivers")
            .update({ latitude: lat, longitude: lng, is_online: true } as any)
            .eq("user_id", user.id);
        } catch (e) {
          console.warn("[GPS] Falha ao sincronizar posição:", e);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
  }

  async function toggle(value: boolean) {
    if (!user) return;
    if (value) {
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
    setOnline(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(`driver_is_online_${user.id}`, String(value));
    }

    const { error } = await supabase
      .from("delivery_drivers")
      .update({ is_online: value } as any)
      .eq("user_id", user.id);

    if (error) {
      if (value) {
        stopLocationTracking();
        DeliveryOverlay.stopOverlay().catch(() => {});
      }
      console.error("Status update error:", error);
      toast.error("Erro: " + error.message);
      setOnline(!value);
      if (typeof window !== "undefined") {
        localStorage.setItem(`driver_is_online_${user.id}`, String(!value));
      }
    } else {
      toast.success(value ? "Você está online" : "Você está offline");
    }
  }

  return (
    <header
      className="relative overflow-hidden rounded-b-[2rem] px-5 pb-14 pt-8 text-white"
      style={{ background: "var(--gradient-hero)" }}
    >
      {/* gold glow */}
      <div
        className="pointer-events-none absolute -top-24 right-[-30%] h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--gradient-gold)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, oklch(0.82 0.13 86 / 0.6), transparent)" }}
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/15"
            style={{ background: "oklch(0 0 0 / 0.4)" }}
          >
            <img src={iconPrimavera} alt="MT 24 Horas Express" className="h-6 w-6 object-contain" />
          </span>
          <div className="leading-tight">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              MT 24 Horas Express
            </p>
            <p className="text-sm font-bold tracking-tight text-gold-gradient">
              Entregador
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle variant="onPrimary" />
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur">
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-400 shadow-[0_0_8px_currentColor]" : "bg-white/40"}`}
              aria-hidden
            />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/85">
              {online ? "Online" : "Offline"}
            </span>
            <Switch checked={online} onCheckedChange={toggle} />
          </div>
        </div>
      </div>

      <div className="relative mt-6">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/55">
          Bem-vindo de volta
        </p>
        <h1 className="mt-1 truncate font-display text-3xl font-bold tracking-tight">
          <span>Olá, </span><span className="text-gold-gradient">{name.split(" ")[0]}</span>
        </h1>
      </div>
    </header>
  );
}