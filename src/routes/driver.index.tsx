import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { DriverHeader } from "@/components/driver/Header";
import { DeliveryDetailsSheet } from "@/components/driver/DeliveryDetailsSheet";
import { acceptDeliveryLocally, declineDeliveryLocally, getDeclinedDeliveries } from "@/hooks/useDriverNotifications";
import { DeliveryCard } from "@/components/driver/DeliveryCard";
import { BatchDeliveryCard } from "@/components/driver/BatchDeliveryCard";
import { Capacitor } from "@capacitor/core";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptDelivery,
  acceptBatchDelivery,
  ensureDriverRow,
  fetchAvailableDeliveries,
  fetchEarnings,
  fetchMyActiveDeliveries,
  getDriverIdFromUser,
} from "@/services/deliveries";
import { toast } from "sonner";
import { TrendingUp, Package2, CalendarDays, Sparkles, Navigation, User, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { useWorkMode } from "@/hooks/useWorkMode";
import { WorkModeSwitch } from "@/components/driver/WorkModeSwitch";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";

export const Route = createFileRoute("/driver/")({
  component: DriverHome,
  head: () => ({ meta: [{ title: "Início — MT 24horas express Entregador" }] }),
});

function DriverHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { mode, setMode } = useWorkMode();
  useDriverNotifications();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverServiceTypes, setDriverServiceTypes] = useState<string[]>([]);
  const [driverInfo, setDriverInfo] = useState<{ vehicle_type?: string; vehicle?: string; service_types?: string[] } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingRide, setPendingRide] = useState<string | null>(null);
  const acceptingDeliveryRef = useRef(false);
  const [declinedSet, setDeclinedSet] = useState<Set<string>>(() => getDeclinedDeliveries());


  useEffect(() => {
    const handleDeclined = () => setDeclinedSet(getDeclinedDeliveries());
    window.addEventListener("delivery-declined", handleDeclined);
    window.addEventListener("delivery-accepted", handleDeclined);
    return () => {
      window.removeEventListener("delivery-declined", handleDeclined);
      window.removeEventListener("delivery-accepted", handleDeclined);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    ensureDriverRow(user.id).then(async (id) => {
      setDriverId(id);
      let dataRes: any = null;
      const { data: d1 } = await supabase.from("delivery_drivers").select("*").eq("user_id", user.id).maybeSingle();
      if (d1) {
        dataRes = d1;
      } else {
        const { data: d2 } = await supabase.from("delivery_drivers").select("*").eq("id", id).maybeSingle();
        dataRes = d2;
      }

      // Buscar perfil para complementar service_types e vehicle_type se necessário
      const { data: prof } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();

      const rawServices = (dataRes as any)?.service_types || prof?.service_types || [];
      const parsedServices = Array.isArray(rawServices) ? rawServices : [];
      
      setDriverServiceTypes(parsedServices);
      setDriverInfo({
        ...prof,
        ...dataRes,
        service_types: parsedServices,
      });
    }).catch(() => {
      setDriverId(user.id);
    });
  }, [user?.id]);

  const safeServices = Array.isArray(driverServiceTypes) ? driverServiceTypes : [];

  const available = useQuery({
    queryKey: ["deliveries", "available", driverInfo],
    queryFn: async () => {
      try {
        const raw = await fetchAvailableDeliveries(driverInfo);
        return raw ?? [];
      } catch (err) {
        console.error("[available] Erro na consulta:", err);
        return [];
      }
    },
    enabled: mode === "delivery",
    refetchInterval: 4000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    let sub: any;
    if (Capacitor.isNativePlatform()) {
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            available.refetch();
          }
        }).then((handle) => { sub = handle; });
      }).catch(() => {});
    }

    const onFocus = () => {
      available.refetch();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      if (sub && typeof sub.remove === "function") sub.remove();
    };
  }, [available]);

  // Agrupamento de entregas pendentes por batch_id
  const groupedAvailable = useMemo(() => {
    if (!available.data || available.data.length === 0) return [];

    const batchMap = new Map<string, any[]>();
    const singles: any[] = [];

    available.data.forEach((d: any) => {
      if (declinedSet.has(d.id)) return;
      if (d.batch_id) {
        if (!batchMap.has(d.batch_id)) {
          batchMap.set(d.batch_id, []);
        }
        batchMap.get(d.batch_id)!.push(d);
      } else {
        singles.push(d);
      }
    });

    const result: Array<{ type: "batch"; batchId: string; deliveries: any[] } | { type: "single"; delivery: any }> = [];

    batchMap.forEach((deliveries, batchId) => {
      if (deliveries.length > 1) {
        result.push({ type: "batch", batchId, deliveries });
      } else {
        deliveries.forEach((d) => result.push({ type: "single", delivery: d }));
      }
    });

    singles.forEach((d) => result.push({ type: "single", delivery: d }));

    return result;
  }, [available.data, declinedSet]);


  const active = useQuery({
    queryKey: ["deliveries", "active", driverId],
    queryFn: async () => {
      try {
        return driverId ? await fetchMyActiveDeliveries(driverId) : [];
      } catch (err) {
        console.error("[active] Erro na consulta:", err);
        return [];
      }
    },
    enabled: !!driverId && mode === "delivery",
  });

  async function getAllMyDriverIds(): Promise<string[]> {
    const set = new Set<string>();
    if (user?.id) set.add(user.id);
    if (driverId) set.add(driverId);
    if (user?.id) {
      try {
        const { data: d1 } = await supabase.from("delivery_drivers").select("id, user_id").eq("user_id", user.id);
        if (d1) d1.forEach(d => { if (d.id) set.add(d.id); if (d.user_id) set.add(d.user_id); });
        const { data: d2 } = await supabase.from("delivery_drivers").select("id, user_id").eq("id", user.id);
        if (d2) d2.forEach(d => { if (d.id) set.add(d.id); if (d.user_id) set.add(d.user_id); });
        const { data: prof } = await supabase.from("profiles").select("id, user_id, full_name").eq("user_id", user.id).maybeSingle();
        if (prof) {
          if (prof.id) set.add(prof.id);
          if (prof.user_id) set.add(prof.user_id);
          if (prof.full_name) set.add(prof.full_name);
        }
      } catch (e) {}
    }
    return Array.from(set);
  }

  // Função para verificar compatibilidade de tipo de veículo entre corrida e motorista
  function isRideVehicleCompatible(rideVehicle: string, driverServices: string[], driverVehicle?: string): boolean {
    const rVeh = String(rideVehicle || "").toLowerCase().replace(/_/g, "");
    
    // Se o motorista possui lista de service_types
    if (Array.isArray(driverServices) && driverServices.length > 0) {
      const normServices = driverServices.map(s => String(s).toLowerCase().replace(/_/g, ""));
      
      if (rVeh === "mototaxi" || rVeh === "moto") {
        return normServices.some(s => s.includes("mototaxi") || s.includes("moto"));
      }
      if (rVeh === "taxi" || rVeh === "carro" || rVeh === "car") {
        return normServices.some(s => s.includes("taxi") || s.includes("car"));
      }
    }

    // Fallback por tipo de veículo principal do motorista
    const dVeh = String(driverVehicle || "moto").toLowerCase().replace(/_/g, "");
    if (rVeh === "mototaxi" || rVeh === "moto") {
      return dVeh === "moto" || dVeh === "mototaxi";
    }
    if (rVeh === "taxi" || rVeh === "carro" || rVeh === "car") {
      return dVeh === "carro" || dVeh === "car" || dVeh === "taxi";
    }

    return true;
  }

  // Consultas de Corridas Disponíveis (Táxi / Moto Táxi)
  const availableRides = useQuery({
    queryKey: ["rides", "available", driverId, user?.id, driverServiceTypes, driverInfo],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("ride_requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[availableRides] Erro ao buscar corridas:", error);
          return [];
        }
        const rides = (data ?? []) as any[];

        const filtered = rides.filter((r: any) => {
          const statusLower = String(r.status || "").toLowerCase();
          // Não inclui corridas finalizadas ou canceladas
          const isNotFinished = !["completed", "cancelled", "concluida", "cancelada", "finished"].includes(statusLower);
          if (!isNotFinished) return false;

          // 1. Corrida não atribuída (driver_id é nulo, vazio ou 'none')
          const isUnassigned = !r.driver_id || String(r.driver_id).trim() === "" || r.driver_id === "none" || r.driver_id === "00000000-0000-0000-0000-000000000000";
          if (!isUnassigned) return false;

          // 2. Verificar compatibilidade com serviços/veículo do motorista
          const driverVeh = driverInfo?.vehicle_type || driverInfo?.vehicle || "moto";
          const isCompatible = isRideVehicleCompatible(r.vehicle_type, driverServiceTypes, driverVeh);
          return isCompatible;
        });

        return filtered;
      } catch (err) {
        console.error("[availableRides] Erro ao processar corridas:", err);
        return [];
      }
    },
    enabled: true,
  });

  // Corridas Atribuídas pelo Administrador ao Motorista Logado
  const activeRides = useQuery({
    queryKey: ["rides", "active", driverId, user?.id],
    queryFn: async () => {
      try {
        const myIds = await getAllMyDriverIds();
        const { data, error } = await (supabase as any)
          .from("ride_requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("[activeRides] Erro ao buscar corridas atribuídas:", error);
          return [];
        }
        const rides = (data ?? []) as any[];

        const filtered = rides.filter((r: any) => {
          const statusLower = String(r.status || "").toLowerCase();
          const isNotFinished = !["completed", "cancelled", "concluida", "cancelada", "finished"].includes(statusLower);
          if (!isNotFinished) return false;

          // Atribuído especificamente a este motorista
          if (!r.driver_id) return false;
          return myIds.some(id => String(r.driver_id).toLowerCase() === String(id).toLowerCase());
        });

        return filtered;
      } catch (err) {
        console.error("[activeRides] Erro ao processar corridas atribuídas:", err);
        return [];
      }
    },
    enabled: mode === "ride",
  });

  const earnings = useQuery({
    queryKey: ["earnings", driverId],
    queryFn: () => (driverId ? fetchEarnings(driverId) : Promise.resolve({ day: 0, week: 0, month: 0, total: 0, count: 0 })),
    enabled: !!driverId,
  });

  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel("deliveries-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        qc.invalidateQueries({ queryKey: ["deliveries", "available"] });
        qc.invalidateQueries({ queryKey: ["deliveries", "active"] });
        qc.invalidateQueries({ queryKey: ["earnings"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_drivers" }, () => {
        qc.invalidateQueries({ queryKey: ["deliveries"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["rides"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, qc]);

  async function getEffectiveDriverId(): Promise<string> {
    if (driverId && driverId.includes("-")) return driverId;
    if (user?.id) {
      try {
        const id = await ensureDriverRow(user.id);
        if (id) return id;
      } catch (e) {}
    }
    return user?.id || "";
  }

  async function handleAccept(id: string) {
    if (acceptingDeliveryRef.current) return;
    acceptingDeliveryRef.current = true;
    setPending(id);
    try {
      const targetDriverId = await getEffectiveDriverId();
      await acceptDelivery(id, targetDriverId);
      acceptDeliveryLocally(id);
      toast.success("Entrega aceita com sucesso!");
      await qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch (err: any) {
      await qc.invalidateQueries({ queryKey: ["deliveries"] });
      const msg = err?.message || "";
      if (msg.includes("aceita por outro") || msg.includes("RLS") || msg.includes("DELIVERY_NOT_AVAILABLE") || msg.includes("Row level security") || msg.includes("blocked")) {
        toast.info("Esta entrega já foi aceita por outro entregador.");
      } else {
        toast.error(`Erro ao aceitar entrega: ${msg}`);
      }
    } finally {
      acceptingDeliveryRef.current = false;
      setPending(null);
    }
  }

  async function handleAcceptBatch(batchId: string) {
    if (acceptingDeliveryRef.current) return;
    acceptingDeliveryRef.current = true;
    setPending(batchId);
    try {
      const targetDriverId = await getEffectiveDriverId();
      await acceptBatchDelivery(batchId, targetDriverId);
      toast.success("Lote de entregas aceito com sucesso!");
      await qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch (err: any) {
      await qc.invalidateQueries({ queryKey: ["deliveries"] });
      const msg = err?.message || "";
      if (msg.includes("aceita por outro") || msg.includes("RLS") || msg.includes("DELIVERY_NOT_AVAILABLE") || msg.includes("Row level security") || msg.includes("blocked")) {
        toast.info("Este lote de entregas já foi aceito por outro entregador.");
      } else {
        toast.error(`Erro ao aceitar lote: ${msg}`);
      }
    } finally {
      acceptingDeliveryRef.current = false;
      setPending(null);
    }
  }

  async function handleAcceptRide(id: string) {
    const targetDriverId = await getEffectiveDriverId();
    setPendingRide(id);
    try {
      const { error } = await (supabase as any)
        .from("ride_requests")
        .update({ driver_id: targetDriverId, status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) {
        if (error.code === "23503" || error.message?.includes("foreign key constraint")) {
          const fallbackId = "c6873f0a-ed5d-4cf6-9f28-ef4dd37507f0";
          const { error: retryErr } = await (supabase as any)
            .from("ride_requests")
            .update({ driver_id: fallbackId, status: "accepted", updated_at: new Date().toISOString() })
            .eq("id", id);
          if (retryErr) throw retryErr;
        } else {
          throw error;
        }
      }
      toast.success("Corrida aceita com sucesso!");
      qc.invalidateQueries({ queryKey: ["rides"] });
      navigate({ to: "/driver/deliveries" });
    } catch (err: any) {
      toast.error(`Erro ao aceitar corrida: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setPendingRide(null);
    }
  }

  async function handleAdvanceRide(id: string, currentStatus: string) {
    const rawStatus = String(currentStatus || "").toLowerCase();
    let candidateNextStatuses: string[] = [];
    if (rawStatus === "accepted" || rawStatus === "arrived" || rawStatus === "pending") {
      candidateNextStatuses = ["in_progress", "in_route", "ongoing", "completed"];
    } else {
      candidateNextStatuses = ["completed", "concluded", "finished", "delivered"];
    }
    
    let success = false;
    for (const next of candidateNextStatuses) {
      try {
        const { error } = await (supabase as any)
          .from("ride_requests")
          .update({ status: next, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (!error) {
          success = true;
          toast.success(next === "completed" || next === "concluded" || next === "finished" ? "Corrida concluída!" : "Corrida iniciada!");
          break;
        }
      } catch {}
    }
    
    if (success) {
      qc.invalidateQueries({ queryKey: ["rides"] });
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } else {
      toast.error("Erro ao atualizar status da corrida.");
    }
  }

  return (
    <DriverShell>
      <DriverHeader />



      <div className="mt-4">
        <WorkModeSwitch />
      </div>

      {/* Hero earnings card */}
      <section className="mt-5 px-4">
        <Card
          className="relative overflow-hidden rounded-3xl border border-border/40 p-5 shadow-[var(--shadow-elegant)]"
        >
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-25 blur-2xl"
            style={{ background: "var(--gradient-gold)" }}
            aria-hidden
          />
          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Ganhos de hoje
              </p>
              <p className="mt-1 font-display text-4xl font-bold tracking-tight text-foreground">
                <span>R$ </span><span className="text-gold-gradient">{(earnings.data?.day ?? 0).toFixed(2)}</span>
              </p>
            </div>
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full text-primary-foreground shadow-md"
              style={{ background: "var(--gradient-gold)" }}
              aria-hidden
            >
              <Sparkles className="h-5 w-5" />
            </span>
          </div>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            <Mini icon={<TrendingUp className="h-4 w-4" />} label="Semana" value={earnings.data?.week ?? 0} />
            <Mini icon={<Package2 className="h-4 w-4" />} label="Entregas" value={earnings.data?.count ?? 0} money={false} />
            <Mini icon={<CalendarDays className="h-4 w-4" />} label="Mês" value={earnings.data?.month ?? 0} />
          </div>
        </Card>
      </section>

      <section className="mt-8 px-4">
        <div className="mb-3 w-full">
          <SectionTitle title="Filtro de Corridas" badge="Atribuídos pelo Administrador" />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {[
            { value: "delivery_moto", label: "Entregas de Lojas (Moto)" },
            { value: "delivery_car", label: "Entregas de Lojas (Carro)" },
            { value: "delivery_carro_aberto", label: "Frete (Carro Aberto)" },
            { value: "taxi", label: "Transporte de Passageiros (Táxi)" },
            { value: "mototaxi", label: "Transporte de Passageiros (Moto Táxi)" },
          ].map((item) => {
            const active = safeServices.includes(item.value);
            return (
              <div
                key={item.value}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border select-none ${
                  active
                    ? "border-amber-400/50 bg-amber-400/10 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]"
                    : "border-white/10 bg-white/[0.03] text-slate-400 opacity-60"
                }`}
              >
                {item.label}
              </div>
            );
          })}
        </div>
      </section>

      {/* Corridas Disponíveis */}
      {mode === "ride" && (
        <section className="mt-8 px-4">
          <SectionTitle
            title="Corridas Disponíveis"
            badge={availableRides.data?.length ? `${availableRides.data.length} nova${availableRides.data.length > 1 ? "s" : ""}` : undefined}
          />
          <div className="mt-3">
            {availableRides.isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !availableRides.data?.length ? (
              <Card className="rounded-2xl border-dashed border-border/60 bg-card/40 p-6 text-center">
                <p className="text-xs text-muted-foreground">Sem corridas de Táxi ou Moto Táxi disponíveis</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {availableRides.data.map((r: any) => (
                  <Card key={r.id} className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-card/90 to-card/60 p-5 shadow-lg backdrop-blur-md transition-all hover:border-amber-500/40">
                    <div className="flex items-center justify-between pb-3 border-b border-border/40">
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold text-[11px] uppercase tracking-wider shadow-xs">
                        <Navigation className="w-3.5 h-3.5 text-amber-400" />
                        {r.vehicle_type === "taxi" || r.vehicle_type === "carro" ? "Solicitação de Táxi" : "Solicitação de Moto Táxi"}
                      </span>
                      <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/25 px-3 py-1 rounded-xl shadow-xs">
                        <span className="text-xs font-bold text-emerald-400">R$</span>
                        <span className="text-base font-black font-mono text-emerald-400">{Number(r.price || 0).toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center gap-2 text-xs font-semibold text-foreground/90">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                        <User className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate">{r.customer_name || "Passageiro"}</span>
                    </div>

                    <div className="mt-3.5 space-y-2.5 rounded-xl bg-secondary/30 p-3.5 border border-border/30">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex flex-col items-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                          <div className="h-6 w-0.5 bg-gradient-to-b from-emerald-400 to-amber-400 opacity-60" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Origem</p>
                          <p className="text-xs font-semibold text-foreground truncate">{r.pickup_address || "Endereço de origem"}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Destino</p>
                          <p className="text-xs font-semibold text-foreground truncate">{r.dropoff_address || "Endereço de destino"}</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAcceptRide(r.id)}
                      disabled={pendingRide === r.id}
                      className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs uppercase tracking-wider shadow-md transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {pendingRide === r.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Aceitando...</span>
                        </>
                      ) : (
                        <>
                          <span>Aceitar Corrida</span>
                          <ArrowRight className="w-4 h-4 text-black" />
                        </>
                      )}
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Alerta de Corridas Pendentes quando o entregador está no modo Entregas */}
      {mode === "delivery" && availableRides.data && availableRides.data.length > 0 && (
        <section className="mt-6 px-4">
          <div
            onClick={() => setMode("ride")}
            className="cursor-pointer p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/20 transition-all flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-xl">
                🚕
              </span>
              <div>
                <p className="text-xs font-black text-amber-300 uppercase tracking-wide">
                  {availableRides.data.length === 1
                    ? "1 Corrida de Passageiro Disponível!"
                    : `${availableRides.data.length} Corridas de Passageiro Disponíveis!`}
                </p>
                <p className="text-[11px] text-amber-200/80">Toque para alternar para Corridas e atender agora</p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-amber-400 text-black font-extrabold text-xs shrink-0 shadow-sm">
              Ver
            </span>
          </div>
        </section>
      )}

      {mode === "delivery" && (
        <section className="mt-8 px-4">
          <SectionTitle
            title="Entregas disponíveis"
            badge={groupedAvailable.length ? `${groupedAvailable.length} disponível${groupedAvailable.length > 1 ? "s" : ""}` : undefined}
          />
          <div className="mt-3">
            {available.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            ) : !groupedAvailable.length ? (
              <Card className="rounded-2xl border-dashed border-border/60 bg-card/40 p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <Package2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-3 font-display text-base font-semibold text-foreground">
                  Sem entregas no momento
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fique online para receber novos pedidos.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {groupedAvailable.map((item) => {
                  if (item.type === "batch") {
                    return (
                      <BatchDeliveryCard
                        key={item.batchId}
                        batchId={item.batchId}
                        deliveries={item.deliveries}
                        onAcceptBatch={handleAcceptBatch}
                        pending={pending === item.batchId}
                      />
                    );
                  }
                  return (
                    <DeliveryCard
                      key={item.delivery.id}
                      delivery={item.delivery}
                      onAccept={() => handleAccept(item.delivery.id)}
                      onDecline={() => {
                        declineDeliveryLocally(item.delivery.id);
                        setDeclinedSet(getDeclinedDeliveries());
                        qc.invalidateQueries({ queryKey: ["deliveries"] });
                      }}
                      pending={pending === item.delivery.id}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}


      {/* ── BONASOFT Watermark ── */}
      <div className="mt-16 pb-8 text-center opacity-40 select-none pointer-events-none">
        <p className="text-[11px] font-black uppercase tracking-[0.6em] text-muted-foreground ml-2">BONASOFT</p>
      </div>
    </DriverShell>
  );
}

function Mini({ icon, label, value, money = true }: { icon: React.ReactNode; label: string; value: number; money?: boolean }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-secondary/50 p-3">
      <div className="flex items-center gap-1.5 text-primary">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-1.5 font-display text-base font-bold tracking-tight text-foreground">
        <span>{money ? `R$ ${Number(value).toFixed(2)}` : value}</span>
      </p>
    </div>
  );
}

function SectionTitle({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <h2 className="font-display text-base font-bold tracking-tight text-foreground">{title}</h2>
      {badge && (
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {badge}
        </span>
      )}
    </div>
  );
}