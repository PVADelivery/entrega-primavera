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
        if (context == null) return;

        try {
            boolean isOnline = context.getSharedPreferences(DeliveryOverlayPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean("is_online", false);
            if (isOnline) {
                Intent serviceIntent = new Intent(context, OverlayService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
                Log.d(TAG, "OverlayService iniciado com sucesso no BootReceiver.");
            }
        } catch (Exception e) {
            Log.w(TAG, "Falha ao iniciar OverlayService no BootReceiver: " + e.getMessage());
        }
    }
}
