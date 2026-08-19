package com.mt24horasexpress.entregador;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class IncomingCallActivity extends Activity {

    private static final String TAG = "IncomingCallActivity";
    public static final String ACTION_UPDATE_CALL = "com.mt24horasexpress.entregador.UPDATE_CALL";
    public static final String ACTION_CANCEL_CALL = "com.mt24horasexpress.entregador.CANCEL_CALL";
    public static final String ACTION_CALL_ACCEPTED = "com.mt24horasexpress.entregador.CALL_ACCEPTED";
    public static final String ACTION_CALL_REJECTED = "com.mt24horasexpress.entregador.CALL_REJECTED";

    private static final String SUPABASE_URL = "https://nptkxlrhrlssdsevpgqe.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wdGt4bHJocmxzc2RzZXZwZ3FlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNDE4MTQsImV4cCI6MjA5MDYxNzgxNH0.t8Cu-yFnSqOURT4GXCZ_mBghpxucT89nRBFlBNA1vZs";

    public static IncomingCallActivity instance;

    private MediaPlayer mediaPlayer;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private String currentDeliveryId = "";

    private Handler checkHandler;
    private Runnable checkRunnable;

    private Button btnAccept;
    private Button btnReject;
    private boolean isSubmitting = false;
    private boolean resultHandled = false;
    private Handler resultTimeoutHandler;
    private Runnable resultTimeoutRunnable;


    private BroadcastReceiver updateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (ACTION_UPDATE_CALL.equals(intent.getAction())) {
                updateCall(
                        intent.getStringExtra("details"),
                        intent.getStringExtra("deliveryId"),
                        intent.getStringExtra("storeName"),
                        intent.getStringExtra("pickup"),
                        intent.getStringExtra("dropoff"),
                        intent.getStringExtra("fee"));
            } else if (ACTION_CANCEL_CALL.equals(intent.getAction())) {
                stopRinging();
                finish();
            }
        }
    };

    public void updateDetails(String details, String deliveryId) {
        updateCall(details, deliveryId, null, null, null, null);
    }

    private String clean(String s) {
        if (s == null) return "";
        s = s.trim();
        if (s.equals("-") || s.equals("—")) return "";
        return s.replace("Veja no app", "Retirada na Loja");
    }

    /**
     * Preenche o card com os campos separados. Se vierem vazios, tenta extrair
     * do texto "details" (formato: Loja: / Coleta: / Entrega: / Ganhos:).
     */
    public void updateCall(String details, String deliveryId,
                           String storeName, String pickup, String dropoff, String fee) {
        if (deliveryId != null && !deliveryId.isEmpty()) {
            currentDeliveryId = deliveryId;
        }

        storeName = clean(storeName);
        pickup    = clean(pickup);
        dropoff   = clean(dropoff);
        fee       = clean(fee);
        details   = clean(details);

        if (!details.isEmpty()) {
            String[] lines = details.split("\\n");
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i].trim();
                String lower = line.toLowerCase();
                if (lower.contains("coleta:")) {
                    if (pickup.isEmpty()) pickup = line.substring(line.indexOf(":") + 1).trim();
                } else if (lower.contains("entrega:")) {
                    if (dropoff.isEmpty()) dropoff = line.substring(line.indexOf(":") + 1).trim();
                } else if (lower.contains("ganhos:")) {
                    if (fee.isEmpty()) fee = line.substring(line.indexOf(":") + 1).trim();
                } else if (lower.contains("loja:")) {
                    if (storeName.isEmpty()) storeName = line.substring(line.indexOf(":") + 1).trim();
                } else if (i == 0 && storeName.isEmpty()
                        && !lower.contains("nova corrida") && !lower.contains("nova entrega")) {
                    storeName = line.replaceAll("^[^\\p{L}\\p{N}]+", "").trim();
                }
            }
        }

        if (storeName.isEmpty() || "Loja Parceira".equalsIgnoreCase(storeName.trim())) storeName = "MT 24 Horas Express Delivery";
        if (pickup.isEmpty())    pickup    = "Retirada na Loja";
        if (dropoff.isEmpty())   dropoff   = "Endereço do cliente";
        if (fee.isEmpty()) fee = "R$ 0,00";
        else if (!fee.toUpperCase().contains("R$")) fee = "R$ " + fee;

        TextView tvStore   = findViewById(R.id.tvStoreName);
        TextView tvEarn    = findViewById(R.id.tvEarnings);
        TextView tvPickup  = findViewById(R.id.tvPickup);
        TextView tvDropoff = findViewById(R.id.tvDropoff);

        if (tvStore   != null) tvStore.setText(storeName);
        if (tvEarn    != null) tvEarn.setText(fee);
        if (tvPickup  != null) tvPickup.setText(pickup);
        if (tvDropoff != null) tvDropoff.setText(dropoff);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_UPDATE_CALL);
        filter.addAction(ACTION_CANCEL_CALL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateReceiver, filter);
        }

        // Acende a tela e mostra sobre a tela de bloqueio
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);

        // Wake lock agressivo para garantir que a tela acende
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK
                            | PowerManager.ACQUIRE_CAUSES_WAKEUP
                            | PowerManager.ON_AFTER_RELEASE,
                    "DeliveryApp:IncomingCall");
            wakeLock.acquire(60000); // 60 segundos max
        }

        setContentView(R.layout.activity_incoming_call);

        btnAccept = findViewById(R.id.btnAccept);
        btnReject = findViewById(R.id.btnReject);

        // Toca o som de alerta
        try {
            mediaPlayer = MediaPlayer.create(this, R.raw.ring);
            if (mediaPlayer != null) {
                mediaPlayer.setLooping(true);
                mediaPlayer.start();
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao tocar som: " + e.getMessage());
        }

        // Vibração pulsante
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            long[] pattern = {0, 1000, 1000};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        }

        // Carrega os detalhes da corrida
        String details = getIntent().getStringExtra("details");
        currentDeliveryId = getIntent().getStringExtra("deliveryId");
        String storeName = getIntent().getStringExtra("storeName");
        String pickup    = getIntent().getStringExtra("pickup");
        String dropoff   = getIntent().getStringExtra("dropoff");
        String fee       = getIntent().getStringExtra("fee");

        // Prioriza dados do plugin estático (mais recentes, vindos do JS ou FCM nativo)
        if (DeliveryOverlayPlugin.latestDetails != null && !DeliveryOverlayPlugin.latestDetails.isEmpty()) {
            details = DeliveryOverlayPlugin.latestDetails;
        }
        if (DeliveryOverlayPlugin.latestDeliveryId != null && !DeliveryOverlayPlugin.latestDeliveryId.isEmpty()) {
            currentDeliveryId = DeliveryOverlayPlugin.latestDeliveryId;
        }
        if (DeliveryOverlayPlugin.latestStore != null && !DeliveryOverlayPlugin.latestStore.isEmpty()) {
            storeName = DeliveryOverlayPlugin.latestStore;
        }
        if (DeliveryOverlayPlugin.latestPickup != null && !DeliveryOverlayPlugin.latestPickup.isEmpty()) {
            pickup = DeliveryOverlayPlugin.latestPickup;
        }
        if (DeliveryOverlayPlugin.latestDropoff != null && !DeliveryOverlayPlugin.latestDropoff.isEmpty()) {
            dropoff = DeliveryOverlayPlugin.latestDropoff;
        }
        if (DeliveryOverlayPlugin.latestFee != null && !DeliveryOverlayPlugin.latestFee.isEmpty()) {
            fee = DeliveryOverlayPlugin.latestFee;
        }

        updateCall(details, currentDeliveryId, storeName, pickup, dropoff, fee);
        applyResponsiveHeight();

        // Se algum dado essencial não veio no payload, completa buscando no Supabase
        boolean incomplete = clean(storeName).isEmpty() || clean(dropoff).isEmpty()
                || clean(pickup).isEmpty() || clean(fee).isEmpty();
        if (incomplete) {
            fetchMissingDetails(currentDeliveryId);
        }


        View btnClose = findViewById(R.id.btnClose);
        if (btnClose != null) {
            btnClose.setOnClickListener(v -> {
                stopRinging();
                stopStatusCheckLoop();
                finish();
            });
        }

        // Inicia verificação automática a cada 1.5s se a corrida continua disponível
        startStatusCheckLoop();

        // ===== BOTÃO ACEITAR =====
        btnAccept.setOnClickListener(v -> {
            if (isSubmitting || resultHandled) return;
            setSubmitting(true, "Aceitando...");
            stopRinging();
            stopStatusCheckLoop();

            final String deliveryId = currentDeliveryId;

            if (DeliveryOverlayPlugin.instance != null) {
                Log.d(TAG, "Aceitar via JS plugin. deliveryId=" + deliveryId);
                startResultTimeout();
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    DeliveryOverlayPlugin.instance.triggerCallResponse("accepted", deliveryId);
                }, 200);
            } else {
                Log.d(TAG, "Aceitar via HTTP nativo (JS indisponível). deliveryId=" + deliveryId);
                new Thread(() -> {
                    final boolean success = acceptDeliveryViaNativeHttp(deliveryId);
                    runOnUiThread(() -> finishWithResult(
                            success,
                            success ? "✅ Corrida aceita!" : "❌ Corrida já foi aceita por outro entregador"));
                }).start();
            }
        });

        // ===== BOTÃO REJEITAR =====
        btnReject.setOnClickListener(v -> {
            if (isSubmitting || resultHandled) return;
            resultHandled = true;
            setSubmitting(true, null);
            btnReject.setText("Recusada");
            stopRinging();
            stopStatusCheckLoop();
            if (DeliveryOverlayPlugin.instance != null) {
                DeliveryOverlayPlugin.instance.triggerCallResponse("rejected", currentDeliveryId);
            }
            Intent intent = new Intent(ACTION_CALL_REJECTED);
            intent.putExtra("deliveryId", currentDeliveryId);
            intent.setPackage(getPackageName());
            sendBroadcast(intent);
            Toast.makeText(getApplicationContext(), "Corrida recusada", Toast.LENGTH_SHORT).show();
            new Handler(Looper.getMainLooper()).postDelayed(this::finish, 500);
        });
    }


    private void startStatusCheckLoop() {
        if (checkHandler == null) {
            checkHandler = new Handler(Looper.getMainLooper());
        }
        checkRunnable = new Runnable() {
            @Override
            public void run() {
                if (currentDeliveryId != null && !currentDeliveryId.isEmpty()) {
                    checkDeliveryAvailabilityAsync(currentDeliveryId);
                }
                if (checkHandler != null && checkRunnable != null) {
                    checkHandler.postDelayed(this, 1500);
                }
            }
        };
        checkHandler.post(checkRunnable);
    }

    private void stopStatusCheckLoop() {
        if (checkHandler != null && checkRunnable != null) {
            checkHandler.removeCallbacks(checkRunnable);
            checkRunnable = null;
        }
    }

    private void checkDeliveryAvailabilityAsync(String deliveryId) {
        new Thread(() -> {
            try {
                URL url = new URL(SUPABASE_URL + "/rest/v1/available_deliveries?id=eq." + deliveryId + "&select=id");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_ANON_KEY);
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder content = new StringBuilder();
                    String inputLine;
                    while ((inputLine = in.readLine()) != null) {
                        content.append(inputLine);
                    }
                    in.close();
                    conn.disconnect();

                    String json = content.toString().trim();
                    // Se o resultado for "[]", a corrida NÃO está mais na view available_deliveries (já aceita ou cancelada)
                    if ("[]".equals(json)) {
                        Log.d(TAG, "Corrida " + deliveryId + " já foi aceita por outro motorista. Fechando popup automaticamente!");
                        runOnUiThread(() -> {
                            stopRinging();
                            stopStatusCheckLoop();
                            finish();
                        });
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Erro ao checar se corrida está disponível: " + e.getMessage());
            }
        }).start();
    }

    private boolean acceptDeliveryViaNativeHttp(String deliveryId) {
        SharedPreferences prefs = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String driverId  = prefs.getString("driver_id", "");
        String userToken = prefs.getString("user_token", "");

        if (driverId.isEmpty()) {
            Log.e(TAG, "Sem driver_id no SharedPreferences.");
            return acceptViaPatch(deliveryId, userToken);
        }

        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/rpc/update_delivery_status_safe");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + (userToken.isEmpty() ? SUPABASE_ANON_KEY : userToken));
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            JSONObject body = new JSONObject();
            body.put("p_delivery_id", deliveryId);
            body.put("p_status",      "accepted");
            body.put("p_driver_id",   driverId);

            byte[] bodyBytes = body.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(bodyBytes);
            os.close();

            int responseCode = conn.getResponseCode();
            Log.d(TAG, "RPC response: " + responseCode);
            conn.disconnect();
            return responseCode >= 200 && responseCode < 300;

        } catch (Exception e) {
            Log.e(TAG, "Erro no aceite HTTP nativo: " + e.getMessage());
            return false;
        }
    }

    private boolean acceptViaPatch(String deliveryId, String token) {
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/deliveries?id=eq." + deliveryId + "&status=in.(pending,broadcasted)&driver_id=is.null");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + (token.isEmpty() ? SUPABASE_ANON_KEY : token));
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            JSONObject body = new JSONObject();
            body.put("status", "accepted");

            byte[] bodyBytes = body.toString().getBytes(StandardCharsets.UTF_8);
            OutputStream os = conn.getOutputStream();
            os.write(bodyBytes);
            os.close();

            int responseCode = conn.getResponseCode();
            Log.d(TAG, "PATCH response: " + responseCode);
            conn.disconnect();
            return responseCode >= 200 && responseCode < 300;

        } catch (Exception e) {
            Log.e(TAG, "Erro no PATCH direto: " + e.getMessage());
            return false;
        }
    }

    private void stopRinging() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception e) { /* ignore */ }
            mediaPlayer = null;
        }
        if (vibrator != null) {
            vibrator.cancel();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (instance == this) instance = null;
        stopStatusCheckLoop();
        stopRinging();
        try {
            unregisterReceiver(updateReceiver);
        } catch (Exception e) {
            // Ignore
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    // =====================================================================
    // Feedback de resultado (vindo do JS via DeliveryOverlayPlugin)
    // =====================================================================

    /** Chamado pelo JS (plugin.reportCallResult) após confirmar o aceite no Supabase. */
    public void onCallResult(final boolean success, final String message) {
        runOnUiThread(() -> finishWithResult(success, message));
    }

    private void finishWithResult(boolean success, String message) {
        if (resultHandled) return;
        resultHandled = true;
        if (resultTimeoutHandler != null && resultTimeoutRunnable != null) {
            resultTimeoutHandler.removeCallbacks(resultTimeoutRunnable);
            resultTimeoutRunnable = null;
        }
        stopRinging();
        stopStatusCheckLoop();

        String text = message != null && !message.trim().isEmpty()
                ? message
                : (success ? "✅ Corrida aceita!" : "❌ Corrida já foi aceita por outro entregador");
        Toast.makeText(getApplicationContext(), text, Toast.LENGTH_LONG).show();

        if (btnAccept != null) btnAccept.setText(success ? "✓ ACEITA" : "✕ INDISPONÍVEL");

        if (success) {
            Intent mainIntent = new Intent(IncomingCallActivity.this, MainActivity.class);
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(mainIntent);
        }

        new Handler(Looper.getMainLooper()).postDelayed(this::finish, success ? 400 : 900);
    }

    private void setSubmitting(boolean submitting, String acceptLabel) {
        isSubmitting = submitting;
        if (btnAccept != null) {
            btnAccept.setEnabled(!submitting);
            btnAccept.setAlpha(submitting ? 0.7f : 1f);
            if (acceptLabel != null) btnAccept.setText(acceptLabel);
        }
        if (btnReject != null) {
            btnReject.setEnabled(!submitting);
            btnReject.setAlpha(submitting ? 0.7f : 1f);
        }
        View close = findViewById(R.id.btnClose);
        if (close != null) close.setEnabled(!submitting);
    }

    private void startResultTimeout() {
        if (resultTimeoutHandler == null) {
            resultTimeoutHandler = new Handler(Looper.getMainLooper());
        }
        resultTimeoutRunnable = () -> {
            if (!resultHandled) {
                Log.w(TAG, "Timeout aguardando confirmação do aceite. Abrindo o app.");
                finishWithResult(true, "Abrindo o app para confirmar a corrida...");
            }
        };
        resultTimeoutHandler.postDelayed(resultTimeoutRunnable, 9000);
    }

    /** Ajusta a altura máxima do corpo do card conforme a tela (evita corte em telas pequenas). */
    private void applyResponsiveHeight() {
        View body = findViewById(R.id.scrollBody);
        if (body == null) return;
        int screenH = getResources().getDisplayMetrics().heightPixels;
        int max = (int) (screenH * 0.55f);
        ViewGroup.LayoutParams lp = body.getLayoutParams();
        if (lp != null && body instanceof android.widget.ScrollView) {
            ((android.widget.ScrollView) body).setNestedScrollingEnabled(true);
        }
        body.setMinimumHeight(0);
        if (body instanceof android.widget.ScrollView) {
            final int maxH = max;
            body.post(() -> {
                if (body.getHeight() > maxH) {
                    ViewGroup.LayoutParams p = body.getLayoutParams();
                    p.height = maxH;
                    body.setLayoutParams(p);
                }
            });
        }
    }

    /** Busca loja/endereços/taxa no Supabase quando o payload do FCM veio incompleto. */
    private void fetchMissingDetails(final String deliveryId) {
        if (deliveryId == null || deliveryId.isEmpty()) return;
        new Thread(() -> {
            try {
                URL url = new URL(SUPABASE_URL + "/rest/v1/available_deliveries?id=eq." + deliveryId + "&select=*");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_ANON_KEY);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                if (conn.getResponseCode() != 200) { conn.disconnect(); return; }

                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder content = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) content.append(line);
                in.close();
                conn.disconnect();

                org.json.JSONArray arr = new org.json.JSONArray(content.toString());
                if (arr.length() == 0) return;
                JSONObject row = arr.getJSONObject(0);

                final String store = firstNonEmpty(row, "company_name", "store_name", "trade_name");
                final String pick = firstNonEmpty(row, "pickup_address", "store_address", "origin_address", "pickup_location");
                final String drop = firstNonEmpty(row, "delivery_address", "dropoff_address", "customer_address", "address");
                final String feeRaw = firstNonEmpty(row, "delivery_fee", "driver_fee", "value", "price");
                String feeTxt = "";
                if (!feeRaw.isEmpty()) {
                    try {
                        feeTxt = "R$ " + String.format(java.util.Locale.US, "%.2f", Double.parseDouble(feeRaw)).replace('.', ',');
                    } catch (Exception ignored) { }
                }
                final String fee = feeTxt;

                runOnUiThread(() -> updateCall("", deliveryId, store, pick, drop, fee));
            } catch (Exception e) {
                Log.w(TAG, "Falha ao completar dados da corrida: " + e.getMessage());
            }
        }).start();
    }

    private String firstNonEmpty(JSONObject obj, String... keys) {
        for (String k : keys) {
            String v = obj.optString(k, "");
            if (v != null && !v.isEmpty() && !"null".equalsIgnoreCase(v)) return v;
        }
        return "";
    }
}

