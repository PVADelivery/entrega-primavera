package com.mt24horasexpress.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NotificationAction";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String deliveryId = intent.getStringExtra("deliveryId");
        Log.d(TAG, "onReceive action=" + action + " deliveryId=" + deliveryId);

        if (deliveryId == null || deliveryId.isEmpty()) return;

        // 1. Silencia o som oficial e remove a notificação/card instantaneamente (0ms)
        NativeSoundPlayer.stopSound();
        MyFirebaseMessagingService.dismissDeliveryAlert(context, deliveryId);

        if ("ACTION_DECLINE".equals(action) || "com.mt24horasexpress.entregador.ACTION_REJECT".equals(action) || "com.mt24horasexpress.entregador.ACTION_DECLINE".equals(action)) {
            if (DeliveryOverlayPlugin.instance != null) {
                DeliveryOverlayPlugin.instance.triggerDeliveryDeclined(deliveryId);
            }
        } else if ("ACTION_ACCEPT".equals(action) || "com.mt24horasexpress.entregador.ACTION_ACCEPT".equals(action)) {
            DeliveryOverlayPlugin.setPendingAccepted(deliveryId);
            if (DeliveryOverlayPlugin.instance != null) {
                DeliveryOverlayPlugin.instance.triggerDeliveryAccepted(deliveryId);
            }

            // Abre o app diretamente para concluir o aceite
            try {
                Intent openApp = new Intent(context, MainActivity.class);
                openApp.putExtra("deliveryId", deliveryId);
                openApp.putExtra("action", "accept");
                openApp.putExtra("route", "/driver/deliveries?deliveryId=" + deliveryId + "&action=accept");
                openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                context.startActivity(openApp);
            } catch (Exception e) {
                Log.e(TAG, "Erro ao abrir MainActivity no aceite: " + e.getMessage());
            }
        }
    }
}
