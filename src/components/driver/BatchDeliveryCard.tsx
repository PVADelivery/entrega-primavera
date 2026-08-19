import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, PackageCheck, Layers, Sparkles, CheckCircle2 } from "lucide-react";
import type { DeliveryWithRelations as Delivery } from "@/services/deliveries";

interface Props {
  batchId: string;
  deliveries: Delivery[];
  onAcceptBatch: (batchId: string) => void;
  pending?: boolean;
}

export function BatchDeliveryCard({ batchId, deliveries, onAcceptBatch, pending }: Props) {
  if (!deliveries || deliveries.length === 0) return null;

  const first = deliveries[0];
  const displayStoreName = first.company_name?.trim() || first.companies?.name?.trim() || "Loja sem nome";
  const count = deliveries.length;

  // Valor total acumulado do lote
  const totalValue = deliveries.reduce((acc, d) => acc + (Number(d.value || d.price || d.delivery_fee || 0)), 0);

  return (
    <Card className="group relative overflow-hidden rounded-3xl border-2 border-amber-400/60 bg-card p-0 shadow-xl transition-all hover:border-amber-400">
      {/* Gold gradient side accent bar */}
      <span
        className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 via-yellow-500 to-amber-600"
        aria-hidden
      />

      <div className="p-4 sm:p-5 pl-6">
        {/* Header do Lote */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-black shadow-md">
              <Layers className="h-3.5 w-3.5" />
              LOTE COM {count} ENTREGAS
            </span>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
              Ganhos do Lote
            </span>
            <span className="font-display text-lg font-black text-emerald-400">
              R$ {totalValue.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>

        {/* Informações da Loja Origem */}
        <div className="mt-3 flex items-start gap-2 text-xs">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/90 block">
              RETIRADA NA LOJA
            </span>
            <strong className="text-sm font-bold text-foreground block">
              {displayStoreName}
            </strong>
            {first.pickup_address && (
              <span className="text-xs text-muted-foreground line-clamp-1">
                {first.pickup_address}
              </span>
            )}
          </div>
        </div>

        {/* Lista de Destinos / Paradas do Lote */}
        <div className="mt-4 space-y-2.5 rounded-2xl bg-secondary/40 p-3 border border-border/30">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <PackageCheck className="h-3.5 w-3.5 text-primary" />
            Paradas do Lote ({count} solicitações):
          </p>

          <div className="space-y-2 divide-y divide-border/20">
            {deliveries.map((item, idx) => {
              const itemFee = Number(item.value || item.price || item.delivery_fee || 0);
              const regionName = item.regions?.name || item.region_name || item.customer_neighborhood || "Região não inf.";

              return (
                <div key={item.id} className={`${idx > 0 ? "pt-2" : ""} flex items-start justify-between gap-2`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-black text-primary">
                        {idx + 1}
                      </span>
                      <strong className="truncate text-xs font-bold text-foreground">
                        {item.customer_name || `Cliente #${idx + 1}`}
                      </strong>
                      {item.short_id && (
                        <span className="text-[9px] font-mono font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {item.short_id}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 pl-5.5 text-[11px] text-muted-foreground truncate">
                      📍 {regionName} {item.address ? `• ${item.address}` : ""}
                    </p>
                  </div>

                  <span className="text-xs font-bold text-emerald-400 shrink-0">
                    R$ {itemFee.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Botão de Aceite do Lote Completo */}
        <div className="mt-4 pt-1">
          <Button
            onClick={() => onAcceptBatch(batchId)}
            disabled={pending}
            className="w-full h-12 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-black font-black text-sm tracking-wide shadow-lg hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            {pending ? (
              <span>Aceitando Lote...</span>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>Aceitar Lote Completo ({count} entregas - R$ {totalValue.toFixed(2).replace(".", ",")})</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}
