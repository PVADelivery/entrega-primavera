package com.mt24horasexpress.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : "null";
        Log.d(TAG, "BootReceiver recebido: " + action);
        if (context != null) {
            boolean isOnline = context.getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean("is_online", true);
            if (isOnline) {
                Log.d(TAG, "Reiniciando DeliveryBackgroundService após boot do aparelho...");
                DeliveryBackgroundService.startService(context);
            }
        }
    }
}
