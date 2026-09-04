import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Store, MapPin, Navigation, CheckCircle2, X, Loader2, Sparkles, Bike } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { extractDeliveryFee, type DeliveryWithRelations as Delivery } from "@/services/deliveries";
import { useAudioAlert } from "@/hooks/useAudioAlert";

interface Props {
  delivery: Delivery | null;
  open: boolean;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => void;
  pending?: boolean;
}

export function MT24NewDeliveryPopup({ delivery, open, onAccept, onDecline, pending }: Props) {
  const { playAlert, stopAlert, unlockAudio } = useAudioAlert();

  // Alerta sonoro oficial do MT 24 Horas Express (ring.mp3) enquanto o popup estiver ativo
  useEffect(() => {
    if (open && delivery) {
      try {
        unlockAudio();
        playAlert(true);
      } catch (e) {
        console.warn("[MT24NewDeliveryPopup] Erro áudio ring.mp3:", e);
      }
    } else {
      stopAlert();
    }
  }, [open, delivery?.id]);

  if (!delivery) return null;

  const isBuscaCondicional = (delivery as any).delivery_type === "BUSCA_CONDICIONAL";

  const displayStoreName =
    delivery.company_name?.trim() ||
    delivery.companies?.name?.trim() ||
    (delivery as any).store_name?.trim() ||
    "Loja MT 24 Horas";

  const grossFee = extractDeliveryFee(delivery);
  // Repasse de comissão para o entregador
  const driverEarnings = (
    delivery.commission && Number(delivery.commission) > 0
      ? Number(delivery.commission)
      : grossFee * 0.75
  ).toFixed(2).replace(".", ",");

  const pickupAddr =
    delivery.pickup_address?.trim() ||
    (delivery as any).store_address?.trim() ||
    (delivery as any).companies?.address?.trim() ||
    "Retirada no estabelecimento parceiro";

  const dropoffAddr =
    delivery.address?.trim() ||
    (delivery as any).delivery_address?.trim() ||
    "Endereço do cliente";

  const orderVal = Number((delivery as any).order_value || (delivery as any).orders?.total || 0);
  const paymentMethod = delivery.payment_method || (delivery as any).orders?.payment_method || "";

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !pending) {
          stopAlert();
          onDecline(delivery.id);
        }
      }}
    >
      <DialogContent className="fixed left-[50%] top-[50%] z-50 w-[94vw] max-w-sm translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-[28px] border border-amber-500/30 bg-[#070d1e] p-0 text-white shadow-[0_0_60px_rgba(245,158,11,0.28)] backdrop-blur-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 duration-200">
        <DialogTitle className="sr-only">Nova Corrida MT 24 Horas Express</DialogTitle>
        <DialogDescription className="sr-only">
          Solicitação de corrida em tempo real para entregador parceiro
        </DialogDescription>

        {/* Top Accent & Branding MT 24 HORAS */}
        <div className="relative bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-transparent px-5 pt-6 pb-2 text-center">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-amber-500/10 p-2 border border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-pulse">
            <img src={iconPrimavera} alt="MT 24 Horas Express" className="h-16 w-16 object-contain" />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-0.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
            <Sparkles className="h-3 w-3" />
            <span>MT 24 HORAS EXPRESS</span>
          </div>

          <h2 className="mt-2 text-xl font-black tracking-tight text-white">
            {isBuscaCondicional ? "Busca de Condicional!" : "Nova Corrida Disponível!"}
          </h2>

          {delivery.short_id && (
            <p className="mt-0.5 text-xs font-mono font-bold text-slate-400">
              Pedido #{delivery.short_id}
            </p>
          )}
        </div>

        {/* Informações detalhadas da corrida */}
        <div className="px-5 pb-5 space-y-3.5">
          {/* Loja & Ganhos Card */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-inner">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                <Store className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{displayStoreName}</span>
              </div>
              <p className="mt-1 text-xs text-slate-300 font-medium truncate">
                Cliente: <strong className="text-white">{delivery.customer_name || "Cliente"}</strong>
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-right shrink-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Ganhos</p>
              <p className="font-mono text-xl font-black text-emerald-300">
                R$ {driverEarnings}
              </p>
            </div>
          </div>

          {/* Rota Coleta / Entrega */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 text-xs">
                📍
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  {isBuscaCondicional ? "1º Coleta (Cliente)" : "1º Coleta (Loja)"}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-slate-200 line-clamp-2">
                  {isBuscaCondicional ? (delivery.address || "Endereço do Cliente") : pickupAddr}
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-800/80 mx-1" />

            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs">
                🏁
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                  {isBuscaCondicional ? "2º Entrega (Loja)" : "2º Entrega (Cliente)"}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-slate-200 line-clamp-2">
                  {isBuscaCondicional ? (pickupAddr || displayStoreName) : dropoffAddr}
                </p>
              </div>
            </div>
          </div>

          {/* Valor a receber no ato da entrega (se houver cobrança) */}
          {orderVal > 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs">
              <span className="font-bold text-amber-300 uppercase tracking-wider">Cobrar do Cliente:</span>
              <span className="font-mono font-black text-amber-200">
                R$ {orderVal.toFixed(2).replace(".", ",")} ({paymentMethod || "Dinheiro"})
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2 text-xs">
              <span className="text-slate-400">Pagamento:</span>
              <span className="font-bold text-emerald-400">Já pago / Convênio (R$ 0,00)</span>
            </div>
          )}

          {/* Botões RECUSAR e ACEITAR */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                stopAlert();
                onDecline(delivery.id);
              }}
              className="h-13 rounded-2xl border border-red-500/50 bg-red-950/40 font-black text-xs uppercase tracking-wider text-red-300 hover:bg-red-900/60 transition-transform active:scale-95 disabled:opacity-50"
            >
              <X className="mr-1.5 h-4 w-4" />
              RECUSAR
            </Button>

            <Button
              type="button"
              disabled={pending}
              onClick={async () => {
                stopAlert();
                await onAccept(delivery.id);
              }}
              className="h-13 rounded-2xl border-none bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 font-black text-xs uppercase tracking-wider text-black shadow-[0_4px_20px_rgba(245,158,11,0.4)] hover:brightness-110 transition-transform active:scale-95 disabled:opacity-50"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ACEITANDO...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  ACEITAR
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
