package com.mt24horasexpress.entregador;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MyFirebaseMsgService";

    // ── Deduplicação anti-rajada rápida apenas (3 segundos) ─────────────────
    private static final long DEDUP_WINDOW_MS = 3_000;
    private static final int MAX_TRACKED_ALERTS = 50;
    private static final Map<String, Long> recentAlerts = Collections.synchronizedMap(
            new LinkedHashMap<String, Long>(32, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, Long> eldest) {
                    return size() > MAX_TRACKED_ALERTS;
                }
            });

    // ── Agendamento em segundo plano para a regra dos 2 minutos (120s) ──────
    private static final Map<String, Runnable> scheduledAlerts = new ConcurrentHashMap<>();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    /** Retorna true apenas no primeiro alerta da corrida dentro da janela de 3s. */
    private static boolean markAlertedOnce(String key) {
        long now = System.currentTimeMillis();
        synchronized (recentAlerts) {
            Iterator<Map.Entry<String, Long>> it = recentAlerts.entrySet().iterator();
            while (it.hasNext()) {
                if (now - it.next().getValue() > DEDUP_WINDOW_MS) it.remove();
            }
            Long last = recentAlerts.get(key);
            if (last != null && now - last < DEDUP_WINDOW_MS) return false;
            recentAlerts.put(key, now);
            return true;
        }
    }

    /**
     * Cancelamento vindo do backend (outro entregador aceitou / corrida
     * cancelada pelo lojista / rebroadcast): cancela agendamento pendente no AlarmManager e fecha alertas.
     */
    public static void cancelDeliveryAlert(Context context, String deliveryId) {
        if (deliveryId == null || deliveryId.isEmpty()) return;

        cancelAlarmManager(context, deliveryId);

        Runnable r = scheduledAlerts.remove(deliveryId);
        if (r != null) {
            mainHandler.removeCallbacks(r);
            Log.d(TAG, "Alerta agendado cancelado para corrida: " + deliveryId);
        }

        NativeSoundPlayer.stopSound();
        synchronized (recentAlerts) {
            recentAlerts.remove(deliveryId);
        }
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(hashId(deliveryId));
    }

    /**
     * Aceite/recusa feitos pelo próprio entregador no app: cancela agendamento
     * e remove a notificação da bandeja.
     */
    public static void dismissDeliveryAlert(Context context, String deliveryId) {
        if (deliveryId == null || deliveryId.isEmpty()) return;

        cancelAlarmManager(context, deliveryId);

        Runnable r = scheduledAlerts.remove(deliveryId);
        if (r != null) {
            mainHandler.removeCallbacks(r);
        }

        NativeSoundPlayer.stopSound();
        synchronized (recentAlerts) {
            recentAlerts.remove(deliveryId);
        }
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(hashId(deliveryId));
    }

    public static void cancelAlarmManager(Context context, String deliveryId) {
        if (deliveryId == null || deliveryId.isEmpty() || context == null) return;
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                Intent intent = new Intent(context, DeliveryAlarmReceiver.class);
                intent.setAction("ACTION_ALARM_" + deliveryId);
                int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    piFlags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pi = PendingIntent.getBroadcast(context, hashId(deliveryId), intent, piFlags);
                am.cancel(pi);
                Log.d(TAG, "AlarmManager alarme cancelado para corrida: " + deliveryId);
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao cancelar AlarmManager: " + e.getMessage());
        }
    }

    public static void scheduleAlarmManager(Context context, String deliveryId, String storeName, String pickup, String dropoff, String fee, String details, long delayMs) {
        if (deliveryId == null || deliveryId.isEmpty() || context == null) return;
        try {
            AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(context, DeliveryAlarmReceiver.class);
            intent.setAction("ACTION_ALARM_" + deliveryId);
            intent.putExtra("deliveryId", deliveryId);
            intent.putExtra("storeName", storeName);
            intent.putExtra("pickup", pickup);
            intent.putExtra("dropoff", dropoff);
            intent.putExtra("fee", fee);
            intent.putExtra("details", details);

            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getBroadcast(context, hashId(deliveryId), intent, piFlags);
            long triggerAt = System.currentTimeMillis() + delayMs;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                } catch (SecurityException se) {
                    Log.w(TAG, "Sem permissao especial para setExactAndAllowWhileIdle, usando setAndAllowWhileIdle: " + se.getMessage());
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
                }
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
            Log.d(TAG, "AlarmManager agendado com sucesso para corrida " + deliveryId + " em " + (delayMs / 1000) + " segundos.");
        } catch (Exception e) {
            Log.e(TAG, "Erro ao agendar AlarmManager: " + e.getMessage(), e);
        }
    }

    private static int hashId(String str) {
        if (str == null) return 0;
        int hash = 0;
        for (int i = 0; i < str.length(); i++) {
            hash = ((hash << 5) - hash) + str.charAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    private static long parseIsoDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) return System.currentTimeMillis();
        try {
            String s = dateStr.trim().replace(" ", "T");
            if (!s.endsWith("Z") && !s.contains("+") && !s.substring(Math.max(0, s.length() - 6)).contains("-")) {
                s += "Z";
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                return java.time.Instant.parse(s).toEpochMilli();
            } else {
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
                sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                return sdf.parse(s.substring(0, Math.min(19, s.length()))).getTime();
            }
        } catch (Exception e) {
            return System.currentTimeMillis();
        }
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
            if (deliveryId == null || deliveryId.isEmpty()) deliveryId = data.get("delivery_id");
            Log.d(TAG, "Corrida " + deliveryId + " cancelada/indisponível. Encerrando alerta.");
            cancelDeliveryAlert(this, deliveryId);
            return;
        }

        boolean isDelivery = "delivery".equals(type) || "INSERT".equals(type) || "UPDATE".equals(type)
                || "new_delivery".equals(type) || data.containsKey("deliveryId") || data.containsKey("delivery_id");
        if (!isDelivery) return;

        // ── GUARDA OFFLINE: entregador offline não deve receber som/alerta de corrida.
        boolean driverOnline = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean("is_online", true);
        if (!driverOnline) {
            Log.d(TAG, "Entregador offline — alerta de corrida suprimido.");
            return;
        }

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
        if (fee == null || fee.isEmpty()) fee = data.get("price");
        if (fee == null || fee.isEmpty()) fee = data.get("value");
        if (fee == null || fee.isEmpty()) fee = data.get("commission");
        if (fee == null || fee.isEmpty()) fee = data.get("driver_fee");
        if (fee == null || fee.isEmpty()) fee = data.get("total_value");
        if (storeName == null) storeName = "";
        if (pickup    == null) pickup    = "";
        if (dropoff   == null) dropoff   = "";
        if (fee       == null) fee       = "";

        // Ganhos do entregador: 75% do valor total da entrega
        if (fee.isEmpty() || "0".equals(fee) || "0.00".equals(fee) || "R$ 0,00".equals(fee)) {
            try {
                String rawVal = data.get("value");
                if (rawVal == null || rawVal.isEmpty()) rawVal = data.get("price");
                if (rawVal == null || rawVal.isEmpty()) rawVal = data.get("delivery_fee");
                if (rawVal != null && !rawVal.isEmpty()) {
                    double v = Double.parseDouble(rawVal);
                    if (v > 0) {
                        fee = String.format(Locale.US, "R$ %.2f", v * 0.75).replace(".", ",");
                    }
                }
            } catch (Exception ignored) {}
        }

        if (address != null && address.contains("Veja no app")) {
            address = address.replace("Veja no app", "Retirada na Loja");
        }

        // Extrai o nome da loja, endereço e taxa do bloco formatado caso venham como fallback
        if ((storeName.isEmpty() || "Loja Parceira".equalsIgnoreCase(storeName.trim())) && address != null && address.contains("🏬 Loja:")) {
            try {
                int startIdx = address.indexOf("🏬 Loja:") + "🏬 Loja:".length();
                int endIdx = address.indexOf("\n", startIdx);
                String parsed = (endIdx != -1 ? address.substring(startIdx, endIdx) : address.substring(startIdx)).trim();
                if (!parsed.isEmpty() && !"Loja Parceira".equalsIgnoreCase(parsed)) {
                    storeName = parsed;
                }
            } catch (Exception ignored) {}
        }
        if ((dropoff.isEmpty() || "Endereço do cliente".equalsIgnoreCase(dropoff.trim())) && address != null && address.contains("🏁 Entrega:")) {
            try {
                int startIdx = address.indexOf("🏁 Entrega:") + "🏁 Entrega:".length();
                int endIdx = address.indexOf("\n", startIdx);
                String parsed = (endIdx != -1 ? address.substring(startIdx, endIdx) : address.substring(startIdx)).trim();
                if (!parsed.isEmpty() && !"Endereço do cliente".equalsIgnoreCase(parsed)) {
                    dropoff = parsed;
                }
            } catch (Exception ignored) {}
        }
        if ((fee.isEmpty() || "0".equals(fee) || "0.00".equals(fee) || "R$ 0,00".equals(fee) || "R$ 0.00".equals(fee)) && address != null && address.contains("💰 Ganhos:")) {
            try {
                int startIdx = address.indexOf("💰 Ganhos:") + "💰 Ganhos:".length();
                int endIdx = address.indexOf("\n", startIdx);
                String parsed = (endIdx != -1 ? address.substring(startIdx, endIdx) : address.substring(startIdx)).trim();
                if (!parsed.isEmpty() && !"R$ 0,00".equals(parsed) && !"R$ 0.00".equals(parsed)) {
                    fee = parsed;
                }
            } catch (Exception ignored) {}
        }

        String details    = (title  != null && !title.isEmpty()   ? title + "\n"  : "")
                          + (address != null && !address.isEmpty() ? address        : "");
        if (details.trim().isEmpty()) details = "Nova corrida disponível!";
        if (details.contains("Veja no app")) {
            details = details.replace("Veja no app", "Retirada na Loja");
        }

        // ── REGRA DOS 2 MINUTOS DO ADMIN / ATRIBUIÇÃO DIRETA ────────────────
        String status = data.get("status");
        if (status == null || status.isEmpty()) status = "pending";
        String driverIdInPayload = data.get("driver_id");
        String createdAt = data.get("created_at");

        String myDriverId = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getString("driver_id", "");

        // 1. Se atribuída diretamente a outro entregador, ignora
        if (driverIdInPayload != null && !driverIdInPayload.isEmpty() && !"none".equalsIgnoreCase(driverIdInPayload) && !"00000000-0000-0000-0000-000000000000".equals(driverIdInPayload)) {
            if (myDriverId != null && !myDriverId.isEmpty() && !myDriverId.equalsIgnoreCase(driverIdInPayload)) {
                Log.d(TAG, "Corrida atribuída a outro motorista (" + driverIdInPayload + "). Ignorando.");
                return;
            }
            // Atribuída a mim diretamente: alerta IMEDIATAMENTE!
            triggerDeliveryAlert(deliveryId, storeName, pickup, dropoff, fee, details);
            return;
        }

        // 2. Se transmitida para todos pelo Admin ('broadcasted'): alerta IMEDIATAMENTE!
        if ("broadcasted".equalsIgnoreCase(status)) {
            triggerDeliveryAlert(deliveryId, storeName, pickup, dropoff, fee, details);
            return;
        }

        // 3. Status pending sem atribuição direta: REGRA RIGOROSA DOS 2 MINUTOS!
        long createdAtMs = parseIsoDate(createdAt);
        long elapsed = System.currentTimeMillis() - createdAtMs;
        if (elapsed >= 120_000) {
            Log.d(TAG, "Corrida já completou os 2 minutos (" + (elapsed / 1000) + "s decorridos). Alertando agora!");
            triggerDeliveryAlert(deliveryId, storeName, pickup, dropoff, fee, details);
        } else {
            long remainingMs = Math.max(1000, 120_000 - elapsed);
            Log.d(TAG, "Corrida pending na janela inicial (" + (elapsed / 1000) + "s decorridos). Agendando AlarmManager para despertar em " + (remainingMs / 1000) + "s.");
            scheduleAlarmManager(this, deliveryId, storeName, pickup, dropoff, fee, details, remainingMs);
        }
    }

    public static void triggerDeliveryAlertFromAlarm(Context context, String deliveryId, String storeName, String pickup, String dropoff, String fee, String details) {
        if (context == null) return;
        boolean driverOnline = context.getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean("is_online", true);
        if (!driverOnline) {
            Log.d(TAG, "Entregador offline ao disparar alarme dos 2 minutos — suprimido.");
            return;
        }

        postDeliveryNotification(context, deliveryId, storeName, pickup, dropoff, fee, details);
    }

    public static void postDeliveryNotification(Context context, String deliveryId, String storeName, String pickup, String dropoff, String fee, String details) {
        // ── DEDUPLICAÇÃO ANTI-BURST (3s apenas)
        String dedupKey = (deliveryId != null && !deliveryId.isEmpty())
                ? deliveryId
                : "details:" + details.hashCode();
        if (!markAlertedOnce(dedupKey)) {
            Log.d(TAG, "Push duplicado ignorado para " + dedupKey + " (janela de 3s).");
            return;
        }

        // Salva nos static fields para a IncomingCallActivity / Plugins lerem
        DeliveryOverlayPlugin.latestDetails    = details;
        DeliveryOverlayPlugin.latestDeliveryId = deliveryId != null ? deliveryId : "";
        DeliveryOverlayPlugin.latestStore      = storeName;
        DeliveryOverlayPlugin.latestPickup     = pickup;
        DeliveryOverlayPlugin.latestDropoff    = dropoff;
        DeliveryOverlayPlugin.latestFee        = fee;

        try {
            NotificationChannels.ensureIncomingChannel(context);

            int notificationId = hashId(deliveryId == null ? details : deliveryId);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }

            // Intent para abrir o app principal MainActivity ao tocar na notificacao
            Intent mainIntent = new Intent(context, MainActivity.class);
            mainIntent.putExtra("details", details);
            mainIntent.putExtra("deliveryId", deliveryId);
            mainIntent.putExtra("storeName", storeName);
            mainIntent.putExtra("pickup", pickup);
            mainIntent.putExtra("dropoff", dropoff);
            mainIntent.putExtra("fee", fee);
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

            PendingIntent contentPI = PendingIntent.getActivity(context, notificationId, mainIntent, piFlags);

            // Botão 1: ACEITAR na notificação da central
            Intent acceptIntent = new Intent(context, NotificationActionReceiver.class);
            acceptIntent.setAction("ACTION_ACCEPT");
            acceptIntent.putExtra("deliveryId", deliveryId);
            PendingIntent acceptPI = PendingIntent.getBroadcast(context, notificationId * 10 + 1, acceptIntent, piFlags);

            // Botão 2: RECUSAR na notificação da central
            Intent declineIntent = new Intent(context, NotificationActionReceiver.class);
            declineIntent.setAction("ACTION_DECLINE");
            declineIntent.putExtra("deliveryId", deliveryId);
            PendingIntent declinePI = PendingIntent.getBroadcast(context, notificationId * 10 + 2, declineIntent, piFlags);

            String finalStoreName = (storeName != null && !storeName.trim().isEmpty() && !"Loja Parceira".equalsIgnoreCase(storeName.trim()))
                    ? storeName.trim()
                    : "MT 24 Horas Express";

            String cardTitle = "🏬 " + finalStoreName;

            String cardSubtext = (dropoff != null && !dropoff.trim().isEmpty() && !"Endereço do cliente".equalsIgnoreCase(dropoff.trim()))
                    ? "🏁 Entrega: " + dropoff.trim()
                    : "📍 Retirada na Loja";

            String formattedBigText = "🏬 Loja: " + finalStoreName
                    + "\n📍 Coleta: " + (pickup != null && !pickup.trim().isEmpty() ? pickup : "Retirada na Loja")
                    + "\n🏁 Entrega: " + (dropoff != null && !dropoff.trim().isEmpty() ? dropoff : "Endereço do cliente")
                    + "\n💰 Ganhos: " + (fee != null && !fee.trim().isEmpty() ? fee : "A calcular");

            Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.ring);

            // Constrói notificação na central com som oficial e botões rápidos
            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NotificationChannels.INCOMING_CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(cardTitle)
                    .setContentText(cardSubtext)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(formattedBigText))
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setOnlyAlertOnce(false)
                    .setSound(soundUri)
                    .setContentIntent(contentPI)
                    .addAction(R.mipmap.ic_launcher, "ACEITAR", acceptPI)
                    .addAction(R.mipmap.ic_launcher, "RECUSAR", declinePI);

            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(notificationId, builder.build());
                Log.d(TAG, "Notificação da central disparada para deliveryId=" + deliveryId);
            }

            // Toca o som oficial ring.mp3
            try {
                NativeSoundPlayer.playDeliveryAlert(context);
            } catch (Exception eAudio) {
                Log.w(TAG, "Falha ao acionar NativeSoundPlayer: " + eAudio.getMessage());
            }

        } catch (Exception e) {
            Log.e(TAG, "Erro na notificação: " + e.getMessage());
        }
    }

    private void triggerDeliveryAlert(String deliveryId, String storeName, String pickup, String dropoff, String fee, String details) {
        postDeliveryNotification(this, deliveryId, storeName, pickup, dropoff, fee, details);
    }

    private void ensureChannel() {
        NotificationChannels.ensureIncomingChannel(this);
    }

    @Override
    public void onNewToken(String token) {
        getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("pending_fcm_token", token)
                .apply();
        if (DeliveryOverlayPlugin.instance != null) {
            DeliveryOverlayPlugin.instance.triggerFcmTokenRefresh(token);
        }
        Log.d(TAG, "Novo token FCM armazenado para sincronização.");
    }
}
