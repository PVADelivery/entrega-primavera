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
  const synthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSynthBeep = useCallback(() => {
    if (synthIntervalRef.current) {
      clearInterval(synthIntervalRef.current);
      synthIntervalRef.current = null;
    }
  }, []);

  const playSynthBeep = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const playMotorRev = () => {
        try {
          const now = ctx.currentTime;

          // 1. Oscilador Sawtooth para o Ronco do Motor de Moto
          const osc = ctx.createOscillator();
          const filter = ctx.createBiquadFilter();
          const gain = ctx.createGain();

          osc.type = "sawtooth";
          
          // Curva de Frequência do Motor (Ronco VROOOOM!)
          osc.frequency.setValueAtTime(90, now);
          osc.frequency.exponentialRampToValueAtTime(360, now + 0.3); // 1ª acelerada
          osc.frequency.exponentialRampToValueAtTime(160, now + 0.5); // troca de marcha
          osc.frequency.exponentialRampToValueAtTime(520, now + 0.95); // 2ª acelerada forte!
          osc.frequency.exponentialRampToValueAtTime(190, now + 1.25); // reduzindo

          // Filtro Passa-Baixas (Escapamento Esportivo)
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(650, now);
          filter.frequency.exponentialRampToValueAtTime(2200, now + 0.35);
          filter.frequency.exponentialRampToValueAtTime(1000, now + 0.5);
          filter.frequency.exponentialRampToValueAtTime(2800, now + 0.95);

          // Controle de Volume com Aceleração
          gain.gain.setValueAtTime(0.7, now);
          gain.gain.exponentialRampToValueAtTime(0.95, now + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 1.3);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 1.3);

          // 2. Apito / Bip Agudo de Alerta em segundo plano
          const beepOsc = ctx.createOscillator();
          const beepGain = ctx.createGain();
          beepOsc.type = "sine";
          beepOsc.frequency.setValueAtTime(1046.5, now + 0.25);
          beepOsc.frequency.setValueAtTime(1318.5, now + 0.55);
          
          beepGain.gain.setValueAtTime(0, now);
          beepGain.gain.setValueAtTime(0.6, now + 0.25);
          beepGain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);

          beepOsc.connect(beepGain);
          beepGain.connect(ctx.destination);
          beepOsc.start(now + 0.25);
          beepOsc.stop(now + 0.75);
        } catch (e) {
          console.warn("[AudioAlert] Erro no som do motor:", e);
        }
      };

      playMotorRev();
      stopSynthBeep();
      synthIntervalRef.current = setInterval(playMotorRev, 1400);
    } catch (e) {
      console.warn("[AudioAlert] Falha sintetizador de motor:", e);
    }
  }, [stopSynthBeep]);

  const unlockAudio = useCallback(() => {
    if (globalAudio) {
      const originalVolume = globalAudio.volume;
      globalAudio.volume = 0;
      globalAudio.play()
        .then(() => {
          globalAudio?.pause();
          if (globalAudio) globalAudio.volume = originalVolume;
        })
        .catch(() => {
          // Destravamento silencioso aguardando o primeiro toque do usuario
        });
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
    stopSynthBeep();

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
  }, [stopSynthBeep]);

  const playAlert = useCallback((loop = false) => {
    if (playingRef.current) {
      stopAlert();
    }

    playingRef.current = true;
    setIsPlaying(true);

    playSynthBeep();

    if (globalAudio) {
      try {
        globalAudio.currentTime = 0;
        globalAudio.loop = loop;
        globalAudio.volume = 1.0;
        globalAudio.play().catch(() => {
          // Autoplay policy do navegador interceptada - WebAudio sintetizador e notificação nativa operam como fallback
        });
      } catch (e) {
        // Silenciado
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
  }, [playSynthBeep, stopAlert]);

  useEffect(() => {
    return () => {
      stopSynthBeep();
      if (timeoutIdRef.current) {
        clearTimeout(timeoutIdRef.current);
      }
    };
  }, [stopSynthBeep]);

  return { unlockAudio, playAlert, stopAlert, isPlaying };
}
