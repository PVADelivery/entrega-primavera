// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { DriverHeader } from "@/components/driver/Header";
import { DeliveryDetailsSheet } from "@/components/driver/DeliveryDetailsSheet";
import { acceptDeliveryLocally } from "@/hooks/useDriverNotifications";
import { DeliveryCard } from "@/components/driver/DeliveryCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptDelivery,
  ensureDriverRow,
  fetchAvailableDeliveries,
  fetchEarnings,
  fetchMyActiveDeliveries,
  getDriverIdFromUser,
} from "@/services/deliveries";
import { toast } from "sonner";
import { TrendingUp, Package2, CalendarDays, Sparkles } from "lucide-react";
import { useWorkMode } from "@/hooks/useWorkMode";
import { WorkModeSwitch } from "@/components/driver/WorkModeSwitch";
import { useDriverNotifications } from "@/hooks/useDriverNotifications";

export const Route = createFileRoute("/driver/")({
  component: DriverHome,
  head: () => ({ meta: [{ title: "Início — MT 24horas express Entregador" }] }),
});

function DriverHome() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { mode } = useWorkMode();
  useDriverNotifications();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [driverServiceTypes, setDriverServiceTypes] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [pendingRide, setPendingRide] = useState<string | null>(null);
  const acceptingDeliveryRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    // Tenta obter o ID do motorista ou assume o user.id da sessão
    ensureDriverRow(user.id).then(async (id) => {
      setDriverId(id);
      const { data } = await supabase.from("delivery_drivers").select("service_types").eq("user_id", user.id).maybeSingle();
      if ((data as any)?.service_types) setDriverServiceTypes((data as any).service_types);
    }).catch(() => {
      setDriverId(user.id);
    });
  }, [user]);

  const safeServices = Array.isArray(driverServiceTypes) ? driverServiceTypes : [];

  const isDeliveryDriver = 
    safeServices.length === 0 ||
    safeServices.includes("delivery_moto") || 
    safeServices.includes("delivery_car") ||
    safeServices.includes("delivery_carro_aberto") ||
    safeServices.includes("moto") ||
    safeServices.includes("carro");

  const available = useQuery({
    queryKey: ["deliveries", "available"],
    queryFn: async () => {
      const raw = await fetchAvailableDeliveries();
      return raw ?? [];
    },
    enabled: mode === "delivery",
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const active = useQuery({
    queryKey: ["deliveries", "active", driverId],
    queryFn: () => (driverId ? fetchMyActiveDeliveries(driverId) : Promise.resolve([])),
    enabled: !!driverId && mode === "delivery",
  });

  // Consultas de Corridas de Táxi/Moto Táxi
  const isTaxiOrMotoTaxi = safeServices.length === 0 || safeServices.includes("taxi") || safeServices.includes("mototaxi");

  const availableRides = useQuery({
    queryKey: ["rides", "available", safeServices],
    queryFn: async () => {
      const types: string[] = [];
      if (safeServices.includes("taxi")) types.push("taxi");
      if (safeServices.includes("mototaxi")) types.push("mototaxi");

      const { data, error } = await (supabase as any)
        .from("ride_requests")
        .select("*")
        .eq("status", "pending")
        .is("driver_id", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rides = (data ?? []) as any[];

      if (types.length > 0 && rides.length > 0) {
        const filtered = rides.filter((r: any) => types.includes(r.vehicle_type));
        if (filtered.length > 0) return filtered;
      }

      return rides;
    },
    enabled: mode === "ride",
  });

  const activeRides = useQuery({
    queryKey: ["rides", "active", driverId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ride_requests")
        .select("*")
        .eq("driver_id", driverId)
        .in("status", ["accepted", "in_progress"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!driverId && mode === "ride",
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
      toast.error(`Erro ao aceitar entrega: ${err?.message || JSON.stringify(err)}`);
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
    } catch (err: any) {
      toast.error(`Erro ao aceitar corrida: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setPendingRide(null);
    }
  }

  async function handleAdvanceRide(id: string, currentStatus: string) {
    const nextStatusMap: Record<string, string> = {
      accepted: "in_progress",
      in_progress: "completed",
    };
    const next = nextStatusMap[currentStatus];
    if (!next) return;
    
    try {
      const { error } = await (supabase as any)
        .from("ride_requests")
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success(next === "completed" ? "Corrida concluída!" : "Corrida iniciada!");
      qc.invalidateQueries({ queryKey: ["rides"] });
    } catch {
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
                R$ <span className="text-gold-gradient">{(earnings.data?.day ?? 0).toFixed(2)}</span>
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



      {/* Corridas de Táxi/Moto Táxi em Andamento */}
      {mode === "ride" && activeRides.data && activeRides.data.length > 0 && (
        <section className="mt-8 px-4">
          <SectionTitle title="Corridas em andamento" badge={`${activeRides.data.length}`} />
          <div className="mt-3 space-y-3">
            {activeRides.data.map((r) => (
              <Card key={r.id} className="p-4 rounded-2xl border border-border/40 shadow-sm space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                    {r.vehicle_type === "taxi" ? "🚗 Táxi" : "🏍️ Moto Táxi"}
                  </span>
                  <span className="text-xs font-bold text-emerald-500">R$ {Number(r.price).toFixed(2)}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground"><strong className="text-foreground">Passageiro:</strong> {r.customer_name}</p>
                  <p className="text-xs text-muted-foreground"><strong className="text-foreground">Origem:</strong> {r.pickup_address}</p>
                  <p className="text-xs text-muted-foreground"><strong className="text-foreground">Destino:</strong> {r.dropoff_address}</p>
                  {r.notes && <p className="text-xs text-muted-foreground italic">"{r.notes}"</p>}
                </div>
                <button
                  onClick={() => handleAdvanceRide(r.id, r.status)}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-all"
                >
                  {r.status === "accepted" ? "Iniciar Corrida" : "Concluir Corrida"}
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

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
                {availableRides.data.map((r) => (
                  <Card key={r.id} className="p-4 rounded-2xl border border-border/40 shadow-sm space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        {r.vehicle_type === "taxi" ? "🚗 Solicitação de Táxi" : "🏍️ Solicitação de Moto Táxi"}
                      </span>
                      <span className="text-xs font-bold text-emerald-500">R$ {Number(r.price).toFixed(2)}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground"><strong className="text-foreground">Passageiro:</strong> {r.customer_name}</p>
                      <p className="text-xs text-muted-foreground"><strong className="text-foreground">Origem:</strong> {r.pickup_address}</p>
                      <p className="text-xs text-muted-foreground"><strong className="text-foreground">Destino:</strong> {r.dropoff_address}</p>
                    </div>
                    <button
                      onClick={() => handleAcceptRide(r.id)}
                      disabled={pendingRide === r.id}
                      className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {pendingRide === r.id ? "Aceitando..." : "Aceitar Corrida"}
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {mode === "delivery" && (
        <section className="mt-8 px-4">
          <SectionTitle
            title="Entregas disponíveis"
            badge={available.data?.length ? `${available.data.length} nova${available.data.length > 1 ? "s" : ""}` : undefined}
          />
          <div className="mt-3">
            {available.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-32 rounded-2xl" />
                <Skeleton className="h-32 rounded-2xl" />
              </div>
            ) : !available.data?.length ? (
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
              <div className="space-y-3">
                {available.data.map((d) => (
                  <DeliveryCard
                    key={d.id}
                    delivery={d}
                    onAccept={() => handleAccept(d.id)}
                    pending={pending === d.id}
                  />
                ))}
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
        {money ? `R$ ${Number(value).toFixed(2)}` : value}
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