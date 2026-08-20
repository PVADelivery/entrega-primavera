import { useCallback, useRef, useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const ALERT_SOUND_URL = "/ring.mp3";

let globalAudio: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  // Só instancia o AudioContext se o usuário já tiver interagido com a página
  if (!navigator.userActivation?.hasBeenActive && typeof (window as any).isUserActive === "undefined") {
    return null;
  }
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
      if (globalAudio) {
        const origVol = globalAudio.volume;
        globalAudio.volume = 0;
        globalAudio.play().then(() => {
          globalAudio?.pause();
          if (globalAudio) globalAudio.volume = origVol;
        }).catch(() => {});
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
    if (globalAudio) {
      const originalVolume = globalAudio.volume;
      globalAudio.volume = 0;
      globalAudio.play()
        .then(() => {
          globalAudio?.pause();
          if (globalAudio) globalAudio.volume = originalVolume;
        })
        .catch(() => {});
    }
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }, []);

  const stopAlert = useCallback(() => {
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
    playingRef.current = false;
    setIsPlaying(false);

    if (typeof navigator !== "undefined" && "vibrate" in navigator && canUseBrowserVibration()) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
  }, []);

  const playAlert = useCallback((loop = false) => {
    if (playingRef.current) {
      stopAlert();
    }

    playingRef.current = true;
    setIsPlaying(true);

    if (globalAudio) {
      try {
        globalAudio.currentTime = 0;
        globalAudio.loop = loop;
        globalAudio.volume = 1.0;
        globalAudio.play().catch((err) => {
          console.warn("[AudioAlert] Autoplay impedido pelo navegador:", err);
        });
      } catch (e) {
        console.warn("[AudioAlert] Erro ao tocar áudio MP3:", e);
      }
    }

    if (typeof navigator !== "undefined" && "vibrate" in navigator && canUseBrowserVibration()) {
      try {
        navigator.vibrate([500, 200, 500, 200, 500]);
      } catch {}
    }

    if (loop) {
      timeoutIdRef.current = setTimeout(() => {
        stopAlert();
      }, 30_000);
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
