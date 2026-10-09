package com.mt24horasexpress.entregador;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static volatile boolean isForeground = false;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeliveryOverlayPlugin.class);
        NotificationChannels.ensureIncomingChannel(this);
        super.onCreate(savedInstanceState);
        setupStatusBar();

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

        handleIntent(getIntent());
    }

    private void setupStatusBar() {
        try {
            Window window = getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
                window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
                window.setStatusBarColor(Color.WHITE);
                window.setNavigationBarColor(Color.WHITE);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }
            WindowInsetsControllerCompat insetsController = 
                WindowCompat.getInsetsController(window, window.getDecorView());
            if (insetsController != null) {
                insetsController.setAppearanceLightStatusBars(true);
                insetsController.setAppearanceLightNavigationBars(true);
            }
        } catch (Exception ignored) {}
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
        setupStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            setupStatusBar();
        }
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
