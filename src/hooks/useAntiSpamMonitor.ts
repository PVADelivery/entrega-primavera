import { useEffect, useRef, useCallback } from "react";
import { reportSpamToTelegram } from "@/services/logger";

interface AntiSpamConfig {
  appName?: string;
  maxClicksPerSecond?: number;
  maxRouteChangesPerMinute?: number;
  enableInjectionDetection?: boolean;
  enableScrapingDetection?: boolean;
}

export function useAntiSpamMonitor(config: AntiSpamConfig = {}) {
  const {
    appName = "App Entregador",
    maxClicksPerSecond = 35,
    maxRouteChangesPerMinute = 60,
    enableInjectionDetection = true,
    enableScrapingDetection = true,
  } = config;

  const clicksRef = useRef<number[]>([]);
  const untrustedClicksRef = useRef<number[]>([]);
  const routeChangesRef = useRef<number[]>([]);
  const lastPathRef = useRef<string>(typeof window !== "undefined" ? window.location.pathname : "");
  const copyRef = useRef<number[]>([]);
  const lastReportedTimeRef = useRef<Record<string, number>>({});

  const throttledReport = useCallback((type: string, reason: string, details: Record<string, unknown>) => {
    const now = Date.now();
    const last = lastReportedTimeRef.current[type] || 0;
    // Cooldown de 90 segundos por tipo de alerta para não saturar logs
    if (now - last < 90000) return;
    lastReportedTimeRef.current[type] = now;

    reportSpamToTelegram(reason, details, appName);
  }, [appName]);

  // 1. Monitorar Autoclickers e Scripts Injetores
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleClick = (e: MouseEvent) => {
      const now = Date.now();

      // Caso 1: Cliques sintéticos / não confiáveis (injetados via script/console sem evento físico de hardware)
      if (e.isTrusted === false) {
        untrustedClicksRef.current = untrustedClicksRef.current.filter((t) => now - t < 1000);
        untrustedClicksRef.current.push(now);

        if (untrustedClicksRef.current.length >= 10) {
          throttledReport("untrusted_clicks", "Autoclicker / Script Injetor Detectado (Cliques Sintéticos)", {
            clicksInLastSecond: untrustedClicksRef.current.length,
            targetTag: (e.target as HTMLElement)?.tagName || "Unknown",
            className: (e.target as HTMLElement)?.className?.toString()?.slice(0, 80) || "",
            isTrusted: false,
          });
          untrustedClicksRef.current = [];
        }
        return;
      }

      // Caso 2: Cliques confiáveis de hardware (dedo no celular / mouse)
      // Ignora toques em divs/background sem elementos interativos que decorrem de scroll rápido ou pinch-to-zoom
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toUpperCase() || "";
      const isContainer = (tag === "DIV" || tag === "MAIN" || tag === "BODY" || tag === "HTML") && !target?.onclick && !target?.getAttribute("role");

      // Se for apenas toque na tela/background durante rolagem ou gesto, tolera margem maior
      const threshold = isContainer ? maxClicksPerSecond * 1.5 : maxClicksPerSecond;

      clicksRef.current = clicksRef.current.filter((t) => now - t < 1000);
      clicksRef.current.push(now);

      if (clicksRef.current.length >= threshold) {
        throttledReport("clicks", "Autoclicker / Flood Extremo de Cliques Detectado", {
          clicksInLastSecond: clicksRef.current.length,
          targetTag: tag || "Unknown",
          className: target?.className?.toString()?.slice(0, 80) || "",
          x: e.clientX,
          y: e.clientY,
        });
        clicksRef.current = [];
      }
    };

    window.addEventListener("click", handleClick, true);
    return () => window.removeEventListener("click", handleClick, true);
  }, [maxClicksPerSecond, throttledReport]);

  // 2. Monitorar Injeção de Código Malicioso (XSS / SQLi) em Inputs
  useEffect(() => {
    if (!enableInjectionDetection || typeof document === "undefined") return;

    const handleInput = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (!target || typeof target.value !== "string") return;

      const value = target.value;
      const suspiciousPattern = /(<script.*?>.*?<\/script>|javascript:|UNION\s+SELECT|DROP\s+TABLE|INSERT\s+INTO|DELETE\s+FROM|--\s*$|<iframe.*?>)/i;

      if (suspiciousPattern.test(value)) {
        throttledReport("injection", "Tentativa de Injeção de Código (XSS/SQLi) em Input", {
          fieldName: target.name || target.id || target.tagName,
          sampleValue: value.slice(0, 100),
          url: window.location.href,
        });
      }
    };

    document.addEventListener("change", handleInput, true);
    return () => document.removeEventListener("change", handleInput, true);
  }, [enableInjectionDetection, throttledReport]);

  // 3. Monitorar Scraping em Massa
  useEffect(() => {
    if (!enableScrapingDetection || typeof document === "undefined") return;

    const handleCopy = () => {
      const selection = window.getSelection()?.toString() || "";
      // Somente textos muito extensos (> 1500 caracteres) copiados repetidamente
      if (selection.length > 1500) {
        const now = Date.now();
        copyRef.current = copyRef.current.filter((t) => now - t < 60000);
        copyRef.current.push(now);

        if (copyRef.current.length >= 5) {
          throttledReport("scraping", "Possível Scraping de Dados Detectado (Cópia em Massa)", {
            copiesInLastMinute: copyRef.current.length,
            lastCopiedLength: selection.length,
          });
          copyRef.current = [];
        }
      }
    };

    document.addEventListener("copy", handleCopy);
    return () => document.removeEventListener("copy", handleCopy);
  }, [enableScrapingDetection, throttledReport]);

  // 4. Monitorar Navegação Anormal (Varredura de Rotas)
  useEffect(() => {
    if (typeof window === "undefined" || !history) return;

    const checkDistinctRouteChange = () => {
      const currentPath = window.location.pathname;
      // Ignora alterações puras de query params / estado se a rota base não mudou
      if (currentPath === lastPathRef.current) return;
      lastPathRef.current = currentPath;

      const now = Date.now();
      routeChangesRef.current = routeChangesRef.current.filter((t) => now - t < 60000);
      routeChangesRef.current.push(now);

      if (routeChangesRef.current.length >= maxRouteChangesPerMinute) {
        throttledReport("routes", "Navegação Anormal / Bot de Varredura de Rotas", {
          routeChangesInLastMinute: routeChangesRef.current.length,
          lastPath: currentPath,
        });
        routeChangesRef.current = [];
      }
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const res = originalPushState.apply(history, args);
      checkDistinctRouteChange();
      return res;
    };

    history.replaceState = function (...args) {
      const res = originalReplaceState.apply(history, args);
      checkDistinctRouteChange();
      return res;
    };

    window.addEventListener("popstate", checkDistinctRouteChange);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", checkDistinctRouteChange);
    };
  }, [maxRouteChangesPerMinute, throttledReport]);

  return {
    reportCustomSpam: (reason: string, details: Record<string, unknown> = {}) =>
      throttledReport("custom", reason, details),
  };
}
