package com.mt24horasexpress.entregador;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Religa o serviço em primeiro plano após o boot, atualização do app
 * ou quando o sistema mata o processo. Sem isso o app entra em
 * "app standby" e para de receber FCM depois de alguns minutos.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            Intent svc = new Intent(context, OverlayService.class);
            svc.setAction(OverlayService.ACTION_KEEP_ALIVE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
            Log.d(TAG, "OverlayService religado: " + intent.getAction());
        } catch (Exception e) {
            Log.w(TAG, "Falha ao religar serviço: " + e.getMessage());
        }
    }
}
