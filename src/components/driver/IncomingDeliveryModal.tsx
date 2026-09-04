import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Store, Navigation, CheckCircle2, X, Loader2, DollarSign } from "lucide-react";
import { extractDeliveryFee, type DeliveryWithRelations as Delivery } from "@/services/deliveries";
import { useAudioAlert } from "@/hooks/useAudioAlert";

interface Props {
  delivery: Delivery | null;
  open: boolean;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => void;
  pending?: boolean;
}

export function IncomingDeliveryModal({ delivery, open, onAccept, onDecline, pending }: Props) {
  const { playAlert, stopAlert, unlockAudio } = useAudioAlert();

  // Toca o alerta sonoro e vibração enquanto o modal estiver aberto
  useEffect(() => {
    if (open && delivery) {
      try {
        unlockAudio();
        playAlert(true);
      } catch (e) {
        console.warn("[IncomingDeliveryModal] Erro ao tocar som:", e);
      }
    } else {
      stopAlert();
    }
  }, [open, delivery?.id]);

  if (!delivery) return null;

  const displayStoreName =
    delivery.company_name?.trim() ||
    delivery.companies?.name?.trim() ||
    (delivery as any).store_name?.trim() ||
    "Loja Parceira";

  const grossFee = extractDeliveryFee(delivery);
  // O entregador recebe 75% da taxa da corrida
  const netEarnings = grossFee * 0.75;
  const earningsText = netEarnings > 0 ? netEarnings.toFixed(2).replace(".", ",") : "A calcular";

  const pickupAddr =
    delivery.pickup_address?.trim() ||
    (delivery as any).store_address?.trim() ||
    (delivery as any).companies?.address?.trim() ||
    "Retirada na Loja";

  const dropoffAddr =
    delivery.address?.trim() ||
    (delivery as any).delivery_address?.trim() ||
    "Endereço do cliente";

  const orderVal = Number((delivery as any).order_value || (delivery as any).orders?.total || 0);
  const paymentMethod = delivery.payment_method || (delivery as any).orders?.payment_method || "";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && !pending) {
        stopAlert();
        onDecline(delivery.id);
      }
    }}>
      <DialogContent 
        className="fixed left-[50%] top-[50%] z-50 w-[92vw] max-w-md translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-3xl border border-amber-500/40 bg-slate-950/95 p-0 shadow-[0_0_50px_rgba(245,158,11,0.35)] backdrop-blur-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
      >
        <DialogTitle className="sr-only">Nova Corrida Disponível</DialogTitle>
        <DialogDescription className="sr-only">
          Alerta de nova entrega disponível para aceitar ou recusar
        </DialogDescription>

        {/* Top Glowing Header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 py-3.5 text-black shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-black/15 text-lg animate-bounce">
                🚨
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-black/80">Chamada de Corrida</p>
                <p className="text-sm font-extrabold uppercase tracking-tight text-black">Nova Entrega Disponível</p>
              </div>
            </div>

            {delivery.short_id && (
              <span className="rounded-xl bg-black/20 px-2.5 py-1 font-mono text-xs font-black text-black">
                #{delivery.short_id}
              </span>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="space-y-4 p-5 text-white">
          {/* Loja & Ganhos */}
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                <Store className="h-3.5 w-3.5" />
                <span>Loja</span>
              </div>
              <h3 className="mt-1 truncate text-xl font-black tracking-tight text-white">
                {displayStoreName}
              </h3>
              <p className="text-xs font-medium text-slate-400 mt-0.5">
                Cliente: <strong className="text-slate-200">{delivery.customer_name || "Cliente"}</strong>
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Seus Ganhos</p>
              <p className="font-mono text-2xl font-black text-emerald-400">
                R$ {earningsText}
              </p>
            </div>
          </div>

          {/* Rota (Origem / Destino) */}
          <div className="relative space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="absolute bottom-6 left-[22px] top-6 w-0.5 bg-gradient-to-b from-amber-400 via-amber-400/50 to-emerald-400" />

            {/* Coleta */}
            <div className="relative flex items-start gap-3 pl-1">
              <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] text-black shadow-[0_0_10px_rgba(251,191,36,0.6)]">
                ●
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">1º Coleta (Loja)</span>
                <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-200">
                  {pickupAddr}
                </p>
              </div>
            </div>

            {/* Entrega */}
            <div className="relative flex items-start gap-3 pl-1">
              <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-[10px] text-black shadow-[0_0_10px_rgba(52,211,153,0.6)]">
                🏁
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">2º Entrega (Cliente)</span>
                <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-200">
                  {dropoffAddr}
                </p>
              </div>
            </div>
          </div>

          {/* Cobrança do Cliente */}
          {orderVal > 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Cobrar do Cliente</span>
              <span className="font-mono text-sm font-black text-amber-300">
                R$ {orderVal.toFixed(2).replace(".", ",")} ({paymentMethod || "Dinheiro"})
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2">
              <span className="text-xs font-semibold text-slate-400">Pagamento do Pedido</span>
              <span className="text-xs font-bold text-emerald-400">Já pago no app / Convênio</span>
            </div>
          )}

          {/* Action Buttons: RECUSAR e ACEITAR */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                stopAlert();
                onDecline(delivery.id);
              }}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/15 font-black text-xs uppercase tracking-wider text-red-400 transition-all hover:bg-red-500/25 active:scale-95 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              <span>RECUSAR</span>
            </button>

            <button
              type="button"
              disabled={pending}
              onClick={async () => {
                stopAlert();
                await onAccept(delivery.id);
              }}
              className="flex h-14 flex-[2] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 font-black text-xs uppercase tracking-wider text-black shadow-[0_8px_25px_rgba(245,158,11,0.4)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>ACEITANDO...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  <span>ACEITAR CORRIDA</span>
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
