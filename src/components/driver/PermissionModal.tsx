import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, Layers, CheckCircle } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";

export function PermissionModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isDismissed = localStorage.getItem("permission_modal_dismissed_v1");
      if (isDismissed === "true") {
        return; // Nunca mais abre se o usuário já aceitou ou fechou uma vez
      }

      if ("Notification" in window) {
        if (Notification.permission === "granted") {
          localStorage.setItem("permission_modal_dismissed_v1", "true");
          return;
        }
        if (Notification.permission === "default") {
          setOpen(true);
        }
      }
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("permission_modal_dismissed_v1", "true");
    setOpen(false);
  };

  const handleGrantPermissions = async () => {
    try {
      if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch (e) {
      console.warn("Erro ao solicitar permissão de notificação:", e);
    }
    
    localStorage.setItem("permission_modal_dismissed_v1", "true");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) handleClose(); }}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800 text-white rounded-3xl p-6 shadow-2xl">
        <DialogHeader className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3 shadow-[0_0_20px_rgba(234,179,8,0.2)]">
            <img src={iconPrimavera} alt="MT 24 Horas Express" className="h-10 w-10 object-contain" />
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-white">
            Permissões de Entrega
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Ative as permissões essenciais para receber alertas de corridas com a tela bloqueada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Card 1: Notificações em Tempo Real */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">Alertas e Sons de Corridas</h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Receba chamadas sonoras e notificações instantâneas de novas entregas das lojas.
              </p>
            </div>
          </div>

          {/* Card 2: Aparecer sobre Outros Apps */}
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 shrink-0 mt-0.5">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-200">Aparecer Sobre Outros Apps</h4>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Permite exibir o alerta de nova corrida no topo mesmo usando o GPS ou com tela bloqueada.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={handleGrantPermissions}
            className="w-full h-13 rounded-2xl font-black text-sm uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_20px_rgba(234,179,8,0.3)] transition-all"
          >
            <CheckCircle className="h-5 w-5 mr-2" /> Ativar Permissões
          </Button>
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-xs text-slate-500 hover:text-slate-400 hover:bg-transparent"
          >
            Já ativei / Entendi
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
