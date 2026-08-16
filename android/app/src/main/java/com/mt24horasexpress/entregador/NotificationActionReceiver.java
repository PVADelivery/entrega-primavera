package com.mt24horasexpress.entregador;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class NotificationActionReceiver extends BroadcastReceiver {
    private static final String TAG = "NotifActionReceiver";

    private int hashId(String str) {
        if (str == null) return 0;
        int hash = 0;
        for (int i = 0; i < str.length(); i++) {
            hash = ((hash << 5) - hash) + str.charAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        String deliveryId = intent.getStringExtra("deliveryId");
        Log.d(TAG, "Ação recebida: " + action + " | deliveryId: " + deliveryId);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.cancel(7777);
            if (deliveryId != null && !deliveryId.isEmpty()) {
                nm.cancel(hashId(deliveryId));
            }
        }

        if ("ACTION_REJECT".equals(action)) {
            // Apenas descarta o alarme e a notificação silenciosamente sem abrir o app!
            Log.d(TAG, "Corrida rejeitada nativamente. Notificação encerrada.");
        } else if ("ACTION_ACCEPT".equals(action)) {
            // Abre o app diretamente na tela da corrida para aceitar
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.putExtra("deliveryId", deliveryId);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(launchIntent);
        }
    }
}
