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
    public static final String ACTION_SHOW_POPUP = "com.mt24horasexpress.entregador.SHOW_POPUP";
    private static final String CHANNEL_ID = "delivery-incoming-v8";
    private static final int NOTIF_ID = 6666;

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
            Log.d(TAG, "Corrida " + deliveryId + " aceita por outro motorista. Encerrando notificação e popup!");

            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(NOTIF_ID);
                if (deliveryId != null && !deliveryId.isEmpty()) {
                    nm.cancel(hashId(deliveryId));
                }
            }

            if (IncomingCallActivity.instance != null) {
                IncomingCallActivity.instance.runOnUiThread(() -> {
                    try {
                        IncomingCallActivity.instance.finish();
                    } catch (Exception e) {
                        Log.w(TAG, "Erro ao fechar IncomingCallActivity: " + e.getMessage());
                    }
                });
            }

            Intent cancelIntent = new Intent(IncomingCallActivity.ACTION_CANCEL_CALL);
            cancelIntent.putExtra("deliveryId", deliveryId);
            cancelIntent.setPackage(getPackageName());
            sendBroadcast(cancelIntent);
            return;
        }

        boolean isDelivery = "delivery".equals(type) || "INSERT".equals(type) || "UPDATE".equals(type) 
                || "new_delivery".equals(type) || data.containsKey("deliveryId") || data.containsKey("delivery_id");
        if (!isDelivery) return;

        String deliveryId = data.get("deliveryId");
        if (deliveryId == null || deliveryId.isEmpty()) deliveryId = data.get("delivery_id");
        if (deliveryId == null || deliveryId.isEmpty()) deliveryId = data.get("id");

        String address    = data.get("address");
        if (address == null || address.isEmpty()) address = data.get("details");

        String title      = data.get("title");
        String storeName  = data.get("storeName");
        if (storeName == null || storeName.isEmpty()) storeName = data.get("store_name");
        if (storeName == null || storeName.isEmpty()) storeName = data.get("company_name");

        String pickup     = data.get("pickup");
        if (pickup == null || pickup.isEmpty()) pickup = data.get("pickup_address");

        String dropoff    = data.get("dropoff");
        if (dropoff == null || dropoff.isEmpty()) dropoff = data.get("delivery_address");

        String fee        = data.get("fee");
        if (fee == null || fee.isEmpty()) fee = data.get("delivery_fee");
        if (storeName == null) storeName = "";
        if (pickup    == null) pickup    = "";
        if (dropoff   == null) dropoff   = "";
        if (fee       == null) fee       = "";

        if (address != null && address.contains("Veja no app")) {
            address = address.replace("Veja no app", "Retirada na Loja");
        }

        // Extrai o nome da loja e o endereço de entrega do bloco formatado caso venha como fallback
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

        String details    = (title  != null && !title.isEmpty()   ? title + "\n"  : "")
                          + (address != null && !address.isEmpty() ? address        : "");
        if (details.trim().isEmpty()) details = "Nova corrida disponível!";
        if (details.contains("Veja no app")) {
            details = details.replace("Veja no app", "Retirada na Loja");
        }

        // Salva para a IncomingCallActivity ler quando abrir
        DeliveryOverlayPlugin.latestDetails    = details;
        DeliveryOverlayPlugin.latestDeliveryId = deliveryId != null ? deliveryId : "";
        DeliveryOverlayPlugin.latestStore      = storeName;
        DeliveryOverlayPlugin.latestPickup     = pickup;
        DeliveryOverlayPlugin.latestDropoff    = dropoff;
        DeliveryOverlayPlugin.latestFee        = fee;

        Log.d(TAG, "Popup para deliveryId=" + deliveryId);

        // ── CAMADA 1: via OverlayService (foreground service pode chamar startActivity no Android 10+)
        try {
            Intent svcIntent = new Intent(this, OverlayService.class);
            svcIntent.setAction(ACTION_SHOW_POPUP);
            svcIntent.putExtra("details",    details);
            svcIntent.putExtra("deliveryId", deliveryId);
            svcIntent.putExtra("storeName", storeName);
            svcIntent.putExtra("pickup",     pickup);
            svcIntent.putExtra("dropoff",    dropoff);
            svcIntent.putExtra("fee",        fee);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(svcIntent);
            } else {
                startService(svcIntent);
            }
            Log.d(TAG, "OverlayService SHOW_POPUP iniciado.");
        } catch (Exception e) {
            Log.w(TAG, "Falha ao iniciar OverlayService: " + e.getMessage());
        }

        // ── CAMADA 2: startActivity direto (funciona quando SYSTEM_ALERT_WINDOW está ativo)
        try {
            Intent actIntent = new Intent(this, IncomingCallActivity.class);
            actIntent.putExtra("details",    details);
            actIntent.putExtra("deliveryId", deliveryId);
            actIntent.putExtra("storeName", storeName);
            actIntent.putExtra("pickup",     pickup);
            actIntent.putExtra("dropoff",    dropoff);
            actIntent.putExtra("fee",        fee);
            actIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(actIntent);
            Log.d(TAG, "startActivity direto disparado.");
        } catch (Exception e) {
            Log.w(TAG, "startActivity bloqueado: " + e.getMessage());
        }

        // ── CAMADA 3: Notification heads-up & Full Screen Intent (Popup nativo)
        try {
            ensureChannel();

            Intent fsIntent = new Intent(this, IncomingCallActivity.class);
            fsIntent.putExtra("details",    details);
            fsIntent.putExtra("deliveryId", deliveryId);
            fsIntent.putExtra("storeName", storeName);
            fsIntent.putExtra("pickup",     pickup);
            fsIntent.putExtra("dropoff",    dropoff);
            fsIntent.putExtra("fee",        fee);
            fsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;

            PendingIntent tapPI = PendingIntent.getActivity(this, 1, fsIntent, piFlags);

            android.net.Uri sound = android.net.Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.ring);

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(this, NotificationChannels.INCOMING_CHANNEL_ID);
            } else {
                builder = new Notification.Builder(this);
            }

        // Override estrito de title e storeName para garantir o Nome da Loja
        if (title != null && title.contains("Nova corrida") && address != null && address.contains("🏬 Loja:")) {
            try {
                int startIdx = address.indexOf("🏬 Loja:") + "🏬 Loja:".length();
                int endIdx = address.indexOf("\n", startIdx);
                String parsedStore = (endIdx != -1 ? address.substring(startIdx, endIdx) : address.substring(startIdx)).trim();
                if (!parsedStore.isEmpty() && !"Loja Parceira".equalsIgnoreCase(parsedStore)) {
                    storeName = parsedStore;
                }
            } catch (Exception e) {}
        }

        String finalStoreName = (storeName != null && !storeName.trim().isEmpty() && !"Loja Parceira".equalsIgnoreCase(storeName.trim()))
                ? storeName.trim()
                : "MT 24 Horas Express Delivery";

        String cardTitle = "🏬 " + finalStoreName;

            String cardSubtext = (dropoff != null && !dropoff.trim().isEmpty() && !"Endereço do cliente".equalsIgnoreCase(dropoff.trim()))
                    ? "🏁 Entrega: " + dropoff.trim()
                    : "📍 Retirada na Loja";

            String formattedBigText = "🏬 Loja: " + finalStoreName
                    + "\n📍 Coleta: " + (pickup != null && !pickup.trim().isEmpty() ? pickup : "Retirada na Loja")
                    + "\n🏁 Entrega: " + (dropoff != null && !dropoff.trim().isEmpty() ? dropoff : "Endereço do cliente")
                    + "\n💰 Ganhos: " + (fee != null && !fee.trim().isEmpty() ? fee : "A calcular");

            builder.setSmallIcon(android.R.drawable.sym_call_incoming)
                    .setContentTitle(cardTitle)
                    .setContentText(cardSubtext)
                    .setStyle(new Notification.BigTextStyle().bigText(formattedBigText))
                    .setCategory(Notification.CATEGORY_CALL)
                    .setPriority(Notification.PRIORITY_MAX)
                    .setSound(sound)
                    .setVibrate(new long[]{0, 600, 200, 600, 200, 600})
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setContentIntent(tapPI);

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
        NotificationChannels.ensureIncomingChannel(this);
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "FCM Token: " + token);
    }
}
