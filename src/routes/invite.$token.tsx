import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bike } from "lucide-react";

export const Route = createFileRoute("/invite/$token")({
  component: InvitePage,
  head: () => ({ meta: [{ title: "Convite — Primavera Delivery" }] }),
});

function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const navigate = useNavigate();
  const [valid, setValid] = useState<boolean | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("invitations")
        .select("status, expires_at, email")
        .eq("token", token)
        .maybeSingle();
      if (!data || data.status === 'accepted' || (data.expires_at && new Date(data.expires_at) < new Date())) {
        setValid(false);
        return;
      }
      setRegionId(null);
      if (data.email) setEmail(data.email);
      setValid(true);
    })();
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/driver`,
          data: { full_name: name },
        },
      });
      if (error) throw error;
      const userId = data.user?.id;
      if (userId) {
        await supabase.from("user_roles").upsert({ user_id: userId, role: "driver" }, { onConflict: "user_id" });
        await supabase.from("delivery_drivers").insert({ user_id: userId, region_id: regionId });
        await supabase.from("invitations").update({ status: 'accepted' }).eq("token", token);
      }
      toast.success("Cadastro feito! Faça login para começar.");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no cadastro");
    } finally {
      setLoading(false);
    }
  }

  if (valid === null) return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  if (!valid) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="rounded-2xl p-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">Convite inválido</h1>
          <p className="mt-2 text-sm text-muted-foreground">Este convite expirou ou já foi usado.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "var(--gradient-hero)" }}>
      <Card className="w-full max-w-sm rounded-2xl p-6 shadow-[var(--shadow-elegant)]">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Bike className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Cadastro de Entregador</h1>
          <p className="mt-1 text-sm text-muted-foreground">Complete seus dados para começar.</p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando..." : "Criar conta de entregador"}
          </Button>
        </form>
      </Card>
    </div>
  );
}