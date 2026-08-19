package com.mt24horasexpress.entregador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;

public class OverlayService extends Service {

    private static final String TAG = "OverlayService";
    private static final String FG_CHANNEL_ID = "overlay_service_channel";
    private static final int    FG_NOTIF_ID   = 1;
    public  static final String ACTION_KEEP_ALIVE = "com.mt24horasexpress.entregador.KEEP_ALIVE";

    private WindowManager windowManager;
    private View floatingView;

    // Keep-alive locks: mantêm CPU e rede ativos enquanto o entregador está Online
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Garante que o foreground notification está ativo (obrigatório Android 8+)
        startForegroundNotification();

        // ── POPUP ACTION: disparado pelo FCM para abrir a IncomingCallActivity
        //    Um foreground service pode chamar startActivity() no Android 10+ sem restrição.
        if (intent != null && MyFirebaseMessagingService.ACTION_SHOW_POPUP.equals(intent.getAction())) {
            String details    = intent.getStringExtra("details");
            String deliveryId = intent.getStringExtra("deliveryId");
            Log.d(TAG, "SHOW_POPUP recebido — deliveryId=" + deliveryId);

            try {
                Intent popupIntent = new Intent(this, IncomingCallActivity.class);
                popupIntent.putExtra("details",    details);
                popupIntent.putExtra("deliveryId", deliveryId);
                popupIntent.putExtra("storeName", intent.getStringExtra("storeName"));
                popupIntent.putExtra("pickup",    intent.getStringExtra("pickup"));
                popupIntent.putExtra("dropoff",   intent.getStringExtra("dropoff"));
                popupIntent.putExtra("fee",       intent.getStringExtra("fee"));
                popupIntent.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK       |
                        Intent.FLAG_ACTIVITY_CLEAR_TOP      |
                        Intent.FLAG_ACTIVITY_SINGLE_TOP     |
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                );
                startActivity(popupIntent);
                Log.d(TAG, "IncomingCallActivity iniciada pelo OverlayService com sucesso!");
            } catch (Exception e) {
                Log.e(TAG, "Falha ao iniciar IncomingCallActivity: " + e.getMessage());
            }
            return START_STICKY;
        }

        // ── OVERLAY WINDOW: cria a bolinha flutuante (só se houver permissão)
        boolean canOverlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || android.provider.Settings.canDrawOverlays(this);
        if (!canOverlay) {
            Log.d(TAG, "Sem permissão de overlay — serviço segue apenas mantendo o app ativo.");
            return START_STICKY;
        }
        if (floatingView == null) {
            try {
                floatingView = LayoutInflater.from(this).inflate(R.layout.floating_bubble, null);

                int layoutFlag = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;

                final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        layoutFlag,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                        PixelFormat.TRANSLUCENT);

                params.gravity = Gravity.TOP | Gravity.LEFT;
                params.x = 0;
                params.y = 100;

                windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
                windowManager.addView(floatingView, params);

                floatingView.findViewById(R.id.bubbleIcon).setOnTouchListener(new View.OnTouchListener() {
                    private int   initialX, initialY;
                    private float initialTouchX, initialTouchY;
                    private boolean isClick;

                    @Override
                    public boolean onTouch(View v, MotionEvent event) {
                        switch (event.getAction()) {
                            case MotionEvent.ACTION_DOWN:
                                initialX      = params.x;
                                initialY      = params.y;
                                initialTouchX = event.getRawX();
                                initialTouchY = event.getRawY();
                                isClick       = true;
                                return true;
                            case MotionEvent.ACTION_MOVE:
                                float dx = event.getRawX() - initialTouchX;
                                float dy = event.getRawY() - initialTouchY;
                                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) isClick = false;
                                params.x = initialX + (int) dx;
                                params.y = initialY + (int) dy;
                                windowManager.updateViewLayout(floatingView, params);
                                return true;
                            case MotionEvent.ACTION_UP:
                                if (isClick) {
                                    Intent i = new Intent(OverlayService.this, MainActivity.class);
                                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                                    startActivity(i);
                                }
                                return true;
                        }
                        return false;
                    }
                });

                floatingView.findViewById(R.id.closeButton).setOnClickListener(v -> stopSelf());

                Log.d(TAG, "Overlay window criada com sucesso.");
            } catch (Exception e) {
                Log.e(TAG, "Erro ao criar overlay window: " + e.getMessage());
            }
        }

        return START_STICKY;
    }

    private void startForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(FG_CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        FG_CHANNEL_ID, "Overlay Service", NotificationManager.IMPORTANCE_LOW);
                nm.createNotificationChannel(ch);
            }
        }

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) piFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent, piFlags);

        Notification notification = new NotificationCompat.Builder(this, FG_CHANNEL_ID)
                .setContentTitle("MT 24 Horas Express Entregador")
                .setContentText("Disponível para entregas")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();

        startForeground(FG_NOTIF_ID, notification);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        startForegroundNotification();

        // ── WAKE LOCK: mantém a CPU ativa para polling/websocket não morrer
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        "EprjaEntregador::OverlayWakeLock");
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
                        "EprjaEntregador::OverlayWifiLock");
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
    }
}
