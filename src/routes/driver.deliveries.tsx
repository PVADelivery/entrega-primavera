// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

export const Route = createFileRoute("/driver/deliveries")({
  component: DeliveriesPage,
  head: () => ({ meta: [{ title: "Entregas & Corridas — MT 24 Horas Express" }] }),
});

function DeliveriesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
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
    if (!confirm("Cancelar esta entrega?")) return;
    setPending(id);
    try {
      await cancelDelivery(id);
      toast.success("Entrega cancelada");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch {
      toast.error("Falha ao cancelar");
    } finally {
      setPending(null);
    }
  }

  function Empty({ msg }: { msg: string }) {
    return (
      <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">{msg}</Card>
    );
  }

  const hasActiveItems = (active.data && active.data.length > 0) || (activeRides.data && activeRides.data.length > 0);
  const hasHistoryItems = (history.data && history.data.length > 0) || (historyRides.data && historyRides.data.length > 0);

  return (
    <DriverShell>
      <div className="px-4 pt-6 pb-24">
        <h1 className="text-2xl font-black text-foreground">Minhas Entregas e Corridas</h1>
        <Tabs defaultValue="active" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">Em rota</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-3">
            {active.isLoading || activeRides.isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !hasActiveItems ? (
              <Empty msg="Nenhuma entrega ou corrida em andamento." />
            ) : (
              <>
                {/* Active Passenger Rides (Táxi / Moto Táxi) */}
                {activeRides.data?.map((r) => (
                  <Card key={r.id} className="p-4 rounded-2xl border border-primary/30 shadow-md space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                        {r.vehicle_type === "taxi" ? "🚗 Táxi em andamento" : "🏍️ Moto Táxi em andamento"}
                      </span>
                      <span className="text-xs font-bold text-emerald-500">R$ {Number(r.price).toFixed(2)}</span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Passageiro: <strong className="text-foreground">{r.customer_name || "Cliente"}</strong></p>
                      <p className="text-xs text-muted-foreground mt-1">Origem: {r.pickup_address}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Destino: {r.dropoff_address}</p>
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
                ))}

                {/* Active Store Deliveries */}
                {active.data?.map((d) => (
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
            {history.isLoading || historyRides.isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !hasHistoryItems ? (
              <Empty msg="Sem histórico ainda." />
            ) : (
              <>
                {historyRides.data?.map((r) => (
                  <Card key={r.id} className="p-4 rounded-2xl border border-border/50 space-y-2 opacity-80">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {r.vehicle_type === "taxi" ? "🚗 Táxi" : "🏍️ Moto Táxi"} ({r.status === "completed" ? "Concluída" : "Cancelada"})
                      </span>
                      <span className="text-xs font-bold text-foreground">R$ {Number(r.price).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Passageiro: {r.customer_name || "Cliente"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">Destino: {r.dropoff_address}</p>
                  </Card>
                ))}
                {history.data?.map((d) => (
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