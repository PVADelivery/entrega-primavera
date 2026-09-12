package com.mt24horasexpress.entregador;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
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
 * Mantém WakeLock e WifiLock ativos para que o aparelho NUNCA durma ou congele o monitoramento
 * quando a tela estiver apagada ou o app estiver em segundo plano.
 * Agenda alarmes exatos no AlarmManager aos 2 minutos para despertar o aparelho mesmo em Doze Mode.
 */
public class DeliveryBackgroundService extends Service {

    private static final String TAG = "DeliveryBgService";
    private static final int FOREGROUND_NOTIFICATION_ID = 88888;
    private static final long POLL_INTERVAL_MS = 3000L;
    public static final String ACTION_HEARTBEAT = "com.mt24horasexpress.entregador.HEARTBEAT";

    private static final String SUPABASE_URL = "https://owlbzwsdcognrgolvnzg.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGJ6d3NkY29nbnJnb2x2bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQ1NTMsImV4cCI6MjA5NTU3MDU1M30.R6-FUqubIr3uABzv1CS7jiS5cwygrNiIqk4oNbq7O44";

    public static volatile boolean isRunning = false;
    private ScheduledExecutorService executorService;
    private final Set<String> alertedDeliveries = Collections.synchronizedSet(new HashSet<>());
    private final Set<String> scheduledDeliveries = Collections.synchronizedSet(new HashSet<>());
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Keep-alive locks
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback networkCallback;

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
        Log.i(TAG, "DeliveryBackgroundService criado. Iniciando Foreground e Locks...");

        NotificationChannels.ensureIncomingChannel(this);
        startAsForeground();
        acquireKeepAliveLocks();
        startPolling();
        scheduleWatchdogHeartbeat();
    }

    private void acquireKeepAliveLocks() {
        // 1. PARTIAL_WAKE_LOCK: Garante que a CPU continue rodando o polling mesmo com tela desligada
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "MT24Horas::DeliveryServiceWakeLock"
                );
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
                Log.i(TAG, "WakeLock adquirido — CPU permanecerá ativa em segundo plano.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao adquirir WakeLock: " + e.getMessage());
        }

        // 2. WIFI_MODE_FULL_HIGH_PERF: Garante que a conexão Wi-Fi não caia em modo de economia
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && (wifiLock == null || !wifiLock.isHeld())) {
                wifiLock = wm.createWifiLock(
                        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                        "MT24Horas::DeliveryServiceWifiLock"
                );
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
                Log.i(TAG, "WifiLock adquirido — Wi-Fi ativo em segundo plano.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao adquirir WifiLock: " + e.getMessage());
        }

        // 3. NetworkCallback: Garante que o Android mantenha rotas de rede abertas
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && networkCallback == null) {
                NetworkRequest request = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        Log.d(TAG, "Rede disponível no background service.");
                    }

                    @Override
                    public void onLost(Network network) {
                        Log.w(TAG, "Rede perdida no background service.");
                    }
                };
                cm.registerNetworkCallback(request, networkCallback);
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao registrar NetworkCallback: " + e.getMessage());
        }
    }

    private void releaseKeepAliveLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                Log.d(TAG, "WakeLock liberado.");
            }
        } catch (Exception ignored) {}
        wakeLock = null;

        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
                Log.d(TAG, "WifiLock liberado.");
            }
        } catch (Exception ignored) {}
        wifiLock = null;

        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    cm.unregisterNetworkCallback(networkCallback);
                }
            }
        } catch (Exception ignored) {}
        networkCallback = null;
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

    private void scheduleWatchdogHeartbeat() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;

            Intent intent = new Intent(this, DeliveryBackgroundService.class);
            intent.setAction(ACTION_HEARTBEAT);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pi = PendingIntent.getService(this, 99991, intent, piFlags);
            long triggerAt = System.currentTimeMillis() + 30_000L;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao agendar watchdog: " + e.getMessage());
        }
    }

    private String refreshAccessToken(String refreshToken) {
        if (refreshToken == null || refreshToken.isEmpty()) return null;
        try {
            URL url = new URL(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("refresh_token", refreshToken);

            byte[] out = body.toString().getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(out.length);
            OutputStream os = conn.getOutputStream();
            os.write(out);
            os.flush();
            os.close();

            int code = conn.getResponseCode();
            if (code == 200) {
                InputStream is = conn.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                reader.close();
                conn.disconnect();

                JSONObject resObj = new JSONObject(sb.toString());
                String newAccessToken = resObj.optString("access_token", null);
                String newRefreshToken = resObj.optString("refresh_token", refreshToken);

                if (newAccessToken != null && !newAccessToken.isEmpty()) {
                    SharedPreferences prefs = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE);
                    prefs.edit()
                            .putString("user_token", newAccessToken)
                            .putString("refresh_token", newRefreshToken)
                            .apply();
                    Log.i(TAG, "Token de sessão do entregador renovado com sucesso!");
                    return newAccessToken;
                }
            } else {
                conn.disconnect();
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao renovar token no background service: " + e.getMessage());
        }
        return null;
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
            String refreshToken = prefs.getString("refresh_token", "");

            // Se o userToken estiver vazio mas temos refreshToken, renova de imediato
            if ((userToken == null || userToken.isEmpty()) && refreshToken != null && !refreshToken.isEmpty()) {
                String refreshed = refreshAccessToken(refreshToken);
                if (refreshed != null && !refreshed.isEmpty()) {
                    userToken = refreshed;
                }
            }

            String authHeader = (userToken != null && !userToken.isEmpty())
                    ? "Bearer " + userToken
                    : "Bearer " + SUPABASE_ANON_KEY;

            // Busca corridas com status pending ou broadcasted
            String endpoint = SUPABASE_URL + "/rest/v1/deliveries"
                    + "?status=in.(pending,broadcasted)"
                    + "&select=id,status,pickup_address,delivery_address,address,dropoff_address,value,commission,created_at,company_id,driver_id,companies(name)"
                    + "&order=created_at.desc"
                    + "&limit=8";

            URL url = new URL(endpoint);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(4000);
            conn.setReadTimeout(4000);
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", authHeader);
            conn.setRequestProperty("Accept", "application/json");

            int responseCode = conn.getResponseCode();

            // Se o token expirou (401), tenta renovar usando o refresh_token salvo
            if (responseCode == 401 && refreshToken != null && !refreshToken.isEmpty()) {
                conn.disconnect();
                String newToken = refreshAccessToken(refreshToken);
                if (newToken != null && !newToken.isEmpty()) {
                    authHeader = "Bearer " + newToken;
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(4000);
                    conn.setReadTimeout(4000);
                    conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
                    conn.setRequestProperty("Authorization", authHeader);
                    conn.setRequestProperty("Accept", "application/json");
                    responseCode = conn.getResponseCode();
                }
            }

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
                boolean isForMe = false;
                if (!assignedDriverId.isEmpty() && !"null".equalsIgnoreCase(assignedDriverId)) {
                    isForMe = (!myDriverId.isEmpty() && myDriverId.equalsIgnoreCase(assignedDriverId))
                            || (!myUserId.isEmpty() && myUserId.equalsIgnoreCase(assignedDriverId));
                    if (!isForMe) {
                        continue;
                    }
                }

                String status = obj.optString("status", "pending");
                boolean isBroadcasted = "broadcasted".equalsIgnoreCase(status);

                JSONObject compObj = obj.optJSONObject("companies");
                String rawStore = compObj != null ? compObj.optString("name", "") : "";
                final String finalStore = (!rawStore.isEmpty() && !"null".equalsIgnoreCase(rawStore))
                        ? rawStore
                        : "MT 24 Horas Express";

                String pickup = obj.optString("pickup_address", "");
                if (pickup.isEmpty() || "null".equalsIgnoreCase(pickup)) pickup = "Retirada na Loja";
                final String finalPickup = pickup;

                String dropoff = obj.optString("delivery_address", "");
                if (dropoff.isEmpty() || "null".equalsIgnoreCase(dropoff)) dropoff = obj.optString("dropoff_address", "");
                if (dropoff.isEmpty() || "null".equalsIgnoreCase(dropoff)) dropoff = obj.optString("address", "Endereço do cliente");
                final String finalDropoff = dropoff;

                double val = obj.optDouble("value", 0.0);
                if (val <= 0) val = obj.optDouble("commission", 0.0);

                double driverFee = val > 0 ? val * 0.75 : 0.0;
                final String finalFee = driverFee > 0
                        ? String.format(Locale.US, "R$ %.2f", driverFee).replace(".", ",")
                        : "R$ 0,00";

                final String finalDetails = "🏬 Loja: " + finalStore
                        + "\n📍 Coleta: " + finalPickup
                        + "\n🏁 Entrega: " + finalDropoff
                        + "\n💰 Ganhos: " + finalFee;

                final String finalId = id;

                // REGRA DOS 2 MINUTOS DO ADMIN (120 SEGUNDOS):
                // Se a corrida NÃO foi atribuída diretamente a mim E NÃO foi transmitida pelo admin:
                // Agenda alarme exato no AlarmManager para despertar o aparelho aos 120s!
                if (!isForMe && !isBroadcasted) {
                    String createdAt = obj.optString("created_at", "");
                    long elapsedSeconds = getElapsedSeconds(createdAt);
                    if (elapsedSeconds < 120) {
                        long remainingSeconds = 120 - elapsedSeconds;
                        long delayMs = Math.max(1000L, remainingSeconds * 1000L);

                        if (!scheduledDeliveries.contains(finalId)) {
                            scheduledDeliveries.add(finalId);
                            Log.i(TAG, "Janela Admin: Corrida " + finalId + " criada há " + elapsedSeconds + "s. Agendando alarme nativo para " + remainingSeconds + "s...");
                            MyFirebaseMessagingService.scheduleAlarmManager(
                                    getApplicationContext(),
                                    finalId,
                                    finalStore,
                                    finalPickup,
                                    finalDropoff,
                                    finalFee,
                                    finalDetails,
                                    delayMs
                            );
                        }
                        continue;
                    }
                }

                // Corrida pronta para alertar na central (atribuída, transmitida ou decorridos 120s)
                if (alertedDeliveries.contains(finalId)) {
                    continue;
                }

                alertedDeliveries.add(finalId);
                scheduledDeliveries.remove(finalId);

                Log.i(TAG, "NOVA CORRIDA DISPONÍVEL! ID: " + finalId + " - Notificando com som oficial na central...");

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

            // Cancela alarmes e limpa registros de corridas que já foram aceitas ou canceladas
            for (String scheduledId : new HashSet<>(scheduledDeliveries)) {
                if (!currentPendingIds.contains(scheduledId)) {
                    MyFirebaseMessagingService.cancelAlarmManager(getApplicationContext(), scheduledId);
                    scheduledDeliveries.remove(scheduledId);
                }
            }

            alertedDeliveries.retainAll(currentPendingIds);

        } catch (Exception e) {
            Log.w(TAG, "Exceção em pollDeliveries: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();
        acquireKeepAliveLocks();
        startPolling();

        if (intent != null && ACTION_HEARTBEAT.equals(intent.getAction())) {
            Log.d(TAG, "Watchdog heartbeat disparado. Executando verificação de entregas...");
            pollDeliveries();
            scheduleWatchdogHeartbeat();
        }

        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.i(TAG, "App removido dos recentes. Reiniciando DeliveryBackgroundService imediatamente...");
        try {
            Intent restart = new Intent(getApplicationContext(), DeliveryBackgroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restart);
            } else {
                getApplicationContext().startService(restart);
            }
        } catch (Exception e) {
            Log.w(TAG, "Falha ao reiniciar DeliveryBackgroundService após task removida: " + e.getMessage());
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isRunning = false;
        Log.i(TAG, "DeliveryBackgroundService destruído.");
        releaseKeepAliveLocks();
        if (executorService != null) {
            executorService.shutdownNow();
            executorService = null;
        }
    }

    private static long getElapsedSeconds(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) return 999;
        try {
            String s = dateStr.trim().replace(" ", "T");
            long timeMs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    timeMs = java.time.OffsetDateTime.parse(s).toInstant().toEpochMilli();
                } catch (Exception ex) {
                    timeMs = java.time.Instant.parse(s.endsWith("Z") ? s : s + "Z").toEpochMilli();
                }
            } else {
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
                sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                timeMs = sdf.parse(s.substring(0, Math.min(19, s.length()))).getTime();
            }
            long diffMs = System.currentTimeMillis() - timeMs;
            return Math.max(0, diffMs / 1000);
        } catch (Exception e) {
            return 999;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
