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
    maxClicksPerSecond = 10,
    maxRouteChangesPerMinute = 25,
    enableInjectionDetection = true,
    enableScrapingDetection = true,
  } = config;

  const clicksRef = useRef<number[]>([]);
  const routeChangesRef = useRef<number[]>([]);
  const copyRef = useRef<number[]>([]);
  const lastReportedTimeRef = useRef<Record<string, number>>({});

  const throttledReport = useCallback((type: string, reason: string, details: Record<string, unknown>) => {
    const now = Date.now();
    const last = lastReportedTimeRef.current[type] || 0;
    // Cooldown de 15 segundos por tipo de alerta para não saturar
    if (now - last < 15000) return;
    lastReportedTimeRef.current[type] = now;

    reportSpamToTelegram(reason, details, appName);
  }, [appName]);

  // 1. Monitorar Autoclickers e Rage Clicks
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleClick = (e: MouseEvent) => {
      const now = Date.now();
      clicksRef.current = clicksRef.current.filter((t) => now - t < 1000);
      clicksRef.current.push(now);

      if (clicksRef.current.length >= maxClicksPerSecond) {
        throttledReport("clicks", "Autoclicker / Flood de Cliques Detectado", {
          clicksInLastSecond: clicksRef.current.length,
          targetTag: (e.target as HTMLElement)?.tagName || "Unknown",
          className: (e.target as HTMLElement)?.className?.toString()?.slice(0, 80) || "",
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
      if (selection.length > 500) {
        const now = Date.now();
        copyRef.current = copyRef.current.filter((t) => now - t < 60000);
        copyRef.current.push(now);

        if (copyRef.current.length >= 3) {
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

  // 4. Monitorar Navegação Anormal
  useEffect(() => {
    if (typeof window === "undefined" || !history) return;

    const handleRouteChange = () => {
      const now = Date.now();
      routeChangesRef.current = routeChangesRef.current.filter((t) => now - t < 60000);
      routeChangesRef.current.push(now);

      if (routeChangesRef.current.length >= maxRouteChangesPerMinute) {
        throttledReport("routes", "Navegação Anormal / Bot de Varredura de Rotas", {
          routeChangesInLastMinute: routeChangesRef.current.length,
          lastPath: window.location.pathname,
        });
        routeChangesRef.current = [];
      }
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      handleRouteChange();
      return originalPushState.apply(history, args);
    };

    history.replaceState = function (...args) {
      handleRouteChange();
      return originalReplaceState.apply(history, args);
    };

    window.addEventListener("popstate", handleRouteChange);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [maxRouteChangesPerMinute, throttledReport]);

  return {
    reportCustomSpam: (reason: string, details: Record<string, unknown> = {}) =>
      throttledReport("custom", reason, details),
  };
}
