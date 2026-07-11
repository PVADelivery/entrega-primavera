import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Wallet, ArrowRight, Eye } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { DeliveryWithRelations as Delivery } from "@/services/deliveries";

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
  in_route: "Concluir entrega",
  in_transit: "Concluir entrega",
};

export function DeliveryCard({ delivery, onAccept, onAdvance, onCancel, pending }: Props) {
  const next = nextLabels[delivery.status];
  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-0 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-elegant)]">
      {/* gold accent line */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: "var(--gradient-gold)" }}
        aria-hidden
      />
      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-display text-base font-bold tracking-tight text-foreground">
                {delivery.customer_name}
              </p>
              {delivery.short_id && <span className="bg-primary/10 text-primary font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">{delivery.short_id}</span>}
            </div>
            {delivery.pickup_address ? (
              <>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="line-clamp-2"><span className="font-medium text-foreground">Coletar em:</span> {delivery.pickup_address}</span>
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                  <span className="line-clamp-2"><span className="font-medium text-foreground">Entregar em:</span> {delivery.address}</span>
                </p>
              </>
            ) : (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="line-clamp-2">{delivery.address}</span>
              </p>
            )}
          </div>
          <StatusBadge status={delivery.status} />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-border/40 bg-secondary/40 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-primary-foreground shadow-sm"
              style={{ background: "var(--gradient-gold)" }}
            >
              <Wallet className="h-3.5 w-3.5" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Comissão
              </p>
              <p className="font-display text-base font-bold tracking-tight text-foreground">
                R$ {Number(delivery.commission ?? 0).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="text-right leading-tight">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Pedido
            </p>
            <p className="text-sm font-semibold text-foreground/80">
              R$ {Number(delivery.value ?? 0).toFixed(2)}
            </p>
          </div>
        </div>

        {(onAccept || (next && onAdvance) || onCancel || (!onAccept && !onAdvance)) && (
          <div className="mt-4 flex gap-2">
            {onAccept && (
              <Button
                className="group/btn h-11 flex-1 rounded-xl font-semibold shadow-[var(--shadow-elegant)] transition-all"
                disabled={pending}
                onClick={onAccept}
              >
                {pending ? "Aceitando..." : (
                  <>
                    Aceitar entrega
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
                  </>
                )}
              </Button>
            )}
            {next && onAdvance && (
              <Button
                className="h-11 flex-1 rounded-xl font-semibold"
                disabled={pending}
                onClick={onAdvance}
              >
                {next}
              </Button>
            )}
            {!onAccept && !onAdvance && (
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl font-semibold shadow-sm"
                onClick={() => (window.location.href = `/driver/delivery/${delivery.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" /> Detalhes
              </Button>
            )}
            {onCancel && delivery.status !== "delivered" && delivery.status !== "cancelled" && (
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={pending}
                onClick={onCancel}
              >
                Cancelar
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}