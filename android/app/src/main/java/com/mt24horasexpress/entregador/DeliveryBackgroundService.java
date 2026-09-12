package com.mt24horasexpress.entregador;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Serviço em primeiro plano (Foreground Service) oficial do MT 24 Horas Express.
 * Garante que o app NUNCA seja suspenso ou desligado pelo Android quando o entregador
 * estiver fora dele (segundo plano, tela apagada, outros apps abertos).
 * Monitora e notifica na CENTRAL DO APARELHO instantaneamente com som e botões de ação.
 */
public class DeliveryBackgroundService extends Service {

    private static final String TAG = "DeliveryBgService";
    private static final int FOREGROUND_NOTIFICATION_ID = 88888;
    private static final long POLL_INTERVAL_MS = 2500L;

    private static final String SUPABASE_URL = "https://owlbzwsdcognrgolvnzg.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGJ6d3NkY29nbnJnb2x2bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQ1NTMsImV4cCI6MjA5NTU3MDU1M30.R6-FUqubIr3uABzv1CS7jiS5cwygrNiIqk4oNbq7O44";

    public static volatile boolean isRunning = false;
    private ScheduledExecutorService executorService;
    private final Set<String> alertedDeliveries = Collections.synchronizedSet(new HashSet<>());
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public static void startService(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, DeliveryBackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar DeliveryBackgroundService: " + e.getMessage());
        }
    }

    public static void stopService(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, DeliveryBackgroundService.class);
            context.stopService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao parar DeliveryBackgroundService: " + e.getMessage());
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        Log.i(TAG, "DeliveryBackgroundService criado. Iniciando Foreground...");

        NotificationChannels.ensureIncomingChannel(this);
        startAsForeground();
        startPolling();
    }

    private void startAsForeground() {
        try {
            Intent appIntent = new Intent(this, MainActivity.class);
            appIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getActivity(this, 0, appIntent, piFlags);

            Notification notification = new NotificationCompat.Builder(this, NotificationChannels.SERVICE_CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle("MT 24 Horas Express - Entregador")
                    .setContentText("Online • Monitorando novas corridas na central")
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setCategory(NotificationCompat.CATEGORY_SERVICE)
                    .setOngoing(true)
                    .setContentIntent(pi)
                    .build();

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(FOREGROUND_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(FOREGROUND_NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao configurar startForeground: " + e.getMessage());
        }
    }

    private void startPolling() {
        if (executorService != null && !executorService.isShutdown()) {
            return;
        }
        executorService = Executors.newSingleThreadScheduledExecutor();
        executorService.scheduleWithFixedDelay(this::pollDeliveries, 1000L, POLL_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }

    private void pollDeliveries() {
        try {
            SharedPreferences prefs = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE);
            boolean isOnline = prefs.getBoolean("is_online", true);
            if (!isOnline) {
                return;
            }

            String myDriverId = prefs.getString("driver_id", "");
            String myUserId = prefs.getString("user_id", "");
            String userToken = prefs.getString("user_token", "");

            String authHeader = (userToken != null && !userToken.isEmpty())
                    ? "Bearer " + userToken
                    : "Bearer " + SUPABASE_ANON_KEY;

            String endpoint = SUPABASE_URL + "/rest/v1/deliveries"
                    + "?status=in.(pending,broadcasted)"
                    + "&select=id,status,pickup_address,delivery_address,value,price,delivery_fee,driver_fee,created_at,company_name,store_name,driver_id"
                    + "&order=created_at.desc"
                    + "&limit=5";

            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", authHeader);
            conn.setRequestProperty("Accept", "application/json");

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                conn.disconnect();
                return;
            }

            InputStream is = conn.getInputStream();
            BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            conn.disconnect();

            JSONArray array = new JSONArray(sb.toString());
            Set<String> currentPendingIds = new HashSet<>();

            for (int i = 0; i < array.length(); i++) {
                JSONObject obj = array.getJSONObject(i);
                String id = obj.optString("id");
                if (id == null || id.isEmpty()) continue;

                currentPendingIds.add(id);

                String assignedDriverId = obj.optString("driver_id", "");
                if (!assignedDriverId.isEmpty() && !"null".equalsIgnoreCase(assignedDriverId)) {
                    boolean isForMe = (!myDriverId.isEmpty() && myDriverId.equalsIgnoreCase(assignedDriverId))
                            || (!myUserId.isEmpty() && myUserId.equalsIgnoreCase(assignedDriverId));
                    if (!isForMe) {
                        continue;
                    }
                }

                if (alertedDeliveries.contains(id)) {
                    continue;
                }

                alertedDeliveries.add(id);

                String rawStore = obj.optString("store_name", "");
                final String finalStore = (!rawStore.isEmpty() && !"null".equalsIgnoreCase(rawStore))
                        ? rawStore
                        : obj.optString("company_name", "MT 24 Horas Express");

                final String finalPickup = obj.optString("pickup_address", "Retirada na Loja");
                final String finalDropoff = obj.optString("delivery_address", "Endereço do cliente");

                double val = obj.optDouble("value", 0.0);
                if (val <= 0) val = obj.optDouble("price", 0.0);
                if (val <= 0) val = obj.optDouble("delivery_fee", 0.0);
                if (val <= 0) val = obj.optDouble("driver_fee", 0.0);

                double driverFee = val > 0 ? val * 0.75 : 0.0;
                final String finalFee = driverFee > 0
                        ? String.format(Locale.US, "R$ %.2f", driverFee).replace(".", ",")
                        : "R$ 0,00";

                final String finalDetails = "🏬 Loja: " + finalStore
                        + "\n📍 Coleta: " + finalPickup
                        + "\n🏁 Entrega: " + finalDropoff
                        + "\n💰 Ganhos: " + finalFee;

                final String finalId = id;

                Log.i(TAG, "NOVA CORRIDA DETECTADA EM SEGUNDO PLANO! ID: " + finalId + " - Notificando na central...");

                mainHandler.post(() -> {
                    MyFirebaseMessagingService.postDeliveryNotification(
                            getApplicationContext(),
                            finalId,
                            finalStore,
                            finalPickup,
                            finalDropoff,
                            finalFee,
                            finalDetails
                    );
                });
            }

            alertedDeliveries.retainAll(currentPendingIds);

        } catch (Exception e) {
            // Falha de rede momentânea
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();
        startPolling();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        Log.i(TAG, "DeliveryBackgroundService destruído.");
        if (executorService != null) {
            executorService.shutdownNow();
            executorService = null;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
