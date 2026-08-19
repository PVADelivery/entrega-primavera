import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import iconPrimavera from "@/assets/primavera-icon-v3.png";
import { declineDeliveryLocally, acceptDeliveryLocally, getDeclinedDeliveries } from "@/hooks/useDriverNotifications";
import { acceptDelivery } from "@/services/deliveries";
import { toast } from "sonner";

export function NewDeliveryPopupModal() {
  const [activeDelivery, setActiveDelivery] = useState<any | null>(null);
  const [accepting, setAccepting] = useState(false);
  const acceptingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPopupAudio = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {}
  };

  useEffect(() => {
    // Escuta novas solicitações de entrega em tempo real
    const channel = supabase
      .channel(`popup-delivery-epraja-${Math.random().toString(36).substring(2, 9)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deliveries" },
        async (payload) => {
          const newDel = payload.new as any;
          if (newDel.status === "pending" || newDel.status === "broadcasted") {
            const declined = getDeclinedDeliveries();
            if (declined.has(newDel.id)) return;

            // Tocar som de chamada de entrega em loop enquanto o modal estiver aberto
            try {
              stopPopupAudio();
              const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3");
              audio.volume = 1.0;
              audio.loop = true;
              audioRef.current = audio;
              audio.play().catch(() => {});
            } catch (e) {}

            // Buscar nome real da loja e endereço de coleta incondicionalmente na tabela companies
            let storeName = newDel.company_name;
            let pickupAddress = newDel.pickup_address;

            if (newDel.company_id) {
              const { data: comp } = await supabase
                .from("companies")
                .select("name, address")
                .eq("id", newDel.company_id)
                .maybeSingle();
              if (comp?.name) storeName = comp.name;
              if (comp?.address) pickupAddress = comp.address;
            }

            if (!storeName || storeName === "Empresa Parceira" || storeName === "EMPRESA PARCEIRA" || storeName === "Loja Parceira") {
              const { data: lastComp } = await supabase
                .from("companies")
                .select("name, address")
                .eq("is_active", true)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (lastComp?.name) {
                storeName = lastComp.name;
                if (!pickupAddress) pickupAddress = lastComp.address;
              }
            }

            setActiveDelivery({
              ...newDel,
              pickup_address: pickupAddress || newDel.pickup_address,
              storeName: (storeName || "Loja Parceira").toUpperCase()
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deliveries" },
        (payload) => {
          const updated = payload.new as any;
          // Se outro motoboy aceitou ou foi cancelada, encerra o modal imediatamente
          if (activeDelivery && updated.id === activeDelivery.id && updated.status !== "pending" && updated.status !== "broadcasted") {
            stopPopupAudio();
            setActiveDelivery(null);
          }
        }
      )
      .subscribe();

    return () => {
      stopPopupAudio();
      supabase.removeChannel(channel);
    };
  }, [activeDelivery?.id]);

  const handleAccept = async () => {
    if (!activeDelivery || acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    stopPopupAudio();

    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (userRes?.user) {
        const { data: driver } = await supabase
          .from("delivery_drivers")
          .select("id")
          .eq("user_id", userRes.user.id)
          .maybeSingle();

        const driverId = driver?.id || userRes.user.id;
        await acceptDelivery(activeDelivery.id, driverId);
        acceptDeliveryLocally(activeDelivery.id);
        toast.success("✅ Corrida aceita com sucesso!");
        setActiveDelivery(null);
        window.location.href = "/driver/deliveries";
      }
    } catch (e: any) {
      console.log("Corrida já aceita por outro entregador:", e);
      toast.info("Esta entrega já foi aceita por outro entregador.");
      declineDeliveryLocally(activeDelivery.id);
      setActiveDelivery(null);
    } finally {
      setAccepting(false);
      acceptingRef.current = false;
    }
  };

  const handleReject = () => {
    if (acceptingRef.current) return;
    if (activeDelivery) {
      declineDeliveryLocally(activeDelivery.id);
    }
    stopPopupAudio();
    setActiveDelivery(null);
  };

  if (!activeDelivery) return null;

  const earnings = Number(
    (activeDelivery.commission && Number(activeDelivery.commission) > 0)
      ? activeDelivery.commission
      : (activeDelivery.delivery_fee && Number(activeDelivery.delivery_fee) > 0)
        ? activeDelivery.delivery_fee
        : (activeDelivery.value && Number(activeDelivery.value) > 0)
          ? activeDelivery.value
          : (activeDelivery.price && Number(activeDelivery.price) > 0)
            ? activeDelivery.price
            : 0
  ).toFixed(2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#0b1329] border border-slate-800 text-white rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Layout idêntico ao modelo "É Pra Já" */}
        <div className="flex flex-col items-center text-center space-y-4 py-2">
          
          {/* Logo Central do Aplicativo */}
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-amber-500/10 p-2 shadow-lg border border-amber-500/20">
            <img src={iconPrimavera} alt="MT 24 Horas Express" className="h-20 w-20 object-contain" />
          </div>

          {/* Título Principal */}
          <h2 className="text-2xl font-black tracking-tight text-white">
            Nova Corrida Disponível!
          </h2>

          {/* Nome da Loja */}
          <p className="text-lg font-black text-slate-300 uppercase tracking-wide">
            {activeDelivery.storeName}
          </p>

          {/* Coleta */}
          <div className="text-sm text-slate-300 font-medium leading-tight max-w-[280px]">
            <span className="font-semibold text-slate-400">Coleta: </span>
            {activeDelivery.pickup_address || "Endereço da Loja"}
          </div>

          {/* Entrega */}
          <div className="text-sm text-slate-300 font-medium leading-tight max-w-[280px]">
            <span className="font-semibold text-slate-400">Entrega: </span>
            {activeDelivery.address || "Endereço do Cliente"}
          </div>

          {/* Ganhos */}
          <p className="text-lg font-black text-white pt-1">
            Ganhos: R$ {earnings}
          </p>

          {/* Botões RECUSAR e ACEITAR lado a lado */}
          <div className="grid grid-cols-2 gap-3 w-full pt-4">
            <Button
              type="button"
              onClick={handleReject}
              disabled={accepting}
              className="h-13 rounded-xl font-black text-base uppercase bg-red-600 hover:bg-red-700 text-white border-none shadow-md transition-transform active:scale-95 disabled:opacity-60"
            >
              RECUSAR
            </Button>
            <Button
              type="button"
              onClick={handleAccept}
              disabled={accepting}
              className="h-13 rounded-xl font-black text-base uppercase bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-md transition-transform active:scale-95 disabled:opacity-60"
            >
              {accepting ? "ACEITANDO..." : "ACEITAR"}
            </Button>
          </div>

        </div>

      </div>
    </div>
  );
}
