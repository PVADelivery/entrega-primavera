// @ts-nocheck
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Camera, Loader2, User, Phone, Wallet, TrendingUp, Package, ArrowUpRight, Star,
  AlertTriangle, FileText, ShieldCheck, LogOut, Edit3, X, ChevronRight, CheckCircle2,
  Clock, ChevronDown, BarChart3, Percent,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ensureDriverRow } from "@/services/deliveries";
import { useWorkMode, SERVICE_LABELS } from "@/hooks/useWorkMode";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export const Route = createFileRoute("/driver/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Perfil — MT 24horas express" }] }),
});

const PERIOD_OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
  { value: "custom", label: "Outro" },
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  completed: { label: "Concluida", color: "text-emerald-500" },
  delivered: { label: "Entregue", color: "text-emerald-500" },
  cancelled: { label: "Cancelada", color: "text-rose-500" },
  pending: { label: "Pendente", color: "text-amber-500" },
  accepted: { label: "Em rota", color: "text-blue-500" },
  picked_up: { label: "Em rota", color: "text-blue-500" },
};

function ProfilePage() {
  const { user, signOut } = useAuth();
  const { mode, serviceTypes: allowedServices } = useWorkMode();
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
  const [showHistory, setShowHistory] = useState(false);

  const [driverStats, setDriverStats] = useState({
    deliveries: 0, periodDeliveries: 0, periodCancelled: 0,
    rating: 0, grossEarnings: 0, platformFee: 0, netEarnings: 0,
    online: false, commissionRate: 0.75, completionRate: 100,
  });

  const [chartData, setChartData] = useState<{ day: string; gross: number; net: number }[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<string[]>(["delivery_moto"]);

  const loadProfile = async () => {
    if (!user) return;
    await ensureDriverRow(user.id);
    const [profRes, drvRes] = await Promise.all([
      supabase.from("profiles").select("*").or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle(),
      supabase.from("delivery_drivers").select("*").or(`user_id.eq.${user.id},id.eq.${user.id}`).maybeSingle(),
    ]);

    const p = profRes.data as any;
    const d = drvRes.data as any;

    setProfile(p || d);
    setFullName(p?.full_name || d?.full_name || "");
    setPhone(p?.phone || d?.phone || "");
    if (d?.service_types) setServiceTypes(d.service_types);
  };

  useEffect(() => {
    if (!user) return;
    loadProfile();

    const ch = supabase
      .channel(`driver-profile-page-sync-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => loadProfile())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` }, () => loadProfile())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_drivers", filter: `user_id=eq.${user.id}` }, () => {
        loadProfile();
        fetchDriverData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchDriverData();
  }, [user, period, customDate, mode]);

  function buildChart(rows: any[], days: number, done: string[], valKey: string, d1: string, d2: string) {
    const result: { day: string; gross: number; net: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const s = new Date(); s.setDate(s.getDate() - i); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setHours(23, 59, 59, 999);
      let g = 0;
      for (const r of rows) {
        const ts = new Date(r[d1] || r[d2]).getTime();
        if (ts >= s.getTime() && ts <= e.getTime() && done.includes(r.status)) g += Number(r[valKey] || 0);
      }
      result.push({ day: s.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""), gross: g, net: +(g * 0.75).toFixed(2) });
    }
    return result;
  }

  const fetchDriverData = async () => {
    try {
      const { data: driver } = await supabase
        .from("delivery_drivers")
        .select("id, rating, is_online, commission_rate, service_types")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!driver) return;
      if (driver.service_types) setServiceTypes(driver.service_types);

      const DONE = ["completed"];
      const cids = Array.from(new Set([driver.id, user.id].filter(Boolean)));

      let start = new Date(), end = new Date();
      start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
      if (period === "yesterday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); }
      else if (period === "week") { start.setDate(start.getDate() - start.getDay()); }
      else if (period === "month") { start.setDate(1); }
      else if (period === "custom" && customDate) {
        const [y, m, d] = customDate.split("-").map(Number);
        start = new Date(y, m - 1, d, 0, 0, 0, 0);
        end = new Date(y, m - 1, d, 23, 59, 59, 999);
      }

      let gross = 0, periodCount = 0, cancelled = 0, total = 0;

      if (mode === "delivery") {
        const { count } = await supabase.from("deliveries").select("id", { count: "exact", head: true }).in("driver_id", cids).in("status", DONE);
        total = count || 0;
        const { data: all } = await supabase.from("deliveries").select("id, value, status, completed_at, created_at").in("driver_id", cids).order("created_at", { ascending: false }).limit(300);
        setRecentDeliveries((all ?? []).slice(0, 15));
        for (const d of all ?? []) {
          const ts = new Date(d.completed_at || d.created_at).getTime();
          if (ts >= start.getTime() && ts <= end.getTime()) {
            if (DONE.includes(d.status)) { gross += (Number(d.value || 0) * 0.75); periodCount++; }
            else if (d.status === "cancelled") cancelled++;
          }
        }
        setChartData(buildChart(all ?? [], 7, DONE, "value", "completed_at", "created_at"));
      } else {
        const { count } = await supabase.from("ride_requests").select("id", { count: "exact", head: true }).eq("driver_id", driver.id).eq("status", "completed");
        total = count || 0;
        const { data: all } = await supabase.from("ride_requests").select("id, price, status, updated_at, created_at").eq("driver_id", driver.id).order("created_at", { ascending: false }).limit(300);
        setRecentDeliveries((all ?? []).slice(0, 15).map((r) => ({ ...r, value: r.price })));
        for (const r of all ?? []) {
          const ts = new Date(r.updated_at || r.created_at).getTime();
          if (ts >= start.getTime() && ts <= end.getTime()) {
            if (r.status === "completed") { gross += Number(r.price || 0); periodCount++; }
            else if (r.status === "cancelled") cancelled++;
          }
        }
        setChartData(buildChart(all ?? [], 7, ["completed"], "price", "updated_at", "created_at"));
      }

      const tot = periodCount + cancelled;
      setDriverStats({
        deliveries: total, periodDeliveries: periodCount, periodCancelled: cancelled,
        rating: driver.rating || 5.0,
        grossEarnings: gross, platformFee: gross * 0.25, netEarnings: gross * 0.75,
        online: driver.is_online || false,
        commissionRate: driver.commission_rate != null ? Number(driver.commission_rate) : 0.75,
        completionRate: tot > 0 ? Math.round((periodCount / tot) * 100) : 100,
      });
    } catch (e) { console.error("[fetchDriverData]", e); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .or(`user_id.eq.${user.id},id.eq.${user.id}`);
      
      if (profileError) {
        console.warn("[uploadAvatar] Aviso ao atualizar profiles:", profileError.message);
      }

      setProfile((prev: any) => ({ ...prev, avatar_url: publicUrl }));
      toast.success("Foto atualizada com sucesso!");
    } catch (err: any) { 
      console.error("[handleAvatarUpload] Erro:", err);
      toast.error("Erro no upload: " + (err.message || "Permissão negada")); 
    }
    finally { setUploading(false); }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase.from("profiles").upsert({ user_id: user.id, full_name: fullName.trim(), phone }, { onConflict: "user_id" });
      await supabase.from("delivery_drivers").update({ service_types: serviceTypes }).eq("user_id", user.id);
      setProfile({ ...profile, full_name: fullName.trim(), phone });
      toast.success("Perfil atualizado!");
      setEditing(false);
    } catch (err: any) { toast.error("Erro: " + err.message); }
    finally { setSaving(false); }
  };

  const displayName = profile?.full_name?.split(" ")[0] || "Entregador";
  const initial = displayName.charAt(0).toUpperCase();

  async function handleDeleteAccount() {
    if (!user) return;
    toast.success("Solicitacao enviada. A conta sera removida pelo administrador.");
    await signOut(); navigate({ to: "/login" });
  }

  return (
    <DriverShell>
      <div className="min-h-screen pb-28 bg-background">
        {/* HERO */}
        <div className="relative bg-zinc-900 -mx-4 -mt-4 rounded-b-[2.5rem] shadow-[var(--shadow-elegant)] overflow-hidden pb-8">
          <div className="absolute inset-0 bg-[var(--gradient-hero)] opacity-50" />
          <div className="relative z-10 px-6 pt-12">
            <div className="flex items-center justify-between mb-8">
              <h1 className="text-xl font-black text-white tracking-tight">Meu Perfil</h1>
              <button onClick={() => setEditing(true)} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-all text-xs font-bold">
                <Edit3 className="h-3.5 w-3.5" /> Editar
              </button>
            </div>
            <div className="flex items-center gap-5">
              <div className="relative">
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="w-20 h-20 rounded-full border-4 border-zinc-800 shadow-2xl bg-zinc-800 overflow-hidden relative group">
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} className="w-full h-full object-cover" alt="Avatar" />
                    : <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}><span className="text-3xl font-black text-white">{initial}</span></div>}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                  </div>
                </button>
                <input ref={fileInputRef} type="file" capture="environment" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <div className={cn("absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-zinc-900 flex items-center justify-center", driverStats.online ? "bg-emerald-500" : "bg-zinc-500")}>
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
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{driverStats.online ? "Online Agora" : "Offline"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 -mt-6 relative z-20 space-y-4">
          {/* CATEGORIAS */}
          <div className="bg-card rounded-[2rem] p-5 shadow-[var(--shadow-card)] border border-border/40">
            <h3 className="text-sm font-black text-foreground uppercase tracking-widest mb-3">Minhas Categorias</h3>
            <div className="flex flex-wrap gap-2">
              {(allowedServices?.length ? allowedServices : ["delivery_moto"]).map((s) => (
                <span key={s} className="px-3 py-1.5 rounded-full border border-primary/40 bg-primary/10 text-primary text-[11px] font-bold">{SERVICE_LABELS[s] ?? s}</span>
              ))}
            </div>
            <p className="mt-3 text-[11px] font-medium text-muted-foreground">
              Modo atual: <strong className="text-foreground">{mode === "ride" ? "Corridas (Passageiros)" : "Entregas (Lojas)"}</strong>
            </p>
          </div>

          {/* FINANCEIRO */}
          <div className="bg-card rounded-[2rem] p-5 shadow-[var(--shadow-card)] border border-border/40">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border/40">
              <h3 className="text-sm font-black text-foreground uppercase tracking-widest flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                {mode === "ride" ? "Financeiro Corridas" : "Financeiro Entregas"}
              </h3>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="bg-secondary/50 border-none text-muted-foreground text-xs font-bold rounded-xl px-3 py-1.5 outline-none cursor-pointer focus:ring-1 focus:ring-primary">
                {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {period === "custom" && (
              <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
                className="w-full bg-secondary/50 rounded-xl px-4 py-3 text-sm font-bold text-foreground mb-4 outline-none border border-border/40" />
            )}

            {/* GANHO LIQUIDO */}
            <div className="relative rounded-2xl p-5 mb-4 border border-border/40 overflow-hidden">
              <div className="absolute inset-0 opacity-10 bg-[var(--gradient-gold)]" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Seu Ganho Liquido</p>
                    <p className="text-[11px] font-medium text-muted-foreground">Livre de taxas da central</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary"><TrendingUp className="h-4 w-4" /></div>
                </div>
                <p className="text-4xl font-black text-foreground tracking-tighter mb-5">
                  <span className="text-lg font-bold mr-1 opacity-70">R$</span>
                  <span>{fmtBRL(driverStats.netEarnings)}</span>
                </p>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                    <span>Bruto: R$ {fmtBRL(driverStats.grossEarnings)}</span>
                    <span>Central: R$ {fmtBRL(driverStats.platformFee)}</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-secondary/70 overflow-hidden flex">
                    <div className="h-full rounded-l-full bg-primary" style={{ width: "75%" }} />
                    <div className="h-full rounded-r-full bg-rose-500/60" style={{ width: "25%" }} />
                  </div>
                  <div className="flex justify-between text-[10px] font-black">
                    <span className="text-primary">75% seu</span>
                    <span className="text-rose-500">25% central</span>
                  </div>
                </div>
              </div>
            </div>

            {/* KPIS 2x2 */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40">
                <Package className="h-5 w-5 text-primary mb-3" />
                <p className="text-xl font-black text-foreground">{driverStats.periodDeliveries}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{mode === "ride" ? "Corridas Concluidas" : "Entregas Concluidas"}</p>
              </div>
              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40">
                <Wallet className="h-5 w-5 text-primary mb-3" />
                <p className="text-xl font-black text-foreground truncate">R$ {fmtBRL(driverStats.grossEarnings)}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Valor Bruto Recebido</p>
              </div>
              <div className="bg-rose-500/10 rounded-2xl p-4 border border-rose-500/20">
                <ArrowUpRight className="h-5 w-5 text-rose-500 mb-3" />
                <p className="text-xl font-black text-rose-500 truncate">- R$ {fmtBRL(driverStats.platformFee)}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-0.5">Devido a Central</p>
              </div>
              <div className="bg-emerald-500/10 rounded-2xl p-4 border border-emerald-500/20">
                <Percent className="h-5 w-5 text-emerald-500 mb-3" />
                <p className="text-xl font-black text-emerald-500">{driverStats.completionRate}%</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">Taxa de Conclusao</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40">
                <Star className="h-5 w-5 text-amber-400 mb-3" />
                <p className="text-xl font-black text-foreground">{driverStats.deliveries}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">Total Historico</p>
              </div>
              <div className="bg-secondary/30 rounded-2xl p-4 border border-border/40">
                <Clock className="h-5 w-5 text-muted-foreground mb-3" />
                <p className="text-xl font-black text-foreground">{driverStats.periodCancelled}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">Cancelamentos</p>
              </div>
            </div>

            {/* GRAFICO */}
            <div className="mb-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5" /> Ganhos - Ultimos 7 Dias
              </p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={14} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fontWeight: 700, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 11, fontWeight: 700 }}
                      formatter={(v: number, name: string) => [`R$ ${fmtBRL(v)}`, name === "gross" ? "Bruto" : "Liquido (75%)"]}
                      cursor={{ fill: "hsl(var(--secondary))", radius: 4 }}
                    />
                    <Bar dataKey="gross" radius={[5, 5, 0, 0]} fill="hsl(var(--primary) / 0.2)" />
                    <Bar dataKey="net" radius={[5, 5, 0, 0]}>
                      {chartData.map((e, i) => <Cell key={i} fill={e.net > 0 ? "hsl(var(--primary))" : "hsl(var(--border))"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-5 mt-2 justify-center">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-primary/20" /><span className="text-[10px] font-bold text-muted-foreground">Bruto</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-primary" /><span className="text-[10px] font-bold text-muted-foreground">Liquido (75%)</span></div>
              </div>
            </div>

            {/* HISTORICO */}
            <button onClick={() => setShowHistory((v) => !v)} className="w-full flex items-center justify-between py-3 px-4 rounded-2xl bg-secondary/30 border border-border/40 text-sm font-bold text-foreground hover:bg-secondary/50 transition-colors">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Historico Recente</span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", showHistory && "rotate-180")} />
            </button>
            {showHistory && (
              <div className="mt-3 space-y-2">
                {recentDeliveries.length === 0
                  ? <p className="text-center text-[11px] text-muted-foreground py-4">Nenhuma entrega encontrada.</p>
                  : recentDeliveries.map((d, i) => {
                    const st = STATUS_MAP[d.status] ?? { label: d.status, color: "text-muted-foreground" };
                    const val = Number(d.value || d.price || 0);
                    return (
                      <div key={d.id ?? i} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/20 border border-border/30">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-primary" /></div>
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-[10px] font-black uppercase tracking-wide", st.color)}>{st.label}</span>
                          <p className="text-[11px] text-muted-foreground truncate">{fmtDate(d.completed_at || d.updated_at || d.created_at)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-foreground">R$ {fmtBRL(val * 0.75)}</p>
                          <p className="text-[10px] text-muted-foreground">bruto R$ {fmtBRL(val)}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* INFO */}
            <div className="mt-4 p-4 rounded-xl bg-secondary/30 border border-border/40">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-primary shrink-0" />
                <h4 className="text-xs font-black uppercase text-foreground">Entenda seus ganhos</h4>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                Voce recebe <strong className="text-foreground">75% dos valores das entregas</strong> e repassa <strong className="text-foreground">25%</strong> para a central sobre o total das entregas concluidas.
              </p>
            </div>
          </div>

          {/* LEGAL */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 ml-4">Legal e Conta</h3>
            <div className="bg-card rounded-[2rem] shadow-[var(--shadow-card)] border border-border/40 overflow-hidden mb-6">
              <button onClick={() => {}} className="w-full flex items-center gap-4 px-6 py-4 border-b border-border/40 hover:bg-secondary/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><FileText className="h-4 w-4 text-muted-foreground" /></div>
                <span className="flex-1 text-sm font-bold text-foreground text-left">Termos de Uso</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </button>
              <button onClick={() => {}} className="w-full flex items-center gap-4 px-6 py-4 border-b border-border/40 hover:bg-secondary/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><ShieldCheck className="h-4 w-4 text-muted-foreground" /></div>
                <span className="flex-1 text-sm font-bold text-foreground text-left">Politica de Privacidade</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </button>
              <button onClick={async () => { await signOut(); navigate({ to: "/login" }); }} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-secondary/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0"><LogOut className="h-4 w-4 text-muted-foreground" /></div>
                <span className="flex-1 text-sm font-bold text-foreground text-left">Sair da Conta</span>
              </button>
            </div>
          </div>

          <div className="text-center px-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-[11px] font-black uppercase tracking-widest text-rose-500/70 hover:text-rose-500 transition-colors py-2">Excluir Conta Permanentemente</button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[32px] max-w-[90vw] sm:max-w-lg border-0 shadow-2xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-xl font-black">Tem certeza absoluta?</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm font-medium">Voce perdera o acesso e todo o historico. Essa acao e irreversivel.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col gap-3 mt-4">
                  <AlertDialogCancel className="rounded-xl font-bold h-12 m-0 bg-slate-100 border-none">Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount} className="bg-rose-500 text-white hover:bg-rose-600 rounded-xl font-black h-12 m-0 shadow-lg shadow-rose-500/30">Sim, Excluir Minha Conta</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* SHEET */}
        <Sheet open={editing} onOpenChange={setEditing}>
          <SheetContent side="bottom" hideClose className="h-auto max-h-[85vh] rounded-t-[2.5rem] border-none p-0 bg-card shadow-[var(--shadow-elegant)]">
            <SheetTitle className="sr-only">Editar Perfil</SheetTitle>
            <SheetDescription className="sr-only">Formulario para editar nome e telefone do entregador</SheetDescription>
            <div className="flex flex-col">
              <div className="w-12 h-1.5 bg-muted rounded-full mx-auto mt-4 mb-2" />
              <div className="p-6 pb-4 flex items-center justify-between border-b border-border/40">
                <h3 className="text-xl font-black text-foreground tracking-tight">Editar Perfil</h3>
                <button onClick={() => setEditing(false)} className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="p-6 space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Nome Completo</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full pl-12 pr-4 py-3.5 rounded-[1.5rem] border border-border bg-secondary/50 font-bold text-foreground outline-none focus:border-primary focus:bg-background transition-all" placeholder="Seu nome" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">WhatsApp</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full pl-12 pr-4 py-3.5 rounded-[1.5rem] border border-border bg-secondary/50 font-bold text-foreground outline-none focus:border-primary focus:bg-background transition-all" placeholder="(00) 00000-0000" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-2">Servicos Ativos</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "delivery_moto", label: "Entregas de Lojas (Moto)" },
                      { value: "delivery_car", label: "Entregas de Lojas (Carro)" },
                      { value: "delivery_carro_aberto", label: "Frete (Carro Aberto)" },
                      { value: "taxi", label: "Transporte de Passageiros (Taxi)" },
                      { value: "mototaxi", label: "Transporte de Passageiros (Moto Taxi)" },
                    ].map((item) => {
                      const safe = Array.isArray(serviceTypes) ? serviceTypes : [];
                      const active = safe.includes(item.value);
                      return (
                        <button key={item.value} type="button"
                          onClick={() => setServiceTypes(active ? safe.filter((x) => x !== item.value) : [...safe, item.value])}
                          className={`p-3 rounded-2xl border text-left text-xs font-bold transition-all ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50"}`}>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button onClick={handleSave} disabled={saving} className="w-full py-4 rounded-[1.5rem] bg-primary text-primary-foreground font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-primary/25 disabled:opacity-50 mt-4 active:scale-95 transition-all">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  {saving ? "Salvando..." : "Salvar Alteracoes"}
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </DriverShell>
  );
}
