import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, Component, type ReactNode } from "react";
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
} from "@/services/deliveries";
import { toast } from "sonner";
import "maplibre-gl/dist/maplibre-gl.css";
import { useWorkMode } from "@/hooks/useWorkMode";
import { Navigation, Phone } from "lucide-react";

const PVA_CENTER: [number, number] = [-54.3075, -15.5606];

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
    ensureDriverRow(user.id).then(setDriverId).catch(() => { });
  }, [user]);

  const active = useQuery({
    queryKey: ["deliveries", "active", driverId, user?.id],
    queryFn: () => fetchMyActiveDeliveries(driverId || user?.id || "", user?.id),
    enabled: true,
  });

  async function getAllMyDriverIds(): Promise<string[]> {
    const set = new Set<string>();
    if (user?.id) set.add(user.id);
    if (driverId) set.add(driverId);
    if (user?.id) {
      try {
        const { data: d1 } = await (supabase as any).from("delivery_drivers").select("id, user_id").eq("user_id", user.id);
        if (d1) d1.forEach((d: any) => { if (d.id) set.add(d.id); if (d.user_id) set.add(d.user_id); });
        const { data: d2 } = await (supabase as any).from("delivery_drivers").select("id, user_id").eq("id", user.id);
        if (d2) d2.forEach((d: any) => { if (d.id) set.add(d.id); if (d.user_id) set.add(d.user_id); });
        const { data: prof } = await (supabase as any).from("profiles").select("user_id, full_name").eq("user_id", user.id).maybeSingle();
        if (prof) {
          if (prof.user_id) set.add(prof.user_id);
          if (prof.full_name) set.add(prof.full_name);
        }
      } catch (e) {}
    }
    return Array.from(set);
  }

  const activeRides = useQuery({
    queryKey: ["rides", "active", driverId, user?.id],
    queryFn: async () => {
      try {
        const myIds = await getAllMyDriverIds();
        const { data, error } = await (supabase as any)
          .from("ride_requests")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return [];
        const rides = (data ?? []) as any[];

        return rides.filter((r: any) => {
          const statusLower = String(r.status || "").toLowerCase();
          const isNotFinished = !["completed", "cancelled", "concluida", "cancelada", "finished"].includes(statusLower);
          if (!isNotFinished) return false;
          if (!r.driver_id) return false;
          return myIds.some(id => String(r.driver_id).toLowerCase() === String(id).toLowerCase());
        });
      } catch (e) {
        return [];
      }
    },
    enabled: true,
    refetchInterval: 2000,
    staleTime: 500,
  });

  const history = useQuery({
    queryKey: ["deliveries", "history", driverId, user?.id],
    queryFn: () => fetchMyHistory(driverId || user?.id || "", user?.id),
    enabled: true,
  });

  const historyRides = useQuery({
    queryKey: ["rides", "history", driverId, user?.id],
    queryFn: async () => {
      try {
        const myIds = await getAllMyDriverIds();
        const { data, error } = await (supabase as any)
          .from("ride_requests")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) return [];
        const rides = (data ?? []) as any[];

        return rides.filter((r: any) => {
          const statusLower = String(r.status || "").toLowerCase();
          const isFinished = ["completed", "cancelled", "concluida", "cancelada", "finished"].includes(statusLower);
          if (!isFinished) return false;
          if (!r.driver_id) return false;
          return myIds.some(id => String(r.driver_id).toLowerCase() === String(id).toLowerCase());
        });
      } catch (e) {
        return [];
      }
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
    if (!confirm("Recusar esta corrida e disponibilizar para outros motoristas?")) return;
    setPending(rideId);
    try {
      const { error } = await (supabase as any)
        .from("ride_requests")
        .update({ driver_id: null, status: "pending", updated_at: new Date().toISOString() })
        .eq("id", rideId);
      if (error) throw error;
      toast.success("Corrida devolvida para a fila de disponíveis!");
      qc.invalidateQueries({ queryKey: ["rides"] });
    } catch (err: any) {
      toast.error(`Erro ao devolver corrida: ${err?.message || JSON.stringify(err)}`);
    } finally {
      setPending(null);
    }
  }

  async function handleAdvance(d: any) {
    setPending(d.id);
    try {
      await advanceDelivery(d);
      toast.success("Status atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch (err: any) {
      console.error("[handleAdvance] Erro:", err);
      toast.error(`Falha ao atualizar: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setPending(null);
    }
  }

  async function handleCancel(id: string) {
    if (!confirm("Recusar esta entrega e disponibilizar para outros entregadores?")) return;
    setPending(id);
    try {
      await cancelDelivery(id);
      toast.success("Entrega devolvida para a fila de disponíveis!");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch (err: any) {
      console.error("[handleCancel] Erro:", err);
      toast.error(`Falha ao recusar entrega: ${err?.message || "Erro desconhecido"}`);
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
                    toast.info("Peça à central para liberar esta categoria no seu cadastro.");
                    return;
                  }
                  setMode(t.value as any);
                }}
                className={`rounded-xl px-3 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${activeTab
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

                const pickup = r.pickup_address || r.pickup || r.origin || "";
                const dropoff = r.dropoff_address || r.dropoff || r.destination || "";
                const rawCustomer = r.customer_name || r.customer || "Passageiro";
                const cleanCustomer = String(rawCustomer).replace(/\s*\(.*?\)/g, "").trim();

                const phoneRaw = r.customer_phone || r.phone || r.whatsapp || r.customer_whatsapp || "";
                const phoneClean = String(phoneRaw).replace(/\D/g, "");
                const whatsappUrl = phoneClean
                  ? `https://wa.me/55${phoneClean}?text=${encodeURIComponent(`Olá ${cleanCustomer}, sou o seu motorista!`)}`
                  : null;

                return (
                  <Card key={r.id} className="p-4 rounded-2xl border border-primary/30 shadow-md space-y-3 overflow-hidden">
                    <div className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold text-[11px] uppercase tracking-wider">
                        <Navigation className="w-3.5 h-3.5 text-amber-400" />
                        {r.vehicle_type === "taxi" || r.vehicle_type === "carro" ? "Táxi em andamento" : "Moto Táxi em andamento"}
                      </span>
                      <span className="text-xs font-bold text-emerald-500">R$ {safePrice}</span>
                    </div>

                    {/* Interactive Map Component for Ride Tracking */}
                    <MapErrorBoundary>
                      <DriverRideMap ride={r} />
                    </MapErrorBoundary>

                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground">Passageiro: <strong className="text-foreground font-bold">{cleanCustomer}</strong></p>
                        {phoneClean && (
                          <a
                            href={whatsappUrl || `tel:${phoneClean}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-all"
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>
                      <p className="text-muted-foreground">Origem: <strong className="text-foreground/90">{pickup}</strong></p>
                      <p className="text-muted-foreground">Destino: <strong className="text-foreground/90">{dropoff}</strong></p>
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
                const rawCustomer = r.customer_name || r.customer || "Cliente";
                const cleanCustomer = String(rawCustomer).replace(/\s*\(.*?\)/g, "").trim();

                return (
                  <Card key={r.id} className="p-4 rounded-2xl border border-border/50 space-y-2 opacity-80">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {r.vehicle_type === "taxi" ? "Táxi" : "Moto Táxi"} ({r.status === "completed" ? "Concluída" : "Cancelada"})
                      </span>
                      <span className="text-xs font-bold text-foreground">R$ {safePrice}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Passageiro: {cleanCustomer}</p>
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
class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.warn("[MapErrorBoundary] Erro de renderizacao do mapa silenciado com sucesso:", error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function DriverRideMap({ ride }: { ride: any }) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current || mapRef.current) return;
    let isMounted = true;

    import("maplibre-gl").then((mod: any) => {
      if (!isMounted || !mapContainerRef.current || mapRef.current) return;
      try {
        const maplibregl = mod.default || mod;
        const MapClass = maplibregl.Map || mod.Map;
        const MarkerClass = maplibregl.Marker || mod.Marker;

        if (!MapClass) return;

        let pLat = Number(ride?.pickup_latitude || ride?.pickup_lat || ride?.origin_lat || 0);
        let pLng = Number(ride?.pickup_longitude || ride?.pickup_lng || ride?.origin_lng || 0);

        let dLat = Number(ride?.dropoff_latitude || ride?.dropoff_lat || ride?.destination_lat || 0);
        let dLng = Number(ride?.dropoff_longitude || ride?.dropoff_lng || ride?.destination_lng || 0);

        const m = new MapClass({
          container: mapContainerRef.current,
          style: {
            version: 8,
            sources: {
              "osm-tiles": {
                type: "raster",
                tiles: [
                  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
                ],
                tileSize: 256,
              }
            },
            layers: [
              {
                id: "osm-layer",
                type: "raster",
                source: "osm-tiles",
                minzoom: 0,
                maxzoom: 19
              }
            ]
          },
          center: (pLat && pLng) ? [pLng, pLat] : PVA_CENTER,
          zoom: 14,
          attributionControl: false,
        });

        mapRef.current = m;
        setTimeout(() => {
          try { m.resize(); } catch (e) {}
        }, 150);

        const fitMapBounds = (pickupLat: number, pickupLng: number, dropoffLat?: number, dropoffLng?: number, drvLat?: number, drvLng?: number) => {
          try {
            const bounds = new maplibregl.LngLatBounds();
            if (pickupLat && pickupLng) bounds.extend([pickupLng, pickupLat]);
            if (dropoffLat && dropoffLng) bounds.extend([dropoffLng, dropoffLat]);
            if (drvLat && drvLng) bounds.extend([drvLng, drvLat]);
            if (!bounds.isEmpty()) {
              m.fitBounds(bounds, { padding: 45, maxZoom: 16, duration: 800 });
            }
          } catch (e) {}
        };

        const renderRoute = (pickupLatitude: number, pickupLongitude: number, dropoffLatitude?: number, dropoffLongitude?: number) => {
          if (MarkerClass) {
            try {
              if (pickupMarkerRef.current) pickupMarkerRef.current.remove();
              pickupMarkerRef.current = new MarkerClass({ color: "#10b981" })
                .setLngLat([pickupLongitude, pickupLatitude])
                .addTo(m);
            } catch (e) {}

            if (dropoffLatitude && dropoffLongitude) {
              try {
                if (dropoffMarkerRef.current) dropoffMarkerRef.current.remove();
                dropoffMarkerRef.current = new MarkerClass({ color: "#ef4444" })
                  .setLngLat([dropoffLongitude, dropoffLatitude])
                  .addTo(m);
              } catch (e) {}
            }
            fitMapBounds(pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude);
          }
        };

        if (pLat && pLng) {
          renderRoute(pLat, pLng, dLat, dLng);
        } else if (ride?.pickup_address) {
          const cleanAddr = ride.pickup_address
            .replace(/\s*\(.*?\)/g, "")
            .replace(/\s*-\s*Primavera do Leste/gi, "")
            .replace(/nº\s*\d+/gi, "")
            .trim();

          const queryStr = `${cleanAddr}, Primavera do Leste, MT, Brasil`;

          fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryStr)}`)
            .then((res) => res.json())
            .then((data) => {
              if (isMounted && data && data.length > 0) {
                pLat = parseFloat(data[0].lat);
                pLng = parseFloat(data[0].lon);
                renderRoute(pLat, pLng, dLat, dLng);
              } else {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent("Jardim Progresso, Primavera do Leste, MT")}`)
                  .then(res => res.json())
                  .then(progData => {
                    if (isMounted && progData && progData.length > 0) {
                      pLat = parseFloat(progData[0].lat);
                      pLng = parseFloat(progData[0].lon);
                      renderRoute(pLat, pLng, dLat, dLng);
                    } else {
                      renderRoute(-15.5606, -54.3075, dLat, dLng);
                    }
                  }).catch(() => renderRoute(-15.5606, -54.3075, dLat, dLng));
              }
            })
            .catch(() => {
              renderRoute(-15.5606, -54.3075, dLat, dLng);
            });
        }

        // Posição GPS do Motorista em tempo real
        if (typeof window !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMounted || !mapRef.current || !MarkerClass) return;
              const lat = pos.coords.latitude;
              const lng = pos.coords.longitude;
              try {
                if (!driverMarkerRef.current) {
                  driverMarkerRef.current = new MarkerClass({ color: "#f59e0b" })
                    .setLngLat([lng, lat])
                    .addTo(mapRef.current);
                } else {
                  driverMarkerRef.current.setLngLat([lng, lat]);
                }
                fitMapBounds(pLat || -15.5606, pLng || -54.3075, dLat, dLng, lat, lng);
              } catch (e) {}
            },
            () => {},
            { enableHighAccuracy: true, timeout: 5000 }
          );
        }
      } catch (err) {
        console.warn("[DriverRideMap] Erro ao inicializar MapLibre:", err);
      }
    }).catch((err) => {
      console.warn("[DriverRideMap] Erro ao carregar MapLibre:", err);
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch (e) {}
        mapRef.current = null;
      }
    };
  }, [ride?.id, ride?.pickup_address, ride?.pickup_latitude, ride?.pickup_longitude]);

  return (
    <div className="w-full h-48 rounded-xl overflow-hidden bg-muted relative border border-border/60 shadow-md">
      <div ref={mapContainerRef} className="w-full h-full min-h-[192px]" />
    </div>
  );
}