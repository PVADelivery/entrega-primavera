import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, DollarSign } from "lucide-react";
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
    <Card className="overflow-hidden rounded-2xl p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{delivery.customer_name}</p>
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{delivery.address}</span>
          </p>
        </div>
        <StatusBadge status={delivery.status} />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <div className="flex items-center gap-1 font-medium text-primary">
          <DollarSign className="h-4 w-4" />
          R$ {Number(delivery.commission ?? 0).toFixed(2)}
        </div>
        <span className="text-xs text-muted-foreground">
          Pedido R$ {Number(delivery.value ?? 0).toFixed(2)}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        {onAccept && (
          <Button className="flex-1" disabled={pending} onClick={onAccept}>
            Aceitar entrega
          </Button>
        )}
        {next && onAdvance && (
          <Button className="flex-1" disabled={pending} onClick={onAdvance}>
            {next}
          </Button>
        )}
        {onCancel && delivery.status !== "delivered" && delivery.status !== "cancelled" && (
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </Card>
  );
}