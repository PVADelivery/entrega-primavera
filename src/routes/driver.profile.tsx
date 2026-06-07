import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ensureDriverRow } from "@/services/deliveries";
import { toast } from "sonner";
import { LogOut, Sun, Moon } from "lucide-react";

export const Route = createFileRoute("/driver/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Perfil — RotaPro" }] }),
});

function ProfilePage() {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("moto");
  const [plate, setPlate] = useState("");
  const [commission, setCommission] = useState(80);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await ensureDriverRow(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("user_id", user.id)
        .maybeSingle();
      setFullName(profile?.full_name ?? "");
      setPhone(profile?.phone ?? "");
      const { data: driver } = await supabase
        .from("delivery_drivers")
        .select("vehicle_type, vehicle_plate, commission_rate")
        .eq("user_id", user.id)
        .maybeSingle();
      if (driver) {
        setVehicleType(driver.vehicle_type ?? "moto");
        setPlate(driver.vehicle_plate ?? "");
        setCommission(Number(driver.commission_rate ?? 80));
      }
    })();
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from("profiles")
        .upsert({ user_id: user.id, full_name: fullName, phone }, { onConflict: "user_id" });
      await supabase
        .from("delivery_drivers")
        .update({ vehicle_type: vehicleType, vehicle_plate: plate, vehicle: vehicleType })
        .eq("user_id", user.id);
      toast.success("Perfil atualizado");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/login" });
  }

  return (
    <DriverShell>
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-foreground">Perfil</h1>

        <Card className="mt-4 rounded-2xl p-4 space-y-3">
          <div>
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </Card>

        <Card className="mt-4 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Veículo</h3>
          <div>
            <Label>Tipo</Label>
            <Select value={vehicleType} onValueChange={setVehicleType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="moto">Moto</SelectItem>
                <SelectItem value="carro">Carro</SelectItem>
                <SelectItem value="bike">Bike</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="plate">Placa</Label>
            <Input id="plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          </div>
          <div>
            <Label>Comissão</Label>
            <Input value={`${commission.toFixed(2)}%`} disabled />
            <p className="mt-1 text-xs text-muted-foreground">Definida pelo administrador.</p>
          </div>
        </Card>

        <Button className="mt-4 w-full" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>

        <div className="mt-3 flex items-center gap-2">
          <Button variant="outline" className="w-full flex-1" onClick={toggle}>
            {theme === "dark" ? <><Sun className="mr-2 h-4 w-4" /> Claro</> : <><Moon className="mr-2 h-4 w-4" /> Escuro</>}
          </Button>
          <Button
            variant="outline"
            className="w-full flex-1 text-destructive hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>

      {/* ── BONASOFT Watermark ── */}
      <div className="pt-8 pb-4 flex justify-center opacity-40 select-none pointer-events-none">
        <span className="text-[10px] font-black tracking-[0.5em] text-muted-foreground uppercase">
          B O N A S O F T
        </span>
      </div>
    </DriverShell>
  );
}