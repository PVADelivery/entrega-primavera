import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { ThemeToggle } from "./ThemeToggle";
import iconPrimavera from "@/assets/primavera-icon.png";

export function DriverHeader() {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);
  const [name, setName] = useState("Entregador");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: driver } = await supabase
        .from("delivery_drivers")
        .select("is_online")
        .eq("user_id", user.id)
        .maybeSingle();
      setOnline(driver?.is_online ?? false);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.full_name) setName(profile.full_name);
    })();
  }, [user]);

  async function toggle(value: boolean) {
    if (!user) return;
    setOnline(value);
    const { error } = await supabase
      .from("delivery_drivers")
      .update({ is_online: value, online: value })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Não foi possível atualizar o status");
      setOnline(!value);
    } else {
      toast.success(value ? "Você está online" : "Você está offline");
      if (value && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            supabase
              .from("delivery_drivers")
              .update({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
              .eq("user_id", user.id);
          },
          () => {}
        );
      }
    }
  }

  return (
    <header
      className="rounded-b-3xl px-5 pb-8 pt-8 text-primary-foreground"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide opacity-90">
            <img src={iconPrimavera} alt="Primavera Delivery" className="h-6 w-6 rounded-full object-contain" />
            <span><span className="font-bold">Primavera</span> Delivery</span>
          </div>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">
            Olá, {name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle variant="onPrimary" />
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
              {online ? "Online" : "Offline"}
            </span>
            <Switch checked={online} onCheckedChange={toggle} />
          </div>
        </div>
      </div>
    </header>
  );
}