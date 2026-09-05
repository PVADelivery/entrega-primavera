import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Wallet, ArrowRight, Eye, Phone, MessageSquare, AlertCircle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { formatDateTime } from "@/lib/utils";
import { extractDeliveryFee, cleanAddressForDriver, type DeliveryWithRelations as Delivery } from "@/services/deliveries";

interface Props {
  delivery: Delivery;
  onAccept?: () => void;
  onAdvance?: () => void;
  onCancel?: () => void;
  onDecline?: () => void;
  pending?: boolean;
}

const normalNextLabels: Record<string, string> = {
  pending: "Iniciar entrega",
  broadcasted: "Iniciar entrega",
  accepted: "Cheguei na loja",
  collecting: "Coletado, indo entregar",
  in_route: "Concluir entrega",
  in_transit: "Concluir entrega",
};

const condicionalNextLabels: Record<string, string> = {
  pending: "Iniciar coleta",
  broadcasted: "Iniciar coleta",
  accepted: "Cheguei no cliente",
  collecting: "Confirmar Coleta no cliente",
  in_route: "Confirmar Entrega na loja",
  in_transit: "Confirmar Entrega na loja",
};

export function DeliveryCard({ delivery, onAccept, onAdvance, onCancel, onDecline, pending }: Props) {
  const isBuscaCondicional = (delivery as any).delivery_type === "BUSCA_CONDICIONAL";
  const next = isBuscaCondicional ? condicionalNextLabels[delivery.status] : normalNextLabels[delivery.status];
  const displayStoreName = delivery.company_name?.trim() || delivery.companies?.name?.trim() || "Loja não vinculada";

  // Formatação do link do WhatsApp do cliente com múltiplos fallbacks
  const rawCustomerPhone = delivery.customer_phone || (delivery as any).phone || (delivery as any).customer?.phone || (delivery as any).customers?.phone || "";
  const customerPhoneClean = rawCustomerPhone.replace(/\D/g, "");
  const whatsappUrl = customerPhoneClean
    ? `https://wa.me/55${customerPhoneClean}?text=${encodeURIComponent(`Olá ${delivery.customer_name || ""}, sou o entregador do seu pedido #${delivery.short_id || ""} da ${displayStoreName}!`)}`
    : null;

  return (
    <Card className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-0 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-elegant)]">
      {/* gold/purple accent line */}
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: isBuscaCondicional ? "#a855f7" : "var(--gradient-gold)" }}
        aria-hidden
      />
      <div className="p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isBuscaCondicional && (
              <div className="mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-black text-[10px] uppercase tracking-wider border border-purple-500/40">
                👗 BUSCA DE CONDICIONAL (Cliente → Loja)
              </div>
            )}
            {["carro", "car", "carro_aberto"].includes(String((delivery as any).vehicle_type || "").toLowerCase()) && (
              <div className="mb-1.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-black text-[10px] uppercase tracking-wider border border-blue-500/40">
                ENTREGA DE CARRO
              </div>
            )}
            <div className="flex items-center gap-2">
              <p className="truncate font-display text-base font-bold tracking-tight text-amber-400">
                {displayStoreName}
              </p>
              {delivery.short_id && <span className="bg-primary/10 text-primary font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">{delivery.short_id}</span>}
            </div>

            {/* Nome do cliente, Telefone e Horário */}
            <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 font-medium">
              <div className="flex items-center gap-2">
                <span><span>Cliente: </span><strong className="text-foreground font-semibold">{delivery.customer_name || "Cliente"}</strong></span>
                {customerPhoneClean && (
                  <span className="text-[11px] text-muted-foreground/80 font-mono">
                    ({rawCustomerPhone})
                  </span>
                )}
              </div>
              {delivery.created_at && (
                <span className="text-[11px] font-mono text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded">
                  {formatDateTime(delivery.created_at, "time")}
                </span>
              )}
            </div>

            {isBuscaCondicional ? (
              <div className="space-y-1 mt-1.5 bg-purple-500/5 p-2 rounded-xl border border-purple-500/20">
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="line-clamp-2"><strong className="text-amber-300 font-bold">1º Buscar em (Cliente):</strong> <span>{cleanAddressForDriver(delivery.address)}</span></span>
                </p>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="line-clamp-2"><strong className="text-emerald-300 font-bold">2º Levar para (Loja):</strong> <span>{delivery.pickup_address || displayStoreName}</span></span>
                </p>
              </div>
            ) : delivery.pickup_address ? (
              <div className="space-y-1 mt-1.5">
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="line-clamp-2"><strong className="text-foreground">Retirada (Loja):</strong> <span>{delivery.pickup_address}</span></span>
                </p>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="line-clamp-2"><strong className="text-foreground">Entrega (Cliente):</strong> <span>{cleanAddressForDriver(delivery.address)}</span></span>
                </p>
              </div>
            ) : (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="line-clamp-2">{cleanAddressForDriver(delivery.address)}</span>
              </p>
            )}

            {/* Observações preenchidas pelo lojista */}
            {Boolean(delivery.notes) && (
              <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-300">
                <span className="font-bold flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Obs do Lojista:</span> <span>{delivery.notes}</span>
              </div>
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
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                GANHOS ENTREGADOR (75%)
              </p>
              <p className="font-display text-base font-bold tracking-tight text-emerald-400">
                <span>R$ </span>{(() => {
                  const grossFee = extractDeliveryFee(delivery);
                  // O entregador recebe 75% da taxa de entrega (25% retido pela plataforma)
                  const netEarnings = grossFee * 0.75;
                  return netEarnings.toFixed(2);
                })()}
              </p>
            </div>
          </div>
          <div className="text-right leading-tight">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Cobrar do Cliente
            </p>
            <p className="text-sm font-bold text-amber-400">
              {Number((delivery as any).order_value || 0) > 0
                ? `R$ ${Number((delivery as any).order_value).toFixed(2)} (${
                    delivery.payment_method === "convenio"
                      ? "Convênio"
                      : delivery.payment_method === "cartao" || delivery.payment_method === "maquininha"
                      ? "Cartão"
                      : delivery.payment_method === "pix"
                      ? "PIX"
                      : delivery.payment_method === "dinheiro"
                      ? "Dinheiro"
                      : delivery.payment_method || "Dinheiro"
                  })`
                : delivery.payment_method === "convenio"
                ? "Convênio / R$ 0,00"
                : "Já pago / R$ 0,00"}
            </p>
          </div>
        </div>

        {(onAccept || (next && onAdvance) || onCancel || (!onAccept && !onAdvance) || whatsappUrl) && (
          <div className="mt-3 flex items-center gap-2">
            {onDecline && onAccept && (
              <Button
                variant="outline"
                className="h-11 rounded-xl border-red-500/40 text-red-400 hover:bg-red-500/10 font-black px-3.5 text-xs uppercase tracking-wider"
                disabled={pending}
                onClick={onDecline}
              >
                RECUSAR
              </Button>
            )}
            {onAccept && (
              <Button
                className="group/btn h-11 flex-1 rounded-xl font-bold shadow-md"
                disabled={pending}
                onClick={() => {
                  if (pending) return;
                  onAccept();
                }}
              >
                {pending ? <span>Aceitando...</span> : (
                  <>
                    <span>Aceitar entrega</span>
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
                <span>{next}</span>
              </Button>
            )}

            {/* Botão com o ícone oficial do WhatsApp (somente APÓS aceitar a entrega) */}
            {whatsappUrl && !onAccept && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                title="Conversar no WhatsApp"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-md transition-all hover:bg-[#20bd5a] active:scale-95 cursor-pointer"
              >
                <svg className="h-5 w-5 fill-current text-white" viewBox="0 0 24 24">
                  <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 0 0 1.333 4.993L2 22l5.233-1.337a9.957 9.957 0 0 0 4.77 1.218h.005c5.505 0 9.987-4.478 9.989-9.984 0-2.668-1.037-5.176-2.924-7.062A9.92 9.92 0 0 0 12.012 2zm5.824 14.161c-.247.695-1.226 1.326-1.996 1.492-.525.113-1.21.205-3.518-.75-2.956-1.222-4.857-4.237-5.006-4.436-.144-.199-1.202-1.603-1.202-3.057 0-1.454.764-2.17 1.036-2.467.272-.298.594-.372.793-.372.198 0 .396.002.569.01.184.008.432-.07.676.516.248.594.842 2.057.917 2.206.074.149.123.322.025.521-.099.198-.148.322-.297.495-.149.174-.313.388-.446.522-.149.149-.305.312-.132.61.174.298.773 1.275 1.658 2.064 1.138 1.014 2.099 1.328 2.396 1.477.297.149.471.124.645-.075.173-.198.743-.867.941-1.164.198-.298.396-.248.669-.149.273.099 1.733.818 2.031.967.297.149.495.223.569.347.074.124.074.72-.173 1.415z"/>
                </svg>
              </a>
            )}

            {!onAccept && !onAdvance && (
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-xl font-semibold shadow-sm"
                onClick={() => (window.location.href = `/driver/delivery/${delivery.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" /> <span>Detalhes</span>
              </Button>
            )}
            {onCancel && delivery.status !== "delivered" && delivery.status !== "cancelled" && (
              <Button
                variant="outline"
                className="h-11 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
                disabled={pending}
                onClick={onCancel}
              >
                <span>Cancelar</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}