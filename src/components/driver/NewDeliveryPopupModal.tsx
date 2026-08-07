import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Wallet, ArrowRight, X, Volume2, Sparkles } from "lucide-react";
import iconPrimavera from "@/assets/primavera-icon-v3.png";

export function NewDeliveryPopupModal() {
  const [activeDelivery, setActiveDelivery] = useState<any | null>(null);

  useEffect(() => {
    // Escuta novas solicitações de entrega em tempo real
    const channel = supabase
      .channel(`popup-delivery-new-${Math.random().toString(36).substring(2, 9)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        async (payload) => {
          const newDel = payload.new as any;
          if (newDel.status === "pending" || newDel.status === "broadcasted") {
            // Tocar som em volume alto
            try {
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
              audio.volume = 1.0;
              audio.play().catch(() => {});
            } catch (e) {}

            // Buscar dados completos da loja
            let companyName = newDel.company_name || "Loja Parceira";
            if (newDel.company_id) {
              const { data: comp } = await supabase
                .from("companies")
                .select("name")
                .eq("id", newDel.company_id)
                .maybeSingle();
              if (comp?.name) companyName = comp.name;
            }

            setActiveDelivery({ ...newDel, storeName: companyName });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleAccept = async () => {
    if (!activeDelivery) return;
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes?.user) {
        const { data: driver } = await supabase
          .from("delivery_drivers")
          .select("id")
          .eq("user_id", userRes.user.id)
          .maybeSingle();

        const driverId = driver?.id || userRes.user.id;
        await supabase
          .from("deliveries")
          .update({
            driver_id: driverId,
            status: "accepted",
            accepted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", activeDelivery.id);
      }
    } catch (e) {
      console.error("Erro ao aceitar corrida no popup:", e);
    } finally {
      setActiveDelivery(null);
      window.location.href = "/driver/deliveries";
    }
  };

  if (!activeDelivery) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) setActiveDelivery(null); }}>
      <DialogContent className="sm:max-w-md bg-slate-950 border-2 border-amber-500/80 text-white rounded-3xl p-6 shadow-[0_0_50px_rgba(234,179,8,0.3)] animate-in zoom-in-95 duration-200">
        
        {/* Cabeçalho com Alerta de Nova Corrida */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">
                Nova Entrega Disponível!
              </p>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {activeDelivery.storeName}
              </h3>
            </div>
          </div>
          <button
            onClick={() => setActiveDelivery(null)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Detalhes da Coleta e Valor */}
        <div className="space-y-4 py-2">
          {/* Endereço de Coleta / Entrega */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
            <div className="flex items-start gap-2 text-xs">
              <MapPin className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Coleta (Loja):</span>
                <p className="text-white font-medium">{activeDelivery.pickup_address || "Endereço da Loja"}</p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs pt-1 border-t border-slate-800/80">
              <MapPin className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Entrega:</span>
                <p className="text-white font-medium">{activeDelivery.address || "Endereço do Cliente"}</p>
              </div>
            </div>
          </div>

          {/* Valor de Ganhos */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500 text-slate-950 font-black">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Ganhos da Corrida
                </p>
                <p className="text-2xl font-black text-white">
                  R$ {Number(activeDelivery.commission || activeDelivery.delivery_fee || activeDelivery.price || (activeDelivery.value ? activeDelivery.value * 0.75 : 0)).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Botão de Aceite Imediato */}
        <div className="pt-2">
          <Button
            onClick={handleAccept}
            className="w-full h-14 rounded-2xl font-black text-base uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_0_30px_rgba(234,179,8,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Aceitar Entrega Agora <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
