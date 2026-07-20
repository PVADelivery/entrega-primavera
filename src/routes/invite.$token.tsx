// @ts-nocheck
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, User, Mail, Lock, Phone, Truck, Eye, EyeOff, Bike, Car, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Cadastro de Entregador — MT Express" }] }),
});

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    document: "",
    vehicle: "moto",
    licensePlate: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError("Token não fornecido");
        setValidating(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("invitations")
          .select("status, expires_at, email")
          .eq("token", token)
          .maybeSingle();

        if (fetchError) throw new Error(fetchError.message);

        if (!data || data.status === 'accepted') {
          setError("Este link de convite é inválido ou já foi utilizado.");
        } else {
          const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
          if (expiresAt && expiresAt < new Date()) {
            setError("Este link de convite expirou.");
          } else {
            if (data.email) {
              setFormData(prev => ({ ...prev, email: data.email }));
            }
          }
        }
      } catch (err: any) {
        console.error("Erro na validação:", err);
        setError("Erro ao validar convite: " + err.message);
      } finally {
        setValidating(false);
      }
    };

    validateToken();
  }, [token]);

  const handleSubmit = async (e?: FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    
    if (step < 2) {
      nextStep();
      return;
    }

    if (loading) return;
    
    setLoading(true);
    setFormError(null);
    if (formData.password !== formData.confirmPassword) {
      setFormError("As senhas não coincidem.");
      toast.error("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    try {
      // Use accept-invitation Edge Function to ensure correct creation (bypassing RLS)
      const { data: result, error: invokeError } = await supabase.functions.invoke("accept-invitation", {
        body: {
          token,
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          phone: formData.phone,
          document: formData.document,
          // We pass vehicle and licensePlate in case the backend uses them
          vehicle: formData.vehicle,
          license_plate: formData.licensePlate.toUpperCase(),
        },
      });

      if (invokeError) throw invokeError;
      if (result?.error) throw new Error(result.error);

      // Log in the user locally
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });
      if (signInError) throw signInError;

      // Update vehicle data via authenticated client since the edge function might have created an empty row
      if (signInData.user) {
        try {
           await supabase.from("delivery_drivers").update({ 
             full_name: formData.fullName,
             phone: formData.phone,
             vehicle: formData.vehicle, 
             license_plate: formData.licensePlate.toUpperCase() 
           } as any).eq("user_id", signInData.user.id);
        } catch (drvErr) {
           console.error("Erro ao salvar dados do veiculo:", drvErr);
        }
      }

      toast.success("Bem-vindo à equipe! Cadastro finalizado com sucesso.");
      
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 2000);

    } catch (err: any) {
      console.error("Erro no cadastro:", err);
      const errorMessage = err.message || "Erro ao realizar cadastro. Tente novamente.";
      setFormError(errorMessage);
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  const steps = ["Credenciais", "Dados Pessoais", "Veículo"];

  const nextStep = () => {
    if (step === 0 && (!formData.email || formData.password.length < 6 || formData.password !== formData.confirmPassword)) {
      toast.error("Preencha o email e uma senha válida de pelo menos 6 caracteres.");
      return;
    }
    if (step === 1 && (!formData.fullName || !formData.phone || !formData.document)) {
      toast.error("Preencha todos os seus dados pessoais.");
      return;
    }
    setStep(s => Math.min(s + 1, 2));
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 rounded-full blur-xl bg-primary/20 animate-pulse" />
            <div className="h-16 w-16 bg-slate-900 border border-white/10 rounded-2xl flex items-center justify-center relative z-10 shadow-2xl">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-400 tracking-[0.2em] uppercase">Validando Convite</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.15),transparent_50%)]" />
        <Card className="w-full max-w-md border-destructive/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl z-10">
          <CardHeader className="text-center pt-10">
            <div className="mx-auto w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6 shadow-inner ring-1 ring-destructive/20">
              <AlertCircle className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle className="text-3xl font-black text-white">Convite Inválido</CardTitle>
            <CardDescription className="text-slate-400 text-base mt-3 leading-relaxed">{error}</CardDescription>
          </CardHeader>
          <CardContent className="pb-10">
            <Button className="w-full h-14 rounded-2xl text-base font-bold transition-all hover:scale-[1.02]" variant="secondary" onClick={() => navigate({ to: "/login" })}>
              Voltar para o Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 py-12 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_70%)]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
      
      <Card className="w-full max-w-xl border-white/10 bg-slate-900/60 backdrop-blur-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] relative z-10 rounded-3xl overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 via-primary to-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
        
        <CardHeader className="text-center pb-6 pt-12 px-8">
          <div className="mx-auto w-24 h-24 rounded-[2rem] bg-gradient-to-br from-primary/20 to-blue-500/10 flex items-center justify-center mb-6 shadow-inner ring-1 ring-white/10 relative group">
            <div className="absolute inset-0 rounded-[2rem] bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <ShieldCheck className="h-12 w-12 text-primary relative z-10" />
          </div>
          <CardTitle className="text-4xl font-black tracking-tight text-white mb-3">Bem-vindo à Equipe!</CardTitle>
          <CardDescription className="text-slate-400 text-base font-medium">
            Complete seu cadastro para começar a faturar.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-8 pb-12">
          
          {/* Progress Steps */}
          <div className="flex items-center gap-3 mb-10">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3 flex-1">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black transition-all duration-500 ${i <= step ? "bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-110" : "bg-white/5 text-slate-500 border border-white/5"}`}>
                  {i + 1}
                </div>
                <span className={`text-[10px] font-black uppercase tracking-[0.15em] hidden sm:block transition-colors duration-300 ${i <= step ? "text-white" : "text-slate-600"}`}>
                  {s}
                </span>
                {i < steps.length - 1 && <div className={`flex-1 h-1 rounded-full transition-colors duration-500 ${i < step ? "bg-primary shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-white/5"}`} />}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{formError}</p>
              </div>
            )}

            <div className="min-h-[220px]">
              {step === 0 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-500 fill-mode-forwards">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">E-mail de Acesso</Label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                      <Input 
                        type="email"
                        className="pl-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600" 
                        placeholder="seu@email.com"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">Criar Senha</Label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                        <Input 
                          type={showPassword ? "text" : "password"}
                          className="pl-12 pr-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600" 
                          placeholder="••••••••"
                          value={formData.password}
                          onChange={e => setFormData({...formData, password: e.target.value})}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }}
                          required
                          minLength={6}
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">Confirmar Senha</Label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                        <Input 
                          type={showConfirmPassword ? "text" : "password"}
                          className="pl-12 pr-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600" 
                          placeholder="••••••••"
                          value={formData.confirmPassword}
                          onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }}
                          required
                          minLength={6}
                        />
                        <button 
                          type="button" 
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                        >
                          {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-500 fill-mode-forwards">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">Nome Completo</Label>
                    <div className="relative group">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                      <Input 
                        className="pl-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600" 
                        placeholder="João da Silva"
                        value={formData.fullName}
                        onChange={e => setFormData({...formData, fullName: e.target.value})}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">Telefone</Label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                        <Input 
                          className="pl-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600" 
                          placeholder="(00) 90000-0000"
                          value={formData.phone}
                          onChange={e => setFormData({...formData, phone: e.target.value})}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">CPF</Label>
                      <div className="relative group">
                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                        <Input 
                          className="pl-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600" 
                          placeholder="000.000.000-00"
                          value={formData.document}
                          onChange={e => setFormData({...formData, document: e.target.value})}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); nextStep(); } }}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-8 duration-500 fill-mode-forwards">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">Tipo de Veículo</Label>
                    <Select value={formData.vehicle} onValueChange={(v) => setFormData({...formData, vehicle: v})}>
                      <SelectTrigger className="h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base focus:bg-black/60 focus:ring-1 focus:ring-primary/50 transition-all px-4">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-white/10 text-white rounded-xl shadow-2xl">
                        <SelectItem value="moto" className="focus:bg-white/10 py-3 cursor-pointer"><div className="flex items-center gap-3"><Bike className="h-4 w-4 text-primary" /> <span>Moto</span></div></SelectItem>
                        <SelectItem value="bicicleta" className="focus:bg-white/10 py-3 cursor-pointer"><div className="flex items-center gap-3"><Bike className="h-4 w-4 text-emerald-500" /> <span>Bicicleta</span></div></SelectItem>
                        <SelectItem value="carro" className="focus:bg-white/10 py-3 cursor-pointer"><div className="flex items-center gap-3"><Car className="h-4 w-4 text-amber-500" /> <span>Carro</span></div></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 ml-1">Placa do Veículo (Opcional)</Label>
                    <div className="relative group">
                      <Truck className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-primary transition-colors" />
                      <Input 
                        className="pl-12 h-14 rounded-2xl bg-black/40 border-white/5 text-white text-base font-mono uppercase focus:bg-black/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-slate-600 placeholder:normal-case" 
                        placeholder="Ex: ABC-1234"
                        value={formData.licensePlate}
                        onChange={e => setFormData({...formData, licensePlate: e.target.value})}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 pt-4 mt-2">
              {step > 0 && (
                <Button 
                  type="button" 
                  variant="outline" 
                  className="h-14 px-6 rounded-2xl font-bold bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white transition-all" 
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft className="h-5 w-5 mr-2" /> Voltar
                </Button>
              )}
              
              {step < 2 ? (
                <Button 
                  key="btn-next"
                  type="button" 
                  className="flex-1 h-14 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all bg-primary hover:bg-primary/90 text-white" 
                  onClick={nextStep}
                >
                  Continuar <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              ) : (
                <Button 
                  key="btn-submit"
                  type="button" 
                  onClick={handleSubmit}
                  className="flex-1 h-14 rounded-2xl font-black shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] hover:scale-[1.02] active:scale-[0.98] transition-all bg-primary hover:bg-primary/90 text-white relative overflow-hidden group" 
                  disabled={loading}
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                  {loading ? (
                    <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processando...</>
                  ) : (
                    <><CheckCircle2 className="h-5 w-5 mr-2" /> Finalizar Cadastro</>
                  )}
                </Button>
              )}
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  );
}