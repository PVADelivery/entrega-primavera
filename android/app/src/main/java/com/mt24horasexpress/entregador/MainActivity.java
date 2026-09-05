package com.mt24horasexpress.entregador;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static volatile boolean isForeground = false;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeliveryOverlayPlugin.class);
        NotificationChannels.ensureIncomingChannel(this);
        super.onCreate(savedInstanceState);

        // Otimiza o WebView para alta estabilidade, cache e tolerância a quedas de rede
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                settings.setCacheMode(WebSettings.LOAD_DEFAULT);
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Erro ao configurar WebSettings: " + e.getMessage());
        }

        // Monitor de conectividade: recarrega automaticamente se estava na tela de erro e a internet voltou
        registerNetworkAutoRecovery();

        // Solicita desativar restrições de bateria para que o app continue notificando em segundo plano
        requestIgnoreBatteryOptimization();

        handleIntent(getIntent());
    }

    private void requestIgnoreBatteryOptimization() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.os.PowerManager pm = (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
                String pkg = getPackageName();
                if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + pkg));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Erro ao solicitar isenção de otimização de bateria: " + e.getMessage());
        }
    }

    private void registerNetworkAutoRecovery() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                networkCallback = new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        new Handler(Looper.getMainLooper()).post(() -> {
                            if (getBridge() != null && getBridge().getWebView() != null) {
                                WebView wv = getBridge().getWebView();
                                String currentUrl = wv.getUrl();
                                if (currentUrl != null && (currentUrl.contains("error.html") || currentUrl.contains("localhost"))) {
                                    android.util.Log.i("MainActivity", "Rede restabelecida! Recarregando tela inicial do entregador...");
                                    wv.loadUrl("https://entregador.mt24horasexpress.com/driver");
                                }
                            }
                        });
                    }
                };
                cm.registerDefaultNetworkCallback(networkCallback);
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Erro ao registrar monitor de rede: " + e.getMessage());
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        isForeground = true;

        try {
            boolean isOnline = getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean("is_online", false);
            if (isOnline && OverlayService.instance == null) {
                Intent intent = new Intent(this, OverlayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent);
                } else {
                    startService(intent);
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        isForeground = false;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (networkCallback != null) {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    cm.unregisterNetworkCallback(networkCallback);
                }
            } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("action");
        String deliveryId = intent.getStringExtra("deliveryId");

        if (deliveryId != null && !deliveryId.isEmpty() && "accept".equals(action)) {
            android.util.Log.d("MainActivity", "handleIntent: ACEITAR deliveryId=" + deliveryId);
            NativeSoundPlayer.stopSound();
            MyFirebaseMessagingService.dismissDeliveryAlert(this, deliveryId);

            DeliveryOverlayPlugin.setPendingAccepted(deliveryId);

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (DeliveryOverlayPlugin.instance != null) {
                    DeliveryOverlayPlugin.instance.triggerDeliveryAccepted(deliveryId);
                }
            }, 600);

            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                if (DeliveryOverlayPlugin.instance != null) {
                    DeliveryOverlayPlugin.instance.triggerDeliveryAccepted(deliveryId);
                }
            }, 1800);
        }
    }
}
