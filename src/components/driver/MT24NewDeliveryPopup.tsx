import React, { useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Store, MapPin, Navigation, CheckCircle2, X, Loader2, Sparkles, Bike } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { extractDeliveryFee, type DeliveryWithRelations as Delivery } from "@/services/deliveries";
import { useAudioAlert } from "@/hooks/useAudioAlert";
import { isDeliveryEligibleForDriver } from "@/utils/delivery-eligibility";
import { Capacitor } from "@capacitor/core";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";

interface Props {
  delivery: Delivery | null;
  open: boolean;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => void;
  pending?: boolean;
}

export function MT24NewDeliveryPopup({ delivery, open, onAccept, onDecline, pending }: Props) {
  const { playAlert, stopAlert, unlockAudio } = useAudioAlert();

  // Blindagem absoluta: NUNCA tocar som nem exibir modal se a entrega estiver na janela de 2 min do Admin
  const isAvailableForDriver = isDeliveryEligibleForDriver(delivery);

  // Alerta sonoro oficial do MT 24 Horas Express (ring.mp3) enquanto o popup estiver ativo
  useEffect(() => {
    if (open && isAvailableForDriver && delivery) {
      if (!Capacitor.isNativePlatform()) {
        try {
          unlockAudio();
          playAlert();
        } catch (e) {
          console.warn("[MT24NewDeliveryPopup] Erro áudio ring.mp3:", e);
        }
      }
    } else {
      stopAlert();
      if (Capacitor.isNativePlatform()) {
        DeliveryOverlay.stopNativeAudio().catch(() => {});
      }
    }
  }, [open, isAvailableForDriver, delivery?.id]);

  if (!delivery || !isAvailableForDriver) return null;

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
          if (Capacitor.isNativePlatform()) {
            DeliveryOverlay.stopNativeAudio().catch(() => {});
          }
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

          <p className="mt-1 text-sm font-semibold text-amber-200/90">{displayStoreName}</p>
        </div>

        {/* Body Info */}
        <div className="space-y-3 px-5 py-4">
          {/* Card Ganhos */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-3.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-300">Seus Ganhos</span>
              <span className="font-mono text-2xl font-black text-amber-400">R$ {driverEarnings}</span>
            </div>
          </div>

          {/* Endereços */}
          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
              <div className="min-w-0">
                <span className="font-semibold text-slate-300">Coleta: </span>
                <span className="text-slate-100">{pickupAddr}</span>
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <div className="min-w-0">
                <span className="font-semibold text-slate-300">Entrega: </span>
                <span className="text-slate-100">{dropoffAddr}</span>
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
                if (Capacitor.isNativePlatform()) {
                  DeliveryOverlay.stopNativeAudio().catch(() => {});
                }
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
                if (Capacitor.isNativePlatform()) {
                  DeliveryOverlay.stopNativeAudio().catch(() => {});
                }
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
