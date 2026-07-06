import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { DriverShell } from "@/components/driver/DriverShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ensureDriverRow } from "@/services/deliveries";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/driver/occurrences")({
  component: OccurrencesPage,
  head: () => ({ meta: [{ title: "Ocorrências — Primavera Delivery" }] }),
});

const TYPES = [
  { value: "motorcycle_issue", label: "Problema na moto" },
  { value: "accident", label: "Acidente" },
  { value: "robbery", label: "Assalto" },
  { value: "other", label: "Outro" },
] as const;

function OccurrencesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [type, setType] = useState<string>("motorcycle_issue");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    ensureDriverRow(user.id).then(setDriverId).catch(() => {});
  }, [user]);

  const list = useQuery({
    queryKey: ["occurrences", driverId],
    queryFn: async () => {
      if (!driverId) return [];
      const { data, error } = await supabase
        .from("occurrences")
        .select("*")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!driverId,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!driverId || !description.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("occurrences").insert({
        driver_id: driverId,
        type: type as "motorcycle_issue" | "accident" | "robbery" | "other",
        description: description.trim(),
      });
      if (error) throw error;
      toast.success("Ocorrência registrada");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["occurrences"] });
    } catch {
      toast.error("Falha ao registrar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell>
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-foreground">Ocorrências</h1>
        <p className="mt-1 text-sm text-muted-foreground">Registre problemas durante a entrega.</p>

        <Card className="mt-4 rounded-2xl p-4">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="desc">Descrição</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="O que aconteceu?"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Enviando..." : "Registrar ocorrência"}
            </Button>
          </form>
        </Card>

        <h2 className="mt-6 mb-2 text-sm font-semibold text-foreground">Suas ocorrências</h2>
        <div className="space-y-3">
          {!list.data?.length ? (
            <Card className="rounded-2xl p-6 text-center text-sm text-muted-foreground">
              Nenhuma ocorrência registrada.
            </Card>
          ) : (
            list.data.map((o) => (
              <Card key={o.id} className="rounded-2xl p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {TYPES.find((t) => t.value === o.type)?.label ?? o.type}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{o.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </DriverShell>
  );
}