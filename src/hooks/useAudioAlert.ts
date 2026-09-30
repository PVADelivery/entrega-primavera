import { useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

// Singleton instances to be used globally outside React lifecycle
const ALERT_SOUND_URL = "/ring.mp3";
export const NOTIFICATION_CHANNEL_ID = "mt24_driver_alerts_v40";

let globalAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let synthOscillator: OscillatorNode | null = null;
let synthGain: GainNode | null = null;
let isUnlocked = false;
let vibrationInterval: any = null;
let activeNotification: Notification | null = null;
let lastPlayPromise: Promise<void> | null = null;
let loopTimeoutTimer: any = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

function startSynthesizedSiren() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (synthOscillator) {
      try { synthOscillator.stop(); } catch {}
      synthOscillator = null;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const startTime = ctx.currentTime;
    // Padrão de som chamativo e alternado (880Hz e 587Hz)
    osc.frequency.setValueAtTime(880, startTime);
    osc.frequency.setValueAtTime(587, startTime + 0.25);
    osc.frequency.setValueAtTime(880, startTime + 0.5);
    osc.frequency.setValueAtTime(587, startTime + 0.75);

    gain.gain.setValueAtTime(0.8, startTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    synthOscillator = osc;
    synthGain = gain;
  } catch (e) {
    console.warn("[AudioAlert] Falha no sintetizador WebAudio:", e);
  }
}

function stopSynthesizedSiren() {
  if (synthOscillator) {
    try {
      synthOscillator.stop();
      synthOscillator.disconnect();
    } catch {}
    synthOscillator = null;
  }
  if (synthGain) {
    try { synthGain.disconnect(); } catch {}
    synthGain = null;
  }
}

if (typeof window !== "undefined") {
  globalAudio = new Audio();
  globalAudio.src = ALERT_SOUND_URL + "?v=" + Date.now();
  globalAudio.preload = "auto";
  globalAudio.load();

  let isUnlocking = false;
  const unlockGlobalAudio = () => {
    if (isUnlocked || isUnlocking) return;
    isUnlocking = true;

    // Desbloqueia Web Audio API
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch {}

    // Desbloqueia HTML5 Audio
    if (globalAudio) {
      globalAudio.muted = true;
      globalAudio.volume = 0;
      const playPromise = globalAudio.play();
      lastPlayPromise = playPromise;
      playPromise
        .then(() => {
          try {
            globalAudio!.pause();
            globalAudio!.currentTime = 0;
          } catch {}
          globalAudio!.muted = false;
          globalAudio!.volume = 1.0;
          isUnlocked = true;
          isUnlocking = false;
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
          window.removeEventListener("click", unlockGlobalAudio);
          window.removeEventListener("touchstart", unlockGlobalAudio);
          window.removeEventListener("touchend", unlockGlobalAudio);
          window.removeEventListener("pointerdown", unlockGlobalAudio);
          window.removeEventListener("keydown", unlockGlobalAudio);
        })
        .catch(() => {
          if (globalAudio) {
            globalAudio.muted = false;
            globalAudio.volume = 1.0;
          }
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
          isUnlocking = false;
        });
    }
  };

  window.addEventListener("click", unlockGlobalAudio);
  window.addEventListener("touchstart", unlockGlobalAudio);
  window.addEventListener("touchend", unlockGlobalAudio);
  window.addEventListener("pointerdown", unlockGlobalAudio);
  window.addEventListener("keydown", unlockGlobalAudio);
}

/**
 * Dispara vibração física no dispositivo do usuário (Haptics)
 */
export function triggerDeviceVibration(pattern: number[] = [500, 200, 500, 200, 800]) {
  const canVibrate = Capacitor.isNativePlatform() || isUnlocked;
  if (canVibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      console.warn("[Vibration] Vibração não suportada:", e);
    }
  }
}

/**
 * Solicita a permissão do sistema para Notificações Nativas do Aparelho (Central de Notificações do Celular/PC)
 */
export function requestNotificationPermission() {
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
    LocalNotifications.requestPermissions().then((res) => {
      if (res.display === "granted" && Capacitor.getPlatform() === "android") {
        // Limpa canais obsoletos para evitar canais travados sem som no Android
        LocalNotifications.deleteChannel({ id: "default" }).catch(() => {});
        LocalNotifications.deleteChannel({ id: "mt24_delivery_alerts_v35" }).catch(() => {});
        LocalNotifications.createChannel({
          id: NOTIFICATION_CHANNEL_ID,
          name: "Novas Corridas MT 24 Horas",
          description: "Alerta de novas corridas disponíveis para entregadores MT 24 Horas",
          importance: 5,
          visibility: 1,
          vibration: true,
          sound: "ring",
        }).catch(() => {});
      }
    }).catch(() => {});
  }
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission()
        .then((perm) => {
          console.log("[Notification] Permissão de notificação nativa:", perm);
        })
        .catch((e) => {
          console.warn("[Notification] Erro ao solicitar permissão de notificação:", e);
        });
    }
  }
}

/**
 * Envia uma notificação nativa diretamente na barra/central de notificações do sistema operacional do celular ou desktop
 */
export function sendNativeDeviceNotification(
  title: string,
  options?: { body?: string; tag?: string; icon?: string }
) {
  // 1. Aciona vibração no dispositivo
  triggerDeviceVibration();

  // 2. Aciona Notificação Nativa do Celular (Android / iOS)
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("LocalNotifications")) {
    try {
      LocalNotifications.schedule({
        notifications: [
          {
            title: title || "Nova Corrida Disponível!",
            body: options?.body || "Acesse o app para aceitar a corrida",
            id: Math.floor(Math.random() * 100000),
            channelId: NOTIFICATION_CHANNEL_ID,
            sound: Capacitor.getPlatform() === "ios" ? "ring.mp3" : "ring",
            extra: {
              tag: options?.tag || "mt24-delivery-new"
            }
          }
        ]
      }).catch((e) => {
        console.warn("[LocalNotifications] Erro ao agendar notificação nativa:", e);
      });
    } catch (e) {
      console.warn("[LocalNotifications] Erro nativo:", e);
    }
  }

  // 3. Aciona Notificação Nativa do Navegador (Desktop / PWA)
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      try {
        if (activeNotification) {
          activeNotification.close();
        }
        activeNotification = new Notification(title, {
          body: options?.body || "Acesse o app para aceitar a corrida",
          icon: options?.icon || "/favicon-v3.png",
          badge: "/favicon-v3.png",
          tag: options?.tag || "mt24-delivery-new",
          requireInteraction: true,
        });

        activeNotification.onclick = () => {
          try {
            window.focus();
          } catch {}
          activeNotification?.close();
          activeNotification = null;
        };
      } catch (e) {
        console.warn("[Notification] Erro ao instanciar notificação nativa:", e);
      }
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") {
          sendNativeDeviceNotification(title, options);
        }
      });
    }
  }
}

export function stopGlobalAudioAlert() {
  if (loopTimeoutTimer) {
    clearTimeout(loopTimeoutTimer);
    loopTimeoutTimer = null;
  }

  stopSynthesizedSiren();

  if (globalAudio) {
    const performPause = () => {
      try {
        globalAudio!.pause();
        globalAudio!.currentTime = 0;
        globalAudio!.loop = false;
      } catch (e) {
        console.warn("[AudioAlert] Falha ao parar áudio:", e);
      }
    };

    if (lastPlayPromise) {
      lastPlayPromise.then(performPause).catch(performPause);
      lastPlayPromise = null;
    } else {
      performPause();
    }
  }

  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }

  if (activeNotification) {
    activeNotification.close();
    activeNotification = null;
  }
}

export function useAudioAlert() {
  const unlockAudio = useCallback(() => {
    requestNotificationPermission();
    if (isUnlocked && globalAudio && !globalAudio.muted) return;
    
    // Desbloqueia Web Audio API
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    } catch {}

    if (globalAudio) {
      globalAudio.muted = true;
      globalAudio.volume = 0;
      const playPromise = globalAudio.play();
      lastPlayPromise = playPromise;
      playPromise
        .then(() => {
          try {
            globalAudio!.pause();
            globalAudio!.currentTime = 0;
          } catch {}
          globalAudio!.muted = false;
          globalAudio!.volume = 1.0;
          isUnlocked = true;
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
        })
        .catch((e) => {
          if (globalAudio) {
            globalAudio.muted = false;
            globalAudio.volume = 1.0;
          }
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
          if (import.meta.env.DEV) console.warn("[AudioAlert] Falha ao destravar áudio:", e);
        });
    }
  }, []);

  const playAlert = useCallback(() => {
    let playedHtmlAudio = false;
    if (globalAudio) {
      globalAudio.currentTime = 0;
      globalAudio.volume = 1.0;
      globalAudio.muted = false;
      const playPromise = globalAudio.play();
      lastPlayPromise = playPromise;
      playPromise
        .then(() => {
          playedHtmlAudio = true;
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
        })
        .catch((e) => {
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
          console.warn("[AudioAlert] Fallback para sintetizador WebAudio:", e);
          startSynthesizedSiren();
        });
    } else {
      startSynthesizedSiren();
    }
    triggerDeviceVibration();
  }, []);

  const stopLoop = useCallback(() => {
    stopGlobalAudioAlert();
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();

    let playedHtmlAudio = false;
    if (globalAudio) {
      globalAudio.loop = true;
      globalAudio.volume = 1.0;
      globalAudio.muted = false;
      const playPromise = globalAudio.play();
      lastPlayPromise = playPromise;
      playPromise
        .then(() => {
          playedHtmlAudio = true;
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
        })
        .catch((e) => {
          if (lastPlayPromise === playPromise) {
            lastPlayPromise = null;
          }
          console.warn("[AudioAlert] Falha ao tocar áudio em loop, ativando sirene WebAudio:", e);
          startSynthesizedSiren();
        });
    } else {
      startSynthesizedSiren();
    }

    // Se após 600ms o áudio HTML não estiver tocando, garante a sirene WebAudio
    setTimeout(() => {
      if (globalAudio && globalAudio.paused && !playedHtmlAudio) {
        startSynthesizedSiren();
      }
    }, 600);

    if (!vibrationInterval) {
      triggerDeviceVibration();
      vibrationInterval = setInterval(() => {
        triggerDeviceVibration();
      }, 3500);
    }

    // Trava de segurança: para automaticamente após 30 segundos
    loopTimeoutTimer = setTimeout(() => {
      stopLoop();
    }, 30000);
  }, [stopLoop]);

  return {
    unlockAudio,
    playAlert,
    startLoop,
    stopLoop,
    stopAlert: stopLoop,
    isPlaying: false
  };
}
