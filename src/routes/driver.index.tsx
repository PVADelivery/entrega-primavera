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
import { TrendingUp, Package2, CalendarDays, Sparkles } from "lucide-react";

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

      {/* Hero earnings card — overlaps header */}
      <section className="-mt-10 px-4">
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

      {active.data && active.data.length > 0 && (
        <section className="mt-8 px-4">
          <SectionTitle title="Em andamento" badge={`${active.data.length} ativa${active.data.length > 1 ? "s" : ""}`} />
          <div className="mt-3 space-y-3">
            {active.data.map((d) => (
              <DeliveryCard key={d.id} delivery={d} />
            ))}
          </div>
        </section>
      )}

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
    <div className="flex items-center justify-between">
      <h2 className="font-display text-base font-bold tracking-tight text-foreground">{title}</h2>
      {badge && (
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {badge}
        </span>
      )}
    </div>
  );
}