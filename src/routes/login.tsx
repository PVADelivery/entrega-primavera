import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/driver/ThemeToggle";
import iconPrimavera from "@/assets/primavera-icon.png";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Entrar — RotaPro Entregador" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Bem-vindo!");
      navigate({ to: "/driver" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="mb-12 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0a0a0a] shadow-[var(--shadow-elegant)]">
            <img
              src={iconPrimavera}
              alt="Primavera Delivery"
              className="h-10 w-10 object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Primavera Delivery</h1>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Painel do Entregador
        </p>
        <h2 className="text-4xl font-bold leading-tight tracking-tight">
          Entrar na conta
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Bom te ver de novo.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-14 rounded-full border-border/60 bg-transparent px-5 text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-14 rounded-full border-border/60 bg-transparent px-5 text-base"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-14 w-full rounded-full text-base font-semibold"
          >
            {loading ? "Aguarde..." : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Acesso exclusivo para entregadores parceiros.
        </p>
      </div>
    </div>
  );
}