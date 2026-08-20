import { useCallback, useRef, useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const ALERT_SOUND_URL = "/ring.mp3";

let globalAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let isAlertActiveGlobal = false;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

const canUseBrowserVibration = () =>
  Capacitor.isNativePlatform() || navigator.userActivation?.hasBeenActive === true;

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
      // Se o alerta de corrida estiver ativo, NUNCA executa teste de pausa no áudio!
      if (isAlertActiveGlobal) return;

      if (globalAudio && globalAudio.paused) {
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
        globalAudio.loop = true;
        globalAudio.play().catch((e) => console.warn("[AudioAlert] unlockAudio play erro:", e));
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

  const playAlert = useCallback((loop = true) => {
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

        // Se já estiver tocando e não estiver pausado, garante que continua tocando o áudio completo!
        if (!globalAudio.paused && globalAudio.currentTime > 0) {
          return;
        }

        globalAudio.currentTime = 0;
        const p = globalAudio.play();
        if (p !== undefined) {
          p.catch((err) => {
            console.warn("[AudioAlert] Autoplay impedido pelo navegador:", err);
          });
        }
      } catch (e) {
        console.warn("[AudioAlert] Erro ao tocar áudio MP3:", e);
      }
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator && canUseBrowserVibration()) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
      } catch {}
    }

    if (loop) {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = setTimeout(() => {
        stopAlert();
      }, 60_000); // 60 segundos de reprodução contínua até o entregador aceitar/rejeitar
    }
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
