package com.mt24horasexpress.entregador;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean requestedOverlayOnLaunch = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DeliveryOverlayPlugin.class);
        NotificationChannels.ensureIncomingChannel(this);
        super.onCreate(savedInstanceState);

        // Garante que o conteúdo do app respeite a barra de status (topo) e navegação (rodapé)
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        handleIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        // Solicita permissão de aparecer sobre outros apps na abertura do app se ainda não tiver
        if (!requestedOverlayOnLaunch) {
            requestedOverlayOnLaunch = true;
            new Handler(Looper.getMainLooper()).postDelayed(this::checkAndPromptOverlayPermission, 1200);
        }
    }

    public void checkAndPromptOverlayPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(this)) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    android.util.Log.w("MainActivity", "Erro ao abrir tela de permissão de sobreposição: " + e.getMessage());
                }
            }
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
