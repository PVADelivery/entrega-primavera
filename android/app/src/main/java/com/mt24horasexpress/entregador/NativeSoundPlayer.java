package com.mt24horasexpress.entregador;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

public class NativeSoundPlayer {

    private static final String TAG = "NativeSoundPlayer";
    private static MediaPlayer mediaPlayer;
    private static final Object lock = new Object();
    private static Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private static Runnable autoStopRunnable = () -> stopSound();

    public static void playDeliveryAlert(Context context) {
        synchronized (lock) {
            try {
                stopSound();

                mediaPlayer = MediaPlayer.create(context.getApplicationContext(), R.raw.notification_sound);
                if (mediaPlayer == null) {
                    // Fallback para ring se notification_sound não carregar
                    mediaPlayer = MediaPlayer.create(context.getApplicationContext(), R.raw.ring);
                }
                if (mediaPlayer == null) {
                    Log.e(TAG, "Falha ao criar MediaPlayer para notification_sound / ring");
                    return;
                }

                AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();

                mediaPlayer.setAudioAttributes(attrs);
                mediaPlayer.setLooping(false);
                mediaPlayer.setVolume(1.0f, 1.0f);
                mediaPlayer.setOnCompletionListener(mp -> {
                    synchronized (lock) {
                        if (mediaPlayer == mp) {
                            try {
                                mp.release();
                            } catch (Exception ignored) {}
                            mediaPlayer = null;
                        }
                    }
                });

                mediaPlayer.start();
                Log.d(TAG, "Áudio oficial de notificação iniciado com sucesso!");

                // Limite máximo de segurança: 40 segundos
                timeoutHandler.removeCallbacks(autoStopRunnable);
                timeoutHandler.postDelayed(autoStopRunnable, 40000);
            } catch (Exception e) {
                Log.e(TAG, "Erro ao tocar áudio oficial: " + e.getMessage(), e);
            }
        }
    }

    public static void stopSound() {
        synchronized (lock) {
            try {
                timeoutHandler.removeCallbacks(autoStopRunnable);
                if (mediaPlayer != null) {
                    if (mediaPlayer.isPlaying()) {
                        mediaPlayer.stop();
                    }
                    mediaPlayer.release();
                    mediaPlayer = null;
                    Log.d(TAG, "Áudio oficial parado e liberado.");
                }
            } catch (Exception e) {
                Log.w(TAG, "Erro ao parar áudio: " + e.getMessage());
                mediaPlayer = null;
            }
        }
    }
}
