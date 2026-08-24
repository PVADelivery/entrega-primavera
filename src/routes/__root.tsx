import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { WorkModeProvider } from "@/hooks/useWorkMode";
import { Toaster } from "@/components/ui/sonner";
import { PermissionModal } from "@/components/driver/PermissionModal";

import { initializeGlobalErrorHandlers, reportErrorToTelegram } from "@/services/logger";
import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Route Error:", error);
  const router = useRouter();

  useEffect(() => {
    reportErrorToTelegram({
      error_message: error?.message || "Erro na rota",
      stack_trace: error?.stack || "",
      url: typeof window !== "undefined" ? window.location.href : "",
    }, "App Entregador");
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
          ⚠️
        </div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Ops! Algo deu errado ao carregar esta tela.
        </h1>
        <p className="text-xs text-muted-foreground">
          Sua conexão oscilou ou uma nova versão foi implantada.
        </p>
        {error?.message && (
          <div className="p-3 bg-muted/60 text-xs text-left font-mono rounded-xl border border-border/60 text-destructive overflow-auto max-h-36">
            {error.message}
          </div>
        )}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                router.invalidate();
                reset();
              }
            }}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider hover:opacity-90 transition-all cursor-pointer shadow-md"
          >
            Recarregar Aplicativo
          </button>
          <a
            href="/driver"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-border bg-card text-foreground font-bold text-xs uppercase tracking-wider hover:bg-accent transition-all text-center"
          >
            Ir para Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "google", content: "notranslate" },
      { title: "Lovable App" },
      { name: "description", content: "Entrega-Primavera is a mobile app for delivery drivers to manage their tasks and deliveries." },
      { name: "author", content: "MT 24horas express" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Entrega-Primavera is a mobile app for delivery drivers to manage their tasks and deliveries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lovable App" },
      { name: "twitter:description", content: "Entrega-Primavera is a mobile app for delivery drivers to manage their tasks and deliveries." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a1d8c26f-9513-4266-9a14-53adc5cf11bb/id-preview-98b6acab--a722d62f-5560-40b7-81d1-64762ca79ce4.lovable.app-1780187530199.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a1d8c26f-9513-4266-9a14-53adc5cf11bb/id-preview-98b6acab--a722d62f-5560-40b7-81d1-64762ca79ce4.lovable.app-1780187530199.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon-v3.png" },
      { rel: "apple-touch-icon", href: "/favicon-v3.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="notranslate" translate="no" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <HeadContent />
      </head>
      <body className="notranslate" translate="no" suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    initializeGlobalErrorHandlers("App Entregador");
    if (typeof window !== "undefined" && (window.location.hostname.includes("lovable.app") || window.location.hostname.includes("lovableproject.com"))) {
      window.location.replace(`https://entregador.mt24horasexpress.com${window.location.pathname}${window.location.search}`);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <WorkModeProvider>
            <PermissionModal />
            <Outlet />
            <Toaster position="top-center" richColors />
          </WorkModeProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
