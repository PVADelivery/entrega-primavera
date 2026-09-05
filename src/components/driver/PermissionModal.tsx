import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { useAuth } from "@/contexts/AuthContext";

export function PermissionModal() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  const checkPermissions = useCallback(async () => {
    // SOMENTE após login confirmado
    if (!user || loading) {
      setOpen(false);
      return;
    }

    const dismissedKey = `mt24_permissions_dismissed_${user.id}`;
    if (typeof window !== "undefined" && localStorage.getItem(dismissedKey) === "true") {
      setOpen(false);
      return;
    }

    // Checagem de notificações na central
    let notifMissing = false;
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted") {
        notifMissing = true;
      }
    }

    // Abre apenas se a notificação na central não estiver concedida
    setOpen(notifMissing);
  }, [user, loading]);

  useEffect(() => {
    if (!user || loading) return;

    const timer = setTimeout(() => {
      checkPermissions();
    }, 1200);

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

  if (!user || loading || !open) {
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
            Notificações de Corridas
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Ative as notificações para ser alertado na central do aparelho com som alto e opções de Aceitar/Recusar quando surgirem novas entregas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5 my-3">
          <div className="flex items-start gap-3 p-3.5 rounded-2xl border bg-amber-500/10 border-amber-500/30">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-300">Alertas na Central do Aparelho</h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Receba chamadas com som e botões de Aceitar/Recusar diretamente na barra de notificações e na tela de bloqueio.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleGrantPermissions}
            className="w-full h-14 rounded-2xl font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-[0_0_25px_rgba(234,179,8,0.4)] transition-all active:scale-[0.98]"
          >
            <CheckCircle className="h-5 w-5 mr-2" /> Ativar Notificações
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
