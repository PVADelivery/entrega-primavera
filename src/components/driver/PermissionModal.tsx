import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Layers, CheckCircle, BatteryCharging } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { Capacitor } from "@capacitor/core";
import { DeliveryOverlay } from "@/plugins/DeliveryOverlay";
import { useAuth } from "@/contexts/AuthContext";

export function PermissionModal() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [needsOverlay, setNeedsOverlay] = useState(false);
  const [needsNotification, setNeedsNotification] = useState(false);

  const checkPermissions = useCallback(async () => {
    // SOMENTE após login confirmado
    if (!user || loading) {
      setOpen(false);
      return;
    }

    const dismissedKey = `mt24_permissions_dismissed_${user.id}`;
    if (typeof window !== "undefined" && localStorage.getItem(dismissedKey) === "true") {
      return;
    }

    let overlayMissing = false;
    let notifMissing = false;

    // Checagem em ambiente nativo Android (Capacitor)
    if (Capacitor.isNativePlatform()) {
      try {
        const { granted } = await DeliveryOverlay.checkOverlayPermission();
        overlayMissing = !granted;
      } catch (e) {
        console.warn("[PermissionModal] Erro ao verificar overlay:", e);
      }
    }

    // Checagem de notificações
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted") {
        notifMissing = true;
      }
    }

    setNeedsOverlay(overlayMissing);
    setNeedsNotification(notifMissing);

    // Abre apenas se houver pelo menos uma permissão pendente
    if (overlayMissing || notifMissing) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [user, loading]);

  useEffect(() => {
    // Aguarda o entregador carregar o painel após o login antes de avaliar permissões
    if (!user || loading) return;

    const timer = setTimeout(() => {
      checkPermissions();
    }, 1200);

    // Re-avalia quando o motoboy volta das configurações do Android
    const onWindowFocus = () => {
      checkPermissions();
    };
    window.addEventListener("focus", onWindowFocus);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [user, loading, checkPermissions]);

  const handleClose = () => {
    if (user?.id) {
      localStorage.setItem(`mt24_permissions_dismissed_${user.id}`, "true");
    }
    setOpen(false);
  };

  const handleGrantPermissions = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        // Solicita permissão para desenhar sobre outros apps (Waze/Maps)
        await DeliveryOverlay.requestOverlayPermission();
        // Solicita isenção de otimização de bateria
        await DeliveryOverlay.requestBatteryOptimizationExemption({ prompt: true });
      } catch (e) {
        console.warn("[PermissionModal] Erro ao solicitar permissões nativas:", e);
      }
    }

    try {
      if ("Notification" in window && Notification.permission !== "granted") {
        await Notification.requestPermission();
      }
    } catch (e) {
      console.warn("[PermissionModal] Erro ao solicitar notificações:", e);
    }

    if (user?.id) {
      localStorage.setItem(`mt24_permissions_dismissed_${user.id}`, "true");
    }
    setOpen(false);
  };

  // Se o entregador não estiver logado, não renderiza absolutamente nada
  if (!user || loading) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white rounded-3xl p-6 shadow-2xl">
        <DialogHeader className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
            <img src={iconPrimavera} alt="MT 24 Horas Express" className="h-10 w-10 object-contain" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Configurar Alertas de Corridas
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Para receber chamadas com som alto e botões de Aceitar/Recusar enquanto utiliza outros apps, ative os recursos abaixo:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 my-3">
          {/* Card 1: Aparecer sobre Outros Apps */}
          <div className={`flex items-start gap-3 p-3.5 rounded-2xl border ${needsOverlay ? 'bg-blue-500/10 border-blue-500/30' : 'bg-slate-900/60 border-slate-800 opacity-75'}`}>
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0 mt-0.5">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-blue-300">Aparecer Sobre Outros Apps</h4>
                {!needsOverlay && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Ativo</span>}
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                Exibe o alerta flutuante da corrida por cima do Waze, Google Maps ou tela bloqueada.
              </p>
            </div>
          </div>

          {/* Card 2: Alertas Sonoros e Notificações */}
          <div className={`flex items-start gap-3 p-3.5 rounded-2xl border ${needsNotification ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/60 border-slate-800 opacity-75'}`}>
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-300">Alertas Sonoros</h4>
                {!needsNotification && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Ativo</span>}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Emite o som contínuo para você ser avisado imediatamente quando entrar uma nova corrida.
              </p>
            </div>
          </div>

          {/* Card 3: Otimização de Bateria */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
              <BatteryCharging className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-300">Manter Alertas Ativos em 2º Plano</h4>
              <p className="text-[11px] text-slate-400 leading-snug mt-0.5">
                Evita que o sistema Android suspenda o aplicativo enquanto a tela estiver desligada.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleGrantPermissions}
            className="w-full h-14 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-[0_0_25px_rgba(234,179,8,0.4)] transition-all active:scale-[0.98]"
          >
            <CheckCircle className="h-5 w-5 mr-2" /> Ativar Permissões Agora
          </Button>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-xs text-slate-500 hover:text-slate-400 hover:bg-transparent"
          >
            Lembrar Mais Tarde
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
