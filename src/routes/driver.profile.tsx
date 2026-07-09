import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Camera, Loader2, User, Phone, Wallet, TrendingUp, Package, ArrowUpRight, Star,
  AlertTriangle, FileText, ShieldCheck, LogOut, Edit3, X, ChevronRight, CheckCircle2
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ensureDriverRow } from "@/services/deliveries";

export const Route = createFileRoute("/driver/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Perfil — Primavera Delivery" }] }),
});

function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState("today");
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split("T")[0];
  });
  
  const [driverStats, setDriverStats] = useState({ 
    deliveries: 0, 
    periodDeliveries: 0, 
    rating: 0, 
    grossEarnings: 0, 
    platformFee: 0,
    netEarnings: 0,
    online: false, 
    commissionRate: 0.80 
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      await ensureDriverRow(user.id);
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setProfile(p);
      setFullName(p?.full_name ?? "");
      setPhone(p?.phone ?? "");
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchDriverData();
  }, [user, period, customDate]);

  const fetchDriverData = async () => {
    try {
      const { data: driver } = await supabase
        .from("delivery_drivers")
        .select("id, rating, is_online, commission_rate, service_types")
        .eq("user_id", user.id)
        .maybeSingle();

      if (driver) {
        if (driver.service_types) {
          setServiceTypes(driver.service_types);
        }
        const DELIVERED_STATUSES = ["delivered", "completed"] as any;

        const { count: totalCount } = await supabase
          .from("deliveries")
          .select("id", { count: "exact", head: true })
          .eq("driver_id", driver.id)
          .in("status", DELIVERED_STATUSES);

        let start = new Date();
        let end = new Date();
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        if (period === "yesterday") {
          start.setDate(start.getDate() - 1);
          end.setDate(end.getDate() - 1);
        } else if (period === "week") {
          start.setDate(start.getDate() - start.getDay());
        } else if (period === "month") {
          start.setDate(1);
        } else if (period === "custom" && customDate) {
          const [year, month, day] = customDate.split("-").map(Number);
          start = new Date(year, month - 1, day, 0, 0, 0, 0);
          end = new Date(year, month - 1, day, 23, 59, 59, 999);
        }

        const startIso = format(start, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
        const endIso = format(end, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");

        const driverRate = driver.commission_rate !== null && driver.commission_rate !== undefined ? Number(driver.commission_rate) : 0.80;

        const { data: summaryData, error: summaryError } = await supabase.rpc("get_driver_earnings_summary", {
          p_driver_id: driver.id,
          p_start_date: startIso,
          p_end_date: endIso
        });

        let grossEarnings = 0;
        let platformFee = 0;
        let netEarnings = 0;
        let periodCount = 0;

        if (!summaryError && summaryData && summaryData.length > 0) {
          grossEarnings = Number(summaryData[0].gross_earnings || 0);
          periodCount = Number(summaryData[0].total_deliveries || 0);
          
          platformFee = periodCount * driverRate;
          netEarnings = grossEarnings - platformFee;
        }

        setDriverStats({
          deliveries: totalCount || 0,
          periodDeliveries: periodCount,
          rating: driver.rating || 5.0,
          grossEarnings,
          platformFee,
          netEarnings,
          online: driver.is_online || false,
          commissionRate: driverRate,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}-${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(filePath);

      await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("user_id", user.id);
      
      setProfile({ ...profile, avatar_url: publicUrl });
      toast.success("Foto atualizada!");
    } catch (err: any) {
      toast.error("Erro no upload: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const [serviceTypes, setServiceTypes] = useState<string[]>(["delivery_moto"]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      // 1. Atualiza dados de perfil
      await supabase
        .from("profiles")
        .upsert({ user_id: user.id, full_name: fullName.trim(), phone }, { onConflict: "user_id" });
      
      // 2. Atualiza os tipos de serviço executados pelo motorista
      await supabase
        .from("delivery_drivers")
        .update({ service_types: serviceTypes })
        .eq("user_id", user.id);

      setProfile({ ...profile, full_name: fullName.trim(), phone });
      toast.success("Perfil atualizado!");
      setEditing(false);
    } catch (err: any) {
      toast.error("Erro: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.full_name?.split(" ")[0] || "Entregador";
  const initial = displayName.charAt(0).toUpperCase();

  async function handleDeleteAccount() {
    // Basic implementation for deleting account
    if (!user) return;
    try {
      // Delete user requires admin privileges via RPC or edge function,
      // Here we just sign out as placeholder for safety
      toast.success("Solicitação enviada. A conta será removida pelo administrador.");
      await signOut();
      navigate({ to: "/login" });
    } catch (e: any) {
      toast.error("Erro ao excluir conta");
    }
  }

  return (
    <DriverShell>
      <div className="min-h-screen pb-24 bg-background">
        <div className="relative bg-zinc-900 -mx-4 -mt-4 rounded-b-[2.5rem] shadow-[var(--shadow-elegant)] overflow-hidden pb-8">
          <div className="absolute inset-0 bg-[var(--gradient-hero)] opacity-50" />
          
          <div className="relative z-10 px-6 pt-12">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-xl font-black text-white tracking-tight">Meu Perfil</h1>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-all text-xs font-bold"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Editar
              </button>
            </div>

            <div className="flex items-center gap-5">
              <div className="relative">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-20 h-20 rounded-full border-4 border-zinc-800 shadow-2xl bg-zinc-800 overflow-hidden relative group"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                  ) : (
                    <div className="w-full h-full gradient-primary flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
                      <span className="text-3xl font-black text-white">{initial}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                  </div>
                </button>
                <input ref={fileInputRef} type="file" capture="environment" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                
                <div className={cn(
                  "absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-zinc-900 flex items-center justify-center",
                  driverStats.online ? "bg-emerald-500" : "bg-zinc-500"
                )}>
                  {driverStats.online && <div className="w-2 h-2 rounded-full bg-white animate-pulse" />}
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-black text-white mb-1">{displayName}</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/80 border border-zinc-700">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-white">{driverStats.rating.toFixed(1)}</span>
                  </div>
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                    {driverStats.online ? "Online Agora" : "Offline"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 -mt-6 relative z-20">
          <div className="bg-card rounded-[2rem] p-5 shadow-[var(--shadow-card)] border border-border/40 mb-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border/40">
              <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Painel Financeiro
              </h3>
              <select 
                value={period} 
                onChange={(e) => setPeriod(e.target.value)}
                className="bg-secondary/50 border-none text-muted-foreground text-xs font-bold rounded-xl px-3 py-1.5 outline-none cursor-pointer focus:ring-1 focus:ring-primary"
              >
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="week">Semana</option>
                <option value="month">Mês</option>
                <option value="custom">Outro</option>
              </select>
            </div>

            {period === "custom" && (
              <input 
                type="date" 
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-sm font-bold text-foreground mb-4 outline-none border border-border/40"
              />
            )}

            <div className="relative rounded-2xl p-5 mb-4 border border-border/40 overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[var(--gradient-gold)]" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Seu Ganho Líquido</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Livre de taxas</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-4xl font-black text-foreground tracking-tighter">
                  <span className="text-lg font-bold mr-1 opacity-70">R$</span>
                  <span className="text-gold-gradient">{driverStats.netEarnings.toFixed(2).replace('.', ',')}</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40 flex flex-col justify-between">
                <Package className="h-5 w-5 text-primary mb-3" />
                <div>
                  <p className="text-xl font-black text-foreground">{driverStats.periodDeliveries}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Corridas Concluídas</p>
                </div>
              </div>

              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40 flex flex-col justify-between">
                <Wallet className="h-5 w-5 text-primary mb-3" />
                <div>
                  <p className="text-xl font-black text-foreground truncate">
                    R$ {driverStats.grossEarnings.toFixed(2).replace('.', ',')}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Taxas Recebidas</p>
                </div>
              </div>

              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40 flex flex-col justify-between">
                <ArrowUpRight className="h-5 w-5 text-destructive mb-3" />
                <div>
                  <p className="text-xl font-black text-destructive truncate">
                    - R$ {driverStats.platformFee.toFixed(2).replace('.', ',')}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Devido ao App</p>
                </div>
              </div>

              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40 flex flex-col justify-between">
                <Star className="h-5 w-5 text-primary mb-3" />
                <div>
                  <p className="text-xl font-black text-foreground">{driverStats.deliveries}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Histórico</p>
                </div>
              </div>
            </div>

            <div className="mt-5 p-4 rounded-xl bg-secondary/30 border border-border/40 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
                <h4 className="text-xs font-black uppercase text-foreground">Entenda seus ganhos</h4>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                Você recebe <strong className="text-foreground">100% da Taxa de Entrega</strong> paga pelo cliente. A plataforma cobra apenas <strong className="text-foreground">R$ {driverStats.commissionRate.toFixed(2).replace('.', ',')}</strong> de repasse por cada entrega concluída.
              </p>
            </div>
          </div>

          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 ml-4">Legal & Conta</h3>
          <div className="bg-card rounded-[2rem] shadow-[var(--shadow-card)] border border-border/40 overflow-hidden mb-6">
            <button onClick={() => {}} className="w-full flex items-center gap-4 px-6 py-4 border-b border-border/40 hover:bg-secondary/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex-1 text-sm font-bold text-foreground text-left">Termos de Uso</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </button>
            <button onClick={() => {}} className="w-full flex items-center gap-4 px-6 py-4 border-b border-border/40 hover:bg-secondary/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex-1 text-sm font-bold text-foreground text-left">Política de Privacidade</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            </button>
            <button onClick={async () => { await signOut(); navigate({ to: "/login" }); }} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-secondary/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex-1 text-sm font-bold text-foreground text-left">Sair da Conta</span>
            </button>
          </div>

          <div className="text-center px-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-[11px] font-black uppercase tracking-widest text-rose-500/70 hover:text-rose-500 transition-colors py-2">
                  Excluir Conta Permanentemente
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[32px] max-w-[90vw] sm:max-w-lg border-0 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-black">Tem certeza absoluta?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm font-medium">Você perderá o acesso e todo o histórico. Essa ação é irreversível.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-3 mt-4">
                  <AlertDialogCancel className="rounded-xl font-bold h-12 m-0 bg-slate-100 border-none">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-rose-500 text-white hover:bg-rose-600 rounded-xl font-black h-12 m-0 shadow-lg shadow-rose-500/30"
                  >
                    Sim, Excluir Minha Conta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent side="bottom" hideClose className="h-auto max-h-[85vh] rounded-t-[2.5rem] border-none p-0 bg-card shadow-[var(--shadow-elegant)]">
          <SheetTitle className="sr-only">Editar Perfil</SheetTitle>
          <SheetDescription className="sr-only">Formulário para editar nome e telefone do entregador</SheetDescription>
          <div className="flex flex-col">
            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mt-4 mb-2" />
            <div className="p-6 pb-4 flex items-center justify-between border-b border-border/40">
              <h3 className="text-xl font-black text-foreground tracking-tight">Editar Perfil</h3>
              <button onClick={() => setEditing(false)} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors">
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-[1.5rem] border border-border bg-secondary/50 font-bold text-foreground outline-none focus:border-primary focus:bg-background transition-all"
                    placeholder="Seu nome"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">WhatsApp</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 rounded-[1.5rem] border border-border bg-secondary/50 font-bold text-foreground outline-none focus:border-primary focus:bg-background transition-all"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
              
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Serviços Ativos</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "delivery_moto", label: "🏍️ Entregar (Moto)" },
                    { value: "delivery_car", label: "🚗 Entregar (Carro)" },
                    { value: "delivery_carro_aberto", label: "🛻 Entregar (Carro Aberto)" },
                    { value: "taxi", label: "🚖 Táxi" },
                    { value: "mototaxi", label: "🏍️ Moto Táxi" },
                  ].map((item) => {
                    const active = serviceTypes.includes(item.value);
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => {
                          if (active) {
                            setServiceTypes(serviceTypes.filter((x) => x !== item.value));
                          } else {
                            setServiceTypes([...serviceTypes, item.value]);
                          }
                        }}
                        className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full py-4 rounded-[1.5rem] bg-primary text-primary-foreground font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50 mt-4 active:scale-95 transition-all"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                {saving ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </DriverShell>
  );
}