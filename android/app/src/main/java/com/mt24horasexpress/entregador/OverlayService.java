package com.mt24horasexpress.entregador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
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
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class OverlayService extends Service {

    private static final String TAG = "OverlayService";
    private static final String FG_CHANNEL_ID = "overlay_service_v25_silent";
    private static final int    FG_NOTIF_ID   = 1;
    public  static final String ACTION_KEEP_ALIVE = "com.mt24horasexpress.entregador.KEEP_ALIVE";
    public  static final String ACTION_SHOW_DELIVERY = "com.mt24horasexpress.entregador.SHOW_DELIVERY";
    public  static final String ACTION_HIDE_DELIVERY = "com.mt24horasexpress.entregador.HIDE_DELIVERY";

    public static OverlayService instance;

    private WindowManager windowManager;
    private View floatingView;
    private WindowManager.LayoutParams windowParams;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Keep-alive locks: mantêm CPU e rede ativos enquanto o entregador está Online
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback networkCallback;

    private String currentDeliveryId;

    private static final String SUPABASE_URL = "https://owlbzwsdcognrgolvnzg.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93bGJ6d3NkY29nbnJnb2x2bnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5OTQ1NTMsImV4cCI6MjA5NTU3MDU1M30.R6-FUqubIr3uABzv1CS7jiS5cwygrNiIqk4oNbq7O44";

    private ScheduledExecutorService pollingExecutor;

    private static long parseIsoDate(String dateStr) {
        if (dateStr == null || dateStr.trim().isEmpty()) return System.currentTimeMillis();
        try {
            String s = dateStr.trim().replace(" ", "T");
            boolean hasTz = s.endsWith("Z") || s.contains("+") || (s.length() > 6 && (s.charAt(s.length() - 6) == '-' || s.charAt(s.length() - 3) == '-'));
            if (hasTz) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    return java.time.Instant.parse(s).toEpochMilli();
                } else {
                    java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
                    sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                    return sdf.parse(s.substring(0, Math.min(19, s.length()))).getTime();
                }
            } else {
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
                return sdf.parse(s.substring(0, Math.min(19, s.length()))).getTime();
            }
        } catch (Exception e) {
            return System.currentTimeMillis();
        }
    }

    private void startBackgroundPolling() {
        if (pollingExecutor != null && !pollingExecutor.isShutdown()) return;
        pollingExecutor = Executors.newSingleThreadScheduledExecutor();
        pollingExecutor.scheduleWithFixedDelay(() -> {
            try {
                pollSupabaseDeliveries();
            } catch (Exception e) {
                Log.w(TAG, "Erro no polling nativo de segundo plano: " + e.getMessage());
            }
        }, 2, 5, TimeUnit.SECONDS);
        Log.i(TAG, "Polling nativo continuo iniciado (5s).");
    }

    private void stopBackgroundPolling() {
        if (pollingExecutor != null) {
            try {
                pollingExecutor.shutdownNow();
            } catch (Exception ignored) {}
            pollingExecutor = null;
        }
    }

    private void pollSupabaseDeliveries() {
        boolean driverOnline = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean("is_online", true);
        if (!driverOnline) return;

        String userToken = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getString("user_token", "");
        String myDriverId = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getString("driver_id", "");

        HttpURLConnection conn = null;
        try {
            String endpoint = SUPABASE_URL + "/rest/v1/deliveries"
                    + "?select=id,short_id,customer_name,address,delivery_address,pickup_address,value,price,delivery_fee,commission,status,driver_id,created_at,company_name,companies(name,address)"
                    + "&status=in.(pending,broadcasted)"
                    + "&order=created_at.desc"
                    + "&limit=10";

            URL url = new URL(endpoint);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + (userToken != null && !userToken.isEmpty() ? userToken : SUPABASE_ANON_KEY));
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                return;
            }

            BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = in.readLine()) != null) {
                sb.append(line);
            }
            in.close();

            JSONArray array = new JSONArray(sb.toString());

            for (int i = 0; i < array.length(); i++) {
                JSONObject item = array.getJSONObject(i);
                String id = item.optString("id", "");
                if (id.isEmpty()) continue;

                String status = item.optString("status", "").toLowerCase();
                String driverId = item.optString("driver_id", "");
                String createdAt = item.optString("created_at", "");

                // Se atribuida a outro entregador, ignora
                if (!driverId.isEmpty() && !"none".equalsIgnoreCase(driverId) && !"00000000-0000-0000-0000-000000000000".equals(driverId)) {
                    if (!myDriverId.isEmpty() && !myDriverId.equalsIgnoreCase(driverId)) {
                        continue;
                    }
                }

                String storeName = "";
                JSONObject compObj = item.optJSONObject("companies");
                if (compObj != null) {
                    storeName = compObj.optString("name", "");
                }
                if (storeName.isEmpty()) storeName = item.optString("company_name", "");
                if (storeName.isEmpty()) storeName = "MT 24 Horas Express";

                String pickup = item.optString("pickup_address", "");
                if (pickup.isEmpty()) pickup = "Retirada na Loja";

                String dropoff = item.optString("delivery_address", "");
                if (dropoff.isEmpty()) dropoff = item.optString("address", "Endereço do cliente");

                String rawFee = item.optString("commission", "");
                if (rawFee.isEmpty() || "0".equals(rawFee)) rawFee = item.optString("delivery_fee", "");
                if (rawFee.isEmpty() || "0".equals(rawFee)) rawFee = item.optString("price", "");
                if (rawFee.isEmpty() || "0".equals(rawFee)) rawFee = item.optString("value", "10");

                String feeFormatted = "R$ " + rawFee;
                try {
                    double val = Double.parseDouble(rawFee.replace(",", "."));
                    if (item.isNull("commission") || item.optDouble("commission", 0) <= 0) {
                        val = val * 0.75;
                    }
                    feeFormatted = String.format(Locale.US, "R$ %.2f", val).replace(".", ",");
                } catch (Exception ignored) {}

                String details = "🏬 Loja: " + storeName
                        + "\n📍 Coleta: " + pickup
                        + "\n🏁 Entrega: " + dropoff
                        + "\n💰 Ganhos: " + feeFormatted;

                // 1. Se atribuida diretamente para mim: alerta IMEDIATO
                boolean isAssignedToMe = !driverId.isEmpty() && !myDriverId.isEmpty() && myDriverId.equalsIgnoreCase(driverId);
                if (isAssignedToMe) {
                    MyFirebaseMessagingService.postDeliveryNotification(OverlayService.this, id, storeName, pickup, dropoff, feeFormatted, details);
                    continue;
                }

                // 2. Se transmitida para todos pelo Admin ('broadcasted'): alerta IMEDIATO
                if ("broadcasted".equals(status)) {
                    MyFirebaseMessagingService.postDeliveryNotification(OverlayService.this, id, storeName, pickup, dropoff, feeFormatted, details);
                    continue;
                }

                // 3. Status pending sem atribuicao direta: REGRA DOS 2 MINUTOS DO ADMIN
                long createdAtMs = parseIsoDate(createdAt);
                long elapsed = System.currentTimeMillis() - createdAtMs;
                if (elapsed >= 120_000) {
                    MyFirebaseMessagingService.postDeliveryNotification(OverlayService.this, id, storeName, pickup, dropoff, feeFormatted, details);
                } else {
                    long remainingMs = Math.max(1000, 120_000 - elapsed);
                    MyFirebaseMessagingService.scheduleAlarmManager(OverlayService.this, id, storeName, pickup, dropoff, feeFormatted, details, remainingMs);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Polling nativo falhou: " + e.getMessage());
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        startForegroundNotification();
        acquireKeepAliveLocks();
        startBackgroundPolling();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        instance = this;
        startForegroundNotification();
        acquireKeepAliveLocks();
        startBackgroundPolling();
        ensureOverlayView();

        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_SHOW_DELIVERY.equals(action)) {
                String deliveryId = intent.getStringExtra("deliveryId");
                String storeName  = intent.getStringExtra("storeName");
                String pickup     = intent.getStringExtra("pickup");
                String dropoff    = intent.getStringExtra("dropoff");
                String fee        = intent.getStringExtra("fee");
                showDeliveryCard(deliveryId, storeName, pickup, dropoff, fee);
            } else if (ACTION_HIDE_DELIVERY.equals(action)) {
                String deliveryId = intent.getStringExtra("deliveryId");
                hideDeliveryCard(deliveryId);
            }
        }

        return START_STICKY;
    }

    private synchronized void ensureOverlayView() {
        // Overlay visual desativado por solicitação do usuário.
        // O serviço atua exclusivamente como Foreground Service silencioso para manter a conexão ativa em 2º plano.
    }

    public void hideOverlayBubble() {
        NativeSoundPlayer.stopSound();
        mainHandler.post(() -> {
            try {
                if (floatingView != null && windowManager != null) {
                    windowManager.removeView(floatingView);
                    floatingView = null;
                }
            } catch (Exception ignored) {}
            stopSelf();
        });
    }

    public void showDeliveryCard(final String deliveryId, final String storeName, final String pickup, final String dropoff, final String fee) {
        mainHandler.post(() -> {
            // DENTRO DO APP: NUNCA exibir popup flutuante! O entregador aceita/recusa diretamente pelos botões na tela do app.
            if (MainActivity.isForeground) {
                Log.d(TAG, "MainActivity está em primeiro plano — popup flutuante suprimido.");
                return;
            }

            ensureOverlayView();
            if (floatingView == null) return;

            // Acende a tela imediatamente se o aparelho estiver bloqueado ou apagado
            try {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                if (pm != null) {
                    PowerManager.WakeLock screenLock = pm.newWakeLock(
                            PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                            "MT24HorasEntregador::ScreenWakeAlert");
                    screenLock.acquire(15000);
                }
            } catch (Exception e) {
                Log.w(TAG, "Erro ao acordar tela: " + e.getMessage());
            }

            this.currentDeliveryId = deliveryId;

            // Exibe e preenche o Card Flutuante Branco (deliveryCardContainer)
            try {
                View cardContainer = floatingView.findViewById(R.id.deliveryCardContainer);
                if (cardContainer != null) {
                    cardContainer.setVisibility(View.VISIBLE);

                    TextView txtStore = floatingView.findViewById(R.id.cardStoreName);
                    TextView txtEarnings = floatingView.findViewById(R.id.cardEarnings);
                    TextView txtPickup = floatingView.findViewById(R.id.cardPickup);
                    TextView txtDropoff = floatingView.findViewById(R.id.cardDropoff);
                    Button btnDecline = floatingView.findViewById(R.id.cardBtnDecline);
                    Button btnAccept = floatingView.findViewById(R.id.cardBtnAccept);
                    ImageView closeBtn = floatingView.findViewById(R.id.cardCloseBtn);

                    String finalStore = (storeName != null && !storeName.trim().isEmpty() && !"Loja Parceira".equalsIgnoreCase(storeName.trim()))
                            ? storeName.trim()
                            : "Nova Corrida Disponível";
                    String finalFee = (fee != null && !fee.trim().isEmpty()) ? fee.trim() : "A calcular";
                    String finalPickup = (pickup != null && !pickup.trim().isEmpty()) ? pickup.trim() : "Retirada na Loja";
                    String finalDropoff = (dropoff != null && !dropoff.trim().isEmpty()) ? dropoff.trim() : "Endereço do cliente";

                    if (txtStore != null) txtStore.setText(finalStore);
                    String displayEarnings = finalFee;
                    if (!displayEarnings.toLowerCase().startsWith("ganhos:")) {
                        displayEarnings = "Ganhos: " + displayEarnings;
                    }
                    if (txtEarnings != null) txtEarnings.setText(displayEarnings);
                    if (txtPickup != null) txtPickup.setText("📍 Coleta: " + finalPickup);
                    if (txtDropoff != null) txtDropoff.setText("🏁 Entrega: " + finalDropoff);

                    if (btnDecline != null) {
                        btnDecline.setOnClickListener(v -> {
                            Log.d(TAG, "Botão RECUSAR clicado no card branco.");
                            NativeSoundPlayer.stopSound();
                            hideDeliveryCard(deliveryId);
                            if (DeliveryOverlayPlugin.instance != null) {
                                DeliveryOverlayPlugin.instance.triggerDeliveryDeclined(deliveryId);
                                DeliveryOverlayPlugin.instance.triggerCallResponse("reject", deliveryId);
                            }
                            MyFirebaseMessagingService.dismissDeliveryAlert(OverlayService.this, deliveryId);
                        });
                    }

                    if (btnAccept != null) {
                        btnAccept.setOnClickListener(v -> {
                            Log.d(TAG, "Botão ACEITAR clicado no card branco.");
                            NativeSoundPlayer.stopSound();
                            hideDeliveryCard(deliveryId);
                            DeliveryOverlayPlugin.setPendingAccepted(deliveryId);
                            if (DeliveryOverlayPlugin.instance != null) {
                                DeliveryOverlayPlugin.instance.triggerDeliveryAccepted(deliveryId);
                                DeliveryOverlayPlugin.instance.triggerCallResponse("accept", deliveryId);
                            }
                            MyFirebaseMessagingService.dismissDeliveryAlert(OverlayService.this, deliveryId);

                            Intent openApp = new Intent(OverlayService.this, MainActivity.class);
                            openApp.putExtra("deliveryId", deliveryId);
                            openApp.putExtra("action", "accept");
                            openApp.putExtra("route", "/driver/deliveries?deliveryId=" + deliveryId + "&action=accept");
                            openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                            startActivity(openApp);
                        });
                    }

                    if (closeBtn != null) {
                        closeBtn.setOnClickListener(v -> {
                            NativeSoundPlayer.stopSound();
                            hideDeliveryCard(deliveryId);
                            MyFirebaseMessagingService.dismissDeliveryAlert(OverlayService.this, deliveryId);
                        });
                    }

                    if (windowManager != null && windowParams != null) {
                        windowManager.updateViewLayout(floatingView, windowParams);
                    }
                }
            } catch (Exception eCard) {
                Log.e(TAG, "Erro ao configurar card flutuante branco: " + eCard.getMessage());
            }
        });
    }

    public void hideDeliveryCard(String deliveryId) {
        NativeSoundPlayer.stopSound();
        mainHandler.post(() -> {
            if (floatingView != null) {
                View cardContainer = floatingView.findViewById(R.id.deliveryCardContainer);
                if (cardContainer != null) {
                    cardContainer.setVisibility(View.GONE);
                    if (windowManager != null && windowParams != null && floatingView != null) {
                        windowManager.updateViewLayout(floatingView, windowParams);
                    }
                }
            }
            if (deliveryId != null && deliveryId.equals(this.currentDeliveryId)) {
                this.currentDeliveryId = null;
            }
        });
    }

    private void startForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                try {
                    nm.deleteNotificationChannel("overlay_service_channel");
                    nm.deleteNotificationChannel("overlay_service");
                } catch (Exception ignored) {}
                if (nm.getNotificationChannel(FG_CHANNEL_ID) == null) {
                    NotificationChannel ch = new NotificationChannel(
                            FG_CHANNEL_ID, "Serviço em Segundo Plano", NotificationManager.IMPORTANCE_LOW);
                    ch.setSound(null, null);
                    ch.enableVibration(false);
                    ch.setShowBadge(false);
                    nm.createNotificationChannel(ch);
                }
            }
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, piFlags);

        Notification notification = new NotificationCompat.Builder(this, FG_CHANNEL_ID)
                .setContentTitle("MT 24 Horas Entregador")
                .setContentText("Disponível para entregas")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pi)
                .setOngoing(true)
                .setSilent(true)
                .setSound(null)
                .setDefaults(0)
                .build();

        startForeground(FG_NOTIF_ID, notification);
    }

    private void acquireKeepAliveLocks() {
        // ── WAKE LOCK: mantém a CPU ativa para polling/websocket não morrer
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "MT24HorasEntregador::OverlayWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire();
                Log.d(TAG, "WakeLock adquirido — CPU ativa em segundo plano.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao adquirir WakeLock: " + e.getMessage());
        }

        // ── WIFI LOCK: mantém a conexão Wi-Fi ativa em modo de alto desempenho
        try {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(
                        WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                        "MT24HorasEntregador::OverlayWifiLock");
                wifiLock.setReferenceCounted(false);
                wifiLock.acquire();
                Log.d(TAG, "WifiLock adquirido — Wi-Fi ativo em segundo plano.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao adquirir WifiLock: " + e.getMessage());
        }

        // ── NETWORK CALLBACK: solicita que o sistema mantenha a rede ativa
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
            if (cm != null) {
                NetworkRequest request = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        Log.d(TAG, "Rede disponível — conexão mantida.");
                    }
                    @Override
                    public void onLost(Network network) {
                        Log.w(TAG, "Rede perdida — aguardando reconexão.");
                    }
                };
                cm.registerNetworkCallback(request, networkCallback);
                Log.d(TAG, "NetworkCallback registrado.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao registrar NetworkCallback: " + e.getMessage());
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // O usuário fechou o app da lista de recentes: religa o serviço
        // para continuar recebendo corridas por FCM.
        try {
            Intent restart = new Intent(getApplicationContext(), OverlayService.class);
            restart.setAction(ACTION_KEEP_ALIVE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(restart);
            } else {
                getApplicationContext().startService(restart);
            }
        } catch (Exception e) {
            Log.w(TAG, "Falha ao religar após task removida: " + e.getMessage());
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        instance = null;
        stopBackgroundPolling();

        // Libera WakeLock
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
                Log.d(TAG, "WakeLock liberado.");
            }
        } catch (Exception e) { /* ignore */ }

        // Libera WifiLock
        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
                Log.d(TAG, "WifiLock liberado.");
            }
        } catch (Exception e) { /* ignore */ }

        // Desregistra NetworkCallback
        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
                if (cm != null) {
                    cm.unregisterNetworkCallback(networkCallback);
                }
                networkCallback = null;
                Log.d(TAG, "NetworkCallback desregistrado.");
            }
        } catch (Exception e) { /* ignore */ }

        // Remove a floating view se existir
        if (floatingView != null && windowManager != null) {
            try {
                windowManager.removeView(floatingView);
            } catch (Exception e) { /* ignore */ }
            floatingView = null;
        }

        // Se o entregador ainda estiver marcado como online, reativa o serviço imediatamente
        try {
            boolean isOnline = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean("is_online", false);
            if (isOnline) {
                Intent restartIntent = new Intent(getApplicationContext(), OverlayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getApplicationContext().startForegroundService(restartIntent);
                } else {
                    getApplicationContext().startService(restartIntent);
                }
            }
        } catch (Exception ignored) {}
    }
}
