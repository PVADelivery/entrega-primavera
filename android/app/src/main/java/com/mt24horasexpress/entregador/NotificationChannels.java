package com.mt24horasexpress.entregador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/** Centraliza a criação do canal de notificação de corridas (som + vibração + tela bloqueada). */
public final class NotificationChannels {

    public static final String INCOMING_CHANNEL_ID = "delivery-incoming-v9";
    public static final String MARKETPLACE_CHANNEL_ID = "marketplace_orders_v2";
    public static final String LEGACY_CHANNEL_V1 = "delivery-incoming-v1";
    public static final String LEGACY_CHANNEL_V8 = "delivery-incoming-v8";

    private NotificationChannels() {}

    public static void ensureIncomingChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        Uri customSound = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.ring);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        String[] channels = new String[] {
            INCOMING_CHANNEL_ID,
            LEGACY_CHANNEL_V1,
            LEGACY_CHANNEL_V8,
            MARKETPLACE_CHANNEL_ID
        };

        for (String chId : channels) {
            if (nm.getNotificationChannel(chId) == null) {
                NotificationChannel ch = new NotificationChannel(
                        chId, "Novas Corridas MT 24 Horas Express", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Alerta sonoro personalizado de novas corridas e entregas disponíveis");
                ch.setSound(customSound, attrs);
                ch.enableVibration(true);
                ch.setVibrationPattern(new long[]{0, 800, 250, 800, 250, 800});
                ch.enableLights(true);
                ch.setShowBadge(true);
                ch.setBypassDnd(true);
                ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
        }
    }
}
