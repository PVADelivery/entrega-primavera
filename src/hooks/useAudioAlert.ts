import { useCallback, useRef, useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const ALERT_SOUND_URL = "/ring.mp3";

let globalAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let isAlertActiveGlobal = false;
let hasUnlockedAudio = false;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;

  // Só cria ou despausa o AudioContext se o usuário já tiver interagido com a página
  const hasUserGesture = typeof navigator !== "undefined" && (navigator as any).userActivation
    ? (navigator as any).userActivation.hasBeenActive
    : false;

  if (!hasUserGesture && !audioCtx) {
    return null; // Evita o aviso do Chrome "The AudioContext was not allowed to start" no carregamento inicial
  }

  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      try {
        audioCtx = new AudioCtxClass();
      } catch (e) {
        console.warn("[AudioAlert] Erro ao instanciar AudioContext:", e);
      }
    }
  }

  if (audioCtx && audioCtx.state === "suspended" && hasUserGesture) {
    audioCtx.resume().catch(() => {});
  }

  return audioCtx;
};

const canUseBrowserVibration = () =>
  Capacitor.isNativePlatform() || (typeof navigator !== "undefined" && (navigator as any).userActivation?.hasBeenActive === true);

if (typeof window !== "undefined") {
  try {
    globalAudio = new Audio(ALERT_SOUND_URL);
    globalAudio.preload = "auto";
    globalAudio.load();
  } catch (e) {
    console.warn("[AudioAlert] Erro ao instanciar HTMLAudioElement:", e);
  }

  const unlockOnUserGesture = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      if (hasUnlockedAudio) return;
      if (isAlertActiveGlobal) return;

      if (globalAudio && globalAudio.paused && (navigator as any).userActivation?.hasBeenActive) {
        hasUnlockedAudio = true;
        const origVol = globalAudio.volume;
        globalAudio.volume = 0.001;
        const p = globalAudio.play();
        if (p !== undefined) {
          p.then(() => {
            if (!isAlertActiveGlobal && globalAudio) {
              globalAudio.pause();
              globalAudio.currentTime = 0;
              globalAudio.volume = origVol || 1.0;
            }
          }).catch(() => {});
        }
      }
    } catch {}
  };

  window.addEventListener("touchstart", unlockOnUserGesture, { capture: true, passive: true });
  window.addEventListener("pointerdown", unlockOnUserGesture, { capture: true, passive: true });
  window.addEventListener("click", unlockOnUserGesture, { capture: true });
  window.addEventListener("keydown", unlockOnUserGesture, { capture: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") unlockOnUserGesture();
  });
}

export function useAudioAlert() {
  const [isPlaying, setIsPlaying] = useState(false);
  const playingRef = useRef(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unlockAudio = useCallback(() => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    if (globalAudio && isAlertActiveGlobal && globalAudio.paused) {
      try {
        globalAudio.volume = 1.0;
        globalAudio.loop = false;
        globalAudio.play().catch((e) => {
          if (e?.name !== "AbortError" && e?.name !== "NotAllowedError") {
            console.warn("[AudioAlert] unlockAudio play erro:", e);
          }
        });
      } catch (e) {}
    }
  }, []);

  const stopAlert = useCallback(() => {
    isAlertActiveGlobal = false;
    playingRef.current = false;
    setIsPlaying(false);

    if (globalAudio) {
      try {
        globalAudio.pause();
        globalAudio.currentTime = 0;
        globalAudio.loop = false;
      } catch (e) {
        console.warn("[AudioAlert] Falha ao parar áudio:", e);
      }
    }

    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator && canUseBrowserVibration()) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }, []);

  const playAlert = useCallback((loop = false) => {
    isAlertActiveGlobal = true;
    playingRef.current = true;
    setIsPlaying(true);

    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    if (globalAudio) {
      try {
        globalAudio.volume = 1.0;
        globalAudio.loop = loop;
        globalAudio.onended = () => {
          if (!loop) {
            stopAlert();
          }
        };

        // Se já estiver tocando e não estiver pausado, garante que continua tocando o áudio completo!
        if (!globalAudio.paused && globalAudio.currentTime > 0) {
          return;
        }

        globalAudio.currentTime = 0;
        const p = globalAudio.play();
        if (p !== undefined) {
          p.catch((err) => {
            if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") {
              console.warn("[AudioAlert] Falha ao tocar áudio MP3:", err);
            }
          });
        }
      } catch (e) {
        console.warn("[AudioAlert] Erro ao disparar áudio MP3:", e);
      }
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator && canUseBrowserVibration()) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500]);
      } catch {}
    }

    if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = setTimeout(() => {
      stopAlert();
    }, loop ? 30_000 : 25_000);
  }, [stopAlert]);

  useEffect(() => {
    return () => {
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, []);

  return { unlockAudio, playAlert, stopAlert, isPlaying };
}
