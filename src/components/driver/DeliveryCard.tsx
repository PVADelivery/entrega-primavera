import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Wallet, ArrowRight, Eye, Phone, MessageSquare, AlertCircle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { DeliveryWithRelations as Delivery } from "@/services/deliveries";

interface Props {
  delivery: Delivery;
  onAccept?: () => void;
  onAdvance?: () => void;
  onCancel?: () => void;
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

export function DeliveryCard({ delivery, onAccept, onAdvance, onCancel, pending }: Props) {
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
                  <a
                    href={whatsappUrl || `tel:${customerPhoneClean}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-bold hover:bg-emerald-500/20 transition-all text-[11px]"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>{rawCustomerPhone}</span>
                  </a>
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
                  <span className="line-clamp-2"><strong className="text-amber-300 font-bold">1º Buscar em (Cliente):</strong> <span>{delivery.address}</span></span>
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
                  <span className="line-clamp-2"><strong className="text-foreground">Entrega (Cliente):</strong> <span>{delivery.address}</span></span>
                </p>
              </div>
            ) : (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="line-clamp-2">{delivery.address}</span>
              </p>
            )}

            {/* Região e Bairro definidos pelo Admin / Lojista */}
            {Boolean(delivery.regions?.name || delivery.region_name || delivery.customer_neighborhood) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {Boolean(delivery.regions?.name || delivery.region_name) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-black text-[11px] uppercase tracking-wide border border-primary/20">
                    <MapPin className="h-3 w-3" /> <span>{delivery.regions?.name || delivery.region_name}</span>
                  </span>
                )}
                {Boolean(delivery.customer_neighborhood && delivery.customer_neighborhood !== (delivery.regions?.name || delivery.region_name)) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground font-bold text-[11px] border border-border/50">
                    <span>Região: </span><span>{delivery.customer_neighborhood}</span>
                  </span>
                )}
              </div>
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
                  const grossFee = Number(
                    (delivery.value && Number(delivery.value) > 0)
                      ? delivery.value
                      : (delivery.price && Number(delivery.price) > 0)
                        ? delivery.price
                        : (delivery.delivery_fee && Number(delivery.delivery_fee) > 0)
                          ? delivery.delivery_fee
                          : (delivery.commission && Number(delivery.commission) > 0)
                            ? delivery.commission
                            : 0
                  );
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
            {onAccept && (
              <Button
                className="group/btn h-11 flex-1 rounded-xl font-semibold shadow-[var(--shadow-elegant)] transition-all"
                disabled={Boolean(pending)}
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

            {/* Botão pequeno apenas com o ícone do WhatsApp na mesma linha (somente APÓS aceitar a entrega) */}
            {whatsappUrl && !onAccept && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                title="Conversar no WhatsApp"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md transition-all hover:bg-emerald-500 active:scale-95"
              >
                <MessageSquare className="h-5 w-5" />
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