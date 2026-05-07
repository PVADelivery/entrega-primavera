import { cn } from "@/lib/utils";

const labels: Record<string, { text: string; cls: string }> = {
  pending: { text: "Disponível", cls: "bg-primary/15 text-primary" },
  broadcasted: { text: "Divulgada", cls: "bg-primary/15 text-primary" },
  accepted: { text: "Aceita", cls: "bg-blue-500/15 text-blue-600" },
  collecting: { text: "Coletando", cls: "bg-amber-500/15 text-amber-600" },
  in_transit: { text: "Em rota", cls: "bg-amber-500/15 text-amber-600" },
  delivered: { text: "Entregue", cls: "bg-emerald-500/15 text-emerald-600" },
  cancelled: { text: "Cancelada", cls: "bg-destructive/15 text-destructive" },
  returned: { text: "Devolvida", cls: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = labels[status] ?? { text: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", s.cls)}>
      {s.text}
    </span>
  );
}