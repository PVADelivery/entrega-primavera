import { cn } from "@/lib/utils";

const labels: Record<string, { text: string; cls: string }> = {
  pending: { text: "Disponível", cls: "bg-primary/15 text-primary border border-primary/30" },
  broadcasted: { text: "Divulgada", cls: "bg-primary/15 text-primary border border-primary/30" },
  accepted: { text: "Aceita", cls: "bg-secondary text-foreground border border-border" },
  collecting: { text: "Coletando", cls: "bg-secondary text-foreground border border-border" },
  in_route: { text: "Em rota", cls: "bg-secondary text-foreground border border-border" },
  in_transit: { text: "Em rota", cls: "bg-secondary text-foreground border border-border" },
  completed: { text: "Entregue", cls: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" },
  delivered: { text: "Entregue", cls: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30" },
  cancelled: { text: "Cancelada", cls: "bg-destructive/15 text-destructive border border-destructive/30" },
  returned: { text: "Devolvida", cls: "bg-muted text-muted-foreground border border-border" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = labels[status] ?? { text: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider", s.cls)}>
      {s.text}
    </span>
  );
}