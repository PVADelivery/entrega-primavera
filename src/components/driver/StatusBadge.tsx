import { cn } from "@/lib/utils";

const labels: Record<string, { text: string; cls: string }> = {
  pending: { text: "Disponível", cls: "bg-primary text-primary-foreground" },
  broadcasted: { text: "Divulgada", cls: "bg-primary text-primary-foreground" },
  accepted: { text: "Aceita", cls: "bg-primary/20 text-foreground border border-primary/40" },
  collecting: { text: "Coletando", cls: "bg-primary/20 text-foreground border border-primary/40" },
  in_route: { text: "Em rota", cls: "bg-primary/20 text-foreground border border-primary/40" },
  completed: { text: "Entregue", cls: "bg-secondary text-foreground" },
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