import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Wallet } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Delivery } from "@/services/deliveries";

interface Props {
  delivery: Delivery;
  onAccept?: () => void;
  onAdvance?: () => void;
  onCancel?: () => void;
  pending?: boolean;
}

const nextLabels: Record<string, string> = {
  accepted: "Cheguei na loja",
  collecting: "Coletado, indo entregar",
  in_transit: "Concluir entrega",
};

export function DeliveryCard({ delivery, onAccept, onAdvance, onCancel, pending }: Props) {
  const next = nextLabels[delivery.status];
  return (
    <Card className="group relative overflow-hidden rounded-2xl border-border/60 bg-card p-4 shadow-[var(--shadow-card)] transition-all hover:border-primary/40">
      <span className="absolute inset-y-0 left-0 w-1 bg-primary/80" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{delivery.customer_name}</p>
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{delivery.address}</span>
          </p>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Wallet className="h-3.5 w-3.5" />
          </span>
          R$ {Number(delivery.commission ?? 0).toFixed(2)}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          Pedido R$ {Number(delivery.value ?? 0).toFixed(2)}
        </span>
      </div>

      {(onAccept || (next && onAdvance) || onCancel) && (
        <div className="mt-4 flex gap-2">
          {onAccept && (
            <Button className="flex-1 font-semibold" disabled={pending} onClick={onAccept}>
              {pending ? "Aceitando..." : "Aceitar entrega"}
            </Button>
          )}
          {next && onAdvance && (
            <Button className="flex-1 font-semibold" disabled={pending} onClick={onAdvance}>
              {next}
            </Button>
          )}
          {onCancel && delivery.status !== "delivered" && delivery.status !== "cancelled" && (
            <Button variant="outline" disabled={pending} onClick={onCancel}>
              Cancelar
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}