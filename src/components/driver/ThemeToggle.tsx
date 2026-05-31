import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "default" | "onPrimary";
}

/**
 * Bolinha com sol/lua — alterna entre claro e escuro.
 * variant="onPrimary" usa cores invertidas para fundo amarelo.
 */
export function ThemeToggle({ className, variant = "default" }: Props) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      onClick={toggle}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-95",
        variant === "onPrimary"
          ? "border-foreground/20 bg-foreground/10 text-foreground hover:bg-foreground/15"
          : "border-border bg-card text-foreground hover:bg-secondary shadow-sm",
        className,
      )}
    >
      <Sun
        className={cn(
          "h-4 w-4 transition-all duration-300",
          isDark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100",
        )}
      />
      <Moon
        className={cn(
          "absolute h-4 w-4 transition-all duration-300",
          isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0",
        )}
      />
    </button>
  );
}