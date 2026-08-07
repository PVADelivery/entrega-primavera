import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MapPin, Wallet, ArrowRight, Eye, Phone, MessageSquare, AlertCircle } from "lucide-react";
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
  const [storeName, setStoreName] = useState<string>(
    delivery.companies?.name || delivery.company_name || ""
  );

  const isGeneric = (str?: string | null) => !str || str === "Empresa Parceira" || str === "EMPRESA PARCEIRA" || str === "Loja Parceira" || str === "LOJA PARCEIRA" || str === "MT 24 HORAS";

  useEffect(() => {
    let active = true;
    const loadCompany = async () => {
      let resolvedName = null;

      // 1. Se tem company_id, busca direta na tabela companies
      if (delivery.company_id) {
        const { data: comp } = await supabase
          .from("companies")
          .select("name")
          .eq("id", delivery.company_id)
          .maybeSingle();
        if (comp?.name) resolvedName = comp.name;
      }

      // 2. Se não encontrou e tem company_name preenchido (que não seja genérico)
      if (!resolvedName && delivery.company_name && !isGeneric(delivery.company_name)) {
        resolvedName = delivery.company_name;
      }

      // 3. Se ainda não encontrou, busca a empresa mais recente/ativa no banco
      if (!resolvedName) {
        const { data: lastCompany } = await supabase
          .from("companies")
          .select("name")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastCompany?.name) resolvedName = lastCompany.name;
      }

      if (active) {
        setStoreName(resolvedName || "Teste Loja");
      }
    };

    loadCompany();
    return () => { active = false; };
  }, [delivery.company_id, delivery.company_name, delivery.companies?.name, delivery.order_id]);

  const displayStoreName = isGeneric(storeName) 
    ? (delivery.companies?.name && !isGeneric(delivery.companies.name) 
        ? delivery.companies.name 
        : (delivery.company_name && !isGeneric(delivery.company_name) 
            ? delivery.company_name 
            : "Teste Loja")) 
    : storeName;

  // Formatação do link do WhatsApp do cliente
  const customerPhoneClean = (delivery.customer_phone || "").replace(/\D/g, "");
  const whatsappUrl = customerPhoneClean
    ? `https://wa.me/55${customerPhoneClean}?text=${encodeURIComponent(`Olá ${delivery.customer_name || ""}, sou o entregador do seu pedido #${delivery.short_id || ""} da ${displayStoreName}!`)}`
    : null;

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
              <p className="truncate font-display text-base font-bold tracking-tight text-amber-400">
                {displayStoreName}
              </p>
              {delivery.short_id && <span className="bg-primary/10 text-primary font-mono text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">{delivery.short_id}</span>}
            </div>

            {/* Nome do cliente */}
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              Cliente: <span className="text-foreground font-semibold">{delivery.customer_name || "Cliente"}</span>
            </p>

            {delivery.pickup_address ? (
              <>
                <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="line-clamp-2"><span className="font-semibold text-foreground">Retirada (Loja):</span> {delivery.pickup_address}</span>
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="line-clamp-2"><span className="font-semibold text-foreground">Entrega:</span> {delivery.address}</span>
                </p>
              </>
            ) : (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="line-clamp-2">{delivery.address}</span>
              </p>
            )}

            {/* Observações preenchidas pelo lojista */}
            {delivery.notes && (
              <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-xs text-amber-300">
                <span className="font-bold flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Obs do Lojista:</span> {delivery.notes}
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
                GANHOS
              </p>
              <p className="font-display text-base font-bold tracking-tight text-amber-400">
                R$ {Number(
                  (delivery.commission && Number(delivery.commission) > 0)
                    ? delivery.commission
                    : (delivery.delivery_fee && Number(delivery.delivery_fee) > 0)
                      ? delivery.delivery_fee
                      : (delivery.value && Number(delivery.value) > 0)
                        ? Number(delivery.value)
                        : (delivery.price && Number(delivery.price) > 0)
                          ? Number(delivery.price)
                          : 0
                ).toFixed(2)}
              </p>
            </div>
          </div>
          <div className="text-right leading-tight">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Valor do Pedido
            </p>
            <p className="text-sm font-semibold text-foreground/80">
              R$ {Number(delivery.value ?? delivery.price ?? 0).toFixed(2)}
            </p>
          </div>
        </div>

        {(onAccept || (next && onAdvance) || onCancel || (!onAccept && !onAdvance) || whatsappUrl) && (
          <div className="mt-3 flex items-center gap-2">
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
                <Eye className="mr-2 h-4 w-4" /> Detalhes
              </Button>
            )}
            {onCancel && delivery.status !== "delivered" && delivery.status !== "cancelled" && (
              <Button
                variant="outline"
                className="h-11 rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
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