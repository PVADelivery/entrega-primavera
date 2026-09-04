package com.mt24horasexpress.entregador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/** Centraliza a criação do canal de notificação de corridas com som oficial ring.mp3 do MT 24 Horas Express. */
public final class NotificationChannels {

    public static final String INCOMING_CHANNEL_ID = "mt24_delivery_alerts_v35";
    public static final String MARKETPLACE_CHANNEL_ID = "mt24_marketplace_orders_v35";

    private NotificationChannels() {}

    public static void ensureIncomingChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        // Limpa canais obsoletos para forçar o registro correto do som ring.mp3 no sistema
        try {
            nm.deleteNotificationChannel("delivery_alerts_official_v34");
            nm.deleteNotificationChannel("marketplace_orders_v34");
            nm.deleteNotificationChannel("delivery_alerts_official_v31");
            nm.deleteNotificationChannel("marketplace_orders_v31");
            nm.deleteNotificationChannel("delivery_alerts_v29_silent");
            nm.deleteNotificationChannel("marketplace_orders_v29_silent");
            nm.deleteNotificationChannel("fcm_fallback_notification_channel");
            nm.deleteNotificationChannel("delivery-incoming-v25-silent");
            nm.deleteNotificationChannel("marketplace_orders_v25_silent");
            nm.deleteNotificationChannel("delivery-incoming-v18");
            nm.deleteNotificationChannel("delivery-incoming-v15");
            nm.deleteNotificationChannel("delivery-incoming-v12");
            nm.deleteNotificationChannel("delivery-incoming-v10");
            nm.deleteNotificationChannel("delivery-incoming-v9");
            nm.deleteNotificationChannel("delivery-incoming-v8");
            nm.deleteNotificationChannel("delivery-incoming-v1");
            nm.deleteNotificationChannel("delivery-incoming");
            nm.deleteNotificationChannel("marketplace_orders_v2");
        } catch (Exception ignored) {}

        // Som exclusivo e nativo do MT 24 Horas Express
        Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.ring);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build();

        // 1) Canal Nativo Marketplace Orders v35
        if (nm.getNotificationChannel(MARKETPLACE_CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                    MARKETPLACE_CHANNEL_ID, "Novos Pedidos MT 24 Horas", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Alerta sonoro de novas entregas e pedidos MT 24 Horas Express");
            ch.setSound(soundUri, audioAttributes);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 800, 250, 800, 250, 800});
            ch.enableLights(true);
            ch.setShowBadge(true);
            ch.setBypassDnd(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }

        // 2) Canal Nativo Entregas v35 com o som oficial ring.mp3
        if (nm.getNotificationChannel(INCOMING_CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(
                    INCOMING_CHANNEL_ID, "Novas Corridas MT 24 Horas", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Alerta de novas corridas disponíveis para entregadores MT 24 Horas");
            ch.setSound(soundUri, audioAttributes);
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
