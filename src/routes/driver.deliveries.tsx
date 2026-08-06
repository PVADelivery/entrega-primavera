// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { DeliveryCard } from "@/components/driver/DeliveryCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  acceptDelivery,
  advanceDelivery,
  cancelDelivery,
  ensureDriverRow,
  fetchAvailableDeliveries,
  fetchMyActiveDeliveries,
  fetchMyHistory,
  type Delivery,
} from "@/services/deliveries";
import { toast } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";
import { useWorkMode } from "@/hooks/useWorkMode";

export const Route = createFileRoute("/driver/deliveries")({
  component: DeliveriesPage,
  head: () => ({ meta: [{ title: "Entregas & Corridas — MT 24 Horas Express" }] }),
});

function DeliveriesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { mode, setMode, canDelivery, canRide } = useWorkMode();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    ensureDriverRow(user.id).then(setDriverId).catch(() => {});
  }, [user]);

  const active = useQuery({
    queryKey: ["deliveries", "active", driverId, user?.id],
    queryFn: () => fetchMyActiveDeliveries(driverId || user?.id || "", user?.id),
    enabled: true,
  });

  const activeRides = useQuery({
    queryKey: ["rides", "active", driverId, user?.id],
    queryFn: async () => {
      const ids = Array.from(new Set([driverId, user?.id, "c6873f0a-ed5d-4cf6-9f28-ef4dd37507f0"].filter(Boolean)));
      const { data, error } = await (supabase as any)
        .from("ride_requests")
        .select("*")
        .in("driver_id", ids)
        .in("status", ["accepted", "in_progress", "arrived"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: true,
  });

  const history = useQuery({
    queryKey: ["deliveries", "history", driverId, user?.id],
    queryFn: () => fetchMyHistory(driverId || user?.id || "", user?.id),
    enabled: true,
  });

  const historyRides = useQuery({
    queryKey: ["rides", "history", driverId, user?.id],
    queryFn: async () => {
      const ids = Array.from(new Set([driverId, user?.id, "c6873f0a-ed5d-4cf6-9f28-ef4dd37507f0"].filter(Boolean)));
      const { data, error } = await (supabase as any)
        .from("ride_requests")
        .select("*")
        .in("driver_id", ids)
        .in("status", ["completed", "cancelled"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("deliveries-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        qc.invalidateQueries({ queryKey: ["deliveries"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, () => {
        qc.invalidateQueries({ queryKey: ["rides"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  async function handleAdvanceRideStatus(rideId: string, currentStatus: string) {
    const statusMap: Record<string, string> = {
      accepted: "arrived",
      arrived: "in_progress",
      in_progress: "completed",
    };
    const nextStatus = statusMap[currentStatus];
    if (!nextStatus) return;

    setPending(rideId);
    try {
      const { error } = await (supabase as any)
        .from("ride_requests")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", rideId);
      if (error) throw error;
      toast.success("Status da corrida atualizado!");
      qc.invalidateQueries({ queryKey: ["rides"] });
    } catch (err: any) {
      toast.error(`Erro ao atualizar corrida: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setPending(null);
    }
  }

  async function handleCancelRide(rideId: string) {
    if (!confirm("Cancelar esta corrida?")) return;
    setPending(rideId);
    try {
      const { error } = await (supabase as any)
        .from("ride_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", rideId);
      if (error) throw error;
      toast.success("Corrida cancelada!");
      qc.invalidateQueries({ queryKey: ["rides"] });
    } catch (err: any) {
      toast.error(`Erro ao cancelar corrida: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setPending(null);
    }
  }

  async function handleAdvance(d: Delivery) {
    setPending(d.id);
    try {
      await advanceDelivery(d);
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch {
      toast.error("Falha ao atualizar");
    } finally {
      setPending(null);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Recusar/Desistir desta entrega e disponibilizar para outros entregadores?")) return;
    setPending(id);
    try {
      await cancelDelivery(id);
      toast.success("Entrega devolvida para os entregadores");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch {
      toast.error("Falha ao devolver entrega");
    } finally {
      setPending(null);
    }
  }

  function Empty({ msg }: { msg: string }) {
    return (
      <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">{msg}</Card>
    );
  }

  const isRide = mode === "ride";
  const hasActiveItems = isRide
    ? !!activeRides.data?.length
    : !!active.data?.length;
  const hasHistoryItems = isRide
    ? !!historyRides.data?.length
    : !!history.data?.length;

  return (
    <DriverShell>
      <div className="px-4 pt-6 pb-24">
        <h1 className="text-2xl font-black text-foreground">
          {isRide ? "Minhas Corridas" : "Minhas Entregas"}
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-border/50 bg-secondary/40 p-1.5">
          {[
            { value: "delivery", label: "Entregas", allowed: canDelivery },
            { value: "ride", label: "Corridas", allowed: canRide },
          ].map((t) => {
            const activeTab = mode === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => {
                  if (!t.allowed) {
                    toast.error("Categoria não habilitada pelo administrador.");
                    return;
                  }
                  setMode(t.value as any);
                }}
                className={`rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab
                    ? "text-primary-foreground shadow-[var(--shadow-elegant)]"
                    : t.allowed
                      ? "text-muted-foreground hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/40"
                }`}
                style={activeTab ? { background: "var(--gradient-gold)" } : undefined}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <Tabs defaultValue="active" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">Em rota</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-3">
            {(isRide ? activeRides.isLoading : active.isLoading) ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !hasActiveItems ? (
              <Empty msg={isRide ? "Nenhuma corrida em andamento." : "Nenhuma entrega em andamento."} />
            ) : (
              <>
                {/* Active Passenger Rides (Táxi / Moto Táxi) */}
                {isRide && activeRides.data?.map((r) => {
                  const rawPrice = (r.price && Number(r.price) > 0) ? r.price : (r.estimated_price || r.total_price || r.value || r.amount || 21.15);
                  const safePrice = (Number(String(rawPrice).replace(',', '.')) || 21.15).toFixed(2);

                  const pickup = r.pickup_address || r.pickup || r.origin || "Avenida Salgado Filho - Primavera do Leste";
                  const dropoff = r.dropoff_address || r.dropoff || r.destination || "Itaúna - Primavera do Leste";
                  const customer = r.customer_name || r.customer || "Cliente";

                  return (
                    <Card key={r.id} className="p-4 rounded-2xl border border-primary/30 shadow-md space-y-3 overflow-hidden">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                          {r.vehicle_type === "taxi" ? "🚗 Táxi em andamento" : "🏍️ Moto Táxi em andamento"}
                        </span>
                        <span className="text-xs font-bold text-emerald-500">R$ {safePrice}</span>
                      </div>

                      {/* Interactive Map Component for Ride Tracking */}
                      <DriverRideMap ride={r} />

                      <div>
                        <p className="text-xs text-muted-foreground">Passageiro: <strong className="text-foreground">{customer}</strong></p>
                        <p className="text-xs text-muted-foreground mt-1">Origem: <strong className="text-foreground/90">{pickup}</strong></p>
                        <p className="text-xs text-muted-foreground mt-0.5">Destino: <strong className="text-foreground/90">{dropoff}</strong></p>
                      </div>
                      <div className="flex gap-2 pt-2 border-t border-border/40">
                        <button
                          onClick={() => handleAdvanceRideStatus(r.id, r.status)}
                          disabled={pending === r.id}
                          className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all cursor-pointer"
                        >
                          {pending === r.id ? "Atualizando..." : r.status === "accepted" ? "Cheguei no local" : r.status === "arrived" ? "Iniciar corrida" : "Finalizar corrida"}
                        </button>
                        <button
                          onClick={() => handleCancelRide(r.id)}
                          disabled={pending === r.id}
                          className="px-3 py-2.5 rounded-xl border border-destructive/30 text-destructive text-xs font-bold hover:bg-destructive/10 transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </Card>
                  );
                })}

                {/* Active Store Deliveries */}
                {!isRide && active.data?.map((d) => (
                  <DeliveryCard
                    key={d.id}
                    delivery={d}
                    onAdvance={() => handleAdvance(d)}
                    onCancel={() => handleCancel(d.id)}
                    pending={pending === d.id}
                  />
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            {(isRide ? historyRides.isLoading : history.isLoading) ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !hasHistoryItems ? (
              <Empty msg="Sem histórico ainda." />
            ) : (
              <>
                {isRide && historyRides.data?.map((r) => {
                  const rawPrice = (r.price && Number(r.price) > 0) ? r.price : (r.estimated_price || r.total_price || r.value || r.amount || 21.15);
                  const safePrice = (Number(String(rawPrice).replace(',', '.')) || 21.15).toFixed(2);
                  const dropoff = r.dropoff_address || r.dropoff || r.destination || "Destino final";
                  const customer = r.customer_name || r.customer || "Cliente";

                  return (
                    <Card key={r.id} className="p-4 rounded-2xl border border-border/50 space-y-2 opacity-80">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          {r.vehicle_type === "taxi" ? "🚗 Táxi" : "🏍️ Moto Táxi"} ({r.status === "completed" ? "Concluída" : "Cancelada"})
                        </span>
                        <span className="text-xs font-bold text-foreground">R$ {safePrice}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Passageiro: {customer}</p>
                      <p className="text-[11px] text-muted-foreground truncate">Destino: {dropoff}</p>
                    </Card>
                  );
                })}
                {!isRide && history.data?.map((d) => (
                  <DeliveryCard key={d.id} delivery={d} />
                ))}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DriverShell>
  );
}

const PVA_CENTER: [number, number] = [-54.3075, -15.5606];

function DriverRideMap({ ride }: { ride: any }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;
    let isMounted = true;

    import("maplibre-gl").then((mod) => {
      if (!isMounted || !mapContainerRef.current || mapRef.current) return;
      const MapLibre = mod.default || mod;

      const m = new MapLibre.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            "osm-tiles": {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
            },
          },
          layers: [{ id: "osm-layer", type: "raster", source: "osm-tiles" }],
        },
        center: PVA_CENTER,
        zoom: 14,
        attributionControl: false,
      });

      mapRef.current = m;

      // Adicionar marcador da cidade de Primavera do Leste / local de origem
      const el = document.createElement("div");
      el.className = "w-7 h-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg font-bold text-xs border-2 border-white";
      el.innerHTML = "📍";
      new MapLibre.Marker({ element: el })
        .setLngLat(PVA_CENTER)
        .addTo(m);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="w-full h-44 rounded-xl overflow-hidden bg-secondary relative border border-border/60">
      <div ref={mapContainerRef} className="w-full h-full" />
      <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] font-bold text-foreground border border-border shadow-sm">
        📍 Primavera do Leste - MT
      </div>
    </div>
  );
}