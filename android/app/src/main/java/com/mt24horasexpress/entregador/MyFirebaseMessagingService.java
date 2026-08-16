package com.mt24horasexpress.entregador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MyFirebaseMsgService";
    private static final String CHANNEL_ID = "delivery-incoming-v1";
    private static final int NOTIF_ID = 7777;

    private int hashId(String str) {
        if (str == null) return 0;
        int hash = 0;
        for (int i = 0; i < str.length(); i++) {
            hash = ((hash << 5) - hash) + str.charAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Log.d(TAG, "FCM recebido de: " + remoteMessage.getFrom());

        if (remoteMessage.getData().size() == 0) return;

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        Log.d(TAG, "type=" + type + " | data=" + data);

        // ── CANCELAMENTO: Quando outro entregador aceita a corrida ou ela é cancelada
        if ("cancel_delivery".equals(type)) {
            String deliveryId = data.get("deliveryId");
            Log.d(TAG, "Corrida " + deliveryId + " aceita por outro motorista. Encerrando notificação!");

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIF_ID);
                if (deliveryId != null && !deliveryId.isEmpty()) {
                    nm.cancel(hashId(deliveryId));
                }
            }
            return;
        }

        boolean isDelivery = "delivery".equals(type) || "INSERT".equals(type) || "UPDATE".equals(type)
                || "new_delivery".equals(type) || data.containsKey("deliveryId") || data.containsKey("delivery_id");
        if (!isDelivery) return;

        String deliveryId = data.get("deliveryId");
        if (deliveryId == null || deliveryId.isEmpty()) deliveryId = data.get("delivery_id");
        if (deliveryId == null || deliveryId.isEmpty()) deliveryId = data.get("id");

        String address   = data.get("address");
        if (address == null || address.isEmpty()) address = data.get("details");

        String title     = data.get("title");
        String storeName = data.get("storeName");
        if (storeName == null || storeName.isEmpty()) storeName = data.get("store_name");
        if (storeName == null || storeName.isEmpty()) storeName = data.get("company_name");

        String pickup    = data.get("pickup");
        if (pickup == null || pickup.isEmpty()) pickup = data.get("pickup_address");

        String dropoff   = data.get("dropoff");
        if (dropoff == null || dropoff.isEmpty()) dropoff = data.get("delivery_address");

        String fee       = data.get("fee");
        if (fee == null || fee.isEmpty()) fee = data.get("delivery_fee");

        if (storeName == null) storeName = "";
        if (pickup    == null) pickup    = "";
        if (dropoff   == null) dropoff   = "";
        if (fee       == null) fee       = "";

        // Parse fallback do bloco formatado
        if ((storeName.isEmpty() || "Loja Parceira".equalsIgnoreCase(storeName.trim())) && address != null && address.contains("🏬 Loja:")) {
            try {
                int startIdx = address.indexOf("🏬 Loja:") + "🏬 Loja:".length();
                int endIdx = address.indexOf("\n", startIdx);
                String parsed = (endIdx != -1 ? address.substring(startIdx, endIdx) : address.substring(startIdx)).trim();
                if (!parsed.isEmpty() && !"Loja Parceira".equalsIgnoreCase(parsed)) {
                    storeName = parsed;
                }
            } catch (Exception e) {}
        }
        if ((dropoff.isEmpty() || "Endereço do cliente".equalsIgnoreCase(dropoff.trim())) && address != null && address.contains("🏁 Entrega:")) {
            try {
                int startIdx = address.indexOf("🏁 Entrega:") + "🏁 Entrega:".length();
                int endIdx = address.indexOf("\n", startIdx);
                String parsed = (endIdx != -1 ? address.substring(startIdx, endIdx) : address.substring(startIdx)).trim();
                if (!parsed.isEmpty() && !"Endereço do cliente".equalsIgnoreCase(parsed)) {
                    dropoff = parsed;
                }
            } catch (Exception e) {}
        }

        String finalStoreName = (storeName != null && !storeName.trim().isEmpty() && !"Loja Parceira".equalsIgnoreCase(storeName.trim()))
                ? storeName.trim()
                : "MT 24 Horas Express";

        String cardTitle = "🏬 " + finalStoreName;
        String cardSubtext = (dropoff != null && !dropoff.trim().isEmpty() && !"Endereço do cliente".equalsIgnoreCase(dropoff.trim()))
                ? "🏁 Entrega: " + dropoff.trim()
                : "Nova entrega disponível!";

        String formattedBigText = "🏬 Loja: " + finalStoreName
                + "\n📍 Coleta: " + (pickup != null && !pickup.trim().isEmpty() ? pickup : "Retirada na Loja")
                + "\n🏁 Entrega: " + (dropoff != null && !dropoff.trim().isEmpty() ? dropoff : "Endereço do cliente")
                + "\n💰 Ganhos: " + (fee != null && !fee.trim().isEmpty() ? fee : "A calcular");

        Log.d(TAG, "Nova entrega: deliveryId=" + deliveryId + " | " + cardTitle);

        // ── Heads-up Notification com Full Screen Intent
        try {
            ensureChannel();

            Intent fsIntent = new Intent(this, MainActivity.class);
            fsIntent.putExtra("deliveryId", deliveryId);
            fsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;

            PendingIntent tapPI = PendingIntent.getActivity(this, 1, fsIntent, piFlags);

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(this, CHANNEL_ID);
            } else {
                builder = new Notification.Builder(this);
            }

            builder.setSmallIcon(android.R.drawable.sym_call_incoming)
                    .setContentTitle(cardTitle)
                    .setContentText(cardSubtext)
                    .setStyle(new Notification.BigTextStyle().bigText(formattedBigText))
                    .setCategory(Notification.CATEGORY_CALL)
                    .setPriority(Notification.PRIORITY_MAX)
                    .setVibrate(new long[]{0, 600, 200, 600, 200, 600})
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setContentIntent(tapPI)
                    .setFullScreenIntent(tapPI, true);

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIF_ID, builder.build());
                if (deliveryId != null && !deliveryId.isEmpty()) {
                    nm.notify(hashId(deliveryId), builder.build());
                }
                Log.d(TAG, "Notificação heads-up disparada.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro na notificação: " + e.getMessage());
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Novas Corridas MT 24 Horas",
                    NotificationManager.IMPORTANCE_HIGH
            );
            ch.setDescription("Alertas de alta prioridade para novas corridas");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 600, 200, 600, 200, 600});
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            try {
                android.net.Uri soundUri = android.net.Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.ring);
                android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder()
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build();
                ch.setSound(soundUri, audioAttributes);
            } catch (Exception e) {
                Log.w(TAG, "Falha ao definir som ring.mp3 no canal: " + e.getMessage());
            }

            nm.createNotificationChannel(ch);
        }
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "FCM Token atualizado: " + token);
        // O token será salvo pelo hook JS via PushNotifications.addListener("registration", ...)
    }
}
