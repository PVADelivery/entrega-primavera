import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Layers, CheckCircle, ShieldAlert } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { Capacitor } from "@capacitor/core";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";

export function PermissionModal() {
  const [open, setOpen] = useState(false);
  const [hasOverlay, setHasOverlay] = useState(true);

  const checkStatus = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { granted } = await DeliveryOverlay.checkOverlayPermission();
        setHasOverlay(granted);
        if (!granted) {
          setOpen(true);
          return;
        }
      } catch (e) {
        console.warn("Erro ao checar permissão overlay:", e);
      }
    }

    if (typeof window !== "undefined") {
      const isDismissed = localStorage.getItem("permission_modal_dismissed_v2");
      if (isDismissed === "true") return;

      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          localStorage.setItem("permission_modal_dismissed_v2", "true");
          return;
        }
        if (Notification.permission === "default") {
          setOpen(true);
        }
      }
    }
  };

  useEffect(() => {
    checkStatus();

    // Re-checa quando o app volta do primeiro plano (ex: após usuário ir nas configurações)
    const handleFocus = () => {
      checkStatus();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const handleClose = () => {
    localStorage.setItem("permission_modal_dismissed_v2", "true");
    setOpen(false);
  };

  const handleGrantPermissions = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // Abre imediatamente a tela do Android de "Aparecer sobre outros aplicativos"
        await DeliveryOverlay.requestOverlayPermission();
        await DeliveryOverlay.requestBatteryOptimizationExemption();
      } catch (e) {
        console.warn("Erro ao solicitar permissões nativas:", e);
      }
    }

    try {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch (e) {
      console.warn("Erro ao solicitar permissão de notificação:", e);
    }
    
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white rounded-3xl p-6 shadow-2xl">
        <DialogHeader className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
            <img src={iconPrimavera} alt="MT 24 Horas Express" className="h-10 w-10 object-contain" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Permissão Obrigatória
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Para tocar chamadas e exibir corridas sobre outros apps ou com a tela bloqueada, ative as permissões abaixo:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 my-3">
          {/* Card 1: Aparecer sobre Outros Apps */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0 mt-0.5">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-300">Aparecer Sobre Outros Aplicativos</h4>
              <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                Exibe o popup com botões <strong>ACEITAR</strong> e <strong>RECUSAR</strong> por cima do Waze, Google Maps ou com a tela desligada.
              </p>
            </div>
          </div>

          {/* Card 2: Notificações em Tempo Real */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">Alertas Sonoros de Corridas</h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Alerta alto e contínuo para você nunca perder uma corrida nova disponível.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleGrantPermissions}
            className="w-full h-14 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-[0_0_25px_rgba(234,179,8,0.4)] transition-all active:scale-[0.98]"
          >
            <CheckCircle className="h-5 w-5 mr-2" /> Ativar Permissão Agora
          </Button>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-xs text-slate-500 hover:text-slate-400 hover:bg-transparent"
          >
            Depois / Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
