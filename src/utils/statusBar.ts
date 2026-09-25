import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

export async function applyStatusBarTheme(isDark: boolean) {
  const themeColor = isDark ? "#000000" : "#ffffff";
  const appleStatus = isDark ? "black-translucent" : "default";

  // 1. Atualiza ou cria meta theme-color no documento
  if (typeof document !== "undefined") {
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.setAttribute("name", "theme-color");
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute("content", themeColor);

    let metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (!metaApple) {
      metaApple = document.createElement("meta");
      metaApple.setAttribute("name", "apple-mobile-web-app-status-bar-style");
      document.head.appendChild(metaApple);
    }
    metaApple.setAttribute("content", appleStatus);

    // Ajusta background do root para evitar flash de cor incorreta
    document.documentElement.style.backgroundColor = themeColor;
    document.body.style.backgroundColor = themeColor;
  }

  // 2. Controla o plugin nativo do Capacitor no iOS e Android
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.show();
      if (isDark) {
        // TEMA ESCURO: Fundo preto e ícones brancos (hora, bateria, wifi)
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#000000" });
        }
      } else {
        // TEMA CLARO: Fundo branco e ícones pretos (hora, bateria, wifi)
        await StatusBar.setStyle({ style: Style.Light });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#FFFFFF" });
        }
      }
    } catch (e) {
      console.warn("[StatusBar] Erro ao sincronizar status bar:", e);
    }
  }
}
