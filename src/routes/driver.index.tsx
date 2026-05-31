import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { DriverHeader } from "@/components/driver/Header";
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
import { TrendingUp, Package2, Star } from "lucide-react";

export const Route = createFileRoute("/driver/")({
  component: DriverHome,
  head: () => ({ meta: [{ title: "Início — RotaPro Entregador" }] }),
});

function DriverHome() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    ensureDriverRow(user.id).then(setDriverId).catch(() => {});
  }, [user]);

  const available = useQuery({
    queryKey: ["deliveries", "available"],
    queryFn: fetchAvailableDeliveries,
    enabled: !!driverId,
  });

  const active = useQuery({
    queryKey: ["deliveries", "active", driverId],
    queryFn: () => (driverId ? fetchMyActiveDeliveries(driverId) : Promise.resolve([])),
    enabled: !!driverId,
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
        qc.invalidateQueries({ queryKey: ["deliveries"] });
        qc.invalidateQueries({ queryKey: ["earnings"] });
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
      toast.error("Não foi possível aceitar (já foi pega por outro?)");
    } finally {
      setPending(null);
    }
  }

  return (
    <DriverShell>
      <DriverHeader />

      <section className="-mt-6 px-4">
        <Card className="rounded-2xl p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs text-muted-foreground">Ganhos de hoje</p>
          <p className="mt-1 text-3xl font-bold text-foreground">
            R$ {earnings.data?.day.toFixed(2) ?? "0,00"}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Mini icon={<TrendingUp className="h-4 w-4" />} label="Semana" value={earnings.data?.week ?? 0} />
            <Mini icon={<Package2 className="h-4 w-4" />} label="Entregas" value={earnings.data?.count ?? 0} money={false} />
            <Mini icon={<Star className="h-4 w-4" />} label="Mês" value={earnings.data?.month ?? 0} />
          </div>
        </Card>
      </section>

      {active.data && active.data.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Em andamento</h2>
          <div className="space-y-3">
            {active.data.map((d) => (
              <DeliveryCard key={d.id} delivery={d} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">Entregas disponíveis</h2>
        {available.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : !available.data?.length ? (
          <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">
            Nenhuma entrega disponível agora. Fique online para receber pedidos.
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
      </section>
    </DriverShell>
  );
}

function Mini({ icon, label, value, money = true }: { icon: React.ReactNode; label: string; value: number; money?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/60 p-2">
      <div className="flex items-center justify-center text-primary">{icon}</div>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-bold text-foreground">
        {money ? `R$ ${Number(value).toFixed(2)}` : value}
      </p>
    </div>
  );
}