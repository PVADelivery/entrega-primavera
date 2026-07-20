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
  head: () => ({ meta: [{ title: "Entregas — MT Express" }] }),
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
    queryKey: ["deliveries", "active", driverId],
    queryFn: () => (driverId ? fetchMyActiveDeliveries(driverId) : Promise.resolve([])),
    enabled: !!driverId,
  });
  const history = useQuery({
    queryKey: ["deliveries", "history", driverId],
    queryFn: () => (driverId ? fetchMyHistory(driverId) : Promise.resolve([])),
    enabled: !!driverId,
  });

  useEffect(() => {
    if (!driverId) return;
    const channel = supabase
      .channel("deliveries-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => {
        qc.invalidateQueries({ queryKey: ["deliveries"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driverId, qc]);

  async function handleAccept(id: string) {
    if (!driverId) return;
    setPending(id);
    try {
      await acceptDelivery(id, driverId);
      toast.success("Entrega aceita!");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
    } catch {
      toast.error("Falha ao aceitar");
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

  return (
    <DriverShell>
      <div className="px-4 pt-6 pb-24">
        <h1 className="text-2xl font-black text-foreground">Minhas Entregas</h1>
        <Tabs defaultValue="active" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active">Em rota</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-3">
            {active.isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !active.data?.length ? (
              <Empty msg="Nenhuma entrega em andamento." />
            ) : (
              active.data.map((d) => (
                <DeliveryCard
                  key={d.id}
                  delivery={d}
                  onAdvance={() => handleAdvance(d)}
                  onCancel={() => handleCancel(d.id)}
                  pending={pending === d.id}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            {history.isLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : !history.data?.length ? (
              <Empty msg="Sem histórico ainda." />
            ) : (
              history.data.map((d) => <DeliveryCard key={d.id} delivery={d} />)
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DriverShell>
  );
}